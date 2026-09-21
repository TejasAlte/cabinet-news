# Cabinet News

An interactive Parliament of India intelligence platform. Tracks Lok Sabha and Rajya Sabha
members and builds an automated, self-updating news archive around them — no manual uploads.

## Stack

Next.js 15 (App Router) · TypeScript · Tailwind CSS · Supabase · Vercel · GitHub Actions · RSS Parser · OpenAI

## What's real vs. what you must verify

This repo is fully wired and runnable, not a mockup. Two things depend on external services I
could not stand up on your behalf, and one data source needed a call I want to flag explicitly:

1. **`scripts/seed-members.ts` — Lok Sabha is verified, Rajya Sabha is not.**
   `https://sansad.in/api_ls/member` is the real, official Parliament of India API (confirmed by
   direct fetch, and independently corroborated as the official source behind the OpenSanctions
   "in_sansad" PEP dataset). It returns the full historical + current Lok Sabha roster as JSON.
   The Rajya Sabha equivalent (`RS_ENDPOINT` in that file) is my best-guess mirror of that URL
   pattern — I was not able to confirm its exact path. **Before running the seed script**, verify it:
   ```bash
   curl -s https://sansad.in/api_rs/member | head -c 500
   ```
   If that 404s, find the correct endpoint (check sansad.in/rs's network tab for its member-list
   XHR call) and update `RS_ENDPOINT` — the mapping code doesn't need to change unless the field
   names differ from the Lok Sabha shape.

2. **RSS feed URLs — I could not directly verify these from this environment; verify before relying on them.**
   Publishers change RSS paths without notice, and this environment's fetch tool is blocked from
   toi/thehindu domains, so I swapped my original guesses for the more commonly-documented URLs
   (`rss_toinews.cms`, `/news/national/feeder/`, etc.) found via search, but none are confirmed
   live by a direct fetch. **Before your first run**, verify all four:
   ```bash
   for url in $(grep rssUrl lib/rss-sources.ts | cut -d"'" -f2); do
     curl -s -o /dev/null -w "%{http_code}  $url\n" "$url"
   done
   ```
   A dead feed is skipped gracefully by the pipeline (logged, not fatal) — it won't break the
   run, it'll just silently under-report from that source until you fix the URL.

3. **You need your own Supabase project and (optionally) OpenAI key.** I obviously can't create
   Supabase/OpenAI accounts for you. Everything downstream — schema, RLS, queries, pipeline — is
   real code against the real `@supabase/supabase-js` and `openai` SDKs; it just needs your keys.

## Setup

```bash
npm install
cp .env.example .env.local   # fill in your Supabase + OpenAI keys
```

Run the migrations against your Supabase project (SQL editor, or the CLI):

```bash
supabase db push
# or paste supabase/migrations/*.sql into the Supabase SQL editor, in order
```

Seed members (verify the Rajya Sabha endpoint first — see above):

```bash
npm run seed:members
```

Run one scrape cycle manually:

```bash
npm run scrape:news
```

Start the app:

```bash
npm run dev
```

## Automated scheduling (every 10 minutes)

Two options, either works standalone:

- **GitHub Actions** (primary): `.github/workflows/scrape-news.yml` calls `POST /api/cron/scrape`
  every 10 minutes. Set repo secrets `APP_URL` (your deployed URL) and `CRON_SECRET` (must match
  the `CRON_SECRET` env var on your deployment).
- **Vercel Cron** (optional backup): `vercel.json` — edit the placeholder secret in the path, or
  delete the file if you're relying on GitHub Actions alone.

## Deploying to Vercel

```bash
vercel deploy
```

Set the same env vars from `.env.example` in the Vercel project settings (Production +
Preview). `NEXT_PUBLIC_*` vars are safe to expose; never set `SUPABASE_SERVICE_ROLE_KEY` or
`OPENAI_API_KEY` as public.

## Testing before you call it done

```bash
npm run typecheck   # no TS errors
npm run build       # project builds
npm run seed:members
npm run scrape:news # RSS parsing + dedupe + matching, end to end
```

For search: with data seeded, hit `/search?q=<any MP surname>` or `GET /api/search?q=...`.

## Hard rules this repo follows

- Never stores article bodies — only RSS title + description, and an original 40–60 word summary.
- Every news item links to its source publisher (`news.source_url`).
- Duplicate detection: exact `source_url` match, or same normalized headline + publisher within 48h.
- AI summaries use `gpt-4o-mini` via `OPENAI_API_KEY`; if unset or the call fails, a deterministic
  extractive fallback runs instead (`lib/ai-summary.ts`) so the pipeline never stalls.
- Row Level Security: the anon key can only `SELECT`. All writes (`seed-members`, `scrape-news`,
  the cron route) use the service-role key.

## What's intentionally out of scope here

- `bills` table exists in the schema ("future ready" per spec) but nothing populates it yet.
- No auth/admin UI — this is a public, read-only site by design; all mutation happens server-side.
- State/party filter query params on `/lok-sabha` and `/rajya-sabha` are supported by
  `lib/queries.ts` and `/api/members`, but no filter UI controls are wired up yet — add a couple of
  `<select>`s posting to the existing query params to finish that.
