-- =====================================================================
--  COMPETE SPORTS — Phase 1 (Discovery MVP) schema
--  Target: Supabase / PostgreSQL 15+
--
--  Design notes
--  ------------
--  * Multi-sport from day one. Sport is a first-class row; surfaces,
--    formats and divisions all hang off a sport, so adding pickleball
--    (or softball, or kickball) is data entry, never a migration.
--  * Adult recreational only. There are no youth age groups anywhere in
--    this model, and `events.adult_only` is a constant TRUE guard so that
--    any future youth work has to be an explicit, deliberate change.
--  * Radius search is served from venue lat/lng with a bounding-box
--    prefilter plus a haversine distance, which keeps the query on a
--    btree index and needs no PostGIS extension.
-- =====================================================================

create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------------
-- Reference data
-- ---------------------------------------------------------------------

create table if not exists sports (
  id            uuid primary key default gen_random_uuid(),
  slug          text not null unique,
  name          text not null,
  display_order int  not null default 0,
  is_active     boolean not null default true,
  created_at    timestamptz not null default now()
);

create table if not exists surfaces (
  id            uuid primary key default gen_random_uuid(),
  sport_id      uuid not null references sports(id) on delete cascade,
  slug          text not null,
  name          text not null,
  display_order int  not null default 0,
  unique (sport_id, slug)
);

-- A "format" is how teams are constituted: Men's Doubles, Coed Quads, ...
create table if not exists formats (
  id            uuid primary key default gen_random_uuid(),
  sport_id      uuid not null references sports(id) on delete cascade,
  slug          text not null,
  name          text not null,
  -- gender is a property of the format, and is also exposed as its own
  -- discovery filter per the Phase 1 closed filter list.
  gender        text not null check (gender in ('mens','womens','coed','reverse_coed','open')),
  team_size     int,
  display_order int  not null default 0,
  unique (sport_id, slug)
);

-- A "division" is competitive skill tier: Open, AAA, AA, A, BB, B, C, Rec.
create table if not exists divisions (
  id            uuid primary key default gen_random_uuid(),
  sport_id      uuid not null references sports(id) on delete cascade,
  slug          text not null,
  name          text not null,
  -- skill_rank orders tiers strongest (1) to most casual (higher).
  skill_rank    int not null default 0,
  display_order int not null default 0,
  unique (sport_id, slug)
);

-- ---------------------------------------------------------------------
-- Organizers and venues
-- ---------------------------------------------------------------------

create table if not exists organizers (
  id            uuid primary key default gen_random_uuid(),
  slug          text not null unique,
  name          text not null,
  contact_email text,
  website_url   text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create table if not exists venues (
  id            uuid primary key default gen_random_uuid(),
  name          text not null,
  address_line  text,
  city          text not null,
  state         text not null,          -- two-letter USPS code
  postal_code   text,
  latitude      double precision,
  longitude     double precision,
  -- how the coordinates were obtained; 'exact' comes from a geocoding
  -- provider, the rest are approximations we should not over-trust.
  geo_precision text not null default 'unknown'
                check (geo_precision in ('exact','postal','city','unknown')),
  geocoded_at   timestamptz,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index if not exists venues_latlng_idx on venues (latitude, longitude);
create index if not exists venues_state_city_idx on venues (state, city);

-- ---------------------------------------------------------------------
-- Events
-- ---------------------------------------------------------------------

create table if not exists events (
  id                    uuid primary key default gen_random_uuid(),
  slug                  text not null unique,
  sport_id              uuid not null references sports(id),
  venue_id              uuid references venues(id),
  organizer_id          uuid references organizers(id),

  name                  text not null,
  event_type            text not null default 'tournament'
                          check (event_type in ('tournament','league')),

  starts_on             date not null,
  ends_on               date,
  start_time            time,
  registration_deadline date,

  entry_fee_cents       int check (entry_fee_cents >= 0),
  fee_basis             text default 'per_player'
                          check (fee_basis in ('per_player','per_team')),
  payout_text           text,

  event_page_url        text,
  flyer_url             text,
  notes                 text,

  -- Adult recreational sport only, as an event property. Guarded, not
  -- merely documented: any future youth work has to be a deliberate
  -- schema change rather than one careless insert. (Accounts are a
  -- separate question — see 003_accounts.sql. A 16-year-old may hold an
  -- account; whether an organizer lets them enter is the organizer's
  -- call, and COMPETE does not list youth or age-group events either way.)
  adult_only            boolean not null default true,
  constraint events_adult_only_guard check (adult_only is true),

  -- Editorial featuring. `featured_until` makes a feature expire on its
  -- own, so a stale event cannot sit at the top of the homepage forever
  -- because nobody remembered to unflag it. 002_featured.sql adds these
  -- same three columns to a database created before they existed; on a
  -- fresh install they are here and 002 is a harmless no-op.
  featured              boolean not null default false,
  featured_rank         int,
  featured_until        date,

  status                text not null default 'draft'
                          check (status in ('draft','approved','cancelled','archived')),
  source                text not null default 'admin'
                          check (source in ('admin','import','host')),
  created_by            text,
  published_at          timestamptz,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),

  constraint events_end_after_start check (ends_on is null or ends_on >= starts_on)
);

create index if not exists events_discovery_idx
  on events (status, starts_on) where status = 'approved';
create index if not exists events_featured_idx
  on events (featured_rank nulls last, starts_on)
  where featured and status = 'approved';
create index if not exists events_sport_idx on events (sport_id, starts_on);
create index if not exists events_venue_idx on events (venue_id);

-- An event can run several surfaces, formats and divisions on the same
-- day, which is the norm in volleyball, so all three are many-to-many.
-- (Mother Lode, in the launch dataset, runs beach and grass together.)
create table if not exists event_surfaces (
  event_id   uuid not null references events(id) on delete cascade,
  surface_id uuid not null references surfaces(id) on delete cascade,
  primary key (event_id, surface_id)
);

create table if not exists event_formats (
  event_id  uuid not null references events(id) on delete cascade,
  format_id uuid not null references formats(id) on delete cascade,
  primary key (event_id, format_id)
);

create table if not exists event_divisions (
  event_id    uuid not null references events(id) on delete cascade,
  division_id uuid not null references divisions(id) on delete cascade,
  primary key (event_id, division_id)
);

create index if not exists event_surfaces_surface_idx on event_surfaces (surface_id);
create index if not exists event_formats_format_idx on event_formats (format_id);
create index if not exists event_divisions_division_idx on event_divisions (division_id);

-- ---------------------------------------------------------------------
-- updated_at maintenance
-- ---------------------------------------------------------------------

create or replace function set_updated_at() returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

do $$
declare t text;
begin
  foreach t in array array['organizers','venues','events'] loop
    execute format(
      'drop trigger if exists %1$s_set_updated_at on %1$s;
       create trigger %1$s_set_updated_at before update on %1$s
       for each row execute function set_updated_at();', t);
  end loop;
end $$;

-- ---------------------------------------------------------------------
-- Discovery view: one row per event, pre-joined and pre-aggregated.
-- ---------------------------------------------------------------------

create or replace view event_discovery as
select
  e.id,
  e.slug,
  e.name,
  e.event_type,
  e.starts_on,
  e.ends_on,
  e.start_time,
  e.registration_deadline,
  e.entry_fee_cents,
  e.fee_basis,
  e.payout_text,
  e.event_page_url,
  e.flyer_url,
  e.notes,
  e.status,
  e.featured,
  e.featured_rank,
  e.featured_until,
  sp.slug  as sport_slug,
  sp.name  as sport_name,
  coalesce(su.surface_slugs, '{}') as surface_slugs,
  coalesce(su.surface_names, '{}') as surface_names,
  o.name   as organizer_name,
  o.contact_email as organizer_email,
  v.name   as venue_name,
  v.address_line,
  v.city,
  v.state,
  v.postal_code,
  v.latitude,
  v.longitude,
  v.geo_precision,
  coalesce(f.format_slugs, '{}')    as format_slugs,
  coalesce(f.format_names, '{}')    as format_names,
  coalesce(f.genders, '{}')         as genders,
  coalesce(d.division_slugs, '{}')  as division_slugs,
  coalesce(d.division_names, '{}')  as division_names,
  d.top_skill_rank
from events e
join sports sp       on sp.id = e.sport_id
left join organizers o on o.id = e.organizer_id
left join venues v    on v.id = e.venue_id
left join lateral (
  select array_agg(sf.slug order by sf.display_order) as surface_slugs,
         array_agg(sf.name order by sf.display_order) as surface_names
  from event_surfaces es join surfaces sf on sf.id = es.surface_id
  where es.event_id = e.id
) su on true
left join lateral (
  select array_agg(fm.slug order by fm.display_order) as format_slugs,
         array_agg(fm.name order by fm.display_order) as format_names,
         array_agg(distinct fm.gender)                as genders
  from event_formats ef join formats fm on fm.id = ef.format_id
  where ef.event_id = e.id
) f on true
left join lateral (
  select array_agg(dv.slug order by dv.display_order) as division_slugs,
         array_agg(dv.name order by dv.display_order) as division_names,
         min(dv.skill_rank)                           as top_skill_rank
  from event_divisions ed join divisions dv on dv.id = ed.division_id
  where ed.event_id = e.id
) d on true;

-- ---------------------------------------------------------------------
-- Distance helper (miles). Immutable so the planner can inline it.
-- ---------------------------------------------------------------------

create or replace function miles_between(
  lat1 double precision, lng1 double precision,
  lat2 double precision, lng2 double precision
) returns double precision as $$
  select 3958.7613 * 2 * asin(sqrt(
      power(sin(radians(lat2 - lat1) / 2), 2)
    + cos(radians(lat1)) * cos(radians(lat2))
    * power(sin(radians(lng2 - lng1) / 2), 2)
  ));
$$ language sql immutable parallel safe;

-- ---------------------------------------------------------------------
-- Row Level Security
--   The app connects with the Postgres role over a pooled connection and
--   bypasses RLS, but policies are defined so that exposing the Supabase
--   anon key later (Phase 2 accounts) is safe by default.
-- ---------------------------------------------------------------------

alter table events           enable row level security;
alter table venues           enable row level security;
alter table organizers       enable row level security;
alter table sports           enable row level security;
alter table surfaces         enable row level security;
alter table formats          enable row level security;
alter table divisions        enable row level security;
alter table event_surfaces   enable row level security;
alter table event_formats    enable row level security;
alter table event_divisions  enable row level security;

drop policy if exists events_public_read on events;
create policy events_public_read on events
  for select using (status = 'approved');

do $$
declare t text;
begin
  foreach t in array array['venues','organizers','sports','surfaces',
                           'formats','divisions','event_surfaces','event_formats',
                           'event_divisions'] loop
    execute format('drop policy if exists %1$s_public_read on %1$s;
                    create policy %1$s_public_read on %1$s for select using (true);', t);
  end loop;
end $$;
