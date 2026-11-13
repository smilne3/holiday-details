-- Off-list gifts: one a buyer adds to someone's list, which everyone but that person sees (#21).
-- They live in their own table so every query that reads a list owner's items for that owner
-- never meets one, and a rollback to code from before this table leaves them hidden
-- (docs/adr/0001-off-list-gifts-in-their-own-table.md). The buyer is on the row: there's no claim.
create table off_list_gifts (
  id uuid primary key default gen_random_uuid(),
  recipient_id uuid not null references people(id),
  buyer_id uuid not null references people(id),
  name text not null check (length(trim(name)) between 1 and 200),
  price text check (price is null or length(price) <= 40),
  details text check (details is null or length(details) <= 500),
  url text check (url is null or (length(url) <= 2000 and url ~ '^https?://')),
  created_at timestamptz not null default now(),
  check (buyer_id <> recipient_id));
create index off_list_gifts_recipient on off_list_gifts(recipient_id);
create index off_list_gifts_buyer on off_list_gifts(buyer_id);

-- No policies, as for every other table: Supabase's public API sees nothing.
alter table off_list_gifts enable row level security;
