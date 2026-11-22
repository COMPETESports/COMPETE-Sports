'use client';

import { useActionState, useEffect, useState } from 'react';
import { useFormStatus } from 'react-dom';
import { findOrganizersToMerge, mergeOrganizers } from '@/lib/organizers-admin';

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

  // Search any record, not just the ones whose names happen to match.
  const [q, setQ] = useState('');
  const [found, setFound] = useState<{ id: string; name: string; city: string | null; state: string | null; events: number }[]>([]);
  useEffect(() => {
    if (q.trim().length < 2) { setFound([]); return; }
    const t = setTimeout(() => {
      findOrganizersToMerge(q, winnerId).then(setFound).catch(() => setFound([]));
    }, 250);
    return () => clearTimeout(t);
  }, [q, winnerId]);
  const [open, setOpen] = useState(false);

  const total = siblings.reduce((n, s) => n + s.events, 0);
  const sibIds = new Set(siblings.map((s) => s.id));
  const extra = found.filter((f) => !sibIds.has(f.id));

  if (!siblings.length && !open) {
    return (
      <section className="panel mt-6 p-5">
        <button type="button" onClick={() => setOpen(true)} className="btn-ghost">
          Merge another record into this one…
        </button>
      </section>
    );
  }

  return (
    <section
      className="panel mt-6 p-5"
      style={{ borderColor: 'color-mix(in srgb, var(--beach) 45%, transparent)' }}
    >
      <h2 className="t-head text-base" style={{ color: 'var(--beach)' }}>
        {siblings.length === 0
          ? 'Merge another record into this one'
          : siblings.length === 1
          ? 'Another record looks like this organization'
          : `${siblings.length} other records look like this organization`}
      </h2>
      <p className="mt-1.5 text-sm text-[color:var(--muted)]">
        {siblings.length > 0 && <>Holding {total} {total === 1 ? 'event' : 'events'} between them. </>}
        Open the record you want to keep, then pick the one to fold in. Merging
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
          <input value={q} onChange={(e) => setQ(e.target.value)}
            placeholder="Search any organization by name or city"
            className="field" aria-label="Search organizations to merge" />
          {extra.map((s) => (
            <label key={s.id}
              className="flex cursor-pointer items-center gap-3 rounded-xl border p-3"
              style={{ borderColor: 'var(--line)' }}>
              <input type="radio" name="loserId" value={s.id} required />
              <span className="min-w-0">
                <span className="t-head block text-sm">{s.name}</span>
                <span className="block text-xs text-[color:var(--muted)]">
                  {[s.city, s.state].filter(Boolean).join(', ') || 'No city'} ·{' '}
                  {s.events} {s.events === 1 ? 'event' : 'events'} would move here
                </span>
              </span>
            </label>
          ))}
          {q.trim().length >= 2 && extra.length === 0 && (
            <p className="text-xs text-[color:var(--faint)]">No other matches.</p>
          )}
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
