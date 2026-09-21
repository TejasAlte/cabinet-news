import { NextRequest, NextResponse } from 'next/server';
import { searchAll } from '../../../lib/queries';

export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams.get('q') ?? '';
  try {
    const results = await searchAll(q);
    return NextResponse.json(results);
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
