-- 020_one_organizer_table.sql
-- ---------------------------------------------------------------------
-- One table for organizations.
--
-- Until now COMPETE had two parallel universes. `organizers` held the
-- ~300 organizations that events point at, created whenever an event
-- named one. `partner_prospects` held the 1,310 researched in the CRM.
-- Nothing connected them: 0 of 1,310 carried an organizer_id.
--
-- The visible symptom, 4 Nov: Legacy VTC is in the CRM, their venue is
-- in the database, and searching Organizers for them returns nothing --
-- because they exist only on the other side.
--
-- The two sets barely overlap. 30 prospects match an organizer name
-- exactly; 72 match loosely. So this is ~1,238 clean inserts, 30 links
-- and 42 judgment calls, not the hundreds of ambiguous merges that made
-- this look dangerous in early November.
--
-- ## The one real problem, and how it is solved
--
-- `organizers` is PUBLICLY READABLE -- the public site reads it. The CRM
-- holds phone numbers, named individuals, pipeline status and private
-- notes about conversations. Those cannot move into a table the
-- anonymous key can read.
--
-- So everything researched lands in `organizer_private`, one row per
-- organizer, with NO public read policy. Admin pages sit behind sign-in
-- and join the two.
--
-- ## A trap found while writing this, worth recording
--
-- Migration 007 had already added phone, city, state, instagram,
-- facebook and booking_platform to `organizers` itself -- and that table
-- is public. The obvious version of this migration would have poured
-- 1,310 researched phone numbers straight into those columns and
-- published every one of them. Some of those numbers are business lines
-- already on a website; some are a cell number somebody gave Tom on a
-- call. Nothing in the data distinguishes them.
--
-- So this migration writes NOTHING into organizers' public contact
-- columns. It fills only city, state and website_url, which are public
-- by nature -- a city is not a secret and a website is a published fact.
-- Phone, email and the social handles go to the private table, and a
-- number reaches the public organizer page only when Tom puts it there
-- on purpose. That page is not built yet, so nothing is lost by waiting.
--
-- ## What is deliberately NOT done here
--
-- `partner_prospects` is left in place, untouched and still readable by
-- the old CRM pages. Nothing is deleted until the new pages have been
-- used in anger. Dropping it is a separate decision on a separate day.
--
-- Migration 016 (prospect_contacts, ZIP, per-platform handles) was never
-- run and is SUPERSEDED by this file. Do not run it. Every column it
-- would have added is created here instead, on the private table where
-- it belongs.

-- ---------------------------------------------------------------------
-- Run as one transaction. Earlier migrations in this project did not
-- bother, and were right not to: they were a column or two of DDL. This
-- one moves 1,310 rows through nine dependent steps, and a half-applied
-- version -- organizers created, research not yet moved -- would be far
-- harder to reason about than a clean failure. If anything raises, the
-- whole thing rolls back and the database is exactly as it was.
-- ---------------------------------------------------------------------
begin;

-- =====================================================================
-- 1 · The private side
-- =====================================================================

create table if not exists organizer_private (
  organizer_id uuid primary key references organizers(id) on delete cascade,

  category     text,
  region       text,

  -- The pipeline, cut from seven stages to five on 9 Nov. 'active' was
  -- derivable from the event count and 'dormant' is really a date, not a
  -- status -- stages nobody maintains lie, and a pipeline that lies is
  -- worse than a short one.
  status       text not null default 'prospect'
               check (status in ('prospect','contacted','in_conversation','partner','not_a_fit')),

  -- What the row said before the cut. Nothing researched is thrown away
  -- because the vocabulary changed.
  legacy_status text,

  -- For 'not_a_fit', why -- so the same dead end is not walked twice.
  status_note       text,
  last_contacted_at timestamptz,
  next_action       text,
  next_action_on    date,

  -- Street address stays private: for a good number of these the address
  -- on file is somebody's house.
  address      text,
  postal_code  text,

  phone        text,
  email        text,
  website      text,

  -- Each platform its own column. An organizer's Instagram is where
  -- their events get announced; buried in a comma-separated blob with
  -- their TikTok it is neither clickable nor countable.
  instagram    text,
  facebook     text,
  tiktok       text,
  -- 1,310 rows of researched free text, kept rather than split by
  -- guesswork, which would invent handles nobody confirmed.
  social       text,

  courts       text,
  offerings    text,
  sports       text not null default 'unknown'
               check (sports in ('volleyball','pickleball','both','volleyball?','unknown')),
  sports_basis text,
  booking_platform text,

  source_url   text,
  source_file  text,
  confidence   text not null default 'inferred'
               check (confidence in ('verified','partial','inferred','unknown')),
  notes        text,
  verified_at  timestamptz,

  invite_token      text,
  invite_sent_at    timestamptz,
  invite_claimed_at timestamptz,

  -- Flagged where this organizer shares a normalised name with another
  -- one. Same key the merge tool already uses, so a flagged row is
  -- exactly a row that tool will cluster. Never auto-merged.
  needs_review boolean not null default false,

  -- Where the row came from, so a hand-entered organizer and one
  -- imported from the directory can be told apart later.
  origin       text not null default 'crm_import'
               check (origin in ('crm_import','events','manual')),

  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create index if not exists organizer_private_status_idx on organizer_private (status);
create index if not exists organizer_private_next_action_idx
  on organizer_private (next_action_on) where next_action_on is not null;
create index if not exists organizer_private_review_idx
  on organizer_private (needs_review) where needs_review;
create unique index if not exists organizer_private_invite_token_uniq
  on organizer_private (invite_token) where invite_token is not null;

-- The whole point of the split. No public read, at all.
alter table organizer_private enable row level security;
drop policy if exists organizer_private_no_public_read on organizer_private;
create policy organizer_private_no_public_read on organizer_private
  for select using (false);

-- =====================================================================
-- 2 · More than one person per organization
-- =====================================================================
-- What 016 was going to do, done once, in the right place. A named
-- person's direct line is the most sensitive field in the whole CRM, so
-- this table is private from the moment it exists.

create table if not exists organizer_contacts (
  id           uuid primary key default gen_random_uuid(),
  organizer_id uuid not null references organizers(id) on delete cascade,

  name         text not null,
  title        text,
  email        text,
  phone        text,
  notes        text,

  is_primary   boolean not null default false,

  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create index if not exists organizer_contacts_org_idx on organizer_contacts (organizer_id);

-- At most one primary per organization, enforced by the database rather
-- than by hoping the form behaves. A plain unique constraint would allow
-- only one NON-primary contact, which is the opposite of the point.
drop index if exists organizer_contacts_one_primary;
create unique index organizer_contacts_one_primary
  on organizer_contacts (organizer_id) where is_primary;

alter table organizer_contacts enable row level security;
drop policy if exists organizer_contacts_no_public_read on organizer_contacts;
create policy organizer_contacts_no_public_read on organizer_contacts
  for select using (false);

-- =====================================================================
-- 3 · Who owns a venue
-- =====================================================================
-- organizer_venues already records who PLAYS somewhere, many-to-many.
-- This answers a different question: who owns the place. A bar that owns
-- its sand courts and also hosts other people's tournaments is both.
-- Nullable, and null is the common case -- most venues in this data are
-- rented by everyone and owned by nobody.

alter table venues add column if not exists owner_organizer_id uuid
  references organizers(id) on delete set null;

create index if not exists venues_owner_idx
  on venues (owner_organizer_id) where owner_organizer_id is not null;

-- =====================================================================
-- 4 · Link the prospects that exactly match an existing organizer
-- =====================================================================
-- 30 of these. Exact, case-insensitive name match is the only automatic
-- link made anywhere in this migration.
--
-- DISTINCT ON guards the case of two prospects matching one organizer:
-- the oldest wins the link, the rest fall through to step 5 and become
-- their own records, flagged for review.

with exact as (
  select distinct on (o.id)
         p.id as prospect_id, o.id as organizer_id
    from partner_prospects p
    join organizers o on lower(btrim(o.name)) = lower(btrim(p.name))
   where p.organizer_id is null
   order by o.id, p.created_at
)
update partner_prospects p
   set organizer_id = e.organizer_id
  from exact e
 where p.id = e.prospect_id;

-- =====================================================================
-- 5 · Create an organizer for every prospect that still has none
-- =====================================================================
-- Slugs must be unique, and two separate collisions are possible: with
-- an organizer that already exists, and with another prospect inside
-- this very insert. A short hash of the prospect id settles both, and a
-- name with no usable characters falls back to the hash alone.
--
-- city, state and website_url are the only public columns this
-- migration writes. See the note at the top for why phone and email are
-- not among them.

with base as (
  select p.id as prospect_id,
         btrim(p.name) as name,
         p.city, p.state, p.website,
         nullif(btrim(regexp_replace(lower(btrim(p.name)), '[^a-z0-9]+', '-', 'g'), '-'), '') as stem
    from partner_prospects p
   where p.organizer_id is null
),
numbered as (
  select *, row_number() over (partition by stem order by prospect_id) as dup_rank
    from base
),
final as (
  select prospect_id, name, city, state, website,
         case
           when stem is null then 'org-' || left(md5(prospect_id::text), 8)
           when dup_rank > 1
             or exists (select 1 from organizers o where o.slug = stem)
             then stem || '-' || left(md5(prospect_id::text), 4)
           else stem
         end as slug
    from numbered
),
inserted as (
  insert into organizers (slug, name, city, state, website_url)
  select slug, name, city, state, website from final
  returning id, slug
)
update partner_prospects p
   set organizer_id = i.id
  from final f
  join inserted i on i.slug = f.slug
 where p.id = f.prospect_id;

-- The 30 that linked to an organizer that already existed: fill the
-- public columns only where the organizer has nothing. Never overwrite
-- a value already there -- an organizer record built from real events
-- outranks a researched row.
update organizers o
   set city        = coalesce(o.city, p.city),
       state       = coalesce(o.state, p.state),
       website_url = coalesce(o.website_url, p.website),
       updated_at  = now()
  from partner_prospects p
 where p.organizer_id = o.id
   and (o.city is null or o.state is null or o.website_url is null);

-- =====================================================================
-- 6 · Move the research onto the private table
-- =====================================================================
-- One row per organizer. DISTINCT ON picks the oldest prospect where two
-- somehow share an organizer, so the primary key cannot be violated.

insert into organizer_private (
  organizer_id, category, region, status, legacy_status,
  status_note, last_contacted_at, next_action, next_action_on,
  address, postal_code, phone, email, website,
  social, courts, offerings, sports, sports_basis, booking_platform,
  source_url, source_file, confidence, notes, verified_at,
  invite_token, invite_sent_at, invite_claimed_at, origin
)
select distinct on (p.organizer_id)
  p.organizer_id,
  p.category,
  p.region,
  case p.status
    when 'committed' then 'partner'
    when 'active'    then 'partner'
    when 'dormant'   then 'contacted'
    else p.status
  end,
  p.status,
  p.status_note, p.last_contacted_at, p.next_action, p.next_action_on,
  p.address, null, p.phone, p.email, p.website,
  p.social, p.courts, p.offerings, p.sports, p.sports_basis, p.booking_platform,
  p.source_url, p.source_file, p.confidence, p.notes, p.verified_at,
  p.invite_token, p.invite_sent_at, p.invite_claimed_at, 'crm_import'
from partner_prospects p
where p.organizer_id is not null
order by p.organizer_id, p.created_at
on conflict (organizer_id) do nothing;

-- Organizers that came from events rather than the directory get an
-- empty private row, so every organizer has one and the admin pages can
-- join without special-casing nulls.
insert into organizer_private (organizer_id, origin)
select o.id, 'events'
  from organizers o
 where not exists (select 1 from organizer_private x where x.organizer_id = o.id)
on conflict (organizer_id) do nothing;

-- =====================================================================
-- 7 · The single contact becomes the first contact
-- =====================================================================
-- Each prospect carries exactly one contact_name. That person becomes
-- the primary contact row. The second and third person at the same
-- organization -- which Tom asked for on 4 Nov, having run into it on
-- real calls -- are added from the profile page from here on.

insert into organizer_contacts (organizer_id, name, title, email, phone, is_primary)
select distinct on (p.organizer_id)
       p.organizer_id, btrim(p.contact_name), p.contact_title, p.email, p.phone, true
  from partner_prospects p
 where p.organizer_id is not null
   and p.contact_name is not null
   and btrim(p.contact_name) <> ''
 order by p.organizer_id, p.created_at;

-- =====================================================================
-- 8 · Flag the duplicate clusters
-- =====================================================================
-- Uses the exact normalised key the organizer merge tool already uses,
-- so a flagged row is precisely a row that tool will cluster. Computed
-- after every insert, which is the only moment the answer is true.

with keyed as (
  select o.id,
         regexp_replace(
           regexp_replace(lower(o.name), '[^a-z0-9]', '', 'g'),
           '(volleyball|vb|sports|s)+$', '') as k
    from organizers o
),
dupes as (
  select k from keyed where k <> '' group by k having count(*) > 1
)
update organizer_private x
   set needs_review = true
  from keyed kk
  join dupes d on d.k = kk.k
 where x.organizer_id = kk.id;

-- =====================================================================
-- 9 · The call log follows
-- =====================================================================

alter table prospect_interactions add column if not exists organizer_id uuid
  references organizers(id) on delete cascade;

update prospect_interactions i
   set organizer_id = p.organizer_id
  from partner_prospects p
 where p.id = i.prospect_id
   and i.organizer_id is null;

create index if not exists prospect_interactions_organizer_idx
  on prospect_interactions (organizer_id);

comment on table organizer_private is
  'Everything about an organizer the public must not read: pipeline status, phone, street address, research provenance, private notes. One row per organizer. organizers itself stays publicly readable and holds only the public identity.';

comment on column organizer_private.needs_review is
  'This organizer shares a normalised name with another. Same key the merge tool uses, so a flagged row is one that tool will cluster. Never auto-merged: across 1,310 rows a fuzzy match would be wrong often enough to poison the data it was meant to connect.';

comment on column organizer_private.phone is
  'The number Tom dials. Deliberately NOT organizers.phone, which is public: nothing in the imported data distinguishes a published business line from a cell number given on a call, so none of them are published by import.';

commit;
