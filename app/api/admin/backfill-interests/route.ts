import { NextResponse } from 'next/server';
import { getSession } from '@/lib/session';
import { serviceRoleClient } from '@/lib/supabase';
import { parseTfidfTerms } from '@/lib/tfidf';

const DELTA: Record<string, number> = { like: 1.0, dislike: -2.0 };

export async function POST() {
  const session = await getSession();
  if (!session.isAdmin) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = serviceRoleClient;

  // Fetch all click_events
  const { data: clicksRaw, error: clicksErr } = await supabase
    .from('click_events')
    .select('article_id, type');

  if (clicksErr) {
    return NextResponse.json({ error: clicksErr.message }, { status: 500 });
  }

  const clicks = (clicksRaw ?? []) as { article_id: string; type: string }[];
  if (clicks.length === 0) {
    return NextResponse.json({ processed: 0, message: 'No click events found' });
  }

  // Aggregate net delta per article
  const deltaByArticle = new Map<string, number>();
  for (const { article_id, type } of clicks) {
    const d = DELTA[type] ?? 0;
    if (d !== 0) {
      deltaByArticle.set(article_id, (deltaByArticle.get(article_id) ?? 0) + d);
    }
  }

  // Fetch tfidf_terms for all relevant articles
  const articleIds = Array.from(deltaByArticle.keys());
  const { data: articlesRaw } = await supabase
    .from('articles')
    .select('id, tfidf_terms')
    .in('id', articleIds);

  const articles = (articlesRaw ?? []) as { id: string; tfidf_terms: string[] }[];

  // Accumulate per-term interest deltas across all articles
  const termDelta = new Map<string, number>();
  for (const article of articles) {
    const totalDelta = deltaByArticle.get(article.id) ?? 0;
    if (totalDelta === 0) continue;
    const terms = parseTfidfTerms(article.tfidf_terms ?? []);
    if (terms.size === 0) continue;
    const perTerm = totalDelta / terms.size;
    for (const term of terms.keys()) {
      termDelta.set(term, (termDelta.get(term) ?? 0) + perTerm);
    }
  }

  if (termDelta.size === 0) {
    return NextResponse.json({ processed: 0, message: 'No articles had tfidf_terms' });
  }

  const now = new Date().toISOString();
  const upserts = Array.from(termDelta.entries()).map(([term, score]) => ({
    term,
    score,
    updated_at: now,
  }));

  // Upsert in chunks of 500
  for (let i = 0; i < upserts.length; i += 500) {
    await supabase
      .from('user_interest')
      .upsert(upserts.slice(i, i + 500) as unknown as never[], { onConflict: 'term' });
  }

  return NextResponse.json({ processed: clicks.length, terms: termDelta.size });
}
