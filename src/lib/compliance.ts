/**
 * Age-bracket change auditing.
 *
 * COMPETE's age gate is self-reported, which is the proportionate choice
 * for a 13+ event-discovery site — ID verification would be both
 * disproportionate and a far larger pile of sensitive data to hold. The
 * consequence is that the gate can be lied to, so the obligation is to
 * make every change to it visible, recorded and reviewable.
 *
 * The automatic enforcement lives elsewhere and already works: a minor's
 * profile cannot hold a phone number (database constraint), no phone means
 * no alerts (database constraint), and a number leaving a profile revokes
 * every live SMS consent (saveProfile). This module is the evidence layer
 * on top of it — what changed, when, from where, and what the controls
 * stripped at the time they fired.
 *
 * On direction, which matters more than it first appears:
 *
 *   18+ -> under 18  ("to_minor") is the SAFE direction. Protections
 *                    engage, the phone is deleted, texting stops. Logged
 *                    because an operator should know, and because the
 *                    stripping is worth being able to prove.
 *
 *   under 18 -> 18+  ("to_adult") is the direction that creates exposure,
 *                    because it is what a minor would do to unlock phone
 *                    collection and texting. Higher severity, even though
 *                    it is the one that looks innocuous.
 *
 * Nothing here blocks a change. A hard block would be trivially defeated
 * by making a second account, while teaching the user to lie on the first
 * attempt instead of correcting an honest mistake. Visibility and a
 * reviewable trail are the useful controls.
 */

import { sql } from '@/lib/db';
import { sendMail } from '@/lib/mailer';
import { CONTACT_EMAIL } from '@/lib/legal';
import type { AgeBracket } from '@/lib/account-fields';

/** Where operator compliance alerts go. */
const ALERT_TO = process.env.COMPLIANCE_EMAIL ?? CONTACT_EMAIL;

export type ChangeDirection = 'to_minor' | 'to_adult' | 'first_set' | 'other';

export interface AgeChangeRow {
  id: string;
  account_id: string;
  email: string | null;
  from_bracket: string | null;
  to_bracket: string;
  direction: ChangeDirection;
  phone_removed: boolean;
  consents_revoked: number;
  ip_address: string | null;
  occurred_at: string;
  notified_at: string | null;
  notify_detail: string | null;
  /** How many bracket changes this account has made in total. */
  changes_for_account: number;
}

const MINOR: AgeBracket = 'under_18';

export function directionOf(
  from: string | null | undefined,
  to: string,
): ChangeDirection {
  if (!from) return 'first_set';
  if (from === to) return 'other';
  if (to === MINOR) return 'to_minor';
  if (from === MINOR) return 'to_adult';
  return 'other';
}

/** Severity ordering for the review queue and for whether to alert at all. */
export function isReviewable(direction: ChangeDirection): boolean {
  return direction === 'to_minor' || direction === 'to_adult';
}

/**
 * Write the change to the append-only log.
 *
 * Returns the row id so the caller can attach a delivery receipt. Returns
 * null only when there was nothing to record (the bracket did not move),
 * which keeps the log free of no-op noise — a profile save that leaves the
 * bracket alone is not an age-gate event.
 *
 * This never throws into the caller's path. An audit write failing is
 * serious and is logged loudly, but it must not be the reason a player
 * cannot save their profile — and in particular must not be the reason a
 * switch TO under-18 fails to apply, since that switch is what strips the
 * phone number.
 */
export async function recordAgeBracketChange(input: {
  accountId: string;
  from: string | null | undefined;
  to: string;
  phoneRemoved: boolean;
  consentsRevoked: number;
  ipAddress?: string | null;
  userAgent?: string | null;
}): Promise<{ id: string; direction: ChangeDirection } | null> {
  if (!input.to) return null;
  if (input.from === input.to) return null;

  const direction = directionOf(input.from, input.to);

  try {
    const [row] = await sql<{ id: string }[]>`
      insert into age_bracket_changes
        (account_id, from_bracket, to_bracket, direction,
         phone_removed, consents_revoked, ip_address, user_agent)
      values
        (${input.accountId}, ${input.from ?? null}, ${input.to}, ${direction},
         ${input.phoneRemoved}, ${input.consentsRevoked},
         ${input.ipAddress ?? null}, ${input.userAgent ?? null})
      returning id`;
    return { id: row.id, direction };
  } catch (error) {
    console.error(
      '[compliance] FAILED to write age_bracket_changes — this is an audit gap, ' +
        'not a cosmetic error. Account:',
      input.accountId,
      `${input.from ?? 'null'} -> ${input.to}`,
      error,
    );
    return null;
  }
}

/**
 * Alert the operator, then record whether the alert actually went out.
 *
 * The receipt is the point. An earlier review of this codebase found mail
 * failures being reported as success, and a compliance alert that silently
 * does not send is worse than none at all — it produces a false belief
 * that someone was told. So the outcome is written to the row either way,
 * and the admin queue shows "not notified" in red rather than nothing.
 */
export async function notifyAgeBracketChange(
  changeId: string,
  detail: {
    direction: ChangeDirection;
    email: string | null;
    from: string | null | undefined;
    to: string;
    phoneRemoved: boolean;
    consentsRevoked: number;
    ipAddress?: string | null;
  },
): Promise<void> {
  if (!isReviewable(detail.direction)) return;

  const toMinor = detail.direction === 'to_minor';

  const subject = toMinor
    ? '[COMPETE] Account switched to under 18 — protections applied'
    : '[COMPETE] Account switched from under 18 to adult — review';

  const body = [
    toMinor
      ? 'An account changed its age bracket to under 18.'
      : 'An account changed its age bracket FROM under 18 to an adult bracket.',
    '',
    `Account:   ${detail.email ?? '(no email on file)'}`,
    `Change:    ${detail.from ?? '(not previously set)'} -> ${detail.to}`,
    `When:      ${new Date().toISOString()}`,
    `IP:        ${detail.ipAddress ?? '(not recorded)'}`,
    '',
    toMinor
      ? [
          'Applied automatically:',
          `  phone number removed:  ${detail.phoneRemoved ? 'yes' : 'no number was on file'}`,
          `  SMS consents revoked:  ${detail.consentsRevoked}`,
          '',
          'No further action is required for the no-texting-minors rule — the',
          'database will not allow a phone number on this profile while it says',
          'under 18. Review only if you want to confirm the account is genuine.',
        ].join('\n')
      : [
          'This is the direction that needs a look.',
          '',
          'An account that was under 18 now claims to be an adult, which is what',
          'removes the no-phone and no-texting restrictions. It may simply be a',
          'player who had a birthday or who mis-tapped when signing up. It may',
          'also be a minor trying to unlock text alerts.',
          '',
          'No phone number or SMS consent carried over — both were cleared when',
          'the account was under 18, so any texting requires a fresh number and a',
          'fresh consent. Nothing is being sent right now.',
        ].join('\n'),
    '',
    'Full log: /admin/compliance',
  ].join('\n');

  const result = await sendMail({ to: ALERT_TO, subject, text: body });

  // Two statements rather than one with a conditional fragment: mixing a
  // sql`` fragment and a null through a ternary is not something the driver
  // interpolates reliably, and getting it wrong here would mean an alert
  // recorded as delivered when it was not.
  try {
    if (result.ok) {
      await sql`
        update age_bracket_changes
           set notified_at = now(), notify_detail = ${`sent to ${ALERT_TO}`}
         where id = ${changeId}`;
    } else {
      await sql`
        update age_bracket_changes
           set notified_at = null,
               notify_detail = ${`NOT SENT: ${result.detail ?? 'unknown'}`}
         where id = ${changeId}`;
    }
  } catch (error) {
    console.error('[compliance] could not record notification receipt:', error);
  }

  if (!result.ok) {
    console.error(
      `[compliance] age-bracket alert NOT delivered (${result.detail}). ` +
        `Change ${changeId} is logged but nobody was told. Check RESEND_API_KEY.`,
    );
  }
}

/**
 * The review queue. Newest first, with the per-account change count so
 * repeated flip-flopping — the actual signal of someone probing the age
 * gate — is visible without a second query.
 */
export async function listAgeChanges(limit = 200): Promise<AgeChangeRow[]> {
  return sql<AgeChangeRow[]>`
    select
      c.id,
      c.account_id,
      a.email,
      c.from_bracket,
      c.to_bracket,
      c.direction,
      c.phone_removed,
      c.consents_revoked,
      host(c.ip_address) as ip_address,
      c.occurred_at,
      c.notified_at,
      c.notify_detail,
      (select count(*)::int from age_bracket_changes x
        where x.account_id = c.account_id) as changes_for_account
    from age_bracket_changes c
    left join accounts a on a.id = c.account_id
    order by c.occurred_at desc
    limit ${limit}`;
}

/**
 * Accounts currently sitting at under_18 that hold a phone number or have
 * alerts enabled — which the database constraints should make impossible.
 *
 * This should always return zero. It exists because "the constraint makes
 * it impossible" is a claim worth testing against the live table rather
 * than trusting, and a non-empty result here is the single most urgent
 * thing on the site.
 */
export async function minorsWithContactData(): Promise<
  { account_id: string; email: string | null; has_phone: boolean; alerts: boolean }[]
> {
  return sql`
    select p.account_id, a.email,
           (p.phone_e164 is not null) as has_phone,
           p.sms_alerts_enabled as alerts
      from athlete_profiles p
      left join accounts a on a.id = p.account_id
     where p.age_bracket = 'under_18'
       and (p.phone_e164 is not null or p.sms_alerts_enabled)`;
}
