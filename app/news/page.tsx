import type { Metadata } from 'next';
import Link from 'next/link';
import { listNews } from '../../lib/queries';

export const metadata: Metadata = {
  title: 'News',
  description: 'Automatically curated news coverage of Indian Members of Parliament, sourced from RSS feeds.',
};

export const revalidate = 120;

export default async function NewsPage() {
  let news: Awaited<ReturnType<typeof listNews>>['news'] = [];
  let loadError = false;

  try {
    const result = await listNews({ page: 1, pageSize: 30 });
    news = result.news;
  } catch {
    loadError = true;
  }

  return (
    <div className="container-page py-10">
      <h1 className="text-3xl font-bold text-navy-900">News</h1>
      <p className="mt-2 text-slate-600">
        Refreshed automatically every 10 minutes from RSS feeds — every item links to its original publisher.
      </p>

      {loadError && (
        <p className="mt-6 rounded-md border border-amber-200 bg-amber-50 p-4 text-amber-800">
          Couldn&apos;t load news right now — check your Supabase connection.
        </p>
      )}

      {!loadError && news.length === 0 && (
        <p className="mt-6 rounded-md border border-slate-200 bg-slate-50 p-4 text-slate-600">
          No news yet. Run <code className="rounded bg-slate-200 px-1">npm run scrape:news</code> to populate
          the archive.
        </p>
      )}

      <div className="mt-6 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {news.map((item) => (
          <article key={item.id} className="card flex flex-col p-5">
            {item.category && <span className="badge badge-navy mb-2 w-fit">{item.category}</span>}
            <h2 className="mb-2 text-lg font-semibold leading-snug text-navy-900">
              <Link href={`/news/${item.slug}`} className="hover:text-saffron-700">
                {item.headline}
              </Link>
            </h2>
            <p className="mb-4 flex-1 text-sm text-slate-600">{item.summary}</p>
            <div className="flex items-center justify-between text-xs text-slate-400">
              <span>{item.publisher}</span>
              <span>{new Date(item.published_at).toLocaleDateString('en-IN')}</span>
            </div>
          </article>
        ))}
      </div>
    </div>
  );
}
