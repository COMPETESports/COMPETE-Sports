/**
 * A small in-process rate limiter for the two endpoints where unlimited
 * attempts actually cost something: password sign-in, and the password-reset
 * email.
 *
 * Honest about what it is. This counter lives in the memory of one server
 * process, so on a platform that runs several instances an attacker gets the
 * limit multiplied by however many instances happen to be warm, and the count
 * resets whenever an instance is recycled. That is not real protection against
 * a determined distributed attack and is not pretending to be.
 *
 * What it does buy, for about thirty lines and no dependency: it stops a
 * single script from grinding through a password list, and it stops somebody
 * pointing a loop at /forgot-password and burning the whole email quota in a
 * minute. When there is a reason to do better, this is the seam to put a
 * shared counter behind.
 */

interface Bucket {
  count: number;
  resetAt: number;
}

const buckets = new Map<string, Bucket>();

/** Keeps the map from growing without limit in a long-lived process. */
function sweep(now: number): void {
  if (buckets.size < 5000) return;
  for (const [key, bucket] of buckets) {
    if (bucket.resetAt <= now) buckets.delete(key);
  }
}

/**
 * Counts an attempt and says whether this key is over its limit.
 * Returns the seconds remaining when it is, so the caller can say so.
 */
export function tooManyAttempts(
  key: string,
  limit: number,
  windowSeconds: number,
): { limited: boolean; retryAfter: number } {
  const now = Date.now();
  sweep(now);

  const existing = buckets.get(key);
  if (!existing || existing.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowSeconds * 1000 });
    return { limited: false, retryAfter: 0 };
  }

  existing.count += 1;
  if (existing.count > limit) {
    return { limited: true, retryAfter: Math.ceil((existing.resetAt - now) / 1000) };
  }
  return { limited: false, retryAfter: 0 };
}
