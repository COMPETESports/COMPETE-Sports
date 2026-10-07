import { createHmac, timingSafeEqual, randomBytes } from 'node:crypto';
import { cookies } from 'next/headers';

/**
 * Phase 1 admin access.
 *
 * The SOW's Phase 1 admin workflow is explicitly temporary: it exists so
 * staff can enter tournaments until Host accounts arrive in Phase 2/3. So
 * this is a single shared password held in an environment variable and a
 * signed, HTTP-only session cookie — deliberately small, with no user
 * table to migrate away from later.
 */

const COOKIE = 'compete_admin';
const MAX_AGE_SECONDS = 60 * 60 * 12;

function secret(): string {
  const value = process.env.SESSION_SECRET;
  if (!value || value.length < 16) {
    throw new Error('SESSION_SECRET must be set to a random string of at least 16 characters.');
  }
  return value;
}

function sign(payload: string): string {
  return createHmac('sha256', secret()).update(payload).digest('base64url');
}

function safeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}

export function checkPassword(candidate: string): boolean {
  const expected = process.env.ADMIN_PASSWORD;
  if (!expected) return false;
  return safeEqual(candidate, expected);
}

export async function createSession(): Promise<void> {
  const expires = Date.now() + MAX_AGE_SECONDS * 1000;
  const payload = `${expires}.${randomBytes(8).toString('hex')}`;
  const token = `${payload}.${sign(payload)}`;

  (await cookies()).set(COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: MAX_AGE_SECONDS,
  });
}

export async function destroySession(): Promise<void> {
  (await cookies()).delete(COOKIE);
}

export async function isSignedIn(): Promise<boolean> {
  const token = (await cookies()).get(COOKIE)?.value;
  if (!token) return false;

  const parts = token.split('.');
  if (parts.length !== 3) return false;

  const [expires, nonce, signature] = parts;
  if (!safeEqual(signature, sign(`${expires}.${nonce}`))) return false;

  const expiresAt = Number(expires);
  return Number.isFinite(expiresAt) && expiresAt > Date.now();
}
