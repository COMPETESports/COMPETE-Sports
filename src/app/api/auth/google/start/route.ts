import { randomBytes } from 'node:crypto';
import { NextResponse } from 'next/server';
import {
  GOOGLE_STATE_COOKIE,
  authorizationUrl,
  isGoogleConfigured,
  isSamePath,
} from '@/lib/google-oauth';

/**
 * Starts Google sign-in.
 *
 * The state parameter is a random value stored in a short-lived HTTP-only
 * cookie and compared on the way back. Without it, anyone could hand a
 * victim a crafted callback URL and attach their own Google account to the
 * victim's session.
 */
export async function GET(request: Request) {
  if (!isGoogleConfigured()) {
    return NextResponse.redirect(new URL('/signin?error=google', request.url));
  }

  const next = new URL(request.url).searchParams.get('next') ?? '';
  const nonce = randomBytes(16).toString('base64url');
  // The return path travels inside state rather than in a second cookie.
  // `startsWith('/')` alone is not a same-site test — `//evil.com` passes it
  // and resolves to another origin — so the stricter check is applied here and
  // again on the way back.
  const state = `${nonce}:${isSamePath(next) ? next : ''}`;

  const response = NextResponse.redirect(authorizationUrl(state));
  response.cookies.set(GOOGLE_STATE_COOKIE, state, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: 600,
  });
  return response;
}
