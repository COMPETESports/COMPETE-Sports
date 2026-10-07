'use client';

import Link from 'next/link';
import { useActionState, useState } from 'react';
import { useFormStatus } from 'react-dom';
import { register, type FormState } from '@/app/account/actions';
import { AGE_BRACKETS } from '@/lib/account-fields';
import { MIN_PASSWORD_LENGTH } from '@/lib/password-rules';

/**
 * Sign-up.
 *
 * Four fields and two tick boxes. Everything else about a player — ZIP,
 * radius, sports, phone — is asked once they are in, because a long form is
 * the fastest way to lose someone who arrived curious.
 *
 * The age range is asked here rather than later for one reason: it decides
 * whether this account can ever have a phone number attached to it, and
 * that is not a question to answer retroactively.
 */
export function JoinForm() {
  const [state, action] = useActionState<FormState, FormData>(register, null);
  const [bracket, setBracket] = useState('');

  return (
    <form action={action} className="space-y-4">
      <div>
        <label className="label" htmlFor="display_name">
          Your name
        </label>
        <input
          id="display_name"
          name="display_name"
          required
          maxLength={60}
          autoComplete="name"
          className="field"
          placeholder="Tommy H."
        />
      </div>

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
          minLength={MIN_PASSWORD_LENGTH}
          autoComplete="new-password"
          className="field"
        />
        <p className="mt-1.5 text-xs text-[color:var(--faint)]">
          At least {MIN_PASSWORD_LENGTH} characters. Length beats punctuation.
        </p>
      </div>

      <fieldset>
        <legend className="label">Age range</legend>
        <div className="flex flex-wrap gap-2">
          {AGE_BRACKETS.map((option) => (
            <label key={option.value} className="toggle-chip">
              <input
                type="radio"
                name="age_bracket"
                value={option.value}
                required
                checked={bracket === option.value}
                onChange={() => setBracket(option.value)}
                className="sr-only"
              />
              <span>{option.label}</span>
            </label>
          ))}
        </div>
        <p className="mt-2 text-xs leading-relaxed text-[color:var(--faint)]">
          A range, not a birthday — we never ask for or store your date of
          birth.
          {bracket === 'under_18' && (
            <>
              {' '}
              <span className="text-[color:var(--coral-ink)]">
                Under-18 accounts cannot add a phone number and never receive
                texts from COMPETE.
              </span>
            </>
          )}
        </p>
      </fieldset>

      <label className="flex gap-2.5 text-sm leading-relaxed">
        <input type="checkbox" name="age_13_plus" value="yes" required className="mt-1" />
        <span className="text-[color:var(--muted)]">I am 13 or older.</span>
      </label>

      <label className="flex gap-2.5 text-sm leading-relaxed">
        <input type="checkbox" name="accept_terms" value="yes" required className="mt-1" />
        <span className="text-[color:var(--muted)]">
          I agree to the{' '}
          <Link href="/terms" className="underline decoration-[color:var(--surf)]">
            terms
          </Link>{' '}
          and{' '}
          <Link href="/privacy" className="underline decoration-[color:var(--surf)]">
            privacy policy
          </Link>
          .
        </span>
      </label>

      {state?.error && (
        <p
          role="alert"
          className="t-mono text-[11px] uppercase leading-relaxed tracking-wider text-[color:var(--coral-ink)]"
        >
          {state.error}
        </p>
      )}

      <Submit />

      <p className="text-center text-sm text-[color:var(--muted)]">
        Already have an account?{' '}
        <Link href="/signin" className="underline decoration-[color:var(--surf)]">
          Sign in
        </Link>
      </p>
    </form>
  );
}

function Submit() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className="btn-primary w-full" disabled={pending}>
      {pending ? 'Creating…' : 'Create my account'}
    </button>
  );
}
