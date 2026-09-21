export type House = 'lok_sabha' | 'rajya_sabha';

export interface Member {
  id: string;
  full_name: string;
  slug: string;
  house: House;
  constituency_id: string | null;
  state_id: string | null;
  party_id: string | null;
  ministry_id: string | null;
  photo_url: string | null;
  current_term: string | null;
  active: boolean;
  name_variants: string[];
  source_ref: string | null;
}

export interface NewsSource {
  id: string;
  name: string;
  publisher: string;
  rss_url: string;
  homepage_url: string | null;
  active: boolean;
}

export interface NewsItem {
  id: string;
  slug: string;
  headline: string;
  summary: string;
  category: string | null;
  source_id: string | null;
  source_url: string;
  publisher: string;
  published_at: string;
  image_url: string | null;
  match_confidence: number | null;
}

export interface RawArticle {
  headline: string;
  link: string;
  publisher: string;
  publishedAt: string; // ISO
  contentSnippet: string; // RSS description only — never full body
  imageUrl?: string;
}

export interface MemberMatch {
  memberId: string;
  fullName: string;
  confidence: number; // 0..1
  matchedVariant: string;
}

export interface AiSummaryResult {
  summary: string;
  category: string;
  people: string[];
}
