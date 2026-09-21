-- Cabinet News — initial schema
-- Run with: supabase db push  (or paste into the Supabase SQL editor)

create extension if not exists "pgcrypto";
create extension if not exists "pg_trgm";

-- ---------- Reference tables ----------

create table if not exists states (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  slug text not null unique
);

create table if not exists parties (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  short_name text not null unique,
  slug text not null unique,
  color_hex text
);

create table if not exists constituencies (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  state_id uuid references states(id) on delete set null,
  house text not null check (house in ('lok_sabha', 'rajya_sabha')),
  unique (name, house, state_id)
);

create table if not exists ministries (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  slug text not null unique
);

-- ---------- Members ----------

create table if not exists members (
  id uuid primary key default gen_random_uuid(),
  full_name text not null,
  slug text not null unique,
  house text not null check (house in ('lok_sabha', 'rajya_sabha')),
  constituency_id uuid references constituencies(id) on delete set null,
  state_id uuid references states(id) on delete set null,
  party_id uuid references parties(id) on delete set null,
  ministry_id uuid references ministries(id) on delete set null,
  photo_url text,
  current_term text,
  active boolean not null default true,
  name_variants text[] not null default '{}',  -- honorific/initials variants for matching
  source_ref text,                              -- external id from the official source, for idempotent upserts
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_members_house on members(house);
create index if not exists idx_members_party on members(party_id);
create index if not exists idx_members_state on members(state_id);
create index if not exists idx_members_active on members(active);
create index if not exists idx_members_name_trgm on members using gin (full_name gin_trgm_ops);

-- ---------- News ----------

create table if not exists news_sources (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  publisher text not null,
  rss_url text not null unique,
  homepage_url text,
  active boolean not null default true,
  last_fetched_at timestamptz
);

create table if not exists news (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  headline text not null,
  summary text not null,              -- original 40-60 word AI/deterministic summary — never the article body
  category text,
  source_id uuid references news_sources(id) on delete set null,
  source_url text not null unique,     -- canonical link to the original publisher; dedupe key
  publisher text not null,
  published_at timestamptz not null,
  image_url text,
  match_confidence real,               -- overall best match confidence across linked members
  created_at timestamptz not null default now()
);

create index if not exists idx_news_published_at on news(published_at desc);
create index if not exists idx_news_source_url on news(source_url);
create index if not exists idx_news_headline_trgm on news using gin (headline gin_trgm_ops);

-- Composite dedupe helper: same headline + publisher within 48h is rejected in application logic
create index if not exists idx_news_headline_publisher on news(publisher, headline);

create table if not exists member_news (
  member_id uuid not null references members(id) on delete cascade,
  news_id uuid not null references news(id) on delete cascade,
  confidence real not null default 0,
  matched_variant text,
  primary key (member_id, news_id)
);

create index if not exists idx_member_news_member on member_news(member_id);
create index if not exists idx_member_news_news on member_news(news_id);

-- ---------- Bills (future ready) ----------

create table if not exists bills (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  slug text not null unique,
  house text check (house in ('lok_sabha', 'rajya_sabha', 'joint')),
  status text,
  introduced_on date,
  summary text,
  source_url text,
  created_at timestamptz not null default now()
);

-- ---------- updated_at trigger ----------

create or replace function set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_members_updated_at on members;
create trigger trg_members_updated_at
  before update on members
  for each row execute function set_updated_at();
