import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getNewsBySlug } from '../../../lib/queries';

export const revalidate = 300;

interface Props {
  params: Promise<{ slug: string }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const result = await getNewsBySlug(slug).catch(() => null);
  if (!result) return { title: 'Article not found' };
  return {
    title: result.news.headline,
    description: result.news.summary,
    openGraph: {
      title: result.news.headline,
      description: result.news.summary,
      images: result.news.image_url ? [result.news.image_url] : undefined,
    },
  };
}

export default async function NewsDetailPage({ params }: Props) {
  const { slug } = await params;
  const result = await getNewsBySlug(slug).catch(() => null);
  if (!result) notFound();
  const { news, linkedMembers } = result;

  return (
    <div className="container-page max-w-3xl py-10">
      {news.category && <span className="badge badge-navy mb-3">{news.category}</span>}
      <h1 className="text-3xl font-bold leading-tight text-navy-900">{news.headline}</h1>
      <div className="mt-2 flex items-center gap-2 text-sm text-slate-500">
        <span>{news.publisher}</span>
        <span>&middot;</span>
        <span>{new Date(news.published_at).toLocaleString('en-IN')}</span>
      </div>

      <p className="mt-6 text-lg leading-relaxed text-slate-700">{news.summary}</p>

      <a
        href={news.source_url}
        target="_blank"
        rel="noopener noreferrer"
        className="mt-6 inline-flex items-center gap-2 rounded-md bg-saffron px-5 py-2.5 font-semibold text-navy-900 hover:bg-saffron-600"
      >
        Read full story at {news.publisher} →
      </a>

      {linkedMembers.length > 0 && (
        <div className="mt-10">
          <h2 className="mb-3 text-xl font-bold text-navy-900">Members mentioned</h2>
          <div className="flex flex-wrap gap-3">
            {linkedMembers.map((row: any) => {
              const m = row.member;
              if (!m) return null;
              return (
                <Link
                  key={m.id}
                  href={`/member/${m.slug}`}
                  className="flex items-center gap-2 rounded-full border border-slate-200 py-1.5 pl-1.5 pr-4 hover:border-saffron"
                >
                  <span className="flex h-8 w-8 items-center justify-center overflow-hidden rounded-full bg-slate-100 text-sm font-semibold text-slate-500">
                    {m.photo_url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={m.photo_url} alt={m.full_name} className="h-full w-full object-cover" />
                    ) : (
                      m.full_name.charAt(0)
                    )}
                  </span>
                  <span className="text-sm font-medium text-navy-900">{m.full_name}</span>
                </Link>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
