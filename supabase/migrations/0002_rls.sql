-- Row Level Security: public read-only access; all writes go through the service role key
-- (used only by the seed script and the scrape pipeline, never exposed to the browser).

alter table states enable row level security;
alter table parties enable row level security;
alter table constituencies enable row level security;
alter table ministries enable row level security;
alter table members enable row level security;
alter table news_sources enable row level security;
alter table news enable row level security;
alter table member_news enable row level security;
alter table bills enable row level security;

create policy "public read states" on states for select using (true);
create policy "public read parties" on parties for select using (true);
create policy "public read constituencies" on constituencies for select using (true);
create policy "public read ministries" on ministries for select using (true);
create policy "public read members" on members for select using (true);
create policy "public read news_sources" on news_sources for select using (true);
create policy "public read news" on news for select using (true);
create policy "public read member_news" on member_news for select using (true);
create policy "public read bills" on bills for select using (true);

-- No insert/update/delete policies are defined for the anon role, so all writes
-- are rejected unless made with the service_role key, which bypasses RLS.
