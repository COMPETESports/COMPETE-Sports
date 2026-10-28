'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { deleteDraftEvent } from '@/lib/admin';

/**
 * Deleting a draft, in two steps.
 *
 * The confirmation is part of the page rather than a browser popup: a
 * popup is easy to dismiss without reading, looks nothing like the rest
 * of the site, and on some devices does not appear at all.
 *
 * Only drafts get this button. Tom's rule, 28 Oct: drafts hold probable
 * events, so an abandoned one should go; anything published is cancelled
 * or archived instead, because deleting it would also strip it from the
 * saved lists of players who kept it.
 */
export function DeleteDraft({ id, name }: { id: string; name: string }) {
  const router = useRouter();
  const [asking, setAsking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const remove = () => {
    setError(null);
    startTransition(async () => {
      const result = await deleteDraftEvent(id);
      if (result.ok) router.push('/admin/events');
      else setError(result.message);
    });
  };

  if (!asking) {
    return (
      <button
        type="button"
        onClick={() => setAsking(true)}
        className="t-mono text-[11px] uppercase tracking-wider text-[color:var(--faint)] hover:text-[color:var(--coral-ink)]"
      >
        Delete draft
      </button>
    );
  }

  return (
    <div className="panel tone-bad w-full p-4">
      <p className="t-head text-base">Delete “{name}” for good?</p>
      <p className="mt-1 text-sm">
        This removes the draft and its brackets. It cannot be undone.
      </p>
      {error && (
        <p role="status" className="t-mono mt-2 text-[11px] uppercase tracking-wider">
          {error}
        </p>
      )}
      <div className="mt-3 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={remove}
          disabled={pending}
          className="btn-primary !py-2 !text-xs disabled:opacity-50"
        >
          {pending ? 'Deleting…' : 'Delete permanently'}
        </button>
        <button
          type="button"
          onClick={() => {
            setAsking(false);
            setError(null);
          }}
          disabled={pending}
          className="btn-ghost !py-2 !text-xs"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
