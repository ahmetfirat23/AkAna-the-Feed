import { serviceRoleClient } from '@/lib/supabase';
import { getSession } from '@/lib/session';

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession();
  if (!session.isAdmin) {
    return new Response('Unauthorized', { status: 401 });
  }

  const { id } = await params;

  const { error } = await serviceRoleClient
    .from('reading_points')
    .delete()
    .eq('id', id);

  if (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }

  return new Response(null, { status: 200 });
}
