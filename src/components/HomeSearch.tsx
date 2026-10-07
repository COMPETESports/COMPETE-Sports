'use client';

import { useFormStatus } from 'react-dom';
import { setHomeZip } from '@/app/actions';

/**
 * The homepage location box.
 *
 * It does two jobs at once: it fills the Local rail, and it remembers the
 * answer so a returning visitor lands on their own events rather than a
 * national list. Submitting an empty box clears it again.
 */
export function HomeSearch({ defaultZip }: { defaultZip: string | null }) {
  return (
    <form action={setHomeZip} className="flex flex-col gap-2.5 sm:flex-row">
      <label htmlFor="home-zip" className="sr-only">
        Your ZIP code or city
      </label>
      <input
        id="home-zip"
        name="zip"
        type="text"
        defaultValue={defaultZip ?? ''}
        placeholder="ZIP code or city, ST"
        className="field flex-1 !py-3 text-base"
        autoComplete="postal-code"
        enterKeyHint="search"
      />
      <Submit hasZip={!!defaultZip} />
    </form>
  );
}

function Submit({ hasZip }: { hasZip: boolean }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className="btn-primary !py-3" disabled={pending}>
      {pending ? 'Finding…' : hasZip ? 'Update' : 'Show my area'}
    </button>
  );
}
