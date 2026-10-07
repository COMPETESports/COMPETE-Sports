'use client';

import Link from 'next/link';
import { useActionState } from 'react';
import { useFormStatus } from 'react-dom';
import { signIn, type FormState } from '@/app/account/actions';

export function SignInForm({
  next,
  googleEnabled,
}: {
  next?: string;
  googleEnabled: boolean;
}) {
  const [state, action] = useActionState<FormState, FormData>(signIn, null);

  return (
    <div className="space-y-5">
      {googleEnabled && (
        <>
          <a
            href={`/api/auth/google/start${next ? `?next=${encodeURIComponent(next)}` : ''}`}
            className="btn-ghost w-full justify-center"
          >
            Continue with Google
          </a>
          <div className="flex items-center gap-3">
            <span className="h-[2px] flex-1 bg-[color:var(--line)]" />
            <span className="t-mono text-[10px] uppercase tracking-[0.18em] text-[color:var(--faint)]">
              or
            </span>
            <span className="h-[2px] flex-1 bg-[color:var(--line)]" />
          </div>
        </>
      )}

      <form action={action} className="space-y-4">
        {next && <input type="hidden" name="next" value={next} />}

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

        <div>
          <label className="label" htmlFor="password">
            Password
          </label>
          <input
            id="password"
            name="password"
            type="password"
            required
            autoComplete="current-password"
            className="field"
          />
        </div>

        {state?.error && (
          <p
            role="alert"
            className="t-mono text-[11px] uppercase leading-relaxed tracking-wider text-[color:var(--coral-ink)]"
          >
            {state.error}
          </p>
        )}

        <Submit />
      </form>

      <div className="flex flex-col gap-2 text-center text-sm text-[color:var(--muted)]">
        <Link href="/forgot-password" className="underline decoration-[color:var(--surf)]">
          Forgot your password?
        </Link>
        <span>
          New here?{' '}
          <Link href="/join" className="underline decoration-[color:var(--surf)]">
            Create an account
          </Link>
        </span>
      </div>
    </div>
  );
}

function Submit() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className="btn-primary w-full" disabled={pending}>
      {pending ? 'Signing in…' : 'Sign in'}
    </button>
  );
}
