import Link from 'next/link';
import { listNews } from '../lib/queries';

export const revalidate = 300;

export default async function HomePage() {
  let news: Awaited<ReturnType<typeof listNews>>['news'] = [];
  let loadError = false;

  try {
    const result = await listNews({ page: 1, pageSize: 9 });
    news = result.news;
  } catch {
    loadError = true;
  }

  return (
    <div>
      <section className="bg-navy text-white">
        <div className="container-page grid gap-8 py-16 md:grid-cols-2 md:items-center">
          <div>
            <span className="badge badge-saffron mb-4">Live, self-updating archive</span>
            <h1 className="text-4xl font-bold leading-tight sm:text-5xl">
              Every Lok Sabha and Rajya Sabha member. Every mention in the news.
            </h1>
            <p className="mt-4 text-lg text-slate-300">
              Cabinet News automatically discovers coverage of India&apos;s Members of Parliament from
              trusted publishers and links it to each MP&apos;s profile — no manual uploads, ever.
            </p>
            <div className="mt-6 flex flex-wrap gap-3">
              <Link href="/lok-sabha" className="rounded-md bg-saffron px-5 py-2.5 font-semibold text-navy-900 hover:bg-saffron-600">
                Browse Lok Sabha
              </Link>
              <Link href="/rajya-sabha" className="rounded-md border border-white/30 px-5 py-2.5 font-semibold hover:bg-white/10">
                Browse Rajya Sabha
              </Link>
            </div>
          </div>
        </div>
      </section>

      <section className="container-page py-12">
        <div className="mb-6 flex items-center justify-between">
          <h2 className="text-2xl font-bold text-navy-900">Latest News</h2>
          <Link href="/news" className="link-underline text-sm font-medium">
            View all
          </Link>
        </div>

        {loadError && (
          <p className="rounded-md border border-amber-200 bg-amber-50 p-4 text-amber-800">
            Couldn&apos;t load the latest news right now — check your Supabase connection (see .env.local).
          </p>
        )}

        {!loadError && news.length === 0 && (
          <p className="rounded-md border border-slate-200 bg-slate-50 p-4 text-slate-600">
            No news items yet. Run <code className="rounded bg-slate-200 px-1">npm run scrape:news</code> to
            populate the archive.
          </p>
        )}

        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {news.map((item) => (
            <article key={item.id} className="card flex flex-col p-5">
              {item.category && <span className="badge badge-navy mb-2 w-fit">{item.category}</span>}
              <h3 className="mb-2 text-lg font-semibold leading-snug text-navy-900">
                <Link href={`/news/${item.slug}`} className="hover:text-saffron-700">
                  {item.headline}
                </Link>
              </h3>
              <p className="mb-4 flex-1 text-sm text-slate-600">{item.summary}</p>
              <div className="flex items-center justify-between text-xs text-slate-400">
                <span>{item.publisher}</span>
                <span>{new Date(item.published_at).toLocaleDateString('en-IN')}</span>
              </div>
            </article>
          ))}
        </div>
      </section>
    </div>
  );
}
