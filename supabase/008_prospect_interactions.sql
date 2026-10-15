-- 008_prospect_interactions.sql
-- ---------------------------------------------------------------------
-- A conversation history for each prospect.
--
-- 007 gave partner_prospects a `last_contacted_at` timestamp, which
-- answers "how long has this one been neglected" and nothing else. One
-- timestamp cannot hold what was actually said, and the second call
-- overwrites the first.
--
-- Prospecting is a sequence: left a voicemail, emailed the link, they
-- replied asking about pricing, call booked for Thursday. The value is in
-- the sequence, not the latest date. That is what this table holds.
--
-- Run after 007_partner_directory.sql.

-- ---------------------------------------------------------------------
-- Owner verification
-- ---------------------------------------------------------------------
-- `confidence` records how sure the *researcher* was. It cannot record
-- that Tom picked up the phone and heard the number ring, which is a
-- different and far stronger fact.
--
-- Without somewhere to put that, every record stays permanently suspect
-- and the same details get re-checked forever. This is the column that
-- lets a row be finished.

alter table partner_prospects
  add column if not exists verified_at timestamptz;

comment on column partner_prospects.verified_at is
  'When Tom personally confirmed this record. Outranks `confidence`, which only describes how sure the research was. Null means nobody has checked it by hand.';


create table if not exists prospect_interactions (
  id           uuid primary key default gen_random_uuid(),
  prospect_id  uuid not null references partner_prospects(id) on delete cascade,

  kind         text not null
               check (kind in ('call','email','text','meeting','note')),

  -- The day it happened, not the day it was typed. A call made on Tuesday
  -- and logged on Thursday is a Tuesday call, and sorting by entry time
  -- would quietly reorder the story.
  occurred_on  date not null default current_date,

  body         text not null check (length(body) between 1 and 4000),

  -- Optional one-liner: "left voicemail", "not interested until spring",
  -- "wants pricing". Shown in the list so a history can be skimmed.
  outcome      text check (outcome is null or length(outcome) <= 120),

  created_at   timestamptz not null default now()
);

create index if not exists prospect_interactions_prospect_idx
  on prospect_interactions (prospect_id, occurred_on desc);

comment on table prospect_interactions is
  'Every touchpoint with a prospect, oldest to newest. Append-only in practice; corrections are a new note rather than an edit.';

-- ---------------------------------------------------------------------
-- Keep last_contacted_at in step
-- ---------------------------------------------------------------------
-- Derived rather than typed, so the two can never disagree.
--
-- A note is deliberately excluded. Writing "their website lists a 2027
-- season" into the record is research, not contact, and letting it reset
-- the neglect clock would hide a prospect that has actually gone quiet —
-- which is the one thing this field exists to surface.

create or replace function touch_prospect_last_contacted() returns trigger
language plpgsql as $$
begin
  if new.kind <> 'note' then
    update partner_prospects
       set last_contacted_at = greatest(
             coalesce(last_contacted_at, 'epoch'::timestamptz),
             new.occurred_on::timestamptz
           ),
           -- A prospect that has been contacted is no longer merely a
           -- prospect. Further stages are Tom's to set by hand; this only
           -- moves the first one, which is otherwise pure bookkeeping.
           status = case when status = 'prospect' then 'contacted' else status end
     where id = new.prospect_id;
  end if;
  return new;
end;
$$;

drop trigger if exists prospect_interactions_touch on prospect_interactions;
create trigger prospect_interactions_touch
  after insert on prospect_interactions
  for each row execute function touch_prospect_last_contacted();

-- ---------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------
-- Same posture as partner_prospects in 007: enabled, no policies, default
-- deny. These rows are private sales notes — what an organizer said, what
-- they thought of the pitch — and are considerably more sensitive than the
-- contact details they hang off. The application reaches them over the
-- pooled Postgres role, which owns the table and bypasses RLS.

alter table prospect_interactions enable row level security;
