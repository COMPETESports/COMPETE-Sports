/**
 * TCPA consent language, versioned.
 *
 * The Telephone Consumer Protection Act attaches damages of $500 per
 * message ($1,500 if a court finds it wilful) to marketing texts sent
 * without prior express written consent, and gives the recipient a private
 * right of action. Consent cannot be added after the fact: a number
 * collected today without a record is a number that can never be marketed
 * to, no matter what the person would have agreed to.
 *
 * So the disclosure is stored here as data rather than living inside a
 * form, and every consent row in the database records the exact version
 * and the exact text that was on the screen. When the wording changes, the
 * version changes with it, and the old record still says what the old
 * person actually saw.
 *
 * Required elements of prior express written consent, and where each one
 * lives in the text below:
 *   1. who is sending             — "COMPETE Sports"
 *   2. messages may be automated  — "automated text messages"
 *   3. what they are about        — new tournaments matching your filters
 *   4. how often, roughly         — "a few times a month"
 *   5. rates disclosure           — "Message and data rates may apply"
 *   6. how to stop                — STOP, and SNOOZE for a pause
 *   7. not a condition of use     — "not required to use COMPETE"
 *
 * The form must also present this as an unchecked box the person ticks
 * themselves. A pre-ticked box, or consent buried in the terms of service,
 * is not consent.
 */

export const SMS_DISCLOSURE_VERSION = '2026-09-1';

/** Marketing: the new-tournament alerts. Needs written consent. */
export const SMS_MARKETING_DISCLOSURE =
  'I agree to receive automated text messages from COMPETE Sports about new ' +
  'tournaments and events that match the sports, location and filters saved ' +
  'on my profile. Message frequency varies, typically a few times a month. ' +
  'Message and data rates may apply. Reply STOP at any time to stop all ' +
  'messages, SNOOZE to pause them, or HELP for help. Consent is not required ' +
  'to use COMPETE and I can browse and save events without it.';

/**
 * Transactional: details about an event the person actually signed up for.
 * A lower bar legally, but still recorded, because carriers and the A2P
 * 10DLC registration process ask for proof of opt-in regardless of which
 * side of the line the message falls on.
 */
export const SMS_TRANSACTIONAL_DISCLOSURE =
  'I agree to receive text messages from COMPETE Sports and event organizers ' +
  'about events I register for or save — schedule changes, directions, court ' +
  'assignments and day-of details. Message and data rates may apply. Reply ' +
  'STOP to stop, HELP for help.';

export type SmsPurpose = 'transactional' | 'marketing';

export function disclosureFor(purpose: SmsPurpose): string {
  return purpose === 'marketing'
    ? SMS_MARKETING_DISCLOSURE
    : SMS_TRANSACTIONAL_DISCLOSURE;
}

/** How long a SNOOZE lasts when the person does not pick a length. */
export const DEFAULT_SNOOZE_DAYS = 30;

export const SNOOZE_CHOICES = [
  { days: 14, label: '2 weeks' },
  { days: 30, label: '1 month' },
  { days: 90, label: '3 months' },
  { days: 180, label: '6 months' },
] as const;

/**
 * STOP, HELP, START and UNSTOP are carrier-mandated and must always work.
 * SNOOZE is COMPETE's own addition on top of them — useful in a seasonal
 * sport, where a player who is out for the winter is not a player who
 * wants to unsubscribe.
 */
export const RESERVED_KEYWORDS = ['STOP', 'STOPALL', 'UNSUBSCRIBE', 'CANCEL', 'END', 'QUIT'];
export const HELP_KEYWORDS = ['HELP', 'INFO'];
export const RESUME_KEYWORDS = ['START', 'UNSTOP', 'YES'];
export const SNOOZE_KEYWORDS = ['SNOOZE', 'PAUSE'];
