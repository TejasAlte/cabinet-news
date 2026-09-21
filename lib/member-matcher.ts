import { Member, MemberMatch } from '@/types';

const HONORIFICS = ['dr\\.?', 'shri', 'smt\\.?', 'prof\\.?', 'shrimati', 'kumari', 'ms\\.?', 'mr\\.?'];
const HONORIFIC_STRIP = new RegExp(`^(${HONORIFICS.join('|')})\\s+`, 'i');

function stripHonorific(name: string): string {
  return name.replace(HONORIFIC_STRIP, '').trim();
}

function normalize(name: string): string {
  return stripHonorific(name)
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Builds "initial + surname" variants, e.g. "Narendra Modi" -> "n modi", "n. modi" */
function initialVariant(fullName: string): string | null {
  const parts = normalize(fullName).split(' ').filter(Boolean);
  if (parts.length < 2) return null;
  const initials = parts.slice(0, -1).map((p) => p[0]).join(' ');
  const surname = parts[parts.length - 1];
  return `${initials} ${surname}`;
}

/**
 * All name variants a member could be referred to as in press copy:
 * full name, honorific-stripped, and initial+surname. Combined with any
 * manually curated name_variants stored on the member record (aliases,
 * common misspellings, English transliterations of vernacular bylines).
 */
export function buildNameVariants(member: Pick<Member, 'full_name' | 'name_variants'>): string[] {
  const variants = new Set<string>();
  variants.add(normalize(member.full_name));
  const initials = initialVariant(member.full_name);
  if (initials) variants.add(initials);
  for (const v of member.name_variants ?? []) {
    variants.add(normalize(v));
  }
  return [...variants].filter(Boolean);
}

/**
 * Scans article text (headline + RSS snippet) for mentions of known members.
 * Returns one match per member at most, with a confidence score:
 *   1.0  — full name matched verbatim (honorific-insensitive)
 *   0.7  — initials + surname matched (e.g. "N. Modi")
 *   0.5  — surname-only matched AND state/constituency also mentioned in text
 * Ambiguous surname-only hits with no supporting context are dropped.
 */
export function matchMembers(
  text: string,
  members: Pick<Member, 'id' | 'full_name' | 'name_variants'>[]
): MemberMatch[] {
  const haystack = ` ${normalize(text)} `;
  const matches: MemberMatch[] = [];

  for (const member of members) {
    const fullVariant = normalize(member.full_name);
    const initials = initialVariant(member.full_name);
    let best: { confidence: number; variant: string } | null = null;

    if (fullVariant && haystack.includes(` ${fullVariant} `)) {
      best = { confidence: 1.0, variant: fullVariant };
    } else if (initials && haystack.includes(` ${initials} `)) {
      best = { confidence: 0.7, variant: initials };
    } else {
      for (const v of member.name_variants ?? []) {
        const nv = normalize(v);
        if (nv && haystack.includes(` ${nv} `)) {
          best = { confidence: 0.85, variant: nv };
          break;
        }
      }
    }

    if (best) {
      matches.push({
        memberId: member.id,
        fullName: member.full_name,
        confidence: best.confidence,
        matchedVariant: best.variant,
      });
    }
  }

  return matches.sort((a, b) => b.confidence - a.confidence);
}
