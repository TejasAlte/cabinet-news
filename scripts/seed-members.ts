/**
 * Seeds `members` (plus `states`, `parties`, `constituencies`) from the
 * Parliament of India member rosters.
 *
 * ---------------------------------------------------------------------------
 * RECORD SHAPES — verified against 540 real Lok Sabha and 2,547 real Rajya
 * Sabha records (243 sitting + 2,304 former).
 *
 * Lok Sabha:
 *   { mpsno, initial, firstName, lastName, mpFirstLastName, mpLastFirstName,
 *     partyFname, partySname, stateName, constName, imageUrl, lsExpr,
 *     lastLoksabha, noOfTerms, status: "Sitting" }
 *
 * Rajya Sabha — a separately maintained table with DIFFERENT field names:
 *   { mpsno, name: "Last, Honorific First", firstName, lastName, initial,
 *     party, partyCode, state, imageUrl, term: "2021-2027", mpFlag: 1|0,
 *     status: "Sitting" | "Retirement" | "Death" | "Resignation" |
 *             "Elected to Lok Sabha" | "Disqualification" }
 *
 * normalizeMember() below maps both shapes to one internal record. RS string
 * fields are space-padded to fixed width ("Keralam" + ~53 spaces) and are
 * trimmed; a handful of RS members are mononymous (blank firstName — e.g.
 * Nirmala Sitharaman) and fall back to parsing the "Last, Honorific First"
 * form in `name`. Both houses carry `status`; "current sitting" is
 * `status === "Sitting"` for both.
 *
 * ---------------------------------------------------------------------------
 * SOURCES.
 *
 * Lok Sabha: https://sansad.in/api_ls/member — a known-good, verified JSON
 * endpoint, used directly.
 *
 * Rajya Sabha: the old /api_rs/* path is gone (404). The /rs/members page
 * is a fully client-rendered Next.js shell — its HTML carries no member
 * data, no RSC streaming chunks, and no <script src> references (the
 * runtime pulls batches in only after hydration). We therefore cannot rely
 * on scraping the document the way the original three strategies attempted.
 * Instead, we ask for the same data the hydrated client would: the page's
 * getServerSideProps JSON, addressed by the `buildId` and `page` values
 * the page itself exposes in its __NEXT_DATA__ blob. Those two strings are
 * always present, even on routes with `__N_SSP: true`, and resolve to
 * `/_next/data/{buildId}{page}.json` — the CDN serves that JSON directly.
 *
 * Beyond that primary probe, we ALSO keep three defensive strategies for
 * the cases where the structure moves again:
 *   1. Data embedded directly in the page's HTML or inline scripts.
 *   2. Data decoded from `self.__next_f.push([...])` RSC stream chunks.
 *   3. API path strings mined from any <script src> bundle the page does
 *      reference, plus a short list of conventional rewrites of the
 *      known-good LS path (the historical /api_rs/member and a handful
 *      of adjacent URLs — never assumed, only tried and shape-validated).
 *
 * Nothing from any of these is trusted on a 200 alone — every candidate
 * is parsed and shape-checked (looks like a member array of realistic
 * size, not arbitrary JSON) before being accepted. When the JSON probe
 * succeeds on the buildId path, the script logs exactly which strategy
 * won so the next failure is easy to diagnose.
 *
 * LS_MEMBER_FILE / LS_MEMBER_ENDPOINT / RS_MEMBER_FILE / RS_MEMBER_ENDPOINT
 * remain as optional overrides — never required, checked first only if set,
 * useful mainly if discovery ever needs to be pinned to a known-good result.
 *
 * ---------------------------------------------------------------------------
 * HTTP. Sansad.in sits behind a CDN that occasionally serves responses
 * whose header lines lack strict CRLF terminators. Node's legacy https.get
 * and undici's fetch are strict enough to refuse those with
 * `Parse Error: Missing expected CR after header value`; `curl` is more
 * lenient and has historically succeeded in the same place. fetchHtml() and
 * probeJson() therefore try global fetch first (for redirects, gzip, abort
 * timeouts — none of which the legacy https.get offered) and fall through
 * to a single `curl -sS` invocation only when fetch rejects the response.
 *
 * ---------------------------------------------------------------------------
 * RERUN SAFETY. `members` has a unique constraint on (house, source_ref)
 * (migration 0003), so upsert cannot duplicate. The real risk is STALE rows
 * — members no longer sitting, left over from an earlier run. This script
 * upserts the fresh roster, then prunes rows for that house whose
 * source_ref did NOT appear in this run, rather than deleting the house
 * first: `member_news.member_id` is ON DELETE CASCADE (migration 0001), so
 * blind deletion would destroy every verified article link and mint a new
 * UUID for every reimported member. Pruning by exclusion preserves both for
 * anyone still sitting. A floor (MIN_ROSTER_FOR_PRUNE) refuses to prune on
 * an implausibly small roster, so a partial fetch can't gut a chamber.
 *
 * Flags:
 *   --dry-run    fetch, normalize and report; touch nothing
 *   --no-prune   upsert only, leave stale rows alone
 *   --house=ls|rs   restrict to one chamber
 */
import 'dotenv/config';
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
import { getServiceClient, slugify } from '../lib/supabase';

type House = 'lok_sabha' | 'rajya_sabha';
type RawRecord = Record<string, unknown>;

const LS_ENDPOINT = 'https://sansad.in/api_ls/member';
// const RS_MEMBERS_PAGE = 'https://sansad.in/rs/members';
const RS_ENDPOINT =
  'https://sansad.in/api_rs/member/sitting-members?state=&party=&gender=&page=1&size=500&mpFlag=1&ageFrom=&ageTo=&terms=&search=&locale=en&month=&ministership=&membershipFrom=&membershipTo=&educationLevelCode=&degreeCode=&subjectCode=&profession1=&profession2=&profession3=&noOfChildren=&nominated=';
//

// Fields that only appear on genuine RS/LS member records — used to
// recognize a roster array buried in a page's embedded data, and to
// validate a discovered API response before trusting it.
const MEMBER_SHAPE_MARKERS = ['"mpsno"', '"partyCode"', '"stateName"', '"mpFlag"', '"partyFname"'];

const MIN_ROSTER_FOR_PRUNE: Record<House, number> = {
  lok_sabha: 400,
  rajya_sabha: 150,
};

const HTML_FETCH_TIMEOUT_MS = 20_000;
const DISCOVERY_TIMEOUT_MS = 20_000;
const BROWSER_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/140 Safari/537.36';
const CURL_BIN = process.env['SEED_MEMBERS_CURL_BIN'] ?? 'curl';

// A record is "member-shaped" if it carries at least one field only member
// records have — cheap enough to run on every array bestMemberArray() finds.
function looksLikeMemberRecord(r: unknown): r is RawRecord {
  if (!r || typeof r !== 'object') return false;
  const keys = Object.keys(r as RawRecord);
  return ['mpsno', 'partyCode', 'stateName', 'partyFname', 'mpFlag', 'firstName', 'name'].some((k) =>
    keys.includes(k)
  );
}

/**
 * Scans `text` for every top-level `[...]` span (string-literal-aware, so
 * brackets inside quoted strings don't confuse it) and returns the ones
 * whose content contains at least one of `markers`. Used to locate a member
 * roster array embedded in arbitrary HTML or decoded JS text without
 * needing to know its exact surrounding structure.
 */
export function findJsonArraysContaining(text: string, markers: string[]): string[] {
  const spans: Array<[number, number]> = [];
  const stack: number[] = [];
  let inStr = false;
  let strCh = '';
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inStr) {
      if (c === '\\') {
        i += 1;
        continue;
      }
      if (c === strCh) inStr = false;
      continue;
    }
    if (c === '"' || c === "'") {
      inStr = true;
      strCh = c;
      continue;
    }
    if (c === '[') stack.push(i);
    else if (c === ']') {
      const start = stack.pop();
      if (start !== undefined) spans.push([start, i]);
    }
  }
  const out: string[] = [];
  for (const [s, e] of spans) {
    const slice = text.slice(s, e + 1);
    if (slice.length > 200 && markers.some((m) => slice.includes(m))) out.push(slice);
  }
  return out;
}

/** Parses each candidate span and keeps the one that's a large array of
 *  member-shaped objects — the real roster, as opposed to some unrelated
 *  small array that happened to contain a matching substring. */
export function bestMemberArray(candidates: string[]): RawRecord[] | null {
  let best: RawRecord[] | null = null;
  for (const candidate of candidates) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(candidate);
    } catch {
      continue; // a partial/truncated span — not valid JSON on its own
    }
    if (!Array.isArray(parsed)) continue;
    const members = parsed.filter(looksLikeMemberRecord);
    if (members.length < 50) continue; // too small to be a full chamber roster
    if (!best || members.length > best.length) best = members;
  }
  return best;
}

export function extractScriptSrcs(html: string, baseUrl: string): string[] {
  const out = new Set<string>();
  const re = /<script[^>]+src=["']([^"']+)["']/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html))) {
    try {
      out.add(new URL(m[1], baseUrl).toString());
    } catch {
      // malformed src attribute — skip
    }
  }
  return [...out];
}

/** React Server Component streaming chunks look like
 *  `self.__next_f.push([1,"...escaped JSON string..."])`. The payload is a
 *  JS string literal; JSON.parse-ing it (it's double-quoted with standard
 *  escaping) unescapes it back to real text, inside which brackets and
 *  quotes are no longer escaped — that decoded text is what
 *  findJsonArraysContaining can then scan. */
export function extractRscDecodedChunks(html: string): string[] {
  const out: string[] = [];
  const re = /self\.__next_f\.push\(\[\d+,\s*("(?:[^"\\]|\\.)*")\]\)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html))) {
    try {
      out.push(JSON.parse(m[1]));
    } catch {
      // not a clean single string literal — skip
    }
  }
  return out;
}

/** Mines a JS bundle's source text for quoted path/URL strings that look
 *  like a member API — either "member" and "api" both present in one path,
 *  or an absolute sansad.in URL containing "api". */
export function findApiPathCandidates(js: string, baseUrl: string): string[] {
  const out = new Set<string>();
  const patterns = [
    /["'`](\/[a-zA-Z0-9_-]*api[a-zA-Z0-9_-]*\/[a-zA-Z0-9_\-/]*member[a-zA-Z0-9_\-/]*)["'`]/gi,
    /["'`](\/[a-zA-Z0-9_-]*member[a-zA-Z0-9_\-/]*api[a-zA-Z0-9_\-/]*)["'`]/gi,
    /["'`](https?:\/\/sansad\.in\/[a-zA-Z0-9_\-/]*api[a-zA-Z0-9_\-/]*)["'`]/gi,
  ];
  for (const re of patterns) {
    let m: RegExpExecArray | null;
    while ((m = re.exec(js))) {
      try {
        out.add(new URL(m[1], baseUrl).toString());
      } catch {
        // relative path that didn't resolve cleanly — skip
      }
    }
  }
  return [...out];
}

/**
 * Robust HTML fetch. The legacy https.get was failing intermittently
 * ("Parse Error", and occasional throws) on sansad.in, so we go through
 * global fetch with a hard timeout and let it handle redirects and
 * content-encoding (gzip/deflate/br) for us. If fetch itself errors on
 * the header parse — undici is stricter about malformed CRLF than curl —
 * we fall back to a single `curl -sS` call that has historically
 * succeeded where Node's HTTP stacks have not.
 */
async function fetchHtml(url: string): Promise<string> {
  try {
    const res = await fetch(url, {
      redirect: 'follow',
      signal: AbortSignal.timeout(HTML_FETCH_TIMEOUT_MS),
      headers: {
        'User-Agent': BROWSER_UA,
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-IN,en;q=0.9',
      },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.text();
  } catch (err) {
    try {
      const out = execFileSync(
        CURL_BIN,
        [
          '-sS',
          '-L',
          '--max-time',
          String(Math.ceil(HTML_FETCH_TIMEOUT_MS / 1000)),
          '-A',
          BROWSER_UA,
          '-H',
          'Accept-Language: en-IN,en;q=0.9',
          url,
        ],
        { encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 }
      );
      return out;
    } catch {
      // Re-throw the original Node error so the diagnostic tells the truth.
      throw err;
    }
  }
}

/** JSON-shaped probe. Mirrors fetchHtml's curl fallback — sansad.in's CDN
 *  is the same server in both cases, so the same header strictness caveats
 *  apply. Returns the parsed JSON or throws. */
async function probeJson(url: string): Promise<unknown> {
  try {
    const res = await fetch(url, {
      redirect: 'follow',
      signal: AbortSignal.timeout(DISCOVERY_TIMEOUT_MS),
      headers: {
        'User-Agent': BROWSER_UA,
        Accept: 'application/json,text/plain,*/*',
        'Accept-Language': 'en-IN,en;q=0.9',
      },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } catch (err) {
    try {
      const out = execFileSync(
        CURL_BIN,
        [
          '-sS',
          '-L',
          '--max-time',
          String(Math.ceil(DISCOVERY_TIMEOUT_MS / 1000)),
          '-A',
          BROWSER_UA,
          '-H',
          'Accept: application/json,text/plain,*/*',
          '-H',
          'Accept-Language: en-IN,en;q=0.9',
          url,
        ],
        { encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 }
      );
      return JSON.parse(out);
    } catch {
      throw err;
    }
  }
}

/** Pulls `buildId` and `page` out of the page's __NEXT_DATA__ blob (or
 *  trailing script tag). They're always present, even on fully
 *  client-rendered routes, and let us call the same getServerSideProps
 *  data endpoint the hydrated React client uses. */
function extractNextDataContext(
  html: string
): { buildId: string | null; page: string | null; assetPrefix: string | null } {
  const m = html.match(/"buildId"\s*:\s*"([A-Za-z0-9_-]+)"/);
  const pg = html.match(/"page"\s*:\s*"([^"\\]*(?:\\.[^"\\]*)*)"/);
  const ap = html.match(/"assetPrefix"\s*:\s*"([^"\\]*(?:\\.[^"\\]*)*)"/);
  return {
    buildId: m ? m[1] : null,
    page: pg ? pg[1] : null,
    assetPrefix: ap ? ap[1] : null,
  };
}

/**
 * Finds and returns the current Rajya Sabha sitting-member roster without
 * hardcoding an endpoint, by trying, in order:
 *   1. Data embedded directly in the page HTML / inline scripts.
 *   2. Data decoded from React Server Component streaming chunks.
 *   3. API path strings mined from any <script src> bundle the page does
 *      reference, plus a short list of historical RS URLs.
 *   4. The page's own Next.js getServerSideProps JSON
 *      (/_next/data/{buildId}{page}.json — the exact URL the hydrated
 *      client hits after mount, addressable from the buildId/page the
 *      page itself exposes in __NEXT_DATA__).
 * Every candidate is shape-validated before being trusted. Returns [] and
 * reports exactly which of the four strategies (if any) won.
 */

// 
export async function discoverRsRoster(): Promise<RawRecord[]> {
  console.log('[seed-members] Rajya Sabha: fetching official sitting members');

  try {
    const res = await fetch(RS_ENDPOINT, {
      headers: {
        'User-Agent': BROWSER_UA,
        Accept: 'application/json',
        'Accept-Language': 'en-IN,en;q=0.9',
      },
    });

    if (!res.ok) throw new Error(`HTTP ${res.status}`);

    const payload = await res.json();
    const rows = unwrapRoster(payload);

    console.log(`[seed-members] Rajya Sabha: ${rows.length} records fetched`);

    return rows;
  } catch (err) {
    console.error(
      `[seed-members] Rajya Sabha failed: ${(err as Error).message}`
    );
    return [];
  }
}
// 

// export async function discoverRsRoster(): Promise<RawRecord[]> {
//   console.log(`[seed-members] Rajya Sabha: no endpoint configured — discovering live from ${RS_MEMBERS_PAGE}`);

//   let html = '';
//   try {
//     html = await fetchHtml(RS_MEMBERS_PAGE);
//   } catch (err) {
//     console.warn(
//       `[seed-members] Rajya Sabha: could not fetch ${RS_MEMBERS_PAGE} (${(err as Error).message})`
//     );
//     return [];
//   }

//   // Strategy 1: data embedded directly in the page's own markup/script tags.
//   const inlineRoster = bestMemberArray(findJsonArraysContaining(html, MEMBER_SHAPE_MARKERS));
//   if (inlineRoster) {
//     console.log(`[seed-members] Rajya Sabha: found ${inlineRoster.length} records embedded directly in the page.`);
//     return inlineRoster;
//   }

//   // Strategy 2: data embedded in a React Server Components stream. The array
//   // lives inside an escaped JS string, invisible to a scan of the raw HTML
//   // until that string is decoded.
//   const rscChunks = extractRscDecodedChunks(html);
//   for (const chunk of rscChunks) {
//     const roster = bestMemberArray(findJsonArraysContaining(chunk, MEMBER_SHAPE_MARKERS));
//     if (roster) {
//       console.log(`[seed-members] Rajya Sabha: found ${roster.length} records in an RSC stream chunk.`);
//       return roster;
//     }
//   }

//   // Build the candidate set across strategies 3 and 4 together so a single
//   // probe pass covers them all.
//   const apiCandidates = new Set<string>();

//   // Strategy 3: path-shaped strings inside any script bundle the page
//   // references, plus a small list of conventional rewrites of the
//   // known-good LS path (api_rs / api/rs / rsapi / ...). The historical
//   // /api_rs/member stays in here as a fallback — the script's earlier
//   // shape-validation step means a 200 on a wrong path cannot succeed,
//   // so listing it costs nothing and gives us a chance if it comes back.
//   const scriptSrcs = extractScriptSrcs(html, RS_MEMBERS_PAGE);
//   if (scriptSrcs.length > 0) {
//     console.log(`[seed-members] Rajya Sabha: scanning ${scriptSrcs.length} script bundle(s) for an API path...`);
//     for (const src of scriptSrcs.slice(0, 30)) {
//       try {
//         const res = await fetch(src, {
//           redirect: 'follow',
//           signal: AbortSignal.timeout(DISCOVERY_TIMEOUT_MS),
//           headers: { 'User-Agent': BROWSER_UA },
//         });
//         if (!res.ok) continue;
//         const js = await res.text();
//         for (const c of findApiPathCandidates(js, RS_MEMBERS_PAGE)) apiCandidates.add(c);
//       } catch {
//         // one bundle failing to fetch shouldn't stop the scan
//       }
//     }
//   } else {
//     console.log(
//       '[seed-members] Rajya Sabha: page HTML carries no <script src> references; the page hydrates entirely from the Next.js runtime.'
//     );
//   }
//   [
//     'https://sansad.in/api_rs/member',
//     'https://sansad.in/api/Rs/member',
//     'https://sansad.in/api/rs/member',
//     'https://sansad.in/api/rs/members',
//     'https://sansad.in/rsapi/member',
//     'https://sansad.in/rsapi/members',
//     'https://sansad.in/rs/api/member',
//     'https://sansad.in/rs/api/members',
//   ].forEach((u) => apiCandidates.add(u));

//   // Strategy 4: the page's own Next.js getServerSideProps data endpoint.
//   // Addressable from the buildId + page the page itself exposed — same
//   // URL the hydrated client would ask for, just earlier than mount.
//   const ctx = extractNextDataContext(html);
//   if (ctx.buildId) {
//     const pageUnderAsset =
//       ctx.assetPrefix && ctx.page
//         ? `${ctx.assetPrefix.replace(/\/$/, '')}${ctx.page.startsWith('/') ? ctx.page : '/' + ctx.page}`
//         : ctx.page ?? '/members';
//     const candidates = [
//       `/_next/data/${ctx.buildId}${pageUnderAsset}.json`,
//       `/_next/data/${ctx.buildId}/rs/members.json`,
//       `/_next/data/${ctx.buildId}/members.json`,
//       `/_next/data/${ctx.buildId}${ctx.page ?? ''}.json`,
//     ];
//     for (const p of candidates) {
//       try {
//         apiCandidates.add(new URL(p, RS_MEMBERS_PAGE).toString());
//       } catch {
//         // skip
//       }
//     }
//   } else {
//     console.log(
//       '[seed-members] Rajya Sabha: page HTML did not expose a buildId; skipping getServerSideProps probe.'
//     );
//   }

//   if (apiCandidates.size === 0) {
//     console.warn(
//       '[seed-members] Rajya Sabha: no candidate endpoints were produced. See the "automatic ' +
//         'discovery found no working source" warning below.'
//     );
//     return [];
//   }

//   console.log(`[seed-members] Rajya Sabha: probing ${apiCandidates.size} candidate endpoint(s)...`);
//   for (const url of apiCandidates) {
//     try {
//       const rows = unwrapRoster(await probeJson(url));
//       const members = rows.filter(looksLikeMemberRecord);
//       if (members.length >= 50) {
//         console.log(`[seed-members] Rajya Sabha: confirmed working endpoint ${url} (${members.length} records).`);
//         return members;
//       }
//     } catch {
//       // not JSON, blocked, or network error — try the next candidate
//     }
//   }

//   console.warn(
//     `[seed-members] Rajya Sabha: automatic discovery found no working source. ` +
//       `Tried embedded page data, ${rscChunks.length} RSC chunk(s), ${scriptSrcs.length} script bundle(s), ` +
//       `and ${apiCandidates.size} candidate endpoint(s) — none returned a valid roster. sansad.in/rs's structure has ` +
//       'likely changed beyond what this discovery logic recognizes; the RS_MEMBER_FILE / RS_MEMBER_ENDPOINT ' +
//       'overrides above remain available as a fallback.'
//   );
//   return [];
// }

interface SourceSpec {
  kind: 'url' | 'file';
  location: string;
}

/** Optional, never required. Checked first only if actually set. */
function configuredSourcesFor(house: House): SourceSpec[] {
  const prefix = house === 'lok_sabha' ? 'LS' : 'RS';
  const specs: SourceSpec[] = [];
  const file = process.env[`${prefix}_MEMBER_FILE`];
  const url = process.env[`${prefix}_MEMBER_ENDPOINT`];
  if (file) specs.push({ kind: 'file', location: file });
  if (url) specs.push({ kind: 'url', location: url });
  return specs;
}

interface NormalizedMember {
  sourceRef: string;
  fullName: string;
  nameVariants: string[];
  partyFull: string | null;
  partyShort: string | null;
  stateName: string | null;
  constName: string | null;
  photoUrl: string | null;
  currentTerm: string | null;
  sitting: boolean;
}

/** Trim to null. RS fields are space-padded to fixed width; untrimmed
 *  values fragment the states/parties lookup tables. */
function str(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  const s = String(value).replace(/\s+/g, ' ').trim();
  return s ? s : null;
}

/** The roster may be a bare array or wrapped; sources disagree on this. */
export function unwrapRoster(payload: unknown): RawRecord[] {
  if (Array.isArray(payload)) return payload as RawRecord[];
  if (!payload || typeof payload !== 'object') return [];
  const obj = payload as Record<string, unknown>;
  for (const key of ['membersDtoList', 'membersDtoLists', 'records', 'data', 'items', 'list', 'rows']) {
    if (Array.isArray(obj[key])) return obj[key] as RawRecord[];
  }
  return [];
}

async function loadFromSpec(spec: SourceSpec, label: string): Promise<RawRecord[]> {
  try {
    if (spec.kind === 'file') {
      const path = resolve(process.cwd(), spec.location);
      const rows = unwrapRoster(JSON.parse(readFileSync(path, 'utf8')));
      console.log(`[seed-members] ${label}: ${rows.length} records from file ${spec.location}`);
      return rows;
    }
    const res = await fetch(spec.location, {
      headers: { 'User-Agent': 'CabinetNewsBot/1.0', Accept: 'application/json' },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const rows = unwrapRoster(await res.json());
    console.log(`[seed-members] ${label}: ${rows.length} records from ${spec.location}`);
    return rows;
  } catch (err) {
    console.warn(`[seed-members] ${label}: ${spec.location} failed (${(err as Error).message})`);
    return [];
  }
}

async function loadRoster(house: House, label: string): Promise<RawRecord[]> {
  // Configured overrides win if present — but nothing requires them.
  for (const spec of configuredSourcesFor(house)) {
    const rows = await loadFromSpec(spec, label);
    if (rows.length) return rows;
  }
  if (house === 'lok_sabha') {
    return loadFromSpec({ kind: 'url', location: LS_ENDPOINT }, label);
  }
  return discoverRsRoster();
}

/**
 * "Abdul Wahab, Shri " -> "Abdul Wahab"; "Agrawal, Dr. Radha Mohan Das" ->
 * "Radha Mohan Das Agrawal". Used only when firstName/lastName are both
 * blank, which happens for a handful of mononymous RS members.
 */
function fromLastFirst(name: string | null): string | null {
  if (!name) return null;
  const idx = name.indexOf(',');
  if (idx === -1) return name;
  const last = name.slice(0, idx).trim();
  const rest = name
    .slice(idx + 1)
    .replace(
      /^(shri|smt\.?|dr\.?|prof\.?|kumari|sushri|ms\.?|mr\.?|mrs\.?|adv\.?|col\.?|capt\.?|gen\.?|justice|maulana|sardar)\s+/i,
      ''
    )
    .trim();
  return [rest, last].filter(Boolean).join(' ').trim() || null;
}

/**
 * @param assumeSittingIfUnknown When neither `status` nor `mpFlag` is
 *   present on a record, treat it as sitting rather than dropping it. Used
 *   for RS records discovered from sansad.in/rs/members, whose default tab
 *   is "Sitting Members" — a record with no status field on that page is a
 *   sitting member, not an unknown. Left false for LS, whose known-good
 *   endpoint always carries `status` and covers the full historical roster.
 */
export function normalizeMember(raw: RawRecord, assumeSittingIfUnknown = false): NormalizedMember | null {
  const sourceRef = str(raw.mpsno) ?? str(raw.mpCode) ?? str(raw.memberCode) ?? str(raw.id);
  if (!sourceRef) return null;

  const first = str(raw.firstName);
  const last = str(raw.lastName);
  const rawName = str(raw.name) ?? str(raw.memberName);

  const fullName =
    [first, last].filter(Boolean).join(' ').trim() ||
    str(raw.mpFirstLastName) ||
    fromLastFirst(rawName) ||
    '';
  if (!fullName) return null;

  const variants = new Set<string>([fullName]);
  const initial = str(raw.initial);
  if (initial) variants.add(`${initial} ${fullName}`);
  const lastFirst = str(raw.mpLastFirstName) ?? rawName;
  if (lastFirst) variants.add(lastFirst);
  if (last && first) variants.add(`${last} ${first}`);

  const status = str(raw.status);
  const mpFlag = raw.mpFlag;
  const sitting = status
    ? status.toLowerCase() === 'sitting'
    : mpFlag === 1 || mpFlag === '1'
      ? true
      : mpFlag === 0 || mpFlag === '0'
        ? false
        : assumeSittingIfUnknown;

  return {
    sourceRef,
    fullName,
    nameVariants: [...variants],
    partyFull: str(raw.partyFname) ?? str(raw.party),
    partyShort: str(raw.partySname) ?? str(raw.partyCode),
    stateName: str(raw.stateName) ?? str(raw.state),
    constName: str(raw.constName) ?? str(raw.constituency),
    photoUrl: str(raw.imageUrl) ?? str(raw.photoUrl) ?? str(raw.image),
    currentTerm: str(raw.lsExpr) ?? str(raw.term) ?? str(raw.lastLoksabha),
    sitting,
  };
}

async function upsertLookup(
  db: ReturnType<typeof getServiceClient>,
  table: 'states' | 'parties' | 'ministries',
  matchCol: string,
  value: string | null,
  extra: Record<string, unknown> = {}
): Promise<string | null> {
  if (!value) return null;
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
  house: House,
  stateId: string | null
): Promise<string | null> {
  if (!name) return null;
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
  roster: NormalizedMember[],
  house: House,
  opts: { prune: boolean }
): Promise<{ upserted: number; errors: number; pruned: number }> {
  let upserted = 0;
  let errors = 0;

  for (const m of roster) {
    try {
      const stateId = await upsertLookup(db, 'states', 'name', m.stateName);
      const partyId = await upsertLookup(db, 'parties', 'name', m.partyFull, {
        short_name: m.partyShort || m.partyFull,
      });
      const constituencyId = await upsertConstituency(db, m.constName, house, stateId);

      // Upsert on (house, source_ref) keeps the existing row's UUID, so
      // member_news links survive a reseed.
      const { error } = await db.from('members').upsert(
        {
          full_name: m.fullName,
          slug: slugify(`${m.fullName}-${house}-${m.sourceRef}`),
          house,
          constituency_id: constituencyId,
          state_id: stateId,
          party_id: partyId,
          photo_url: m.photoUrl,
          current_term: m.currentTerm,
          active: true,
          name_variants: m.nameVariants,
          source_ref: m.sourceRef,
        },
        { onConflict: 'house,source_ref' }
      );

      if (error) {
        console.error(`[seed-members] upsert failed for ${m.fullName}: ${error.message}`);
        errors += 1;
        continue;
      }
      upserted += 1;
    } catch (err) {
      console.error(`[seed-members] unexpected error: ${(err as Error).message}`);
      errors += 1;
    }
  }

  let pruned = 0;
  if (opts.prune && upserted > 0) {
    pruned = await pruneStale(db, house, roster.map((m) => m.sourceRef));
  }

  return { upserted, errors, pruned };
}

/**
 * Removes rows for this house that the current roster no longer contains —
 * members who have retired, died, resigned or moved chambers. Scoped by
 * source_ref exclusion rather than a blanket delete, so sitting members keep
 * their UUIDs and their member_news rows (which cascade on member delete).
 */
async function pruneStale(
  db: ReturnType<typeof getServiceClient>,
  house: House,
  keepRefs: string[]
): Promise<number> {
  if (keepRefs.length < MIN_ROSTER_FOR_PRUNE[house]) {
    console.warn(
      `[seed-members] skipping prune for ${house}: only ${keepRefs.length} members ` +
        `(expected at least ${MIN_ROSTER_FOR_PRUNE[house]}). Refusing to delete on a partial roster.`
    );
    return 0;
  }

  const { data: existing, error } = await db.from('members').select('id, source_ref').eq('house', house);
  if (error) {
    console.error(`[seed-members] prune lookup failed: ${error.message}`);
    return 0;
  }

  const keep = new Set(keepRefs);
  const staleIds = (existing ?? [])
    .filter((row) => !row.source_ref || !keep.has(String(row.source_ref)))
    .map((row) => row.id as string);
  if (!staleIds.length) return 0;

  let removed = 0;
  for (let i = 0; i < staleIds.length; i += 200) {
    const chunk = staleIds.slice(i, i + 200);
    const { error: delErr } = await db.from('members').delete().in('id', chunk);
    if (delErr) {
      console.error(`[seed-members] prune delete failed: ${delErr.message}`);
      break;
    }
    removed += chunk.length;
  }
  console.warn(
    `[seed-members] pruned ${removed} stale ${house} row(s) no longer in the roster ` +
      '(their member_news links cascade away with them).'
  );
  return removed;
}

export async function runSeed() {
  const argv = process.argv.slice(2);
  const dryRun = argv.includes('--dry-run');
  const prune = !argv.includes('--no-prune');
  const houseArg = argv.find((a) => a.startsWith('--house='))?.split('=')[1];
  const doLS = !houseArg || houseArg === 'ls' || houseArg === 'lok_sabha';
  const doRS = !houseArg || houseArg === 'rs' || houseArg === 'rajya_sabha';

  const [lsRaw, rsRaw] = await Promise.all([
    doLS ? loadRoster('lok_sabha', 'Lok Sabha') : Promise.resolve([]),
    doRS ? loadRoster('rajya_sabha', 'Rajya Sabha') : Promise.resolve([]),
  ]);

  const normalize = (rows: RawRecord[], label: string, assumeSittingIfUnknown: boolean) => {
    const mapped = rows.map((r) => normalizeMember(r, assumeSittingIfUnknown));
    const dropped = mapped.filter((m) => m === null).length;
    if (dropped > 0) {
      console.warn(`[seed-members] ${label}: ${dropped} record(s) had no usable name or id — skipped.`);
      if (rows.length && dropped / rows.length > 0.5) {
        console.warn(
          `[seed-members] ${label}: over half the roster was unusable. The field shape has likely ` +
            'changed — check normalizeMember() against a sample record.'
        );
      }
    }
    const usable = mapped.filter((m): m is NormalizedMember => m !== null);
    const sitting = usable.filter((m) => m.sitting);
    console.log(`[seed-members] ${label}: ${sitting.length} sitting of ${usable.length} usable`);
    return sitting;
  };

  const lsRoster = normalize(lsRaw, 'Lok Sabha', false);
  // RS's discovered source is scoped to the "Sitting Members" tab, so an RS
  // record with no status/mpFlag field is still a sitting member, not an
  // unknown — see normalizeMember's doc comment.
  const rsRoster = normalize(rsRaw, 'Rajya Sabha', true);

  if (doRS && rsRoster.length === 0) {
    console.warn(
      '[seed-members] No Rajya Sabha members resolved this run — see the "Rajya Sabha: automatic discovery ' +
        'found no working source" warning above for exactly what was tried.'
    );
  }

  if (dryRun) {
    console.log(
      '[seed-members] dry run — nothing written. Would import:',
      JSON.stringify({ lok_sabha: lsRoster.length, rajya_sabha: rsRoster.length }, null, 2)
    );
    return;
  }

  const db = getServiceClient();
  const lsResult = lsRoster.length ? await seedHouse(db, lsRoster, 'lok_sabha', { prune }) : null;
  const rsResult = rsRoster.length ? await seedHouse(db, rsRoster, 'rajya_sabha', { prune }) : null;

  console.log('[seed-members] done:', JSON.stringify({ lsResult, rsResult }, null, 2));
}

if (require.main === module) {
  runSeed()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error('[seed-members] fatal error:', err);
      process.exit(1);
    });
}
