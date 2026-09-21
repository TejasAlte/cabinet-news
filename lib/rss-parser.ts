import Parser from 'rss-parser';
import { RSS_SOURCES, RssSourceConfig } from './rss-sources';
import { RawArticle } from '@/types';

type FeedItem = {
  title?: string;
  link?: string;
  isoDate?: string;
  pubDate?: string;
  contentSnippet?: string;
  content?: string;
  enclosure?: { url?: string };
};

const parser = new Parser<Record<string, unknown>, FeedItem>({
  timeout: 15000,
  headers: { 'User-Agent': 'CabinetNewsBot/1.0 (+https://cabinet.news)' },
});

function extractImage(item: FeedItem): string | undefined {
  if (item.enclosure?.url) return item.enclosure.url;
  const html = item.content ?? '';
  const match = html.match(/<img[^>]+src="([^"]+)"/i);
  return match?.[1];
}

function normalize(item: FeedItem, source: RssSourceConfig): RawArticle | null {
  if (!item.title || !item.link) return null;
  const publishedAt = item.isoDate ?? (item.pubDate ? new Date(item.pubDate).toISOString() : null);
  if (!publishedAt) return null;

  return {
    headline: item.title.trim(),
    link: item.link.trim(),
    publisher: source.publisher,
    publishedAt,
    // RSS description only — this is publisher-syndicated metadata, not the article body.
    contentSnippet: (item.contentSnippet ?? '').trim().slice(0, 500),
    imageUrl: extractImage(item),
  };
}

/**
 * Fetch every configured RSS feed. A feed that fails (timeout, 404, malformed
 * XML) is logged and skipped — it never aborts the whole run.
 */
export async function fetchAllFeeds(): Promise<{ source: RssSourceConfig; articles: RawArticle[] }[]> {
  const results = await Promise.allSettled(
    RSS_SOURCES.map(async (source) => {
      const feed = await parser.parseURL(source.rssUrl);
      const articles = (feed.items ?? [])
        .map((item) => normalize(item, source))
        .filter((a): a is RawArticle => a !== null);
      return { source, articles };
    })
  );

  const out: { source: RssSourceConfig; articles: RawArticle[] }[] = [];
  for (const r of results) {
    if (r.status === 'fulfilled') {
      out.push(r.value);
    } else {
      console.error('[rss] feed failed, skipping:', r.reason?.message ?? r.reason);
    }
  }
  return out;
}
