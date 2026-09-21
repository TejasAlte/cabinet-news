import type { Metadata } from 'next';
import Link from 'next/link';
import { searchAll } from '../../lib/queries';

export const metadata: Metadata = {
  title: 'Search',
  description: 'Search Cabinet News for Members of Parliament and news coverage.',
};

interface Props {
  searchParams: Promise<{ q?: string }>;
}

export default async function SearchPage({ searchParams }: Props) {
  const { q = '' } = await searchParams;
  const results = q ? await searchAll(q).catch(() => ({ members: [], news: [] })) : { members: [], news: [] };

  return (
    <div className="container-page max-w-3xl py-10">
      <h1 className="text-3xl font-bold text-navy-900">Search</h1>
      <form className="mt-4 flex gap-2" action="/search" method="get">
        <input
          type="search"
          name="q"
          defaultValue={q}
          placeholder="Search MPs or news headlines…"
          className="flex-1 rounded-md border border-slate-300 px-4 py-2.5 focus:border-saffron focus:outline-none focus:ring-1 focus:ring-saffron"
        />
        <button type="submit" className="rounded-md bg-navy px-5 py-2.5 font-semibold text-white hover:bg-navy-700">
          Search
        </button>
      </form>

      {q && (
        <div className="mt-8 space-y-10">
          <section>
            <h2 className="mb-3 text-lg font-bold text-navy-900">Members</h2>
            {results.members.length === 0 && <p className="text-sm text-slate-500">No members found.</p>}
            <div className="space-y-2">
              {results.members.map((m: any) => (
                <Link
                  key={m.id}
                  href={`/member/${m.slug}`}
                  className="card flex items-center gap-3 p-3 hover:border-saffron"
                >
                  <span className="flex h-9 w-9 items-center justify-center overflow-hidden rounded-full bg-slate-100 text-sm font-semibold text-slate-500">
                    {m.photo_url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={m.photo_url} alt={m.full_name} className="h-full w-full object-cover" />
                    ) : (
                      m.full_name.charAt(0)
                    )}
                  </span>
                  <span>
                    <span className="block font-medium text-navy-900">{m.full_name}</span>
                    <span className="block text-xs text-slate-500">
                      {m.house === 'lok_sabha' ? 'Lok Sabha' : 'Rajya Sabha'}
                    </span>
                  </span>
                </Link>
              ))}
            </div>
          </section>

          <section>
            <h2 className="mb-3 text-lg font-bold text-navy-900">News</h2>
            {results.news.length === 0 && <p className="text-sm text-slate-500">No news found.</p>}
            <div className="space-y-2">
              {results.news.map((n: any) => (
                <Link key={n.id} href={`/news/${n.slug}`} className="card block p-4 hover:border-saffron">
                  <p className="font-medium text-navy-900">{n.headline}</p>
                  <p className="mt-1 text-sm text-slate-500">{n.summary}</p>
                </Link>
              ))}
            </div>
          </section>
        </div>
      )}
    </div>
  );
}
