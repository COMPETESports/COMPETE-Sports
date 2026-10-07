'use server';

import { redirect } from 'next/navigation';
import { checkPassword, createSession, destroySession } from '@/lib/auth';

export async function signIn(
  _prev: { error: string } | null,
  formData: FormData,
): Promise<{ error: string }> {
  const password = String(formData.get('password') ?? '');
  if (!password) return { error: 'Enter the staff password.' };

  if (!process.env.ADMIN_PASSWORD) {
    return { error: 'ADMIN_PASSWORD is not configured on the server.' };
  }
  if (!checkPassword(password)) {
    // A deliberate pause takes brute forcing off the table for a shared
    // password without adding rate-limiting infrastructure in Phase 1.
    await new Promise((resolve) => setTimeout(resolve, 600));
    return { error: 'That password is not right.' };
  }

  await createSession();
  redirect('/admin/events');
}

export async function signOut(): Promise<void> {
  await destroySession();
  redirect('/admin');
}
