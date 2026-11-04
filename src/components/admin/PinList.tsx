'use client';

import { useMemo, useState } from 'react';
import { PinVenue } from './PinVenue';
import type { BackfillVenue } from '@/lib/venue-backfill';

/**
 * The venues waiting for a pin, searchable.
 *
 * Ordered by what is at stake is the right default - venues with
 * upcoming events first - but it is a bad way to find one venue you
 * have in mind. Tom, 4 Nov. Filtering happens here rather than on the
 * server because 172 rows is nothing, and a round trip per keystroke
 * would be slower and worse.
 */
export function PinList({ venues }: { venues: BackfillVenue[] }) {
  const [query, setQuery] = useState('');
  const [onlyUpcoming, setOnlyUpcoming] = useState(false);
  const [shown, setShown] = useState(10);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return venues.filter((v) => {
      if (onlyUpcoming && v.upcoming === 0) return false;
      if (!q) return true;
      return (
        v.name.toLowerCase().includes(q) ||
        v.city.toLowerCase().includes(q) ||
        v.state.toLowerCase().includes(q) ||
        (v.address_line ?? '').toLowerCase().includes(q) ||
        (v.postal_code ?? '').includes(q)
      );
    });
  }, [venues, query, onlyUpcoming]);

  const visible = filtered.slice(0, shown);

  return (
    <div>
      <div className="mt-6 grid gap-3 sm:grid-cols-[1fr_auto] sm:items-end">
        <label className="grid gap-1.5">
          <span className="t-head text-sm text-[color:var(--muted)]">
            Find a venue
          </span>
          <input
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setShown(10);
            }}
            placeholder="Name, city, state or ZIP"
            className="field"
            autoComplete="off"
          />
        </label>
        <button
          type="button"
          onClick={() => {
            setOnlyUpcoming((s) => !s);
            setShown(10);
          }}
          aria-pressed={onlyUpcoming}
          className="t-head rounded-xl border px-4 py-2.5 text-sm transition-colors"
          style={
            onlyUpcoming
              ? { borderColor: 'var(--grass)', color: 'var(--grass)' }
              : { borderColor: 'var(--line)', color: 'var(--muted)' }
          }
        >
          {onlyUpcoming ? 'Upcoming events only' : 'All venues'}
        </button>
      </div>

      <p className="t-mono mt-2 text-[11px] text-[color:var(--muted)]">
        {filtered.length === venues.length
          ? `${venues.length} waiting for a pin`
          : `${filtered.length} of ${venues.length} match`}
      </p>

      {filtered.length === 0 ? (
        <p className="panel mt-4 p-4 text-sm text-[color:var(--muted)]">
          Nothing matches that. Every venue with an exact pin already has been
          removed from this list, so it may be done.
        </p>
      ) : (
        <>
          <div className="mt-4 grid gap-4">
            {visible.map((v) => (
              <PinVenue key={v.id} venue={v} />
            ))}
          </div>

          {shown < filtered.length && (
            <button
              type="button"
              onClick={() => setShown((n) => n + 10)}
              className="btn-ghost mt-5 w-full"
            >
              Show 10 more — {filtered.length - shown} left
            </button>
          )}
        </>
      )}
    </div>
  );
}
