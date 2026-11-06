create function new_token() returns text language sql volatile
  as $$ select replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', '') $$;

create table households (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(trim(name)) between 1 and 80),
  created_at timestamptz not null default now());

create table people (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references households(id),
  name text not null check (length(trim(name)) between 1 and 60),
  kind text not null check (kind in ('adult', 'kid')),
  token text unique,
  is_organizer boolean not null default false,
  created_at timestamptz not null default now(),
  check ((kind = 'adult') = (token is not null)),
  check (not is_organizer or kind = 'adult'));

create table items (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references people(id),
  name text not null check (length(trim(name)) between 1 and 200),
  details text check (details is null or length(details) <= 500),
  url text check (url is null or (length(url) <= 2000 and url ~ '^https?://')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  removed_at timestamptz);
create index items_owner on items(owner_id);

-- One buyer per item: the primary key is what makes two simultaneous claims produce one winner.
create table claims (
  item_id uuid primary key references items(id),
  buyer_id uuid not null references people(id),
  created_at timestamptz not null default now());
create index claims_buyer on claims(buyer_id);

-- No policies: Supabase's public API (anon/authenticated) sees nothing. The app connects as the owner.
alter table households enable row level security;
alter table people enable row level security;
alter table items enable row level security;
alter table claims enable row level security;
