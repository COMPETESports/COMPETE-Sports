-- ---------------------------------------------------------------------
-- 005_age_audit.sql — every age-bracket change, on the record
--
-- Tom, 2 Oct 2026: "If an account switches from an 18+ account to under
-- 18, we need to be notified of this attempt to address it immediately
-- to remain compliant with the law."
--
-- The ENFORCEMENT already exists and is tested:
--   * athlete_no_minor_phone      — a minor's profile cannot hold a phone
--   * athlete_alerts_need_phone   — no phone means no alerts
--   * saveProfile revokes every live SMS consent when a number leaves
--
-- What did not exist is EVIDENCE. A control that fires silently cannot be
-- shown to have fired, and "we have a constraint" is a weaker answer to a
-- regulator or a parent than "here is the log entry, timestamped, with
-- what was stripped and when you were notified".
--
-- ONE IMPORTANT NOTE ON DIRECTION. Tom asked about 18+ -> under 18. That
-- transition makes an account MORE protected: the phone is deleted,
-- consents are revoked, texting stops. It is the safe direction and the
-- system already handles it.
--
-- The direction that creates exposure is under 18 -> 18+, because that is
-- what a minor would do to unlock phone collection and texting. No
-- self-reported age field can prevent that outright — only ID
-- verification could, which is disproportionate here — but it can be
-- made visible, slow and recorded. So BOTH directions are logged, and the
-- adult-ward one is the higher-severity review item.
--
-- Safe to re-run.
-- ---------------------------------------------------------------------

create table if not exists age_bracket_changes (
  id              uuid primary key default gen_random_uuid(),
  account_id      uuid not null references accounts(id) on delete cascade,

  -- null `from_bracket` is the first time a bracket was ever set, which is
  -- not a change and is recorded at low severity for completeness.
  from_bracket    text,
  to_bracket      text not null,

  -- Derived once, at write time, so the review queue can be queried
  -- without re-deriving the rule in every caller.
  --   to_minor    — 18+ -> under 18. Protections engage.
  --   to_adult    — under 18 -> 18+. Protections disengage. HIGH severity.
  --   first_set   — bracket set for the first time.
  --   other       — a change between two adult brackets. Routine.
  direction       text not null
                    check (direction in ('to_minor','to_adult','first_set','other')),

  -- Proof the automatic remediation actually ran, captured at the moment
  -- it ran rather than inferred later from current state.
  phone_removed   boolean not null default false,
  consents_revoked int    not null default 0,

  ip_address      inet,
  user_agent      text,
  occurred_at     timestamptz not null default now(),

  -- Delivery receipt for the operator alert. Nullable because the alert
  -- is attempted after the row is written: the record of the change must
  -- survive even if the mail provider is down or not configured yet.
  notified_at     timestamptz,
  notify_detail   text
);

create index if not exists age_bracket_changes_recent_idx
  on age_bracket_changes (occurred_at desc);

-- The review queue: unresolved high-severity transitions, newest first.
create index if not exists age_bracket_changes_review_idx
  on age_bracket_changes (direction, occurred_at desc)
  where direction in ('to_minor','to_adult');

-- Repeated flip-flopping is the real signal of someone probing the age
-- gate, and it is a per-account question.
create index if not exists age_bracket_changes_account_idx
  on age_bracket_changes (account_id, occurred_at desc);

alter table age_bracket_changes enable row level security;


-- ---------------------------------------------------------------------
-- Append-only, enforced rather than documented
--
-- sms_consents is append-only by convention. For this table convention is
-- not enough: its entire purpose is to be believable after the fact, and
-- a log that can be quietly edited is not evidence of anything.
--
-- So deletes are refused outright, and updates are refused unless they
-- touch only the two delivery-receipt columns. The facts of what changed,
-- when, from where, and what was stripped are immutable once written —
-- including to the application itself, which has no legitimate reason to
-- revise them and would be the most likely thing to do so by accident.
-- ---------------------------------------------------------------------

create or replace function age_bracket_changes_append_only() returns trigger as $$
begin
  if tg_op = 'DELETE' then
    raise exception
      'age_bracket_changes is append-only: rows cannot be deleted (id %)', old.id;
  end if;

  if new.account_id       is distinct from old.account_id
  or new.from_bracket     is distinct from old.from_bracket
  or new.to_bracket       is distinct from old.to_bracket
  or new.direction        is distinct from old.direction
  or new.phone_removed    is distinct from old.phone_removed
  or new.consents_revoked is distinct from old.consents_revoked
  or new.ip_address       is distinct from old.ip_address
  or new.user_agent       is distinct from old.user_agent
  or new.occurred_at      is distinct from old.occurred_at
  then
    raise exception
      'age_bracket_changes is append-only: only notified_at and notify_detail '
      'may be updated (id %)', old.id;
  end if;

  return new;
end;
$$ language plpgsql;

drop trigger if exists age_bracket_changes_immutable on age_bracket_changes;
create trigger age_bracket_changes_immutable
  before update or delete on age_bracket_changes
  for each row execute function age_bracket_changes_append_only();


-- ---------------------------------------------------------------------
-- Backfill: current minors, so day one is not a blank page
--
-- Any profile already sitting at under_18 is recorded as `first_set`,
-- because the real transition (if there was one) happened before this log
-- existed and inventing a `from_bracket` would be fabricating evidence.
-- The timestamp is the profile's own, not now(), for the same reason.
-- ---------------------------------------------------------------------

insert into age_bracket_changes
  (account_id, from_bracket, to_bracket, direction,
   phone_removed, consents_revoked, occurred_at, notify_detail)
select p.account_id, null, 'under_18', 'first_set',
       false, 0, coalesce(p.updated_at, now()),
       'backfilled by 005_age_audit.sql — predates the log'
  from athlete_profiles p
 where p.age_bracket = 'under_18'
   and not exists (
     select 1 from age_bracket_changes c where c.account_id = p.account_id
   );
