import { serviceRoleClient } from '@/lib/supabase';

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ articleId: string }> }
) {
  const { articleId } = await params;

  const { error } = await serviceRoleClient
    .from('bookmarks')
    .delete()
    .eq('article_id', articleId);

  if (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }

  return new Response(null, { status: 200 });
}
