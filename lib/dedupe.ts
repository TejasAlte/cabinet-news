import { SupabaseClient } from '@supabase/supabase-js';
import { RawArticle } from '@/types';

const FORTY_EIGHT_HOURS_MS = 48 * 60 * 60 * 1000;

function normalizeHeadline(headline: string): string {
  return headline
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Returns true if the article should be SKIPPED because it's a duplicate:
 *  - exact source_url already stored, OR
 *  - same normalized headline + same publisher within the last 48h.
 */
export async function isDuplicate(db: SupabaseClient, article: RawArticle): Promise<boolean> {
  const { data: byUrl } = await db.from('news').select('id').eq('source_url', article.link).limit(1);
  if (byUrl && byUrl.length > 0) return true;

  const windowStart = new Date(new Date(article.publishedAt).getTime() - FORTY_EIGHT_HOURS_MS).toISOString();
  const { data: recent } = await db
    .from('news')
    .select('headline')
    .eq('publisher', article.publisher)
    .gte('published_at', windowStart);

  if (!recent) return false;

  const target = normalizeHeadline(article.headline);
  return recent.some((row: { headline: string }) => normalizeHeadline(row.headline) === target);
}
