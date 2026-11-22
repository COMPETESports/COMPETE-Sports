-- 028_event_submissions.sql
-- ---------------------------------------------------------------------
-- Events submitted by people outside COMPETE staff. 22 Nov 2026.
--
-- Tom, 22 Nov: friends want to add events, and only staff can. Decided:
--   * only signed-in accounts with a confirmed email can submit
--   * the full event form, the same one staff use
--   * a submission waits for Tom: approve, or decline with a reason
--   * the submitter is emailed either way
--
-- Two new statuses:
--   pending   submitted from outside, waiting for review. NOT public:
--             the public view and every public query read 'approved' only.
--   declined  reviewed and turned down. Kept, with the reason, so a
--             second submission of the same thing can be recognised.
--
-- And four columns recording who submitted it and what happened.
--
-- Safe to run twice. No existing rows change.

begin;

alter table events drop constraint if exists events_status_check;
alter table events add constraint events_status_check
  check (status in ('draft', 'pending', 'approved', 'declined', 'cancelled', 'archived'));

alter table events drop constraint if exists events_source_check;
alter table events add constraint events_source_check
  check (source in ('admin', 'import', 'host', 'submission'));

alter table events
  add column if not exists submitted_by uuid references accounts(id) on delete set null,
  add column if not exists submitted_at timestamptz,
  add column if not exists reviewed_at  timestamptz,
  add column if not exists review_note  text;

comment on column events.submitted_by is
  'The account that submitted this event from the public form. Null for staff entries. Set null if the account is deleted, so the event survives.';
comment on column events.review_note is
  'Tom''s reason when declining a submission; sent to the submitter in the decline email.';

-- The review queue reads this, newest first.
create index if not exists events_pending_idx
  on events (submitted_at desc) where status = 'pending';

-- A submitter's own list, and the per-day submission cap.
create index if not exists events_submitted_by_idx
  on events (submitted_by, submitted_at desc) where submitted_by is not null;

commit;
