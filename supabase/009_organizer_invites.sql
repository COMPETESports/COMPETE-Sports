-- 009_organizer_invites.sql
-- ---------------------------------------------------------------------
-- Closes the loop between prospecting and signup.
--
-- The workflow this exists for: research a venue, add it as a prospect,
-- verify its details, enter the events it is already running, then email
-- the organizer inviting them to take the page over.
--
-- Without a token on that invitation, the loop does not close. The
-- organizer registers, a host profile appears, and nothing connects it to
-- the prospect record that has six weeks of call notes against it. Tom
-- would be matching them up by hand, which is the duplicated work this
-- whole system is meant to prevent.
--
-- A token in the link means the signup arrives already attached: the new
-- host profile claims the right organizer, the events already listed stay
-- theirs, and the prospect moves to 'active' on its own.
--
-- Run after 008_prospect_interactions.sql.

alter table partner_prospects
  -- Unguessable, and one per prospect. Generated when Tom first asks for a
  -- link, not at import, so 1,310 unused tokens are not sitting in the
  -- table waiting to be a liability.
  add column if not exists invite_token     text,
  add column if not exists invite_sent_at   timestamptz,
  add column if not exists invite_claimed_at timestamptz;

create unique index if not exists partner_prospects_invite_token_uniq
  on partner_prospects (invite_token) where invite_token is not null;

comment on column partner_prospects.invite_token is
  'Random token embedded in the organizer invitation link. Null until an invite is generated; stays valid after use so a second person at the same organization can still claim it.';
comment on column partner_prospects.invite_sent_at is
  'When Tom generated the link. Recorded at the time rather than inferred later, same rule as every other control in this schema.';
comment on column partner_prospects.invite_claimed_at is
  'When someone actually signed up through it. The gap between sent and claimed is the only honest measure of whether outreach is working.';


-- ---------------------------------------------------------------------
-- Tying a host profile back to the invitation
-- ---------------------------------------------------------------------
-- host_profiles already has organizer_id, which is how a host claims the
-- events listed under their organization. What it lacks is any record of
-- how that claim came about — whether they found COMPETE themselves or
-- arrived through an invitation Tom sent.
--
-- That distinction is the only way to tell outreach from organic growth,
-- and it cannot be reconstructed afterwards.

alter table host_profiles
  add column if not exists prospect_id uuid references partner_prospects(id) on delete set null,
  add column if not exists signup_source text
    check (signup_source is null or signup_source in ('invite', 'direct', 'entered_by_staff'));

comment on column host_profiles.signup_source is
  'invite = arrived through a tokenised link; direct = found the site alone; entered_by_staff = Tom filled the form in on a phone call, with their agreement.';


-- ---------------------------------------------------------------------
-- Claiming an invite
-- ---------------------------------------------------------------------
-- One function rather than three statements in application code, because
-- the three have to happen together or not at all: a host profile pointing
-- at an organizer, a prospect marked claimed, and the prospect promoted.
-- Half of that applied is worse than none of it.

create or replace function claim_organizer_invite(
  p_account_id uuid,
  p_token      text,
  p_source     text default 'invite'
) returns uuid
language plpgsql as $$
declare
  v_prospect  partner_prospects%rowtype;
  v_organizer uuid;
begin
  select * into v_prospect from partner_prospects
   where invite_token = p_token;
  if not found then
    return null;
  end if;

  -- A prospect may not have an organizer record yet — most do not, because
  -- organizers only exist once they have events. Create one so the host has
  -- something to own, reusing the prospect's own details.
  v_organizer := v_prospect.organizer_id;
  if v_organizer is null then
    insert into organizers (slug, name, contact_email, website_url,
                            phone, city, state, contact_source, contact_checked_at)
    values (
      -- Slugs must be unique; collisions are rare enough that a short
      -- random suffix is cheaper than a retry loop.
      regexp_replace(lower(v_prospect.name), '[^a-z0-9]+', '-', 'g')
        || '-' || substr(md5(random()::text), 1, 6),
      v_prospect.name, v_prospect.email, v_prospect.website,
      v_prospect.phone, v_prospect.city, v_prospect.state,
      'organizer_submitted', now()
    )
    returning id into v_organizer;

    update partner_prospects set organizer_id = v_organizer where id = v_prospect.id;
  end if;

  insert into host_profiles (account_id, organizer_id, prospect_id, signup_source,
                             organization_name, contact_email)
  values (p_account_id, v_organizer, v_prospect.id, p_source,
          v_prospect.name, coalesce(v_prospect.email, ''))
  on conflict (account_id) do update
    set organizer_id  = excluded.organizer_id,
        prospect_id   = excluded.prospect_id,
        signup_source = excluded.signup_source;

  update partner_prospects
     set invite_claimed_at = coalesce(invite_claimed_at, now()),
         status = case when status in ('active') then status else 'active' end
   where id = v_prospect.id;

  return v_organizer;
end;
$$;
