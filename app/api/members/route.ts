import { NextRequest, NextResponse } from 'next/server';
import { listMembers } from '../../../lib/queries';
import { House } from '../../../types';

export async function GET(req: NextRequest) {
  const params = req.nextUrl.searchParams;
  const house = params.get('house') as House | null;
  const page = Number(params.get('page') ?? '1');
  const party = params.get('party') ?? undefined;
  const state = params.get('state') ?? undefined;

  if (house !== 'lok_sabha' && house !== 'rajya_sabha') {
    return NextResponse.json({ error: 'invalid house' }, { status: 400 });
  }

  try {
    const result = await listMembers({ house, page, party, state });
    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
