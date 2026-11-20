/**
 * Telling a sign-up bot from a person, without making the person do a
 * puzzle. Tom, 19 Nov 2026: 35 accounts appeared in a day, named like
 * "KgwnusLAHGotzlHFdKBr", every one aged 55+ (the last option), using real
 * strangers' email addresses. Each one made COMPETE send a confirmation
 * email to someone who never signed up — the fastest way to get a sending
 * domain marked as spam.
 *
 * Three cheap layers, each enough to stop a lazy bot:
 *   1. a honeypot field people never see, so never fill;
 *   2. a minimum time on the page — a person cannot fill the form in 3s;
 *   3. a name check for random strings.
 * Plus a per-address rate limit in the action itself.
 */

/** A random string, not a name: one word, long, capitals scattered through it. */
export function looksLikeBotName(name: string): boolean {
  const n = name.trim();
  if (/\s/.test(n)) return false; // real names usually have a space
  if (n.length < 12) return false;
  if (!/^[A-Za-z]+$/.test(n)) return false;
  const innerCaps = (n.slice(1).match(/[A-Z]/g) ?? []).length;
  return innerCaps >= 3;
}

export const HONEYPOT_FIELD = 'company_website';
export const STARTED_FIELD = 'form_started';
export const MIN_FILL_MS = 3000;

/** null = looks human; otherwise the reason, for the log only. */
export function botReason(data: FormData, now = Date.now()): string | null {
  const honey = data.get(HONEYPOT_FIELD);
  if (typeof honey === 'string' && honey.trim() !== '') return 'honeypot';

  const started = Number(data.get(STARTED_FIELD));
  if (!Number.isFinite(started) || started <= 0) return 'no-start-time';
  const elapsed = now - started;
  if (elapsed < MIN_FILL_MS) return 'too-fast';
  if (elapsed > 1000 * 60 * 60 * 24) return 'stale-form';

  const name = data.get('display_name');
  if (typeof name === 'string' && looksLikeBotName(name)) return 'random-name';
  return null;
}
