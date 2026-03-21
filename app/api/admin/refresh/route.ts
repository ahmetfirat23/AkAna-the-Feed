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

  const base = process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000';
  const res = await fetch(`${base}/api/cron/refresh`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${cronSecret}` },
  });

  const data = await res.json();
  return NextResponse.json(data, { status: res.status });
}
