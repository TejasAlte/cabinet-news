import type { MetadataRoute } from 'next';
import { getPublicClient } from '../lib/supabase';

const BASE_URL = 'https://cabinet.news';

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const staticRoutes: MetadataRoute.Sitemap = [
    { url: `${BASE_URL}/`, changeFrequency: 'hourly', priority: 1 },
    { url: `${BASE_URL}/lok-sabha`, changeFrequency: 'daily', priority: 0.9 },
    { url: `${BASE_URL}/rajya-sabha`, changeFrequency: 'daily', priority: 0.9 },
    { url: `${BASE_URL}/news`, changeFrequency: 'hourly', priority: 0.9 },
    { url: `${BASE_URL}/search`, changeFrequency: 'weekly', priority: 0.5 },
    { url: `${BASE_URL}/about`, changeFrequency: 'monthly', priority: 0.3 },
  ];

  try {
    const db = getPublicClient();
    const [{ data: members }, { data: news }] = await Promise.all([
      db.from('members').select('slug').eq('active', true).limit(5000),
      db.from('news').select('slug').order('published_at', { ascending: false }).limit(5000),
    ]);

    const memberRoutes: MetadataRoute.Sitemap = (members ?? []).map((m) => ({
      url: `${BASE_URL}/member/${m.slug}`,
      changeFrequency: 'daily',
      priority: 0.7,
    }));
    const newsRoutes: MetadataRoute.Sitemap = (news ?? []).map((n) => ({
      url: `${BASE_URL}/news/${n.slug}`,
      changeFrequency: 'never',
      priority: 0.6,
    }));

    return [...staticRoutes, ...memberRoutes, ...newsRoutes];
  } catch {
    // Supabase not configured at build time — fall back to static routes only.
    return staticRoutes;
  }
}
