-- 030_submitter_role.sql
-- ---------------------------------------------------------------------
-- Who is submitting a public event: the organizer, or an athlete adding
-- it on the organizer's behalf. 23 Nov 2026.
--
-- Tom asked for the question on the "List an event" form. The answer is
-- shown on the review panel, and an 'organizer' answer is the seed of
-- organizer accounts later: that person is claiming to run the
-- organization, which Tom can confirm with the contact details they gave.
--
-- Safe to run twice. Existing rows stay null (staff entries, and
-- submissions made before this question existed).

alter table events
  add column if not exists submitter_role text
    check (submitter_role is null or submitter_role in ('organizer', 'athlete'));

comment on column events.submitter_role is
  'Public submissions: ''organizer'' if the submitter says they run it, ''athlete'' if they are adding it for someone else. Null for staff entries.';
