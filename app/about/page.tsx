import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'About',
  description: 'How Cabinet News tracks Parliament of India members and builds its automated news archive.',
};

export default function AboutPage() {
  return (
    <div className="container-page max-w-2xl py-10">
      <h1 className="text-3xl font-bold text-navy-900">About Cabinet News</h1>
      <div className="prose prose-slate mt-6 max-w-none space-y-4 text-slate-700">
        <p>
          Cabinet News is an interactive intelligence platform for the Parliament of India. It tracks every
          current Lok Sabha and Rajya Sabha member and automatically builds a historical news archive around
          them — no one on our team uploads articles by hand.
        </p>
        <h2 className="text-xl font-bold text-navy-900">How it works</h2>
        <ol className="list-decimal space-y-2 pl-5">
          <li>Member rosters are seeded and kept current from the Parliament&apos;s own sansad.in member APIs.</li>
          <li>A scheduled pipeline reads RSS feeds from The Times of India, The Hindu, The Indian Express, and ANI every 10 minutes.</li>
          <li>Each article is deduplicated, matched to any MPs it mentions (handling honorifics, initials, and multiple names), and given an original 40&ndash;60 word summary.</li>
          <li>Nothing but the publisher&apos;s own RSS title and description is ever read — we never scrape or store full article bodies, and every item links back to the original publisher.</li>
        </ol>
        <p className="text-sm text-slate-500">
          Cabinet News is an independent project and is not affiliated with, endorsed by, or connected to the
          Parliament of India, the Lok Sabha Secretariat, or the Rajya Sabha Secretariat.
        </p>
      </div>
    </div>
  );
}
