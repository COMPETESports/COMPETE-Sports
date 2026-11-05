'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { deleteOrganizer } from '@/lib/organizers-admin';

/**
 * Two-step delete, and only for a record holding nothing.
 *
 * The server refuses an organizer with events regardless of what this
 * component does — this just makes the refusal visible before the click
 * rather than after it.
 */
export function DeleteOrganizer({
  id,
  name,
  events,
}: {
  id: string;
  name: string;
  events: number;
}) {
  const [armed, setArmed] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const router = useRouter();

  if (events > 0) {
    return (
      <p className="t-mono mt-6 text-[11px] text-[color:var(--faint)]">
        Holds {events} {events === 1 ? 'event' : 'events'}, so it cannot be
        deleted — that would leave {events === 1 ? 'it' : 'them'} attributed to
        nobody. Merge it into the right record instead.
      </p>
    );
  }

  if (!armed) {
    return (
      <button
        type="button"
        onClick={() => setArmed(true)}
        className="t-mono mt-6 text-[11px] uppercase tracking-wider text-[color:var(--faint)] underline underline-offset-2 hover:text-[color:var(--coral-ink)]"
      >
        Delete this organizer
      </button>
    );
  }

  return (
    <div className="panel tone-bad mt-6 p-4">
      <p className="text-sm">
        Delete <strong>{name}</strong>? It holds no events. This cannot be undone.
      </p>
      <div className="mt-3 flex flex-wrap gap-2">
        <button
          type="button"
          disabled={pending}
          onClick={() =>
            start(async () => {
              const res = await deleteOrganizer(id);
              if (res.ok) router.push('/admin/organizers');
              else setError(res.message);
            })
          }
          className="btn-primary !py-2 !text-xs disabled:opacity-50"
        >
          {pending ? 'Deleting…' : 'Yes, delete it'}
        </button>
        <button type="button" onClick={() => setArmed(false)} className="btn-ghost !py-2 !text-xs">
          Cancel
        </button>
      </div>
      {error && <p className="mt-2 text-xs">{error}</p>}
    </div>
  );
}
