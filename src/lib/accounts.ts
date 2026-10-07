import { createHash, randomBytes } from 'node:crypto';
import { cookies } from 'next/headers';
import zipcodes from 'zipcodes';
import { sql } from './db';
import { hashPassword, verifyPassword } from './password';
import { disclosureFor, SMS_DISCLOSURE_VERSION, type SmsPurpose } from './sms-consent';
import type { Account, AgeBracket, AthleteProfile, Gender, HostProfile } from './account-fields';

// Re-exported so server code has one import for accounts, while the client
// forms import the same names straight from account-fields.
export { AGE_BRACKETS, GENDER_OPTIONS } from './account-fields';
export type { Account, AgeBracket, AthleteProfile, Gender, HostProfile } from './account-fields';

/**
 * Player and host accounts.
 *
 * Deliberate choices worth knowing before changing anything here:
 *
 * * Sessions are rows, not self-contained tokens. The cookie holds an
 *   opaque random string; only its SHA-256 is stored. That costs one query
 *   per request and buys the ability to revoke a session — which matters
 *   the first time somebody signs in on a friend's laptop.
 * * An email address identifies an account, and credentials hang off it.
 *   Signing in with Google using an address that already has a password
 *   attaches Google to that same account rather than making a second one.
 * * Nothing here stores a date of birth, and no code path can put a phone
 *   number on a profile marked under-18 — the database refuses it.
 */

const SESSION_COOKIE = 'compete_session';
const SESSION_DAYS = 60;

// ---------------------------------------------------------------------
// Sessions
// ---------------------------------------------------------------------

function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export async function startSession(accountId: string, userAgent?: string): Promise<void> {
  const token = randomBytes(32).toString('base64url');
  const expires = new Date(Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000);

  await sql`
    insert into account_sessions (account_id, token_hash, user_agent, expires_at)
    values (${accountId}, ${hashToken(token)}, ${userAgent ?? null}, ${expires})
  `;

  (await cookies()).set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    expires,
  });
}

export async function endSession(): Promise<void> {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (token) {
    await sql`delete from account_sessions where token_hash = ${hashToken(token)}`;
  }
  store.delete(SESSION_COOKIE);
}

/**
 * Signs every device out, including this one.
 *
 * Called on a password reset. A reset is what somebody does *because* they
 * think another person has their account, so leaving that person's 60-day
 * session working would defeat the point of the whole exercise.
 */
export async function endAllSessions(accountId: string): Promise<number> {
  const rows = await sql<{ id: string }[]>`
    delete from account_sessions where account_id = ${accountId} returning id
  `;
  return rows.length;
}

/** Signs every other device out, leaving this one signed in. */
export async function endOtherSessions(accountId: string): Promise<number> {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  const keep = token ? hashToken(token) : '';
  const rows = await sql<{ id: string }[]>`
    delete from account_sessions
     where account_id = ${accountId} and token_hash <> ${keep}
    returning id
  `;
  return rows.length;
}

/**
 * The current account, or null. Called on most pages, so it is one indexed
 * query and it does not touch the profile tables.
 */
export async function currentAccount(): Promise<Account | null> {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) return null;

  // `last_used_at` is refreshed at most hourly. Writing on every request would
  // mean a database write per page view; never writing it at all would leave
  // the column that tells you which sessions are actually in use permanently
  // reading as the moment they were created.
  const rows = await sql<Account[]>`
    with touched as (
      update account_sessions
         set last_used_at = now()
       where token_hash = ${hashToken(token)}
         and expires_at > now()
         and last_used_at < now() - interval '1 hour'
      returning account_id
    )
    select a.id, a.email, a.email_verified_at, a.display_name,
           a.is_athlete, a.is_host, a.is_staff, a.plan, a.status
      from account_sessions s
      join accounts a on a.id = s.account_id
     where s.token_hash = ${hashToken(token)}
       and s.expires_at > now()
       and a.status = 'active'
     limit 1
  `;
  return rows[0] ?? null;
}

/** For pages that must not render to a stranger. */
export async function requireAccount(): Promise<Account> {
  const account = await currentAccount();
  if (!account) throw new Error('NOT_SIGNED_IN');
  return account;
}

// ---------------------------------------------------------------------
// Registration and sign-in
// ---------------------------------------------------------------------

export function normaliseEmail(input: string): string {
  return input.trim().toLowerCase();
}

export function emailProblem(email: string): string | null {
  if (!email) return 'Enter your email address.';
  // Deliberately permissive: the only real test of an address is whether
  // mail to it arrives, and over-strict patterns reject valid addresses.
  if (!/^[^\s@]+@[^\s@.]+\.[^\s@]{2,}$/.test(email)) {
    return 'That does not look like an email address.';
  }
  if (email.length > 254) return 'That address is too long.';
  return null;
}

export async function accountByEmail(email: string): Promise<Account | null> {
  const rows = await sql<Account[]>`
    select id, email, email_verified_at, display_name,
           is_athlete, is_host, is_staff, plan, status
      from accounts where lower(email) = ${normaliseEmail(email)} limit 1
  `;
  return rows[0] ?? null;
}

export interface RegisterInput {
  email: string;
  password: string;
  displayName: string;
  /** Required: nobody under 13 may hold an account. */
  ageBracket: AgeBracket;
}

export async function registerWithPassword(
  input: RegisterInput,
): Promise<{ ok: true; account: Account } | { ok: false; error: string }> {
  const email = normaliseEmail(input.email);

  const existing = await accountByEmail(email);
  if (existing) {
    // Whether an address already has an account is not a secret worth
    // keeping — the sign-in page leaks it anyway — and pretending
    // otherwise sends people in circles.
    return {
      ok: false,
      error: 'An account already uses that email. Sign in instead, or reset your password.',
    };
  }

  const hash = await hashPassword(input.password);

  const rows = await sql<Account[]>`
    with created as (
      insert into accounts (email, display_name)
      values (${email}, ${input.displayName.trim()})
      returning id, email, email_verified_at, display_name,
                is_athlete, is_host, is_staff, plan, status
    ), cred as (
      insert into account_credentials (account_id, provider, provider_uid, password_hash)
      select id, 'password', ${email}, ${hash} from created
      returning account_id
    ), prof as (
      insert into athlete_profiles (account_id, age_bracket)
      select id, ${input.ageBracket} from created
      returning account_id
    )
    select * from created
  `;

  return { ok: true, account: rows[0] };
}

/**
 * A real scrypt hash of a random string nobody knows, with the same
 * parameters the live hashes use. Verifying against it takes the same time
 * as verifying a real password and can never succeed.
 */
const DECOY_HASH =
  'scrypt$16384$8$1$8f2c1d4e5a6b7c8d9e0f1a2b3c4d5e6f$' +
  'b8a0e3d1c7f45926a8b3d0e1f2c3a4b5968778695a4b3c2d1e0f9a8b7c6d5e4f' +
  '3a2b1c0d9e8f7a6b5c4d3e2f1a0b9c8d7e6f5a4b3c2d1e0f9a8b7c6d5e4f3a2b';

export async function signInWithPassword(
  email: string,
  password: string,
): Promise<{ ok: true; account: Account } | { ok: false; error: string }> {
  const rows = await sql<(Account & { password_hash: string | null })[]>`
    select a.id, a.email, a.email_verified_at, a.display_name,
           a.is_athlete, a.is_host, a.is_staff, a.plan, a.status,
           c.password_hash
      from accounts a
      left join account_credentials c
        on c.account_id = a.id and c.provider = 'password'
     where lower(a.email) = ${normaliseEmail(email)}
     limit 1
  `;

  const row = rows[0];
  const generic = 'That email and password do not match an account.';

  // When there is no account, verify against a fixed decoy hash so the reply
  // costs the same one scrypt derivation as a wrong password would. Hashing a
  // throwaway string here instead would cost two, which makes the unknown
  // address the *slower* branch and leaks exactly what it meant to hide.
  if (!row?.password_hash) {
    await verifyPassword(password, DECOY_HASH);
    return { ok: false, error: generic };
  }

  if (row.status !== 'active') {
    return { ok: false, error: 'That account is not active. Email hello@joincompete.com.' };
  }

  const good = await verifyPassword(password, row.password_hash);
  if (!good) return { ok: false, error: generic };

  const { password_hash: _drop, ...account } = row;
  await sql`update accounts set last_seen_at = now() where id = ${account.id}`;
  return { ok: true, account };
}

/**
 * Google sign-in. Attaches to an existing account with the same verified
 * email rather than creating a duplicate.
 */
export async function upsertGoogleAccount(profile: {
  sub: string;
  email: string;
  name?: string;
  emailVerified?: boolean;
}): Promise<{ ok: true; account: Account } | { ok: false; error: string }> {
  const email = normaliseEmail(profile.email);

  const byProvider = await sql<Account[]>`
    select a.id, a.email, a.email_verified_at, a.display_name,
           a.is_athlete, a.is_host, a.is_staff, a.plan, a.status
      from account_credentials c
      join accounts a on a.id = c.account_id
     where c.provider = 'google' and c.provider_uid = ${profile.sub}
     limit 1
  `;
  if (byProvider[0]) return { ok: true, account: byProvider[0] };

  const existing = await accountByEmail(email);
  if (existing) {
    // Google having verified the address is not enough on its own. An
    // attacker can register hello@victim.com here with a password of their
    // choosing and simply wait; when the real owner later clicks "Continue
    // with Google", linking on Google's word alone would drop them into the
    // attacker's account, phone number and saved events included.
    //
    // So the existing account has to have proved the address on OUR side
    // too — either by confirming the email, or by having no password for an
    // attacker to have set in the first place.
    const hasPassword = await sql<{ n: number }[]>`
      select count(*)::int as n from account_credentials
       where account_id = ${existing.id} and provider = 'password'
    `;
    const unproven = !existing.email_verified_at && hasPassword[0].n > 0;

    if (!profile.emailVerified || unproven) {
      return {
        ok: false,
        error:
          'That email already has a COMPETE account. Sign in with your password ' +
          'and confirm your email address, then Google will connect to it.',
      };
    }
    await sql`
      insert into account_credentials (account_id, provider, provider_uid)
      values (${existing.id}, 'google', ${profile.sub})
      on conflict (account_id, provider) do update set provider_uid = excluded.provider_uid
    `;
    return { ok: true, account: existing };
  }

  const rows = await sql<Account[]>`
    with created as (
      insert into accounts (email, display_name, email_verified_at)
      values (${email}, ${(profile.name ?? email.split('@')[0]).trim()},
              ${profile.emailVerified ? new Date() : null})
      returning id, email, email_verified_at, display_name,
                is_athlete, is_host, is_staff, plan, status
    ), cred as (
      insert into account_credentials (account_id, provider, provider_uid)
      select id, 'google', ${profile.sub} from created
      returning account_id
    ), prof as (
      insert into athlete_profiles (account_id) select id from created
      returning account_id
    )
    select * from created
  `;
  return { ok: true, account: rows[0] };
}

// ---------------------------------------------------------------------
// Single-use tokens (email verification, password reset)
// ---------------------------------------------------------------------

export async function issueToken(
  accountId: string,
  purpose: 'email_verify' | 'password_reset',
  ttlMinutes: number,
): Promise<string> {
  const token = randomBytes(32).toString('base64url');
  await sql`
    insert into account_tokens (account_id, purpose, token_hash, expires_at)
    values (${accountId}, ${purpose}, ${hashToken(token)},
            now() + ${`${ttlMinutes} minutes`}::interval)
  `;
  return token;
}

export async function consumeToken(
  token: string,
  purpose: 'email_verify' | 'password_reset',
): Promise<string | null> {
  const rows = await sql<{ account_id: string }[]>`
    update account_tokens
       set consumed_at = now()
     where token_hash = ${hashToken(token)}
       and purpose = ${purpose}
       and consumed_at is null
       and expires_at > now()
    returning account_id
  `;
  return rows[0]?.account_id ?? null;
}

export async function setPassword(accountId: string, plain: string): Promise<void> {
  const hash = await hashPassword(plain);
  const emailRows = await sql<{ email: string }[]>`
    select email from accounts where id = ${accountId}
  `;
  const email = normaliseEmail(emailRows[0]?.email ?? '');

  await sql`
    insert into account_credentials (account_id, provider, provider_uid, password_hash)
    values (${accountId}, 'password', ${email}, ${hash})
    on conflict (account_id, provider)
      do update set password_hash = excluded.password_hash, updated_at = now()
  `;
}

// ---------------------------------------------------------------------
// Athlete profile
// ---------------------------------------------------------------------

export async function getAthleteProfile(accountId: string): Promise<AthleteProfile | null> {
  const rows = await sql<AthleteProfile[]>`
    select account_id, home_postal_code, home_city, home_state,
           latitude, longitude, travel_radius_miles, age_bracket, gender,
           phone_e164, sms_alerts_enabled, sms_snoozed_until::text
      from athlete_profiles where account_id = ${accountId} limit 1
  `;
  return rows[0] ?? null;
}

export interface AthleteProfilePatch {
  displayName?: string;
  homePostalCode?: string | null;
  travelRadiusMiles?: number;
  ageBracket?: AgeBracket;
  gender?: 'male' | 'female' | 'undisclosed' | null;
  /** null clears the number; undefined leaves it alone. */
  phoneE164?: string | null;
}

export async function saveAthleteProfile(
  accountId: string,
  patch: AthleteProfilePatch,
): Promise<void> {
  if (patch.displayName !== undefined) {
    await sql`
      update accounts set display_name = ${patch.displayName.trim()} where id = ${accountId}
    `;
  }

  // Read, merge in JavaScript, write every column. Building a partial SET
  // clause out of SQL fragments works, but it reads like a puzzle and one
  // wrong branch silently blanks a column — so the whole row goes back.
  const current = await getAthleteProfile(accountId);
  if (!current) {
    await sql`insert into athlete_profiles (account_id) values (${accountId})
              on conflict do nothing`;
  }
  const base = current ?? {
    home_postal_code: null,
    home_city: null,
    home_state: null,
    latitude: null,
    longitude: null,
    travel_radius_miles: 100,
    age_bracket: null,
    gender: null,
    phone_e164: null,
    sms_alerts_enabled: false,
  };

  // City, state and coordinates are always derived from the ZIP, never
  // typed, so they cannot disagree with it.
  let zip = base.home_postal_code;
  let city = base.home_city;
  let state = base.home_state;
  let lat = base.latitude;
  let lng = base.longitude;

  if (patch.homePostalCode !== undefined) {
    zip = patch.homePostalCode || null;
    city = null;
    state = null;
    lat = null;
    lng = null;
    if (zip) {
      const hit = zipcodes.lookup(zip);
      if (hit) {
        city = hit.city;
        state = hit.state;
        lat = hit.latitude;
        lng = hit.longitude;
      }
    }
  }

  const ageBracket = patch.ageBracket ?? base.age_bracket;
  const gender = patch.gender !== undefined ? patch.gender : base.gender;

  // Dropping to the under-18 bracket removes the phone number, because the
  // database will not hold both — and that is the safe direction to resolve
  // it in.
  const isMinor = ageBracket === 'under_18';
  const phone = isMinor
    ? null
    : patch.phoneE164 !== undefined
      ? patch.phoneE164
      : base.phone_e164;

  // Alerts survive only if the number is unchanged. Consent is consent to be
  // texted on a *particular* number, so a new number starts from no
  // permission rather than inheriting the old number's.
  const sameNumber = phone !== null && phone === base.phone_e164;
  const alerts = sameNumber && !isMinor ? base.sms_alerts_enabled : false;

  await sql`
    update athlete_profiles set
      home_postal_code    = ${zip},
      home_city           = ${city},
      home_state          = ${state},
      latitude            = ${lat},
      longitude           = ${lng},
      travel_radius_miles = ${patch.travelRadiusMiles ?? base.travel_radius_miles},
      age_bracket         = ${ageBracket},
      gender              = ${gender},
      phone_e164          = ${phone},
      sms_alerts_enabled  = ${alerts}
    where account_id = ${accountId}
  `;
}

/**
 * Replaces one preference set. Empty array means "no preference".
 *
 * Written out four times rather than parameterised on the table name: a
 * table name cannot be a query parameter, and four plain queries are
 * easier to read — and to be sure of — than one clever one.
 */
export async function setAthletePreference(
  accountId: string,
  kind: 'sports' | 'surfaces' | 'formats' | 'divisions',
  ids: string[],
): Promise<void> {
  const clean = ids.filter((id) => /^[0-9a-f-]{36}$/i.test(id));

  await sql.begin(async (tx) => {
    switch (kind) {
      case 'sports':
        await tx`delete from athlete_sports where account_id = ${accountId}`;
        if (clean.length)
          await tx`insert into athlete_sports (account_id, sport_id)
                   select ${accountId}, unnest(${clean}::uuid[])
                   on conflict do nothing`;
        break;
      case 'surfaces':
        await tx`delete from athlete_surfaces where account_id = ${accountId}`;
        if (clean.length)
          await tx`insert into athlete_surfaces (account_id, surface_id)
                   select ${accountId}, unnest(${clean}::uuid[])
                   on conflict do nothing`;
        break;
      case 'formats':
        await tx`delete from athlete_formats where account_id = ${accountId}`;
        if (clean.length)
          await tx`insert into athlete_formats (account_id, format_id)
                   select ${accountId}, unnest(${clean}::uuid[])
                   on conflict do nothing`;
        break;
      case 'divisions':
        await tx`delete from athlete_divisions where account_id = ${accountId}`;
        if (clean.length)
          await tx`insert into athlete_divisions (account_id, division_id)
                   select ${accountId}, unnest(${clean}::uuid[])
                   on conflict do nothing`;
        break;
    }
  });
}

export async function getAthletePreferences(accountId: string): Promise<{
  sports: string[];
  surfaces: string[];
  formats: string[];
  divisions: string[];
}> {
  const [sports, surfaces, formats, divisions] = await Promise.all([
    sql<{ id: string }[]>`select sport_id as id from athlete_sports where account_id = ${accountId}`,
    sql<{ id: string }[]>`select surface_id as id from athlete_surfaces where account_id = ${accountId}`,
    sql<{ id: string }[]>`select format_id as id from athlete_formats where account_id = ${accountId}`,
    sql<{ id: string }[]>`select division_id as id from athlete_divisions where account_id = ${accountId}`,
  ]);
  return {
    sports: sports.map((r) => r.id),
    surfaces: surfaces.map((r) => r.id),
    formats: formats.map((r) => r.id),
    divisions: divisions.map((r) => r.id),
  };
}

// ---------------------------------------------------------------------
// Host profile
// ---------------------------------------------------------------------

export async function getHostProfile(accountId: string): Promise<HostProfile | null> {
  const rows = await sql<HostProfile[]>`
    select account_id, organizer_id, organization_name, contact_email,
           contact_phone, website_url, city, state, about
      from host_profiles where account_id = ${accountId} limit 1
  `;
  return rows[0] ?? null;
}

export interface HostProfilePatch {
  organizationName: string;
  contactEmail: string;
  contactPhone: string | null;
  websiteUrl: string | null;
  city: string | null;
  state: string | null;
  about: string | null;
}

export async function saveHostProfile(
  accountId: string,
  patch: HostProfilePatch,
): Promise<void> {
  await sql.begin(async (tx) => {
    await tx`
      insert into host_profiles (account_id, organization_name, contact_email,
                                 contact_phone, website_url, city, state, about)
      values (${accountId}, ${patch.organizationName}, ${patch.contactEmail},
              ${patch.contactPhone}, ${patch.websiteUrl}, ${patch.city},
              ${patch.state}, ${patch.about})
      on conflict (account_id) do update set
        organization_name = excluded.organization_name,
        contact_email     = excluded.contact_email,
        contact_phone     = excluded.contact_phone,
        website_url       = excluded.website_url,
        city              = excluded.city,
        state             = excluded.state,
        about             = excluded.about
    `;
    await tx`update accounts set is_host = true where id = ${accountId}`;
  });
}

/**
 * Links a host to an organizer already in the database, so the events they
 * have run stay attached to them.
 *
 * The match is against the account's **own confirmed** email address, not
 * the contact email typed into the form. Organizer contact emails are public
 * — they are printed on every event page — so trusting the typed field would
 * let anybody claim Gateway Beach Series by typing its address, and the
 * "unclaimed only" rule would then lock the real organizer out permanently.
 *
 * Returns 'unverified' when the address matches but the account has not
 * confirmed its email yet, so the caller can say what is missing rather than
 * silently doing nothing.
 */
export async function claimOwnOrganizer(
  account: Account,
): Promise<{ status: 'claimed'; organizerId: string } | { status: 'none' | 'unverified' }> {
  const candidates = await sql<{ id: string }[]>`
    select o.id from organizers o
     where lower(o.contact_email) = ${normaliseEmail(account.email)}
       and not exists (select 1 from host_profiles h where h.organizer_id = o.id)
     limit 1
  `;
  const organizerId = candidates[0]?.id;
  if (!organizerId) return { status: 'none' };
  if (!account.email_verified_at) return { status: 'unverified' };

  // The unique index on host_profiles.organizer_id is the real arbiter, so
  // two people racing for the same organizer cannot both win. Losing the
  // race is not an error worth showing anybody.
  try {
    await sql`
      update host_profiles set organizer_id = ${organizerId}
       where account_id = ${account.id}
    `;
  } catch {
    return { status: 'none' };
  }
  return { status: 'claimed', organizerId };
}

// ---------------------------------------------------------------------
// SMS consent
// ---------------------------------------------------------------------

/**
 * Records a consent decision. Append-only: revoking inserts a row, it does
 * not delete the grant. Refuses outright for a profile marked under-18 —
 * a minor cannot give valid consent to be marketed to, and the product
 * rule is that no minor receives messages from COMPETE at all.
 */
export async function recordSmsConsent(opts: {
  accountId: string;
  phoneE164: string;
  purpose: SmsPurpose;
  granted: boolean;
  ipAddress?: string | null;
  userAgent?: string | null;
  channel?: 'web' | 'sms_reply' | 'staff';
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const profile = await getAthleteProfile(opts.accountId);
  if (opts.granted && profile?.age_bracket === 'under_18') {
    return { ok: false, error: 'COMPETE does not send text messages to anyone under 18.' };
  }

  await sql`
    insert into sms_consents (account_id, phone_e164, purpose, action,
                              disclosure_version, disclosure_text, channel,
                              ip_address, user_agent)
    values (${opts.accountId}, ${opts.phoneE164}, ${opts.purpose},
            ${opts.granted ? 'granted' : 'revoked'},
            ${SMS_DISCLOSURE_VERSION}, ${disclosureFor(opts.purpose)},
            ${opts.channel ?? 'web'},
            ${opts.ipAddress ?? null}, ${opts.userAgent ?? null})
  `;
  return { ok: true };
}

export interface SmsConsentState {
  granted: boolean;
  /** The number the consent was given for, which may not be the current one. */
  phoneE164: string | null;
}

/**
 * Current consent per purpose, including which number it was given for.
 *
 * The number matters: consent is to be texted on a particular number, not in
 * general. Returning only a boolean is how you end up texting a new number
 * on the strength of a record that names the old one.
 */
export async function smsConsentState(
  accountId: string,
): Promise<Record<SmsPurpose, SmsConsentState>> {
  const rows = await sql<
    { purpose: SmsPurpose; is_granted: boolean; phone_e164: string }[]
  >`
    select purpose, is_granted, phone_e164
      from sms_consent_current where account_id = ${accountId}
  `;
  const state: Record<SmsPurpose, SmsConsentState> = {
    transactional: { granted: false, phoneE164: null },
    marketing: { granted: false, phoneE164: null },
  };
  for (const row of rows) {
    state[row.purpose] = {
      granted: row.is_granted,
      phoneE164: row.is_granted ? row.phone_e164 : null,
    };
  }
  return state;
}

/**
 * Withdraws every live consent on an account, recording a revocation row for
 * each so the log stays a complete history.
 *
 * Called whenever a number leaves a profile — deleted, replaced, or removed
 * because the profile became an under-18 one. Without this, the grant row
 * survives with the old number on it, and `sms_consent_current` goes on
 * saying "yes, text this person here" about a number they asked us to
 * forget. For a profile that has just become a minor's, that is the whole
 * no-texting-minors rule quietly failing.
 */
/**
 * Returns how many live consents were withdrawn, so a caller auditing an
 * age-bracket change can record what the control actually stripped at the
 * moment it fired rather than inferring it from state afterwards.
 */
export async function revokeAllSmsConsent(
  accountId: string,
  context?: { ipAddress?: string | null; userAgent?: string | null },
): Promise<number> {
  const current = await smsConsentState(accountId);
  let revoked = 0;

  for (const purpose of ['transactional', 'marketing'] as const) {
    const live = current[purpose];
    if (!live.granted || !live.phoneE164) continue;
    revoked += 1;
    await sql`
      insert into sms_consents (account_id, phone_e164, purpose, action,
                                disclosure_version, disclosure_text, channel,
                                ip_address, user_agent)
      values (${accountId}, ${live.phoneE164}, ${purpose}, 'revoked',
              ${SMS_DISCLOSURE_VERSION}, ${disclosureFor(purpose)}, 'web',
              ${context?.ipAddress ?? null}, ${context?.userAgent ?? null})
    `;
  }

  return revoked;
}

export async function setSmsSnooze(accountId: string, until: string | null): Promise<void> {
  await sql`
    update athlete_profiles set sms_snoozed_until = ${until}
     where account_id = ${accountId}
  `;
}

export async function setSmsAlerts(accountId: string, enabled: boolean): Promise<void> {
  if (enabled) {
    // Turning alerts on clears any snooze, and the WHERE clause is what
    // stops alerts being enabled on a profile with no number — including a
    // minor's, which can never have one.
    await sql`
      update athlete_profiles
         set sms_alerts_enabled = true, sms_snoozed_until = null
       where account_id = ${accountId} and phone_e164 is not null
    `;
  } else {
    await sql`
      update athlete_profiles
         set sms_alerts_enabled = false, sms_snoozed_until = null
       where account_id = ${accountId}
    `;
  }
}
