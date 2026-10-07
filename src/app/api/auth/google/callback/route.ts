import { timingSafeEqual } from 'node:crypto';
import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { startSession, upsertGoogleAccount } from '@/lib/accounts';
import {
  GOOGLE_STATE_COOKIE,
  exchangeCode,
  isGoogleConfigured,
  isSamePath,
} from '@/lib/google-oauth';

function fail(request: Request) {
  return NextResponse.redirect(new URL('/signin?error=google', request.url));
}

export async function GET(request: Request) {
  if (!isGoogleConfigured()) return fail(request);

  const url = new URL(request.url);
  const code = url.searchParams.get('code');
  const state = url.searchParams.get('state');

  const store = await cookies();
  const expected = store.get(GOOGLE_STATE_COOKIE)?.value;
  store.delete(GOOGLE_STATE_COOKIE);

  if (!code || !state || !expected) return fail(request);

  const a = Buffer.from(state);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return fail(request);

  const identity = await exchangeCode(code);
  if (!identity) return fail(request);

  const result = await upsertGoogleAccount(identity);
  if (!result.ok) {
    // The reason is worth showing — "sign in with your password first" is
    // actionable, where a bare failure sends people round in circles.
    return NextResponse.redirect(
      new URL(`/signin?error=${encodeURIComponent(result.error)}`, request.url),
    );
  }

  await startSession(result.account.id, request.headers.get('user-agent') ?? undefined);

  const next = state.split(':').slice(1).join(':');
  return NextResponse.redirect(new URL(isSamePath(next) ? next : '/account', request.url));
}
