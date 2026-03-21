import { serviceRoleClient } from '@/lib/supabase';

export async function GET() {
  const { data, error } = await serviceRoleClient
    .from('bookmarks')
    .select(
      `
      id,
      created_at,
      article_id,
      articles (
        id,
        title,
        description,
        summary,
        link,
        published_at,
        image_url,
        source_id,
        sources (
          name,
          custom_tags
        )
      )
    `
    )
    .order('created_at', { ascending: false });

  if (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }

  return Response.json(data);
}

export async function POST(request: Request) {
  let body: { article_id?: string };
  try {
    body = await request.json();
  } catch {
    return new Response('Bad Request', { status: 400 });
  }

  const { article_id } = body;

  if (!article_id) {
    return new Response('Bad Request: article_id is required', { status: 400 });
  }

  const { data, error } = await (serviceRoleClient
    .from('bookmarks')
    .insert({ article_id } as unknown as never)
    .select()
    .single());

  if (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }

  return Response.json(data, { status: 201 });
}
