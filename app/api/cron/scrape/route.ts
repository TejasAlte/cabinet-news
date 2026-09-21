import { NextRequest, NextResponse } from 'next/server';
import { runScrapePipeline } from '../../../../scripts/scrape-news';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/**
 * Triggered every 10 minutes by .github/workflows/scrape-news.yml (or a
 * Vercel Cron job if you add one in vercel.json). Requires the CRON_SECRET
 * env var to match the Authorization header, so the endpoint can't be
 * triggered by anyone who finds the URL.
 */
export async function POST(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  const auth = req.headers.get('authorization');

  if (!secret || auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  try {
    const result = await runScrapePipeline();
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    console.error('[api/cron/scrape] failed:', err);
    return NextResponse.json({ ok: false, error: (err as Error).message }, { status: 500 });
  }
}

// GET is provided only for manual browser-based smoke testing with ?secret=
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  const provided = req.nextUrl.searchParams.get('secret');
  if (!secret || provided !== secret) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  const result = await runScrapePipeline();
  return NextResponse.json({ ok: true, ...result });
}
