import Link from 'next/link';

export interface NewsCardItem {
  id: string;
  slug: string;
  headline: string;
  summary: string;
  category: string | null;
  publisher: string;
  source_url: string;
  published_at: string;
  image_url: string | null;
  source?: { name: string; publisher: string; homepage_url: string | null } | null;
}

// Fixed formatter so server-rendered dates don't drift with the runtime locale
// or timezone of whichever machine renders the page.
const dateFormatter = new Intl.DateTimeFormat('en-IN', {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
  timeZone: 'Asia/Kolkata',
});

function formatPublishedAt(value: string) {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  return dateFormatter.format(parsed);
}

export default function NewsCard({ item }: { item: NewsCardItem }) {
  const publisher = item.source?.publisher || item.publisher;
  const publishedOn = formatPublishedAt(item.published_at);

  return (
    <article className="card flex flex-col p-5">
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <span className="badge badge-navy">{publisher}</span>
        {item.category && <span className="badge badge-saffron">{item.category}</span>}
        {publishedOn && (
          <time dateTime={item.published_at} className="text-xs text-slate-400">
            {publishedOn}
          </time>
        )}
      </div>

      <h3 className="mb-2 text-lg font-semibold leading-snug text-navy-900">
        <Link href={`/news/${item.slug}`} className="hover:text-saffron-700">
          {item.headline}
        </Link>
      </h3>

      <p className="mb-4 flex-1 text-sm leading-relaxed text-slate-600">{item.summary}</p>

      <a
        href={item.source_url}
        target="_blank"
        rel="noopener noreferrer nofollow"
        className="inline-flex w-fit items-center gap-1 rounded-md border border-slate-200 px-3 py-1.5 text-sm font-medium text-navy-900 transition-colors hover:border-saffron hover:text-saffron-700"
      >
        Read Original
        <span aria-hidden="true">&rarr;</span>
        <span className="sr-only"> (opens {publisher} in a new tab)</span>
      </a>
    </article>
  );
}
