/**
 * Password rules, with no crypto attached.
 *
 * The forms need to state the minimum length and the server needs to
 * enforce it, and the forms are client components — so the rule lives apart
 * from `password.ts`, which imports `node:crypto` and cannot be bundled for
 * a browser.
 */

/** Passwords shorter than this are refused at sign-up. */
export const MIN_PASSWORD_LENGTH = 10;

/**
 * Why a length floor and nothing else: composition rules ("one capital, one
 * symbol") push people toward Password1! and are worse than useless. Length
 * is the property that actually helps.
 */
export function passwordProblem(plain: string): string | null {
  if (plain.length < MIN_PASSWORD_LENGTH) {
    return `Use at least ${MIN_PASSWORD_LENGTH} characters.`;
  }
  if (plain.length > 200) return 'That is too long — 200 characters maximum.';
  if (/^\s|\s$/.test(plain)) return 'Remove the leading or trailing space.';
  return null;
}
