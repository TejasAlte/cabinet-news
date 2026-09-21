import { getPublicClient } from './supabase';
import { House } from '@/types';

const MEMBER_SELECT = `
  id, full_name, slug, house, photo_url, current_term, active,
  party:parties ( name, short_name, slug, color_hex ),
  state:states ( name, slug ),
  constituency:constituencies ( name )
`;

export interface MemberListParams {
  house: House;
  page?: number;
  pageSize?: number;
  party?: string;
  state?: string;
}

export async function listMembers({ house, page = 1, pageSize = 24, party, state }: MemberListParams) {
  const db = getPublicClient();
  let query = db
    .from('members')
    .select(MEMBER_SELECT, { count: 'exact' })
    .eq('house', house)
    .eq('active', true)
    .order('full_name', { ascending: true });

  if (party) query = query.eq('party.short_name', party);
  if (state) query = query.eq('state.slug', state);

  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;
  const { data, count, error } = await query.range(from, to);
  if (error) throw new Error(`listMembers failed: ${error.message}`);
  return { members: data ?? [], total: count ?? 0 };
}

export async function getMemberBySlug(slug: string) {
  const db = getPublicClient();
  const { data, error } = await db
    .from('members')
    .select(
      `${MEMBER_SELECT}, ministry:ministries ( name )`
    )
    .eq('slug', slug)
    .maybeSingle();
  if (error) throw new Error(`getMemberBySlug failed: ${error.message}`);
  return data;
}

export async function getMemberNews(memberId: string, limit = 50) {
  const db = getPublicClient();
  const { data, error } = await db
    .from('member_news')
    .select(
      `confidence, matched_variant,
       news:news (
         id, slug, headline, summary, category, publisher, source_url, published_at, image_url,
         source:news_sources ( name, publisher, homepage_url )
       )`
    )
    .eq('member_id', memberId)
    .order('news(published_at)', { ascending: false })
    .limit(limit);
  if (error) throw new Error(`getMemberNews failed: ${error.message}`);
  return data ?? [];
}

export async function listNews({ page = 1, pageSize = 20 }: { page?: number; pageSize?: number }) {
  const db = getPublicClient();
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;
  const { data, count, error } = await db
    .from('news')
    .select('id, slug, headline, summary, category, publisher, source_url, published_at, image_url', {
      count: 'exact',
    })
    .order('published_at', { ascending: false })
    .range(from, to);
  if (error) throw new Error(`listNews failed: ${error.message}`);
  return { news: data ?? [], total: count ?? 0 };
}

export async function getNewsBySlug(slug: string) {
  const db = getPublicClient();
  const { data, error } = await db.from('news').select('*').eq('slug', slug).maybeSingle();
  if (error) throw new Error(`getNewsBySlug failed: ${error.message}`);
  if (!data) return null;

  const { data: linkedMembers } = await db
    .from('member_news')
    .select('confidence, member:members ( id, full_name, slug, photo_url, house )')
    .eq('news_id', data.id)
    .order('confidence', { ascending: false });

  return { news: data, linkedMembers: linkedMembers ?? [] };
}

export async function searchAll(q: string) {
  const db = getPublicClient();
  const trimmed = q.trim();
  if (!trimmed) return { members: [], news: [] };

  const [{ data: members }, { data: news }] = await Promise.all([
    db
      .from('members')
      .select('id, full_name, slug, house, photo_url')
      .ilike('full_name', `%${trimmed}%`)
      .eq('active', true)
      .limit(10),
    db
      .from('news')
      .select('id, slug, headline, summary, publisher, published_at')
      .ilike('headline', `%${trimmed}%`)
      .order('published_at', { ascending: false })
      .limit(10),
  ]);

  return { members: members ?? [], news: news ?? [] };
}
