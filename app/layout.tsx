import type { Metadata } from 'next';
import Link from 'next/link';
import './globals.css';

export const metadata: Metadata = {
  metadataBase: new URL('https://cabinet.news'),
  title: { default: 'Cabinet News — Parliament of India Intelligence', template: '%s | Cabinet News' },
  description:
    'Track every Lok Sabha and Rajya Sabha member with an automatically updating news archive, sourced from RSS feeds and linked publisher by publisher.',
  openGraph: {
    title: 'Cabinet News',
    description: 'Interactive Parliament of India intelligence — members, parties, and automatically curated news.',
    type: 'website',
  },
};

const NAV_LINKS = [
  { href: '/lok-sabha', label: 'Lok Sabha' },
  { href: '/rajya-sabha', label: 'Rajya Sabha' },
  { href: '/news', label: 'News' },
  { href: '/search', label: 'Search' },
  { href: '/about', label: 'About' },
];

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="flex min-h-screen flex-col font-sans">
        <header className="border-b border-slate-200 bg-navy">
          <div className="container-page flex h-16 items-center justify-between">
            <Link href="/" className="flex items-center gap-2 text-lg font-bold text-white">
              <span className="inline-block h-2.5 w-2.5 rounded-full bg-saffron" />
              Cabinet News
            </Link>
            <nav className="hidden gap-6 text-sm font-medium text-slate-200 md:flex">
              {NAV_LINKS.map((link) => (
                <Link key={link.href} href={link.href} className="hover:text-saffron transition-colors">
                  {link.label}
                </Link>
              ))}
            </nav>
            <Link
              href="/search"
              className="rounded-md bg-saffron px-3 py-1.5 text-sm font-semibold text-navy-900 hover:bg-saffron-600 md:hidden"
            >
              Search
            </Link>
          </div>
        </header>
        <main className="flex-1">{children}</main>
        <footer className="border-t border-slate-200 bg-navy-900 text-slate-300">
          <div className="container-page flex flex-col gap-2 py-8 text-sm sm:flex-row sm:items-center sm:justify-between">
            <p>&copy; {new Date().getFullYear()} Cabinet News. Not affiliated with the Parliament of India.</p>
            <p>News summaries are original and link to the publisher for the full story.</p>
          </div>
        </footer>
      </body>
    </html>
  );
}
