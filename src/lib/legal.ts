/**
 * The handful of facts the privacy policy and terms both need.
 *
 * Kept in one file so that changing the legal entity name or an effective
 * date is one edit rather than a hunt through prose — and so the two
 * documents can never disagree about who "we" is.
 *
 * `LEGAL_ENTITY` and `GOVERNING_STATE` were placeholders until 6 Oct 2026;
 * Tom confirmed both: the registered name is COMPETE SPORTS LLC and the LLC
 * is registered in Missouri, whose law governs.
 *
 * ⚠ STILL OUTSTANDING: neither document has been reviewed by a lawyer. They
 * are drafted to match what the software actually does — which is the part a
 * template cannot do — but that is not the same as being reviewed, and they
 * are not legal advice. The developer SOW lists privacy-policy and terms
 * drafting among its global exclusions, so this review is Tom's to arrange.
 *
 * Note the SOW itself is governed by Kentucky law. That is the contract with
 * the contractor and is unrelated to the law governing this site's terms;
 * the two differing is expected, not a mistake.
 */

export const LEGAL_ENTITY = 'COMPETE SPORTS LLC';
export const GOVERNING_STATE = 'Missouri';

/**
 * The public contact address and the From: on every email the site sends.
 * Tom is creating it as an alias on the existing Google Workspace account so
 * it lands in his inbox — until it exists, mail to it will bounce.
 */
export const CONTACT_EMAIL = 'hello@joincompete.com';
export const SITE_NAME = 'COMPETE';
export const SITE_DOMAIN = 'joincompete.com';

/** Update both when either document changes materially. */
export const PRIVACY_EFFECTIVE = 'September 26, 2026';
export const TERMS_EFFECTIVE = 'September 26, 2026';

/** The age floor. Referenced by both documents and by the sign-up form. */
export const MINIMUM_AGE = 13;
