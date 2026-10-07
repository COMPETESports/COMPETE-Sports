'use client';

import Link from 'next/link';
import { useActionState } from 'react';
import { useFormStatus } from 'react-dom';
import { verifyEmail, type FormState } from '@/app/account/actions';

/**
 * Confirming an email takes a click, not just a page load.
 *
 * The token is single-use, and plenty of things fetch a URL without a person
 * being involved: corporate mail scanners, Outlook Safe Links, Slack and
 * iMessage unfurling a preview, a browser prefetching a hovered link. Burning
 * the token on one of those means the real owner clicks their own link and is
 * told it has already been used.
 */
export function VerifyForm({ token }: { token: string }) {
  const [state, action] = useActionState<FormState, FormData>(verifyEmail, null);

  if (state?.notice) {
    return (
      <>
        <p className="t-display text-2xl text-[color:var(--surf-ink)]">Confirmed</p>
        <p className="mt-3 text-sm leading-relaxed text-[color:var(--muted)]">
          That address is verified. Password resets and event details will reach
          you.
        </p>
        <Link href="/account" className="btn-primary mt-6">
          Go to your account
        </Link>
      </>
    );
  }

  return (
    <form action={action}>
      <input type="hidden" name="token" value={token} />
      <p className="t-display text-2xl">One click to finish</p>
      <p className="mt-3 text-sm leading-relaxed text-[color:var(--muted)]">
        Confirm this is your email address and we are done.
      </p>

      {state?.error && (
        <p role="alert" className="panel tone-warn mt-5 p-3 text-left text-sm leading-relaxed">
          {state.error}
        </p>
      )}

      <Submit />

      <Link href="/account" className="btn-ghost mt-3 w-full justify-center">
        Skip for now
      </Link>
    </form>
  );
}

function Submit() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className="btn-primary mt-6 w-full" disabled={pending}>
      {pending ? 'Confirming…' : 'Confirm my email'}
    </button>
  );
}
