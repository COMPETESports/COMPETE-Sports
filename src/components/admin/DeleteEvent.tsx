'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { deleteEvent } from '@/lib/admin';

/**
 * Deleting an event, in two steps. Any status since 15 Nov 2026.
 *
 * The confirmation is part of the page rather than a browser popup: a
 * popup is easy to dismiss without reading, looks nothing like the rest
 * of the site, and on some devices does not appear at all.
 *
 * It lives inside the event, beside Save, because that is the only place
 * two identical-looking duplicates can be told apart -- in the list they
 * are the same card twice. The server refuses if a player has saved the
 * event; see deleteEvent in admin.ts.
 */
export function DeleteEvent({ id, name, status }: { id: string; name: string; status: string }) {
  const router = useRouter();
  const [asking, setAsking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const live = status === 'approved';

  const remove = () => {
    setError(null);
    startTransition(async () => {
      const result = await deleteEvent(id);
      if (result.ok) router.push('/admin/events');
      else setError(result.message);
    });
  };

  if (!asking) {
    return (
      <button type="button" onClick={() => setAsking(true)} className="btn-ghost">
        Delete event
      </button>
    );
  }

  return (
    <div className="panel tone-bad mt-2 w-full p-4">
      <p className="t-head text-base">Delete “{name}” for good?</p>
      <p className="mt-1 text-sm">
        {live
          ? 'This event is live on the site. Deleting it removes it from search, the map and its own page, with its brackets.'
          : 'This removes the event and its brackets.'}{' '}
        It cannot be undone.
      </p>
      {error && (
        <p role="status" className="mt-2 text-sm font-semibold">
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
          Keep it
        </button>
      </div>
    </div>
  );
}
