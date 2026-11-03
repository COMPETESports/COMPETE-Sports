'use client';

import { useActionState } from 'react';
import { useFormStatus } from 'react-dom';
import { mergeVenues } from '@/lib/venues-admin';

export function MergeVenue({
  winnerId,
  winnerName,
  siblings,
}: {
  winnerId: string;
  winnerName: string;
  siblings: { id: string; name: string; address_line: string | null; city: string; state: string; events: number }[];
}) {
  const [state, action] = useActionState<{ ok: boolean; message: string } | null, FormData>(
    async (_prev, form) => {
      const loserId = String(form.get('loserId') ?? '');
      if (!loserId) return { ok: false, message: 'Pick a record to merge.' };
      return mergeVenues(loserId, winnerId);
    },
    null,
  );

  if (!siblings.length) return null;
  const total = siblings.reduce((n, s) => n + s.events, 0);

  return (
    <div
      className="mt-3 rounded-xl border p-3"
      style={{ borderColor: 'color-mix(in srgb, var(--beach) 45%, transparent)' }}
    >
      <p className="t-head text-sm" style={{ color: 'var(--beach)' }}>
        {siblings.length === 1 ? 'Another record looks like this place' : `${siblings.length} other records look like this place`}
      </p>
      <p className="mt-1 text-xs text-[color:var(--muted)]">
        Holding {total} {total === 1 ? 'event' : 'events'}. Merging moves them onto{' '}
        <strong>{winnerName}</strong> and deletes the other. Cannot be undone.
      </p>
      <form action={action} className="mt-3 grid gap-2">
        {siblings.map((s) => (
          <label key={s.id} className="flex cursor-pointer items-center gap-3 rounded-lg border p-2" style={{ borderColor: 'var(--line)' }}>
            <input type="radio" name="loserId" value={s.id} required />
            <span className="min-w-0">
              <span className="block text-sm">{s.name}</span>
              <span className="block text-[11px] text-[color:var(--muted)]">
                {[s.address_line, `${s.city}, ${s.state}`].filter(Boolean).join(' · ')} — {s.events} {s.events === 1 ? 'event' : 'events'}
              </span>
            </span>
          </label>
        ))}
        <Go winnerName={winnerName} />
      </form>
      {state && (
        <p role="status" className={`panel mt-2 p-2 text-xs ${state.ok ? 'tone-good' : 'tone-bad'}`}>
          {state.message}
        </p>
      )}
    </div>
  );
}

function Go({ winnerName }: { winnerName: string }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} className="btn-primary justify-self-start !py-2 !text-xs disabled:opacity-50">
      {pending ? 'Merging…' : `Merge into ${winnerName}`}
    </button>
  );
}
