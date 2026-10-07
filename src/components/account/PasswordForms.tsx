'use client';

import { useActionState } from 'react';
import { useFormStatus } from 'react-dom';
import {
  completePasswordReset,
  requestPasswordReset,
  type FormState,
} from '@/app/account/actions';
import { MIN_PASSWORD_LENGTH } from '@/lib/password-rules';

export function ForgotForm() {
  const [state, action] = useActionState<FormState, FormData>(requestPasswordReset, null);

  return (
    <form action={action} className="space-y-4">
      <div>
        <label className="label" htmlFor="email">
          Email
        </label>
        <input
          id="email"
          name="email"
          type="email"
          required
          autoComplete="email"
          className="field"
        />
      </div>

      {state?.error && (
        <p role="alert" className="t-mono text-[11px] uppercase tracking-wider text-[color:var(--coral-ink)]">
          {state.error}
        </p>
      )}
      {state?.notice && (
        <p className="panel tone-good p-3 text-sm leading-relaxed">{state.notice}</p>
      )}

      <Submit idle="Send me a reset link" busy="Sending…" />
    </form>
  );
}

export function ResetForm({ token }: { token: string }) {
  const [state, action] = useActionState<FormState, FormData>(completePasswordReset, null);

  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="token" value={token} />

      <div>
        <label className="label" htmlFor="password">
          New password
        </label>
        <input
          id="password"
          name="password"
          type="password"
          required
          minLength={MIN_PASSWORD_LENGTH}
          autoComplete="new-password"
          autoFocus
          className="field"
        />
        <p className="mt-1.5 text-xs text-[color:var(--faint)]">
          At least {MIN_PASSWORD_LENGTH} characters.
        </p>
      </div>

      {state?.error && (
        <p role="alert" className="t-mono text-[11px] uppercase tracking-wider text-[color:var(--coral-ink)]">
          {state.error}
        </p>
      )}

      <Submit idle="Set my password" busy="Saving…" />
    </form>
  );
}

function Submit({ idle, busy }: { idle: string; busy: string }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className="btn-primary w-full" disabled={pending}>
      {pending ? busy : idle}
    </button>
  );
}
