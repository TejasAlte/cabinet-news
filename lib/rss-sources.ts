/**
 * RSS-only sources. We never scrape article bodies — only the RSS feed's own
 * title + description (which publishers explicitly syndicate for this purpose).
 *
 * NOTE: publishers change their RSS paths without notice. Verify each URL
 * resolves (curl -I) before relying on it in production; a dead feed is
 * skipped gracefully by the pipeline rather than failing the whole run.
 */
export interface RssSourceConfig {
  name: string;
  publisher: string;
  rssUrl: string;
  homepageUrl: string;
}

export const RSS_SOURCES: RssSourceConfig[] = [
  {
    name: 'toi-india',
    publisher: 'The Times of India',
    rssUrl: 'https://timesofindia.indiatimes.com/rss_toinews.cms',
    homepageUrl: 'https://timesofindia.indiatimes.com/india',
  },
  {
    name: 'the-hindu-national',
    publisher: 'The Hindu',
    rssUrl: 'https://www.thehindu.com/news/national/feeder/',
    homepageUrl: 'https://www.thehindu.com/news/national/',
  },
  {
    name: 'indian-express-india',
    publisher: 'The Indian Express',
    rssUrl: 'https://indianexpress.com/section/india/feed/',
    homepageUrl: 'https://indianexpress.com/section/india/',
  },
  {
    name: 'ani-india',
    publisher: 'ANI News',
    rssUrl: 'https://www.aninews.in/rss/national-news.xml',
    homepageUrl: 'https://www.aninews.in/',
  },
];
