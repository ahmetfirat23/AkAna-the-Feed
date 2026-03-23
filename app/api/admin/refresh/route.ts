import { NextResponse } from 'next/server';
import { getSession } from '@/lib/session';

export async function POST() {
  const session = await getSession();
  if (!session.isAdmin) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    return NextResponse.json({ error: 'CRON_SECRET not set' }, { status: 500 });
  }

  const base = process.env.NEXT_PUBLIC_SITE_URL
    ?? (process.env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` : null)
    ?? (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'http://localhost:3000');

  let res: Response;
  try {
    res = await fetch(`${base}/api/cron/refresh`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${cronSecret}` },
    });
  } catch (err) {
    return NextResponse.json({ error: `Could not reach cron endpoint: ${err}` }, { status: 500 });
  }

  let data: unknown;
  try {
    data = await res.json();
  } catch {
    return NextResponse.json({ error: `Cron returned status ${res.status} (non-JSON)` }, { status: 500 });
  }

  return NextResponse.json(data, { status: res.status });
}
