'use client';

import { useActionState } from 'react';
import { useFormStatus } from 'react-dom';
import { mergeOrganizers } from '@/lib/organizers-admin';

/**
 * Fold a duplicate record into this one.
 *
 * Two steps, because a merge cannot be undone: the events move and the
 * other record is gone. Naming the record and its event count in the
 * confirmation means the number on screen is the number at risk.
 */
export function MergeOrganizer({
  winnerId,
  winnerName,
  siblings,
}: {
  winnerId: string;
  winnerName: string;
  siblings: { id: string; name: string; events: number }[];
}) {
  const [state, action] = useActionState<
    { ok: boolean; message: string } | null,
    FormData
  >(async (_prev, form) => {
    const loserId = String(form.get('loserId') ?? '');
    if (!loserId) return { ok: false, message: 'Pick a record to merge.' };
    return mergeOrganizers(loserId, winnerId);
  }, null);

  if (!siblings.length) return null;

  const total = siblings.reduce((n, s) => n + s.events, 0);

  return (
    <section
      className="panel mt-6 p-5"
      style={{ borderColor: 'color-mix(in srgb, var(--beach) 45%, transparent)' }}
    >
      <h2 className="t-head text-base" style={{ color: 'var(--beach)' }}>
        {siblings.length === 1
          ? 'Another record looks like this organization'
          : `${siblings.length} other records look like this organization`}
      </h2>
      <p className="mt-1.5 text-sm text-[color:var(--muted)]">
        Holding {total} {total === 1 ? 'event' : 'events'} between them. Merging
        moves those events onto <strong>{winnerName}</strong> and deletes the
        other record. <strong>This cannot be undone.</strong>
      </p>

      <form action={action} className="mt-4 grid gap-3">
        <div className="grid gap-2">
          {siblings.map((s) => (
            <label
              key={s.id}
              className="flex cursor-pointer items-center gap-3 rounded-xl border p-3"
              style={{ borderColor: 'var(--line)' }}
            >
              <input type="radio" name="loserId" value={s.id} required />
              <span className="min-w-0">
                <span className="t-head block text-sm">{s.name}</span>
                <span className="block text-xs text-[color:var(--muted)]">
                  {s.events} {s.events === 1 ? 'event' : 'events'} would move here
                </span>
              </span>
            </label>
          ))}
        </div>
        <MergeButton winnerName={winnerName} />
      </form>

      {state && (
        <p
          role="status"
          className={`panel mt-3 p-3 text-sm ${state.ok ? 'tone-good' : 'tone-bad'}`}
        >
          {state.message}
        </p>
      )}
    </section>
  );
}

function MergeButton({ winnerName }: { winnerName: string }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} className="btn-primary justify-self-start disabled:opacity-50">
      {pending ? 'Merging…' : `Merge into ${winnerName}`}
    </button>
  );
}
