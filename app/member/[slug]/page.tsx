import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getMemberBySlug, getMemberNews } from '../../../lib/queries';

export const revalidate = 300;

interface Props {
  params: Promise<{ slug: string }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const member = await getMemberBySlug(slug).catch(() => null);
  if (!member) return { title: 'Member not found' };
  return {
    title: member.full_name,
    description: `News coverage and profile for ${member.full_name}, ${
      member.house === 'lok_sabha' ? 'Lok Sabha' : 'Rajya Sabha'
    } MP.`,
    openGraph: { images: member.photo_url ? [member.photo_url] : undefined },
  };
}

export default async function MemberPage({ params }: Props) {
  const { slug } = await params;
  const memberRaw = await getMemberBySlug(slug).catch(() => null);
  if (!memberRaw) notFound();
  // Supabase's untyped client infers to-one foreign table joins as arrays;
  // normalize them here rather than generating a typed client for this scaffold.
  const member = memberRaw as unknown as {
    id: string;
    full_name: string;
    house: 'lok_sabha' | 'rajya_sabha';
    photo_url: string | null;
    current_term: string | null;
    party: { name: string } | null;
    state: { name: string } | null;
    constituency: { name: string } | null;
  };

  const linkedNews = await getMemberNews(member.id).catch(() => []);

  return (
    <div className="container-page py-10">
      <div className="card flex flex-col gap-6 p-6 sm:flex-row sm:items-center">
        <div className="h-28 w-28 shrink-0 overflow-hidden rounded-full bg-slate-100">
          {member.photo_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={member.photo_url} alt={member.full_name} className="h-full w-full object-cover" />
          ) : (
            <div className="flex h-full w-full items-center justify-center text-3xl font-semibold text-slate-400">
              {member.full_name.charAt(0)}
            </div>
          )}
        </div>
        <div>
          <span className="badge badge-navy mb-2">
            {member.house === 'lok_sabha' ? 'Lok Sabha' : 'Rajya Sabha'}
          </span>
          <h1 className="text-3xl font-bold text-navy-900">{member.full_name}</h1>
          <p className="mt-1 text-slate-600">
            {member.party?.name ?? 'Independent'}
            {member.constituency?.name ? ` · ${member.constituency.name}` : ''}
            {member.state?.name ? ` · ${member.state.name}` : ''}
          </p>
          {member.current_term && (
            <p className="mt-1 text-sm text-slate-400">Term(s): {member.current_term}</p>
          )}
        </div>
      </div>

      <h2 className="mb-4 mt-10 text-2xl font-bold text-navy-900">News mentioning {member.full_name}</h2>

      {linkedNews.length === 0 && (
        <p className="rounded-md border border-slate-200 bg-slate-50 p-4 text-slate-600">
          No news linked yet. The pipeline links coverage automatically as it is discovered.
        </p>
      )}

      <div className="grid gap-6 sm:grid-cols-2">
        {linkedNews.map((row: any) => {
          const n = row.news;
          if (!n) return null;
          return (
            <article key={n.id} className="card flex flex-col p-5">
              {n.category && <span className="badge badge-saffron mb-2 w-fit">{n.category}</span>}
              <h3 className="mb-2 text-lg font-semibold leading-snug text-navy-900">
                <Link href={`/news/${n.slug}`} className="hover:text-saffron-700">
                  {n.headline}
                </Link>
              </h3>
              <p className="mb-4 flex-1 text-sm text-slate-600">{n.summary}</p>
              <div className="flex items-center justify-between text-xs text-slate-400">
                <span>{n.publisher}</span>
                <span>{new Date(n.published_at).toLocaleDateString('en-IN')}</span>
              </div>
            </article>
          );
        })}
      </div>
    </div>
  );
}
