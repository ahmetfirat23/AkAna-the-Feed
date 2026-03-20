import { serviceRoleClient } from '@/lib/supabase';
import { fetchArticleContent } from '@/lib/reader';

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  // Look up the article
  const { data: article, error } = await serviceRoleClient
    .from('articles')
    .select('id, title, content, link')
    .eq('id', id)
    .single();

  if (error || !article) {
    return Response.json({ error: 'Article not found' }, { status: 404 });
  }

  // Cache hit — return stored content
  if (article.content) {
    return Response.json({
      content: article.content,
      title: article.title,
      byline: null,
    });
  }

  // Cache miss — fetch and parse the article
  const parsed = await fetchArticleContent(article.link);

  if (!parsed) {
    return Response.json(
      { error: 'Could not fetch article' },
      { status: 502 }
    );
  }

  if (!parsed.content) {
    return Response.json(
      { error: 'Could not parse article — try opening the original' },
      { status: 422 }
    );
  }

  // Persist to DB so next open is instant
  await serviceRoleClient
    .from('articles')
    .update({
      content: parsed.content,
      content_fetched_at: new Date().toISOString(),
    })
    .eq('id', id);

  return Response.json({
    content: parsed.content,
    title: parsed.title || article.title,
    byline: parsed.byline,
  });
}
