-- 026 · A record of every staff change to a player's account
--
-- Tom, 19 Nov 2026: staff must be able to fix a misspelled email, resend
-- the confirmation, edit a player's details with their permission, and
-- delete accounts (starting with the bot sign-ups). Each of those is
-- written here with what changed and the permission note, so "who changed
-- my email?" always has an answer.
--
-- account_id is kept nullable and SET NULL on delete, so the record of a
-- deletion outlives the account it deleted; the email at the time is kept
-- alongside it for that reason.
--
-- Safe to run twice. Paste into the Supabase SQL editor and run, THEN push.

create table if not exists account_admin_log (
  id          uuid primary key default gen_random_uuid(),
  account_id  uuid references accounts(id) on delete set null,
  email_then  text not null,
  action      text not null
                check (action in ('edit', 'email_change', 'resend_confirmation',
                                  'mark_confirmed', 'delete', 'close')),
  -- What changed: { "field": ["before", "after"], ... }
  changes     jsonb not null default '{}'::jsonb,
  -- How the player gave permission, in staff's words. Required for edits.
  permission  text,
  occurred_at timestamptz not null default now()
);

create index if not exists account_admin_log_account_idx
  on account_admin_log (account_id, occurred_at desc);

alter table account_admin_log enable row level security;

select 'account_admin_log ready' as result;
