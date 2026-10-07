/**
 * US phone numbers, normalised to E.164.
 *
 * COMPETE texts US numbers only, so this deliberately handles exactly that
 * case rather than pulling in a full international parsing library. A
 * number that is not a valid US number is rejected with a reason the
 * person can act on, not silently reformatted into something wrong.
 */

export type PhoneResult =
  | { ok: true; e164: string; display: string }
  | { ok: false; error: string };

export function normalisePhone(input: string): PhoneResult {
  const digits = input.replace(/\D+/g, '');

  // 11 digits starting with 1 is a US number with the country code typed.
  const local = digits.length === 11 && digits.startsWith('1') ? digits.slice(1) : digits;

  if (local.length === 0) return { ok: false, error: 'Enter a phone number.' };
  if (local.length !== 10) {
    return { ok: false, error: 'US numbers are 10 digits — check for a missing or extra one.' };
  }

  // The North American Numbering Plan: neither the area code nor the
  // exchange may start with 0 or 1, so these are never real numbers.
  if (/^[01]/.test(local)) {
    return { ok: false, error: 'That area code does not exist.' };
  }
  if (/^[01]/.test(local.slice(3))) {
    return { ok: false, error: 'That is not a valid number — check the digits after the area code.' };
  }
  // 555-01xx is permanently reserved for fiction.
  if (local.slice(3, 6) === '555' && local.slice(6, 8) === '01') {
    return { ok: false, error: 'That is a placeholder number, not a real one.' };
  }

  return {
    ok: true,
    e164: `+1${local}`,
    display: `(${local.slice(0, 3)}) ${local.slice(3, 6)}-${local.slice(6)}`,
  };
}

/** Formats a stored E.164 number back for display. */
export function displayPhone(e164: string | null): string | null {
  if (!e164) return null;
  const m = /^\+1(\d{3})(\d{3})(\d{4})$/.exec(e164);
  return m ? `(${m[1]}) ${m[2]}-${m[3]}` : e164;
}
