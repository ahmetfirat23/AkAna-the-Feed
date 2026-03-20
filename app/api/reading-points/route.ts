import { serviceRoleClient } from '@/lib/supabase';
import { getSession } from '@/lib/session';

const MAX_AUTO = 3;
const MAX_MANUAL = 5;

export async function GET() {
  const { data, error } = await serviceRoleClient
    .from('reading_points')
    .select('*')
    .order('saved_at', { ascending: false });

  if (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }

  return Response.json(data);
}

export async function POST(request: Request) {
  const session = await getSession();
  if (!session.isAdmin) {
    return new Response('Unauthorized', { status: 401 });
  }

  let body: {
    article_id?: string;
    label?: string;
    feed_mode?: string;
    tag_filter?: string;
    is_auto?: boolean;
  };

  try {
    body = await request.json();
  } catch {
    return new Response('Bad Request', { status: 400 });
  }

  const { article_id, label, feed_mode, tag_filter, is_auto = false } = body;

  if (!article_id) {
    return new Response('Bad Request: article_id is required', { status: 400 });
  }

  // Look up the article title for denormalization
  const { data: article, error: articleError } = await serviceRoleClient
    .from('articles')
    .select('title')
    .eq('id', article_id)
    .single();

  if (articleError || !article) {
    return Response.json({ error: 'Article not found' }, { status: 404 });
  }

  const type = is_auto ? 'auto' : 'manual';
  const limit = is_auto ? MAX_AUTO : MAX_MANUAL;

  // Count existing points of this type
  const { data: existing, error: countError } = await serviceRoleClient
    .from('reading_points')
    .select('id, saved_at')
    .eq('type', type)
    .order('saved_at', { ascending: true });

  if (countError) {
    return Response.json({ error: countError.message }, { status: 500 });
  }

  // If at limit, delete the oldest of this type first
  if (existing && existing.length >= limit) {
    const oldest = existing[0];
    await serviceRoleClient
      .from('reading_points')
      .delete()
      .eq('id', oldest.id);
  }

  const pointLabel =
    label ??
    `${is_auto ? 'Auto' : 'Manual'} — ${new Date().toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    })}`;

  const insertPayload: Record<string, unknown> = {
    type,
    article_id,
    article_title: article.title,
    label: pointLabel,
  };

  if (feed_mode !== undefined) insertPayload.feed_mode = feed_mode;
  if (tag_filter !== undefined) insertPayload.tag_filter = tag_filter;

  const { data: created, error: insertError } = await serviceRoleClient
    .from('reading_points')
    .insert(insertPayload as unknown as never)
    .select()
    .single();

  if (insertError) {
    return Response.json({ error: insertError.message }, { status: 500 });
  }

  return Response.json(created, { status: 201 });
}
