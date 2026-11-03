-- 016_crm_contacts_and_handles.sql
-- ---------------------------------------------------------------------
-- Three gaps Tom hit using the CRM for real, 3 Nov 2026.
--
-- 1. An organization has more than one person in it. The directory had
--    exactly one contact_name / contact_title / phone / email, so the
--    second person you meet has nowhere to live. That is not an edge
--    case -- it is the normal shape of a parks department or a social
--    league, where the person who answers the phone and the person who
--    decides are rarely the same person.
--
-- 2. A ZIP code. The address was a single free-text line with city and
--    state beside it and no postal code, which is the one field radius
--    search actually uses.
--
-- 3. One "social" field for every platform at once. An organizer's
--    Instagram is where their events get announced; burying it in a
--    comma-separated string with their TikTok makes it unusable as a
--    thing to click, and impossible to count.

-- ---- 2 and 3: columns on the prospect itself ----

alter table partner_prospects add column if not exists postal_code text;

-- Each platform its own column, because each is a different kind of
-- lookup and a different outreach channel. `social` is kept rather than
-- migrated: it holds 1,310 rows of researched free text, and splitting
-- it by guesswork would invent handles that were never confirmed.
alter table partner_prospects add column if not exists instagram text;
alter table partner_prospects add column if not exists facebook  text;
alter table partner_prospects add column if not exists tiktok    text;

-- ---- 1: more than one person per organization ----

create table if not exists prospect_contacts (
  id          uuid primary key default gen_random_uuid(),
  prospect_id uuid not null references partner_prospects(id) on delete cascade,

  name        text not null,
  title       text,
  email       text,
  phone       text,
  notes       text,

  -- The person to call first. At most one per organization, enforced by
  -- the partial unique index below rather than by hoping the UI behaves.
  is_primary  boolean not null default false,

  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index if not exists prospect_contacts_prospect_idx
  on prospect_contacts (prospect_id);

-- "At most one primary" expressed as a rule the database keeps. A plain
-- unique constraint would allow only one non-primary contact per
-- organization, which is the opposite of the point.
drop index if exists prospect_contacts_one_primary;
create unique index prospect_contacts_one_primary
  on prospect_contacts (prospect_id)
  where is_primary;

alter table prospect_contacts enable row level security;
drop policy if exists prospect_contacts_no_public_read on prospect_contacts;
-- Deliberately NOT publicly readable. Every other child table on this
-- project is, because it describes an event. This one is a list of named
-- people with their phone numbers and belongs to the CRM, which is
-- staff-only. The server actions hold the service key and bypass RLS;
-- the anon key sees nothing.
create policy prospect_contacts_no_public_read on prospect_contacts
  for select using (false);

-- ---- carry the existing single contact across ----
-- Anything already in contact_name becomes that organization's first and
-- primary contact, so nothing researched is stranded on the old columns.
-- The old columns stay for now rather than being dropped: they are still
-- what the list view reads, and dropping them is a separate, reversible
-- decision once the UI has moved over.
insert into prospect_contacts (prospect_id, name, title, email, phone, is_primary)
select p.id, p.contact_name, p.contact_title, p.email, p.phone, true
  from partner_prospects p
 where p.contact_name is not null
   and btrim(p.contact_name) <> ''
   and not exists (
     select 1 from prospect_contacts c where c.prospect_id = p.id
   );
