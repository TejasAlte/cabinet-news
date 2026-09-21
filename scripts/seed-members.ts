/**
 * Seeds `members` (plus `states`, `parties`, `constituencies`) from the
 * official Parliament of India member APIs on sansad.in.
 *
 * VERIFIED (as of this writing): https://sansad.in/api_ls/member returns the
 * full historical + current Lok Sabha roster as JSON — confirmed by direct
 * fetch and corroborated by OpenSanctions' "in_sansad" dataset, which lists
 * that exact URL as its official source. Response shape:
 *   { metaDatasDto: {...}, membersDtoList: [ { mpsno, initial, firstName,
 *     lastName, gender, partyFname, partySname, stateName, constName,
 *     imageUrl, lastLoksabha, status: "Sitting"|"Former"|"Died"|"Resigned",
 *     noOfTerms, ... } ] }
 *
 * UNVERIFIED: the equivalent Rajya Sabha endpoint. sansad.in/rs is the
 * Rajya Sabha Secretariat's site and very likely exposes a matching
 * `api_rs/member` (mirroring the `api_ls/member` naming), but I have not
 * been able to confirm its exact path or shape. RS_ENDPOINT below is set to
 * that best guess — verify with `curl -s https://sansad.in/api_rs/member | head`
 * before relying on it, and adjust RS_MEMBER_SHAPE / the mapping function if
 * the real field names differ. If the endpoint 404s, the script logs a clear
 * warning and continues with Lok Sabha only rather than failing the run.
 *
 * Idempotent: upserts on (house, source_ref=mpsno), so running this twice
 * updates existing rows instead of duplicating them.
 */
import 'dotenv/config';
import { getServiceClient, slugify } from '../lib/supabase';

const LS_ENDPOINT = 'https://sansad.in/api_ls/member';
const RS_ENDPOINT = 'https://sansad.in/api_rs/member'; // unverified — see header comment

interface SansadMemberDto {
  mpsno: number;
  initial: string | null;
  firstName: string;
  lastName: string;
  gender: string;
  partyFname: string | null;
  partySname: string | null;
  stateName: string | null;
  constName: string | null;
  imageUrl: string | null;
  lastLoksabha: number | null;
  lsExpr?: string;
  noOfTerms: number;
  status: string; // "Sitting" | "Former" | "Died" | "Resigned" | ...
}

interface SansadResponse {
  metaDatasDto: { totalElements: number; totalPages: number };
  membersDtoList: SansadMemberDto[];
}

async function fetchRoster(url: string, label: string): Promise<SansadMemberDto[]> {
  try {
    const res = await fetch(url, { headers: { 'User-Agent': 'CabinetNewsBot/1.0' } });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = (await res.json()) as SansadResponse;
    return data.membersDtoList ?? [];
  } catch (err) {
    console.warn(`[seed-members] ${label} fetch failed, skipping (${(err as Error).message})`);
    return [];
  }
}

function fullName(m: SansadMemberDto): string {
  const parts = [m.firstName, m.lastName].map((s) => (s ?? '').trim()).filter(Boolean);
  return parts.join(' ').replace(/\s+/g, ' ').trim();
}

function nameVariants(m: SansadMemberDto): string[] {
  const variants = new Set<string>();
  if (m.initial) variants.add(`${m.initial} ${fullName(m)}`.trim());
  variants.add(fullName(m));
  return [...variants];
}

async function upsertLookup(
  db: ReturnType<typeof getServiceClient>,
  table: 'states' | 'parties' | 'ministries',
  matchCol: string,
  value: string | null,
  extra: Record<string, unknown> = {}
): Promise<string | null> {
  if (!value || !value.trim()) return null;
  const { data: existing } = await db.from(table).select('id').eq(matchCol, value).limit(1).maybeSingle();
  if (existing) return existing.id as string;

  const { data: inserted, error } = await db
    .from(table)
    .insert({ [matchCol]: value, slug: slugify(value), ...extra })
    .select('id')
    .single();
  if (error) {
    console.error(`[seed-members] failed to upsert ${table}("${value}"): ${error.message}`);
    return null;
  }
  return inserted.id as string;
}

async function upsertConstituency(
  db: ReturnType<typeof getServiceClient>,
  name: string | null,
  house: 'lok_sabha' | 'rajya_sabha',
  stateId: string | null
): Promise<string | null> {
  if (!name || !name.trim()) return null;
  const query = db.from('constituencies').select('id').eq('name', name).eq('house', house);
  const { data: existing } = stateId
    ? await query.eq('state_id', stateId).limit(1).maybeSingle()
    : await query.is('state_id', null).limit(1).maybeSingle();
  if (existing) return existing.id as string;

  const { data: inserted, error } = await db
    .from('constituencies')
    .insert({ name, house, state_id: stateId })
    .select('id')
    .single();
  if (error) {
    console.error(`[seed-members] failed to upsert constituency("${name}"): ${error.message}`);
    return null;
  }
  return inserted.id as string;
}

async function seedHouse(
  db: ReturnType<typeof getServiceClient>,
  roster: SansadMemberDto[],
  house: 'lok_sabha' | 'rajya_sabha'
): Promise<{ upserted: number; errors: number }> {
  let upserted = 0;
  let errors = 0;

  for (const m of roster) {
    try {
      const name = fullName(m);
      if (!name) continue;

      const stateId = await upsertLookup(db, 'states', 'name', m.stateName);
      const partyId = await upsertLookup(db, 'parties', 'name', m.partyFname, {
        short_name: m.partySname || m.partyFname,
      });
      const constituencyId = await upsertConstituency(db, m.constName, house, stateId);

      const active = m.status === 'Sitting';
      const slug = slugify(`${name}-${house}-${m.mpsno}`);

      // Idempotent upsert keyed on (house, source_ref) — see migration 0003,
      // which adds the unique constraint this relies on.
      const { error } = await db.from('members').upsert(
        {
          full_name: name,
          slug,
          house,
          constituency_id: constituencyId,
          state_id: stateId,
          party_id: partyId,
          photo_url: m.imageUrl,
          current_term: m.lsExpr ?? (m.lastLoksabha ? String(m.lastLoksabha) : null),
          active,
          name_variants: nameVariants(m),
          source_ref: String(m.mpsno),
        },
        { onConflict: 'house,source_ref' }
      );

      if (error) {
        console.error(`[seed-members] upsert failed for ${name}: ${error.message}`);
        errors += 1;
        continue;
      }

      upserted += 1;
    } catch (err) {
      console.error(`[seed-members] unexpected error: ${(err as Error).message}`);
      errors += 1;
    }
  }

  return { upserted, errors };
}

export async function runSeed() {
  const db = getServiceClient();

  const [lsAll, rsAll] = await Promise.all([
  fetchRoster(LS_ENDPOINT, 'Lok Sabha'),
  fetchRoster(RS_ENDPOINT, 'Rajya Sabha'),
]);

// ONLY CURRENT MEMBERS
const lsRoster = lsAll.filter(m => m.status === 'Sitting');
const rsRoster = rsAll.filter(m => m.status === 'Sitting');

console.log(
  `[seed-members] current MPs: ${lsRoster.length} LS, ${rsRoster.length} RS`
);

const lsResult = await seedHouse(db, lsRoster, 'lok_sabha');
const rsResult = rsRoster.length
  ? await seedHouse(db, rsRoster, 'rajya_sabha')
  : { upserted: 0, errors: 0 };

  console.log('[seed-members] done:', JSON.stringify({ lsResult, rsResult }, null, 2));
  if (rsRoster.length === 0) {
    console.warn(
      '[seed-members] Rajya Sabha endpoint returned nothing — verify RS_ENDPOINT in this file against ' +
        'the real sansad.in/rs API before relying on Rajya Sabha data.'
    );
  }
}

if (require.main === module) {
  runSeed()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error('[seed-members] fatal error:', err);
      process.exit(1);
    });
}
