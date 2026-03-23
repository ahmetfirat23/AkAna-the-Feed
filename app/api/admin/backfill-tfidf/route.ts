import { NextResponse } from 'next/server';
import { getSession } from '@/lib/session';
import { serviceRoleClient } from '@/lib/supabase';
import { tokenize, computeTfIdf, topK } from '@/lib/tfidf';

const CHUNK = 100; // articles per batch

export async function POST() {
  const session = await getSession();
  if (!session.isAdmin) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = serviceRoleClient;

  // Fetch all articles with empty tfidf_terms
  const { data: articlesRaw, error: fetchErr } = await supabase
    .from('articles')
    .select('id, title, summary, description')
    .eq('tfidf_terms', '{}' as unknown as never);

  if (fetchErr) {
    return NextResponse.json({ error: fetchErr.message }, { status: 500 });
  }

  const articles = (articlesRaw ?? []) as {
    id: string;
    title: string;
    summary: string | null;
    description: string | null;
  }[];

  if (articles.length === 0) {
    return NextResponse.json({ processed: 0, message: 'Nothing to backfill' });
  }

  // Get total article count for IDF denominator
  const { count: totalArticles } = await supabase
    .from('articles')
    .select('*', { count: 'exact', head: true });
  const N = totalArticles ?? articles.length;

  // Tokenize all articles and collect unique terms
  const articleTokens = new Map<string, string[]>();
  const allTerms = new Set<string>();

  for (const article of articles) {
    const text = `${article.title} ${article.summary ?? article.description ?? ''}`;
    const terms = tokenize(text);
    articleTokens.set(article.id, terms);
    for (const t of new Set(terms)) allTerms.add(t);
  }

  // Fetch existing doc_freq for all terms
  const termList = Array.from(allTerms);
  const existingDf = new Map<string, number>();
  for (let i = 0; i < termList.length; i += 500) {
    const { data: dfRows } = await supabase
      .from('tfidf_stats')
      .select('term, doc_freq')
      .in('term', termList.slice(i, i + 500));
    for (const row of (dfRows ?? []) as { term: string; doc_freq: number }[]) {
      existingDf.set(row.term, row.doc_freq);
    }
  }

  // Compute delta doc_freq from this batch
  const deltaDF = new Map<string, number>();
  for (const terms of articleTokens.values()) {
    for (const t of new Set(terms)) {
      deltaDF.set(t, (deltaDF.get(t) ?? 0) + 1);
    }
  }

  // Merge and upsert tfidf_stats
  const mergedDf = new Map<string, number>(existingDf);
  for (const [term, delta] of deltaDF) {
    mergedDf.set(term, (mergedDf.get(term) ?? 0) + delta);
  }

  const dfUpserts = Array.from(mergedDf.entries()).map(([term, doc_freq]) => ({
    term,
    doc_freq,
    updated_at: new Date().toISOString(),
  }));

  for (let i = 0; i < dfUpserts.length; i += 500) {
    await supabase
      .from('tfidf_stats')
      .upsert(dfUpserts.slice(i, i + 500) as unknown as never[], { onConflict: 'term' });
  }

  // Compute TF-IDF and update articles in chunks
  let processed = 0;
  const ids = Array.from(articleTokens.keys());

  for (let i = 0; i < ids.length; i += CHUNK) {
    const chunkIds = ids.slice(i, i + CHUNK);
    const updates = chunkIds.map((id) => {
      const terms = articleTokens.get(id)!;
      const scored = computeTfIdf(terms, mergedDf, N);
      const tfidfTerms = topK(scored, 15);
      return supabase
        .from('articles')
        .update({ tfidf_terms: tfidfTerms } as unknown as never)
        .eq('id', id);
    });

    await Promise.allSettled(updates);
    processed += chunkIds.length;
  }

  return NextResponse.json({ processed, total: articles.length });
}
