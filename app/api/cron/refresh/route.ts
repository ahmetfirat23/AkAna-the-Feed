import { NextRequest, NextResponse } from 'next/server';
import { serviceRoleClient } from '@/lib/supabase';
import { fetchAndParseFeed } from '@/lib/rss';
import { sanitizeHtml } from '@/lib/sanitize';
import { generateSummaries } from '@/lib/openai';
import { tokenize, tokenSimilarity, tokenizeSet, contentSimilarity, computeTfIdf, topK, parseTfidfTerms } from '@/lib/tfidf';

// ── concurrency limiter ────────────────────────────────────────────────────

/**
 * Run an array of async tasks with a maximum of `limit` running concurrently.
 */
async function runWithConcurrencyLimit<T>(
  tasks: (() => Promise<T>)[],
  limit: number,
): Promise<PromiseSettledResult<T>[]> {
  const results: PromiseSettledResult<T>[] = [];
  let index = 0;

  async function worker(): Promise<void> {
    while (index < tasks.length) {
      const taskIndex = index++;
      try {
        const value = await tasks[taskIndex]();
        results[taskIndex] = { status: 'fulfilled', value };
      } catch (reason) {
        results[taskIndex] = { status: 'rejected', reason };
      }
    }
  }

  const workers = Array.from({ length: Math.min(limit, tasks.length) }, () => worker());
  await Promise.all(workers);
  return results;
}

// ── main handler ───────────────────────────────────────────────────────────

export async function POST(req: NextRequest): Promise<NextResponse> {
  // 1. Auth check
  const authHeader = req.headers.get('authorization') ?? '';
  const cronSecret = process.env.CRON_SECRET;

  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = serviceRoleClient;

  // 2. Fetch all active sources
  const { data: sourcesRaw, error: sourcesError } = await supabase
    .from('sources')
    .select('id, name, url, last_fetched_at, consecutive_errors')
    .eq('active', true);
  const sources = sourcesRaw as unknown as {
    id: string;
    name: string;
    url: string;
    last_fetched_at: string | null;
    consecutive_errors: number | null;
  }[] | null;

  if (sourcesError) {
    return NextResponse.json({ error: 'Failed to load sources' }, { status: 500 });
  }

  if (!sources || sources.length === 0) {
    return NextResponse.json({ processed: 0, inserted: 0, errors: 0 });
  }

  const RATE_LIMIT_MINUTES = 25;
  const now = Date.now();

  let totalInserted = 0;
  let totalErrors = 0;

  // 3. Process each source (max 5 concurrent)
  const tasks = sources.map((source) => async () => {
    // Rate-limit: skip if fetched within the last 25 minutes
    if (source.last_fetched_at) {
      const lastFetchMs = new Date(source.last_fetched_at as string).getTime();
      if (now - lastFetchMs < RATE_LIMIT_MINUTES * 60 * 1000) {
        return { inserted: 0, error: false };
      }
    }

    let sourceInserted = 0;

    try {
      // 3a. Fetch and parse the RSS feed
      const articles = await fetchAndParseFeed(source.url as string);

      // Fetch recent articles for this source's tags to use for dedup comparison.
      // We fetch the last 100 articles from the past 48h across all sources
      // to compare against (excluding is_duplicate ones).
      const cutoff48h = new Date(now - 48 * 60 * 60 * 1000).toISOString();
      const { data: recentArticles } = await supabase
        .from('articles')
        .select('id, title, source_id')
        .eq('is_duplicate', false)
        .neq('source_id', source.id)
        .gte('published_at', cutoff48h)
        .order('published_at', { ascending: false })
        .limit(100);

      const recentTitles: { id: string; title: string; source_id: string }[] =
        recentArticles ?? [];

      // 3b. Insert each article
      for (const article of articles) {
        // Check if URL already exists (link is the unique column)
        const { data: existing } = await supabase
          .from('articles')
          .select('id')
          .eq('link', article.url)
          .maybeSingle();

        if (existing) continue;

        // Sanitize description
        const sanitizedDescription = article.description
          ? sanitizeHtml(article.description)
          : null;

        // Duplicate detection: word-overlap on titles from other sources (past 48h).
        // contentSimilarity blends in summary comparison when title sim is borderline (0.15–0.30)
        // and both articles have summaries — catches "same story, different headline" cases.
        let isDuplicate = false;
        for (const recent of recentTitles) {
          if (contentSimilarity(article.title, recent.title) > 0.3) {
            isDuplicate = true;
            break;
          }
        }

        // Insert article
        const { error: insertError } = await supabase.from('articles').insert({
          source_id: source.id,
          title: article.title,
          link: article.url,
          description: sanitizedDescription,
          image_url: article.imageUrl,
          published_at: article.publishedAt?.toISOString() ?? null,
          is_duplicate: isDuplicate,
        } as unknown as never);

        if (!insertError) {
          sourceInserted++;
        }
      }

      // 3c. Update source: clear errors, set last_fetched_at
      await supabase
        .from('sources')
        .update({
          last_fetched_at: new Date().toISOString(),
          consecutive_errors: 0,
          last_error: null,
        })
        .eq('id', source.id);

      return { inserted: sourceInserted, error: false };
    } catch (err) {
      // 3d. On error: increment consecutive_errors, record message
      const message = err instanceof Error ? err.message : String(err);
      await supabase
        .from('sources')
        .update({
          consecutive_errors: (source.consecutive_errors ?? 0) + 1,
          last_error: message,
        })
        .eq('id', source.id);

      return { inserted: 0, error: true };
    }
  });

  const results = await runWithConcurrencyLimit(tasks, 5);

  for (const result of results) {
    if (result.status === 'fulfilled') {
      totalInserted += result.value.inserted;
      if (result.value.error) totalErrors++;
    } else {
      totalErrors++;
    }
  }

  // 4. GPT summaries: articles with no summary where description is missing or > 400 chars
  //    Fetch recently inserted articles (fetched_at within the last hour) that need summaries.
  const oneHourAgo = new Date(now - 60 * 60 * 1000).toISOString();
  const { data: needsSummary } = await supabase
    .from('articles')
    .select('id, title, description')
    .is('summary', null)
    .gte('fetched_at', oneHourAgo);

  // Only summarise if description is missing or longer than 400 chars
  const toSummarise = (needsSummary ?? []).filter(
    (a: { id: string; title: string; description: string | null }) =>
      !a.description || a.description.length > 400,
  );

  if (toSummarise.length > 0) {
    const summaryMap = await generateSummaries(
      toSummarise.map((a: { id: string; title: string; description: string | null }) => ({
        id: a.id,
        title: a.title,
        description: a.description ?? '',
      })),
    );

    // Update each article's summary
    const summaryUpdates = Array.from(summaryMap.entries()).map(([id, summary]) =>
      supabase.from('articles').update({ summary }).eq('id', id),
    );

    await Promise.allSettled(summaryUpdates);
  }

  // 5. TF-IDF extraction for new articles (fetched in the last hour, tfidf_terms empty)
  //    Computes top-15 n-gram TF-IDF terms per article and stores them in articles.tfidf_terms.
  //    Also upserts doc_freq counts into tfidf_stats for future IDF calculations.
  {
    const { data: needsTfidf } = await supabase
      .from('articles')
      .select('id, title, summary, description')
      .eq('tfidf_terms', '{}' as unknown as never)
      .gte('fetched_at', oneHourAgo);

    const articlesToProcess = (needsTfidf ?? []) as {
      id: string;
      title: string;
      summary: string | null;
      description: string | null;
    }[];

    if (articlesToProcess.length > 0) {
      // Get total article count for IDF denominator
      const { count: totalArticles } = await supabase
        .from('articles')
        .select('*', { count: 'exact', head: true });

      const N = totalArticles ?? 1;

      // Tokenize each article and collect all unique terms for batch df fetch
      const articleTokens = new Map<string, string[]>();
      const allTerms = new Set<string>();

      for (const article of articlesToProcess) {
        const text = `${article.title} ${article.summary ?? article.description ?? ''}`;
        const terms = tokenize(text);
        articleTokens.set(article.id, terms);
        for (const t of new Set(terms)) allTerms.add(t);
      }

      // Fetch existing doc_freq for all terms we'll encounter
      const termList = Array.from(allTerms);
      let existingDf = new Map<string, number>();
      if (termList.length > 0) {
        const { data: dfRows } = await supabase
          .from('tfidf_stats')
          .select('term, doc_freq')
          .in('term', termList);
        for (const row of (dfRows ?? []) as { term: string; doc_freq: number }[]) {
          existingDf.set(row.term, row.doc_freq);
        }
      }

      // Compute delta: each article contributes 1 to doc_freq of each unique term it contains
      const deltaDF = new Map<string, number>();
      for (const terms of articleTokens.values()) {
        for (const t of new Set(terms)) {
          deltaDF.set(t, (deltaDF.get(t) ?? 0) + 1);
        }
      }

      // Merge existing + delta df
      const mergedDf = new Map<string, number>(existingDf);
      for (const [term, delta] of deltaDF) {
        mergedDf.set(term, (mergedDf.get(term) ?? 0) + delta);
      }

      // Upsert tfidf_stats with updated doc_freq counts
      const dfUpserts = Array.from(mergedDf.entries()).map(([term, doc_freq]) => ({
        term,
        doc_freq,
        updated_at: new Date().toISOString(),
      }));

      // Batch upserts in chunks of 500 to avoid query size limits
      const CHUNK = 500;
      for (let i = 0; i < dfUpserts.length; i += CHUNK) {
        await supabase
          .from('tfidf_stats')
          .upsert(dfUpserts.slice(i, i + CHUNK) as unknown as never[], { onConflict: 'term' });
      }

      // Compute TF-IDF for each article and update tfidf_terms
      const tfidfUpdates = Array.from(articleTokens.entries()).map(([id, terms]) => {
        const scored = computeTfIdf(terms, mergedDf, N);
        const tfidfTerms = topK(scored, 15);
        return supabase
          .from('articles')
          .update({ tfidf_terms: tfidfTerms } as unknown as never)
          .eq('id', id);
      });

      await Promise.allSettled(tfidfUpdates);
    }
  }

  // 5.5 User interest decay: apply 0.95^(days_since_updated) to all user_interest scores.
  //     Delete rows where the decayed score drops below 0.001.
  {
    const DAY_MS = 1000 * 60 * 60 * 24;
    const { data: interestRows } = await supabase
      .from('user_interest')
      .select('term, score, updated_at');

    if (interestRows && interestRows.length > 0) {
      const toDelete: string[] = [];
      const toUpdate: { term: string; score: number; updated_at: string }[] = [];
      const nowStr = new Date().toISOString();

      for (const row of interestRows as { term: string; score: number; updated_at: string }[]) {
        const daysSince = (now - new Date(row.updated_at).getTime()) / DAY_MS;
        const decayed = row.score * Math.pow(0.95, daysSince);
        if (decayed < 0.001) {
          toDelete.push(row.term);
        } else {
          toUpdate.push({ term: row.term, score: decayed, updated_at: nowStr });
        }
      }

      if (toDelete.length > 0) {
        await supabase.from('user_interest').delete().in('term', toDelete);
      }
      if (toUpdate.length > 0) {
        await supabase
          .from('user_interest')
          .upsert(toUpdate as unknown as never[], { onConflict: 'term' });
      }
    }
  }

  // 6. Update click weights per source based on clicks in the past 7 days
  //    Formula: 1.0 + (clicks in last 7 days) * 0.1
  //    We fetch all sources and their 7-day click counts, then update in JS.
  const sevenDaysAgo = new Date(now - 7 * 24 * 60 * 60 * 1000).toISOString();

  const { data: allSources } = await supabase
    .from('sources')
    .select('id')
    .eq('active', true);

  if (allSources && allSources.length > 0) {
    const { data: clickCounts } = await supabase
      .from('click_events')
      .select('source_id')
      .eq('type', 'like')
      .gte('clicked_at', sevenDaysAgo);

    // Count clicks per source
    const countBySouce = new Map<string, number>();
    for (const row of clickCounts ?? []) {
      const sid = row.source_id as string;
      countBySouce.set(sid, (countBySouce.get(sid) ?? 0) + 1);
    }

    const weightUpdates = allSources.map((s: { id: string }) => {
      const clicks = countBySouce.get(s.id) ?? 0;
      const clickWeight = 1.0 + clicks * 0.1;
      return supabase
        .from('sources')
        .update({ click_weight: clickWeight })
        .eq('id', s.id);
    });

    await Promise.allSettled(weightUpdates);
  }

  // 7. Retention cleanup: delete articles older than 30 days that are not bookmarked
  const cutoff30d = new Date(now - 30 * 24 * 60 * 60 * 1000).toISOString();

  // Fetch bookmarked article IDs to exclude them
  const { data: bookmarked } = await supabase
    .from('bookmarks')
    .select('article_id');

  const bookmarkedIds = (bookmarked ?? []).map(
    (b: { article_id: string }) => b.article_id,
  );

  let deleteQuery = supabase
    .from('articles')
    .delete()
    .lt('fetched_at', cutoff30d);

  if (bookmarkedIds.length > 0) {
    deleteQuery = deleteQuery.not('id', 'in', `(${bookmarkedIds.join(',')})`);
  }

  await deleteQuery;

  // 8. Return summary
  return NextResponse.json({
    processed: sources.length,
    inserted: totalInserted,
    errors: totalErrors,
  });
}
