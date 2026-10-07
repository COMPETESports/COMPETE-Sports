'use client';

import { useState, useTransition } from 'react';
import { resendVerification } from '@/app/account/actions';

/**
 * Shown until the address is confirmed.
 *
 * Confirming matters for two concrete things, so the banner says both rather
 * than nagging: without it there is no password reset, and an organizer cannot
 * be matched to the events already listed under their email.
 */
export function VerifyBanner({ email }: { email: string }) {
  const [pending, start] = useTransition();
  const [message, setMessage] = useState<string | null>(null);

  return (
    <div className="panel tone-warn p-5">
      <p className="t-head text-base">Confirm your email</p>
      <p className="mt-2 text-sm leading-relaxed">
        We sent a link to <strong>{email}</strong>. Until you click it we cannot
        reset your password if you forget it, and we cannot attach any events
        already listed under that address to your organizer profile.
      </p>

      {message ? (
        <p className="mt-3 text-sm font-semibold">{message}</p>
      ) : (
        <button
          type="button"
          className="btn-ghost mt-4 !px-3 !py-1.5 text-[10px]"
          disabled={pending}
          onClick={() =>
            start(async () => {
              const result = await resendVerification();
              setMessage(result?.error ?? result?.notice ?? 'Sent.');
            })
          }
        >
          {pending ? 'Sending…' : 'Send it again'}
        </button>
      )}
    </div>
  );
}
