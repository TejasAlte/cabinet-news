import { permanentRedirect } from 'next/navigation';

interface Props {
  params: Promise<{ slug: string }>;
}

// Member profiles are canonically served from /member/[slug] (MemberGrid, search
// and the sitemap all link there). This route exists so /lok-sabha/[slug] also
// resolves, without duplicating the profile render or splitting SEO signals.
export default async function LokSabhaMemberPage({ params }: Props) {
  const { slug } = await params;
  permanentRedirect(`/member/${slug}`);
}
