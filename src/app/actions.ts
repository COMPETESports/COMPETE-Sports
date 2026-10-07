'use server';

import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { HOME_ZIP_COOKIE, HOME_ZIP_MAX_AGE } from '@/lib/home-location';

/**
 * Remembers where a visitor plays.
 *
 * A ZIP code is not a precise location and nothing here identifies a
 * person, so it is a plain first-party cookie rather than anything that
 * needs an account. When Phase 2 profiles arrive the same value moves to
 * the profile and this becomes the signed-out fallback.
 */
export async function setHomeZip(formData: FormData): Promise<void> {
  const raw = String(formData.get('zip') ?? '').trim();
  const store = await cookies();

  if (!raw) {
    store.delete(HOME_ZIP_COOKIE);
    redirect('/');
  }

  store.set(HOME_ZIP_COOKIE, raw.slice(0, 40), {
    httpOnly: false,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: HOME_ZIP_MAX_AGE,
  });

  redirect('/');
}
