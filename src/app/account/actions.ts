'use server';

import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import {
  AGE_BRACKETS,
  accountByEmail,
  claimOwnOrganizer,
  consumeToken,
  currentAccount,
  emailProblem,
  endAllSessions,
  endSession,
  issueToken,
  normaliseEmail,
  recordSmsConsent,
  registerWithPassword,
  revokeAllSmsConsent,
  getAthleteProfile,
  saveAthleteProfile,
  saveHostProfile,
  setAthletePreference,
  setPassword,
  setSmsAlerts,
  setSmsSnooze,
  signInWithPassword,
  smsConsentState,
  startSession,
  type AgeBracket,
} from '@/lib/accounts';
import { sql } from '@/lib/db';
import { passwordProblem } from '@/lib/password-rules';
import { normalisePhone } from '@/lib/phone';
import { sendMail } from '@/lib/mailer';
import { recordAgeBracketChange, notifyAgeBracketChange } from '@/lib/compliance';
import { tooManyAttempts } from '@/lib/rate-limit';
import { setRelation, type EventRelation } from '@/lib/my-events';

export type FormState = { error?: string; notice?: string } | null;

const VALID_BRACKETS = new Set(AGE_BRACKETS.map((b) => b.value));
const VALID_RELATIONS = new Set<EventRelation>(['saved', 'registered', 'attended']);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function str(data: FormData, key: string): string {
  const value = data.get(key);
  return typeof value === 'string' ? value.trim() : '';
}

/**
 * Whether a redirect target is somewhere on this site.
 *
 * `startsWith('/')` is not enough: `//evil.com` and `/\evil.com` both pass it
 * and both resolve to another origin, which turns the sign-in page into a
 * convincing first step of a phishing flow.
 */
function safePath(value: string | undefined | null): string | null {
  if (!value) return null;
  if (!value.startsWith('/')) return null;
  if (value.startsWith('//') || value.startsWith('/\\')) return null;
  return value;
}

async function requestContext() {
  const h = await headers();
  return {
    userAgent: h.get('user-agent'),
    // Vercel puts the real client address first in x-forwarded-for.
    ip: h.get('x-forwarded-for')?.split(',')[0]?.trim() ?? null,
  };
}

// ---------------------------------------------------------------------
// Sign up / sign in / sign out
// ---------------------------------------------------------------------

export async function register(_prev: FormState, data: FormData): Promise<FormState> {
  const email = normaliseEmail(str(data, 'email'));
  const displayName = str(data, 'display_name');
  const password = str(data, 'password');
  const bracket = str(data, 'age_bracket') as AgeBracket;

  if (!displayName) return { error: 'Tell us what to call you.' };
  if (displayName.length > 60) return { error: 'That name is too long.' };

  const emailIssue = emailProblem(email);
  if (emailIssue) return { error: emailIssue };

  const passwordIssue = passwordProblem(password);
  if (passwordIssue) return { error: passwordIssue };

  if (!VALID_BRACKETS.has(bracket)) return { error: 'Choose your age range.' };

  // The 13+ floor. COPPA attaches a verifiable-parental-consent obligation
  // to personal information collected from anyone under 13, so the product
  // rule is that they do not hold accounts — and the confirmation is an
  // explicit tick, not an assumption.
  if (data.get('age_13_plus') !== 'yes') {
    return { error: 'You need to confirm you are 13 or older to create an account.' };
  }

  if (data.get('accept_terms') !== 'yes') {
    return { error: 'You need to accept the terms and privacy policy.' };
  }

  const result = await registerWithPassword({ email, password, displayName, ageBracket: bracket });
  if (!result.ok) return { error: result.error };

  const { userAgent } = await requestContext();
  await startSession(result.account.id, userAgent ?? undefined);

  const token = await issueToken(result.account.id, 'email_verify', 60 * 48);
  const site = process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000';
  await sendMail({
    to: email,
    subject: 'Confirm your COMPETE email',
    text:
      `Welcome to COMPETE.\n\nConfirm this address so we can send you event ` +
      `details and password resets:\n\n${site}/verify-email?token=${token}\n\n` +
      `The link is good for 48 hours. If you did not sign up, ignore this.\n`,
  });

  redirect('/account?welcome=1');
}

export async function signIn(_prev: FormState, data: FormData): Promise<FormState> {
  const email = str(data, 'email');
  const password = str(data, 'password');
  if (!email || !password) return { error: 'Enter your email and password.' };

  const { ip, userAgent } = await requestContext();
  const gate = tooManyAttempts(`signin:${ip ?? 'unknown'}:${normaliseEmail(email)}`, 8, 300);
  if (gate.limited) {
    return {
      error: `Too many attempts. Wait ${Math.ceil(gate.retryAfter / 60)} minute(s) and try again, or reset your password.`,
    };
  }

  const result = await signInWithPassword(email, password);
  if (!result.ok) return { error: result.error };

  await startSession(result.account.id, userAgent ?? undefined);

  redirect(safePath(str(data, 'next')) ?? '/account');
}

export async function signOut(): Promise<void> {
  await endSession();
  redirect('/');
}

// ---------------------------------------------------------------------
// Password reset
// ---------------------------------------------------------------------

export async function requestPasswordReset(
  _prev: FormState,
  data: FormData,
): Promise<FormState> {
  const email = normaliseEmail(str(data, 'email'));
  const issue = emailProblem(email);
  if (issue) return { error: issue };

  const { ip } = await requestContext();
  const gate = tooManyAttempts(`reset:${ip ?? 'unknown'}`, 5, 900);
  if (gate.limited) {
    return { error: 'Too many reset requests from here. Try again in a few minutes.' };
  }

  const account = await accountByEmail(email);

  // Same answer whether or not the address has an account. This page is
  // reachable by anyone, so it must not become a way to test which of your
  // friends has signed up.
  if (account) {
    const token = await issueToken(account.id, 'password_reset', 60);
    const site = process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000';
    const sent = await sendMail({
      to: email,
      subject: 'Reset your COMPETE password',
      text:
        `Someone asked to reset the password for this COMPETE account.\n\n` +
        `${site}/reset-password?token=${token}\n\n` +
        `The link works once and expires in an hour. If this was not you, ` +
        `nothing has changed and you can ignore this.\n`,
    });

    // Loud in the log, quiet on the page. Telling this visitor that delivery
    // failed would tell them the address has an account, so the alarm has to
    // go somewhere only the operator sees. If resets stop arriving, this line
    // is what says why.
    if (!sent.ok) {
      console.error(
        `[COMPETE] password reset email NOT DELIVERED (${sent.detail}). ` +
          `Check RESEND_API_KEY and the Resend dashboard.`,
      );
    }
  }

  return {
    notice:
      'If that address has an account, a reset link is on its way. Check your spam folder too.',
  };
}

export async function completePasswordReset(
  _prev: FormState,
  data: FormData,
): Promise<FormState> {
  const token = str(data, 'token');
  const password = str(data, 'password');

  const issue = passwordProblem(password);
  if (issue) return { error: issue };

  const accountId = await consumeToken(token, 'password_reset');
  if (!accountId) {
    return { error: 'That reset link has expired or was already used. Ask for a new one.' };
  }

  await setPassword(accountId, password);

  // Everything signed in before this moment is signed out. A reset is what
  // somebody does because they think someone else is in their account, and a
  // 60-day session that survives the reset would make the reset pointless.
  await endAllSessions(accountId);

  const { userAgent } = await requestContext();
  await startSession(accountId, userAgent ?? undefined);
  redirect('/account?reset=1');
}

/**
 * Confirms an email address.
 *
 * A server action rather than something a page does while rendering: the
 * token is single-use, and mail scanners, link previews and browser prefetch
 * all fetch a URL without anybody clicking it. Burned that way, the real
 * owner clicks their own link and is told it has expired.
 */
export async function verifyEmail(_prev: FormState, data: FormData): Promise<FormState> {
  const token = str(data, 'token');
  if (!token) return { error: 'That link is missing its token.' };

  const accountId = await consumeToken(token, 'email_verify');
  if (!accountId) {
    return {
      error:
        'That confirmation link has expired or was already used. ' +
        'Sign in and we can send you a fresh one.',
    };
  }

  await sql`update accounts set email_verified_at = now() where id = ${accountId}`;
  return { notice: 'Confirmed. That address is verified.' };
}

/** Sends a fresh confirmation email to the signed-in account. */
export async function resendVerification(): Promise<FormState> {
  const account = await currentAccount();
  if (!account) return { error: 'Sign in first.' };
  if (account.email_verified_at) return { notice: 'That address is already confirmed.' };

  const gate = tooManyAttempts(`verify:${account.id}`, 3, 900);
  if (gate.limited) return { error: 'We just sent one. Check your inbox and spam folder.' };

  const token = await issueToken(account.id, 'email_verify', 60 * 48);
  const site = process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000';
  await sendMail({
    to: account.email,
    subject: 'Confirm your COMPETE email',
    text:
      `Confirm this address so we can send you event details and password ` +
      `resets:\n\n${site}/verify-email?token=${token}\n\n` +
      `The link is good for 48 hours.\n`,
  });

  return { notice: 'Sent. Check your inbox.' };
}

// ---------------------------------------------------------------------
// Athlete profile
// ---------------------------------------------------------------------

export async function saveProfile(_prev: FormState, data: FormData): Promise<FormState> {
  const account = await currentAccount();
  if (!account) return { error: 'Sign in again — your session expired.' };

  const displayName = str(data, 'display_name');
  if (!displayName) return { error: 'Tell us what to call you.' };
  if (displayName.length > 60) return { error: 'That name is too long — 60 characters maximum.' };

  const zipRaw = str(data, 'home_postal_code');
  if (zipRaw && !/^\d{5}$/.test(zipRaw)) {
    return { error: 'A home ZIP is five digits.' };
  }

  const bracket = str(data, 'age_bracket') as AgeBracket;
  if (bracket && !VALID_BRACKETS.has(bracket)) return { error: 'That is not one of the age ranges.' };

  const genderRaw = str(data, 'gender');
  const gender =
    genderRaw === 'male' || genderRaw === 'female' || genderRaw === 'undisclosed'
      ? genderRaw
      : null;

  // A whole number, not merely a number in range: the column is an integer,
  // and a posted "50.5" would otherwise reach Postgres and throw.
  const radius = Number(str(data, 'travel_radius_miles')) || 100;
  if (!Number.isInteger(radius) || radius < 10 || radius > 250) {
    return { error: 'Pick a whole number of miles between 10 and 250.' };
  }

  // Phone. Optional for adults, impossible for minors — the database has a
  // constraint saying so, and this is the friendly version of it.
  const isMinor = bracket === 'under_18';
  const phoneRaw = str(data, 'phone');
  let phoneE164: string | null | undefined;

  if (isMinor) {
    phoneE164 = null;
  } else if (phoneRaw === '') {
    phoneE164 = null;
  } else {
    const parsed = normalisePhone(phoneRaw);
    if (!parsed.ok) return { error: parsed.error };
    phoneE164 = parsed.e164;
  }

  // Preference ids are validated before anything is written, so a bad one
  // cannot leave the profile saved and the preferences half-applied.
  const preferences: Record<string, string[]> = {};
  for (const kind of ['sports', 'surfaces', 'formats', 'divisions'] as const) {
    const ids = data.getAll(`pref_${kind}`).filter((v): v is string => typeof v === 'string');
    if (ids.some((id) => !UUID.test(id))) {
      return { error: 'Something went wrong with those selections. Reload and try again.' };
    }
    preferences[kind] = ids;
  }

  const { ip, userAgent } = await requestContext();

  // Read the bracket BEFORE writing, because an age-gate change is only
  // detectable as a difference. Also note whether a number was on file, so
  // the audit entry can say what the switch actually stripped rather than
  // inferring it from the after-state.
  const priorProfile = await getAthleteProfile(account.id);
  const priorBracket = priorProfile?.age_bracket ?? null;
  const priorHadPhone = Boolean(priorProfile?.phone_e164);

  await saveAthleteProfile(account.id, {
    displayName,
    homePostalCode: zipRaw || null,
    travelRadiusMiles: radius,
    ageBracket: bracket || undefined,
    gender,
    phoneE164,
  });

  for (const kind of ['sports', 'surfaces', 'formats', 'divisions'] as const) {
    await setAthletePreference(account.id, kind, preferences[kind]);
  }

  // How many live consents the save withdrew. Needed by the age-bracket
  // audit below, which records what the controls stripped at the moment
  // they fired rather than inferring it afterwards.
  let revokedConsents = 0;

  // SMS consent. Two independent boxes, each recorded with the exact wording
  // that was on the screen, and compared against both the previous answer AND
  // the number it was given for — consent is permission to text a particular
  // number, so a changed number needs a fresh record rather than inheriting
  // the old one's.
  if (phoneE164) {
    const existing = await smsConsentState(account.id);
    for (const purpose of ['transactional', 'marketing'] as const) {
      const wanted = data.get(`sms_${purpose}`) === 'yes';
      const live = existing[purpose];
      const unchanged = live.granted === wanted && (!wanted || live.phoneE164 === phoneE164);
      if (unchanged) continue;

      const outcome = await recordSmsConsent({
        accountId: account.id,
        phoneE164,
        purpose,
        granted: wanted,
        ipAddress: ip,
        userAgent,
      });
      if (!outcome.ok) return { error: outcome.error };
    }
    await setSmsAlerts(account.id, data.get('sms_marketing') === 'yes');
  } else {
    // The number is gone — deleted, or removed because the profile became an
    // under-18 one. Withdraw the consents explicitly rather than just turning
    // alerts off: otherwise the log keeps saying "yes, text them here" about a
    // number that is no longer on the account, and for a minor's profile that
    // is the no-texting-minors rule failing quietly.
    revokedConsents = await revokeAllSmsConsent(account.id, { ipAddress: ip, userAgent });
    await setSmsAlerts(account.id, false);
  }

  // The age gate is self-reported, so every movement through it goes on the
  // append-only record — with what the automatic controls stripped at the
  // time they fired, which is the part that is worth being able to prove
  // later. Deliberately after the write: the log records what happened, and
  // must never be the reason the protective change fails to apply.
  const change = await recordAgeBracketChange({
    accountId: account.id,
    from: priorBracket,
    to: bracket,
    phoneRemoved: priorHadPhone && phoneE164 === null,
    consentsRevoked: revokedConsents,
    ipAddress: ip,
    userAgent,
  });

  if (change) {
    // Not awaited into the player's response. They should not wait on an
    // SMTP round trip to see "Saved.", and a mail outage must not look to
    // them like a failed save. The receipt is written to the log either
    // way, and /admin/compliance shows anything that did not send.
    void notifyAgeBracketChange(change.id, {
      direction: change.direction,
      email: account.email,
      from: priorBracket,
      to: bracket,
      phoneRemoved: priorHadPhone && phoneE164 === null,
      consentsRevoked: revokedConsents,
      ipAddress: ip,
    });
  }

  revalidatePath('/account');
  revalidatePath('/');
  return { notice: 'Saved.' };
}

export async function snoozeAlerts(days: number): Promise<void> {
  const account = await currentAccount();
  if (!account) return;

  // A server action is an HTTP endpoint, so the argument is whatever was
  // posted. Without this, NaN or 1e21 reaches toISOString() and throws.
  if (!Number.isInteger(days) || days < 0 || days > 365) return;

  if (days === 0) {
    await setSmsSnooze(account.id, null);
  } else {
    const until = new Date(Date.now() + days * 24 * 60 * 60 * 1000);
    await setSmsSnooze(account.id, until.toISOString().slice(0, 10));
  }
  revalidatePath('/account');
}

// ---------------------------------------------------------------------
// Host profile
// ---------------------------------------------------------------------

export async function saveHost(_prev: FormState, data: FormData): Promise<FormState> {
  const account = await currentAccount();
  if (!account) return { error: 'Sign in again — your session expired.' };

  const organizationName = str(data, 'organization_name');
  if (!organizationName) {
    return { error: 'Enter an organization name — "Tommy Heimrich Tournaments" is fine.' };
  }
  if (organizationName.length > 120) return { error: 'That organization name is too long.' };

  const contactEmail = normaliseEmail(str(data, 'contact_email'));
  const emailIssue = emailProblem(contactEmail);
  if (emailIssue) return { error: `Contact email: ${emailIssue.toLowerCase()}` };

  const phoneRaw = str(data, 'contact_phone');
  let contactPhone: string | null = null;
  if (phoneRaw) {
    const parsed = normalisePhone(phoneRaw);
    if (!parsed.ok) return { error: `Contact phone: ${parsed.error.toLowerCase()}` };
    contactPhone = parsed.e164;
  }

  let websiteUrl: string | null = str(data, 'website_url') || null;
  if (websiteUrl) {
    if (!/^https?:\/\//i.test(websiteUrl)) websiteUrl = `https://${websiteUrl}`;
    try {
      new URL(websiteUrl);
    } catch {
      return { error: 'That website address does not look right.' };
    }
  }

  const about = str(data, 'about') || null;
  if (about && about.length > 500) return { error: 'Keep the description under 500 characters.' };

  const state = str(data, 'state').toUpperCase() || null;
  if (state && !/^[A-Z]{2}$/.test(state)) return { error: 'State is a two-letter code.' };

  await saveHostProfile(account.id, {
    organizationName,
    contactEmail,
    contactPhone,
    websiteUrl,
    city: str(data, 'city') || null,
    state,
    about,
  });

  // An organizer already in the database is matched on the account's OWN
  // confirmed address, never on the contact email typed above. Organizer
  // contact emails are printed on every event page, so trusting the typed
  // field would let anyone claim somebody else's events by copying an address
  // off the site.
  const claim = await claimOwnOrganizer(account);

  revalidatePath('/account/host');

  if (claim.status === 'claimed') {
    return { notice: 'Saved — and the events already listed under your email are now yours.' };
  }
  if (claim.status === 'unverified') {
    return {
      notice:
        'Saved. There are events already listed under your email — confirm your ' +
        'email address and they will be attached to this profile.',
    };
  }
  return { notice: 'Saved.' };
}

// ---------------------------------------------------------------------
// Saving events
// ---------------------------------------------------------------------

export async function updateEventRelation(
  eventId: string,
  relation: EventRelation | null,
  returnTo?: string,
): Promise<void> {
  // Both arguments arrive over HTTP and neither is enforced by the type
  // signature, so they are checked here. An invalid id would otherwise reach
  // Postgres and throw an unhandled error at the person.
  if (!UUID.test(eventId)) return;
  if (relation !== null && !VALID_RELATIONS.has(relation)) return;

  const safeReturn = safePath(returnTo);

  const account = await currentAccount();
  if (!account) redirect(`/signin?next=${encodeURIComponent(safeReturn ?? '/events')}`);

  await setRelation(account.id, eventId, relation);
  revalidatePath('/account/events');
  if (safeReturn) revalidatePath(safeReturn);
}
