-- Lets scripts/seed-members.ts upsert on (house, source_ref) so re-running the
-- seed script updates existing members instead of creating duplicates.
alter table members
  add constraint members_house_source_ref_unique unique (house, source_ref);
