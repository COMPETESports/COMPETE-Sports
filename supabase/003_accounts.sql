-- =====================================================================
--  COMPETE SPORTS — Phase 2: accounts and profiles
--  Run this after 001_schema.sql and 002_featured.sql.
--
--  Design notes
--  ------------
--  * One account, additive roles. A tournament director is also a player,
--    so `is_athlete` and `is_host` are independent flags rather than a
--    single "type" the person has to choose between.
--  * Two ways in, one account. Credentials live in their own table keyed
--    by provider, so signing in with Google after having registered by
--    email lands on the SAME account instead of quietly creating a second.
--  * No dates of birth. Age is a self-declared bracket and nothing else,
--    which means there is no exact birth date to leak and none to secure.
--  * Accounts are 13+. Enforced in the application at sign-up; the bracket
--    'under_18' therefore means 13-17.
--  * A minor never has a phone number on file. That is a CHECK constraint,
--    not a convention, because it is the kind of rule that quietly rots.
--  * SMS consent is an append-only evidence log. Rows are never updated
--    and never deleted; current state is the latest row per purpose. TCPA
--    consent is only worth having if you can prove what was shown, when,
--    and what the person agreed to.
-- =====================================================================

-- ---------------------------------------------------------------------
-- Accounts
-- ---------------------------------------------------------------------

create table if not exists accounts (
  id                uuid primary key default gen_random_uuid(),
  -- Stored lowercased by the application; unique so two sign-in methods
  -- on the same address converge on one account.
  email             text not null unique
                      check (length(email) between 3 and 254),
  email_verified_at timestamptz,
  -- Bounded, because this renders in the page header. Without a limit a
  -- megabyte of "name" stores happily and then has to be drawn.
  display_name      text not null
                      check (length(display_name) between 1 and 60),

  -- Additive roles. Everyone starts as an athlete; the Host hat is a
  -- toggle inside the same account.
  is_athlete        boolean not null default true,
  is_host           boolean not null default false,
  is_staff          boolean not null default false,

  -- Present and unused. Adding a column to an empty table is free; adding
  -- one to a live table full of accounts is a migration and a backfill.
  plan              text not null default 'free'
                      check (plan in ('free','local','regional','national')),

  status            text not null default 'active'
                      check (status in ('active','suspended','closed')),

  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  last_seen_at      timestamptz
);

create index if not exists accounts_email_idx on accounts (lower(email));

-- One row per sign-in method. `provider_uid` is Google's stable subject
-- for google, and the lowercased email for password.
create table if not exists account_credentials (
  account_id    uuid not null references accounts(id) on delete cascade,
  provider      text not null check (provider in ('password','google')),
  provider_uid  text not null,
  -- scrypt, formatted as scrypt$N$r$p$salt$hash. Null for google.
  password_hash text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  primary key (account_id, provider),
  unique (provider, provider_uid),
  constraint credentials_password_has_hash
    check (provider <> 'password' or password_hash is not null)
);

-- Server-side sessions, so "sign out everywhere" and revocation are
-- possible. The cookie carries an opaque token; only its hash is stored.
create table if not exists account_sessions (
  id           uuid primary key default gen_random_uuid(),
  account_id   uuid not null references accounts(id) on delete cascade,
  token_hash   text not null unique,
  user_agent   text,
  created_at   timestamptz not null default now(),
  last_used_at timestamptz not null default now(),
  expires_at   timestamptz not null
);

create index if not exists account_sessions_account_idx on account_sessions (account_id);
create index if not exists account_sessions_expiry_idx on account_sessions (expires_at);

-- Single-use tokens for email verification and password reset.
create table if not exists account_tokens (
  id          uuid primary key default gen_random_uuid(),
  account_id  uuid not null references accounts(id) on delete cascade,
  purpose     text not null check (purpose in ('email_verify','password_reset')),
  token_hash  text not null unique,
  expires_at  timestamptz not null,
  consumed_at timestamptz,
  created_at  timestamptz not null default now()
);

create index if not exists account_tokens_account_idx on account_tokens (account_id, purpose);

-- ---------------------------------------------------------------------
-- Athlete profile
-- ---------------------------------------------------------------------

create table if not exists athlete_profiles (
  account_id           uuid primary key references accounts(id) on delete cascade,

  -- Home location. The ZIP drives the Local rail and the radius search;
  -- city, state and coordinates are derived from it, never typed.
  home_postal_code     text check (home_postal_code ~ '^[0-9]{5}$'),
  home_city            text,
  home_state           text,
  latitude             double precision,
  longitude            double precision,

  travel_radius_miles  int not null default 100
                         check (travel_radius_miles between 10 and 250),

  -- Volunteered, never required, never verified. No date of birth.
  age_bracket          text check (age_bracket in
                         ('under_18','18_24','25_34','35_44','45_54','55_plus')),
  gender               text check (gender in ('male','female','undisclosed')),

  -- E.164, e.g. +13145551234. Optional but recommended for adults.
  phone_e164           text check (phone_e164 ~ '^\+1[0-9]{10}$'),

  -- New-tournament alerts. The criteria are this profile: home ZIP plus
  -- radius plus the preference tables below.
  sms_alerts_enabled   boolean not null default false,
  sms_snoozed_until    date,

  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),

  -- No minor has a phone number on file, so no minor can be texted.
  constraint athlete_no_minor_phone
    check (age_bracket is distinct from 'under_18' or phone_e164 is null),
  -- Alerts require a number to send them to.
  constraint athlete_alerts_need_phone
    check (sms_alerts_enabled is false or phone_e164 is not null)
);

create index if not exists athlete_profiles_latlng_idx
  on athlete_profiles (latitude, longitude);

-- Preferences. Many-to-many against the same reference tables events use,
-- so a preference and an event filter are always the same vocabulary.
create table if not exists athlete_sports (
  account_id uuid not null references accounts(id) on delete cascade,
  sport_id   uuid not null references sports(id) on delete cascade,
  primary key (account_id, sport_id)
);

create table if not exists athlete_surfaces (
  account_id uuid not null references accounts(id) on delete cascade,
  surface_id uuid not null references surfaces(id) on delete cascade,
  primary key (account_id, surface_id)
);

create table if not exists athlete_formats (
  account_id uuid not null references accounts(id) on delete cascade,
  format_id  uuid not null references formats(id) on delete cascade,
  primary key (account_id, format_id)
);

create table if not exists athlete_divisions (
  account_id  uuid not null references accounts(id) on delete cascade,
  division_id uuid not null references divisions(id) on delete cascade,
  primary key (account_id, division_id)
);

-- ---------------------------------------------------------------------
-- Host profile
-- ---------------------------------------------------------------------

create table if not exists host_profiles (
  account_id        uuid primary key references accounts(id) on delete cascade,
  -- Set when this host claims an organizer already in the database, so the
  -- events they have run stay attached to them.
  organizer_id      uuid references organizers(id) on delete set null,

  organization_name text not null check (length(organization_name) between 1 and 120),
  contact_email     text not null check (length(contact_email) between 3 and 254),
  contact_phone     text check (contact_phone ~ '^\+1[0-9]{10}$'),
  website_url       text check (website_url is null or length(website_url) <= 500),
  city              text check (city is null or length(city) <= 80),
  state             text check (state is null or state ~ '^[A-Z]{2}$'),
  about             text check (about is null or length(about) <= 500),

  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

create unique index if not exists host_profiles_organizer_idx
  on host_profiles (organizer_id) where organizer_id is not null;

-- ---------------------------------------------------------------------
-- An account's relationship to an event
--
-- One row per account+event. The relation moves forward — saved, then
-- registered, then attended — so an event is never in two lists at once.
-- Which bucket it appears in is a function of the relation AND the date,
-- which means a registered event moves into history on its own the day
-- after it ends. No scheduled job, nothing to fall behind.
-- ---------------------------------------------------------------------

create table if not exists account_events (
  account_id uuid not null references accounts(id) on delete cascade,
  event_id   uuid not null references events(id) on delete cascade,
  relation   text not null check (relation in ('saved','registered','attended')),
  note       text check (note is null or length(note) <= 280),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (account_id, event_id)
);

create index if not exists account_events_account_idx
  on account_events (account_id, relation);
create index if not exists account_events_event_idx on account_events (event_id);

-- ---------------------------------------------------------------------
-- SMS consent — append-only evidence log
--
-- TCPA consent is only useful if you can produce what was on the screen,
-- when the person agreed, and which purpose they agreed to. So this table
-- is written and never rewritten: revoking consent inserts a 'revoked'
-- row rather than deleting the 'granted' one. Current state is the latest
-- row per (account, purpose), served by the view below.
-- ---------------------------------------------------------------------

create table if not exists sms_consents (
  id                 uuid primary key default gen_random_uuid(),
  account_id         uuid not null references accounts(id) on delete cascade,
  phone_e164         text not null,
  purpose            text not null check (purpose in ('transactional','marketing')),
  action             text not null check (action in ('granted','revoked')),
  -- The exact disclosure shown, plus a version so a wording change is
  -- visible in the record rather than silently rewriting history.
  disclosure_version text not null,
  disclosure_text    text not null,
  channel            text not null default 'web'
                       check (channel in ('web','sms_reply','staff')),
  ip_address         inet,
  user_agent         text,
  occurred_at        timestamptz not null default now()
);

create index if not exists sms_consents_account_idx
  on sms_consents (account_id, purpose, occurred_at desc);

create or replace view sms_consent_current as
select distinct on (account_id, purpose)
  account_id,
  purpose,
  phone_e164,
  action,
  action = 'granted' as is_granted,
  disclosure_version,
  occurred_at
from sms_consents
order by account_id, purpose, occurred_at desc;

-- ---------------------------------------------------------------------
-- updated_at maintenance for the new tables
-- ---------------------------------------------------------------------

do $$
declare t text;
begin
  foreach t in array array['accounts','account_credentials','athlete_profiles',
                           'host_profiles','account_events'] loop
    execute format(
      'drop trigger if exists %1$s_set_updated_at on %1$s;
       create trigger %1$s_set_updated_at before update on %1$s
       for each row execute function set_updated_at();', t);
  end loop;
end $$;

-- ---------------------------------------------------------------------
-- Row Level Security
--   Every table here holds personal data, so all of them are enabled with
--   NO policies: default deny. The application reaches them over the
--   pooled Postgres role, which bypasses RLS. If the Supabase anon key is
--   ever exposed to the browser, none of this is readable through it.
-- ---------------------------------------------------------------------

do $$
declare t text;
begin
  foreach t in array array['accounts','account_credentials','account_sessions',
                           'account_tokens','athlete_profiles','athlete_sports',
                           'athlete_surfaces','athlete_formats','athlete_divisions',
                           'host_profiles','account_events','sms_consents'] loop
    -- Enabled, not forced. Forcing would subject the application's own
    -- pooled role to these (non-existent) policies and lock it out too.
    execute format('alter table %1$s enable row level security;', t);
  end loop;
end $$;
