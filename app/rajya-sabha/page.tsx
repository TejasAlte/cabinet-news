import { permanentRedirect } from 'next/navigation';

interface Props {
  params: Promise<{ slug: string }>;
}

// Mirrors app/lok-sabha/[slug]/page.tsx. Member profiles are canonically
// served from /member/[slug] (MemberGrid, search and the sitemap all link
// there); this route exists so /rajya-sabha/[slug] also resolves, without
// duplicating the profile render or splitting SEO signals across two paths.
export default async function RajyaSabhaMemberPage({ params }: Props) {
  const { slug } = await params;
  permanentRedirect(`/member/${slug}`);
}
