/**
 * Cabinet News scrape pipeline.
 * Runs standalone (`npm run scrape:news`) or is invoked by app/api/cron/scrape/route.ts.
 *
 * Steps: fetch RSS -> normalize -> dedupe -> match MPs -> summarize -> persist -> link.
 */
import 'dotenv/config';
import { getServiceClient, slugify } from '../lib/supabase';
import { fetchAllFeeds } from '../lib/rss-parser';
import { isDuplicate } from '../lib/dedupe';
import { matchMembers } from '../lib/member-matcher';
import { generateSummary } from '../lib/ai-summary';
import { RawArticle } from '../types';

interface RunSummary {
  fetched: number;
  skippedDuplicate: number;
  inserted: number;
  membersLinked: number;
  errors: string[];
}

export async function runScrapePipeline(): Promise<RunSummary> {
  const db = getServiceClient();
  const result: RunSummary = { fetched: 0, skippedDuplicate: 0, inserted: 0, membersLinked: 0, errors: [] };

  // Load all active members once; matching is done in-process against the full roster.
  const { data: members, error: membersErr } = await db
    .from('members')
    .select('id, full_name, name_variants')
    .eq('active', true);
  if (membersErr) throw new Error(`failed to load members: ${membersErr.message}`);

  // Map source URL -> source_id for FK linking, upserting news_sources as we go.
  const feeds = await fetchAllFeeds();

  for (const { source, articles } of feeds) {
    const { data: sourceRow, error: sourceErr } = await db
      .from('news_sources')
      .upsert(
        {
          name: source.name,
          publisher: source.publisher,
          rss_url: source.rssUrl,
          homepage_url: source.homepageUrl,
          active: true,
          last_fetched_at: new Date().toISOString(),
        },
        { onConflict: 'rss_url' }
      )
      .select('id')
      .single();

    if (sourceErr || !sourceRow) {
      result.errors.push(`source upsert failed for ${source.name}: ${sourceErr?.message}`);
      continue;
    }

    for (const article of articles as RawArticle[]) {
      result.fetched += 1;
      try {
        if (await isDuplicate(db, article)) {
          result.skippedDuplicate += 1;
          continue;
        }

        const ai = await generateSummary(article);
        const matches = matchMembers(`${article.headline} ${article.contentSnippet}`, members ?? []);

        const slug = `${slugify(article.headline)}-${Date.now().toString(36)}`;
        const { data: newsRow, error: newsErr } = await db
          .from('news')
          .insert({
            slug,
            headline: article.headline,
            summary: ai.summary,
            category: ai.category,
            source_id: sourceRow.id,
            source_url: article.link,
            publisher: article.publisher,
            published_at: article.publishedAt,
            image_url: article.imageUrl ?? null,
            match_confidence: matches[0]?.confidence ?? null,
          })
          .select('id')
          .single();

        if (newsErr || !newsRow) {
          result.errors.push(`insert failed for "${article.headline}": ${newsErr?.message}`);
          continue;
        }

        result.inserted += 1;

        if (matches.length > 0) {
          const rows = matches.map((m) => ({
            member_id: m.memberId,
            news_id: newsRow.id,
            confidence: m.confidence,
            matched_variant: m.matchedVariant,
          }));
          const { error: linkErr } = await db.from('member_news').insert(rows);
          if (linkErr) {
            result.errors.push(`member_news insert failed for "${article.headline}": ${linkErr.message}`);
          } else {
            result.membersLinked += rows.length;
          }
        }
      } catch (err) {
        result.errors.push(`unexpected error for "${article.headline}": ${(err as Error).message}`);
      }
    }
  }

  return result;
}

// Allow direct execution: `npm run scrape:news`
if (require.main === module) {
  runScrapePipeline()
    .then((r) => {
      console.log('[scrape-news] run complete:', JSON.stringify(r, null, 2));
      //
       if (r.errors.length) {
        console.log('\n=== ERRORS ===');
        r.errors.forEach((e) => console.log(e));
      }
      //
      process.exit(r.errors.length > 0 ? 1 : 0);
    })
    .catch((err) => {
      console.error('[scrape-news] fatal error:', err);
      process.exit(1);
    });
}
