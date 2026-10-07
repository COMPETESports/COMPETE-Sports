'use client';

import { useActionState } from 'react';
import { useFormStatus } from 'react-dom';
import { signIn } from '@/app/admin/actions';

export function SignInForm() {
  const [state, action] = useActionState(signIn, null);

  return (
    <form action={action} className="mt-6 space-y-3">
      <div>
        <label className="label" htmlFor="password">
          Staff password
        </label>
        <input
          id="password"
          name="password"
          type="password"
          required
          autoFocus
          autoComplete="current-password"
          className="field"
        />
      </div>

      {state?.error && (
        <p role="alert" className="t-mono text-[11px] uppercase tracking-wider text-[color:var(--coral-ink)]">
          {state.error}
        </p>
      )}

      <Submit />
    </form>
  );
}

function Submit() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className="btn-primary w-full" disabled={pending}>
      {pending ? 'Checking…' : 'Sign in'}
    </button>
  );
}
