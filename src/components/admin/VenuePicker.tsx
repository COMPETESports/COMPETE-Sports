'use client';

import { useMemo, useState } from 'react';

/**
 * Pick a venue that is already in the database instead of retyping it.
 *
 * saveEvent matches an existing venue on name + city + state, exactly.
 * So "Sand Volleyball Club" and "Sand Volleyball club" are two venues,
 * on two map pins, and a radius search finds one of them. Typing the
 * same gym a second time is the most likely way to put bad data in, and
 * the fix is not to validate harder afterwards -- it is to make picking
 * the existing row easier than retyping it.
 *
 * Picking fills the four address fields below, which stay editable: a
 * venue that has moved or had its ZIP corrected should be fixable in
 * place, and saveEvent writes the correction back to the same row.
 */

export interface VenueOption {
  id: string;
  name: string;
  address_line: string | null;
  city: string;
  state: string;
  postal_code: string | null;
  event_count: number;
}

export interface VenuePickerProps {
  venues: VenueOption[];
  /** The venue name currently in the form, to show what is selected. */
  current: string;
  onPick: (venue: VenueOption) => void;
}

const MAX_SHOWN = 8;

export function VenuePicker({ venues, current, onPick }: VenuePickerProps) {
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (q.length < 2) return [];
    // Name first, then city - someone searching "Austin" wants the gyms
    // in Austin, and someone searching "Pharr" wants the one called Pharr.
    const scored = venues
      .map((v) => {
        const name = v.name.toLowerCase();
        const city = v.city.toLowerCase();
        if (name.startsWith(q)) return { v, rank: 0 };
        if (name.includes(q)) return { v, rank: 1 };
        if (city.startsWith(q)) return { v, rank: 2 };
        if (city.includes(q)) return { v, rank: 3 };
        return null;
      })
      .filter((x): x is { v: VenueOption; rank: number } => x !== null);

    scored.sort((a, b) => a.rank - b.rank || b.v.event_count - a.v.event_count);
    return scored.slice(0, MAX_SHOWN).map((x) => x.v);
  }, [venues, query]);

  function pick(venue: VenueOption) {
    onPick(venue);
    setQuery('');
    setOpen(false);
  }

  return (
    <div className="sm:col-span-2">
      <label className="grid gap-1.5">
        <span className="t-head text-sm text-[color:var(--muted)]">
          Find a venue already in the database
        </span>
        <input
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          placeholder={`Search ${venues.length} venues by name or city`}
          className="field"
          autoComplete="off"
        />
      </label>

      {open && query.trim().length >= 2 && (
        <div
          className="mt-2 overflow-hidden rounded-xl border"
          style={{ borderColor: 'var(--line)' }}
        >
          {matches.length === 0 ? (
            <p className="px-4 py-3 text-xs text-[color:var(--muted)]">
              No venue matches “{query.trim()}”. Fill the fields below and it
              will be added as a new one.
            </p>
          ) : (
            <ul>
              {matches.map((m) => (
                <li key={m.id}>
                  <button
                    type="button"
                    onClick={() => pick(m)}
                    className="block w-full border-b px-4 py-2.5 text-left transition-colors last:border-b-0 hover:bg-[color:var(--raised)]"
                    style={{ borderColor: 'var(--line)' }}
                  >
                    <span className="t-head block text-sm text-[color:var(--ink)]">
                      {m.name}
                    </span>
                    <span className="block text-xs text-[color:var(--muted)]">
                      {[m.address_line, `${m.city}, ${m.state}`, m.postal_code]
                        .filter(Boolean)
                        .join(' · ')}
                      {m.event_count > 0
                        ? ` — ${m.event_count} event${m.event_count === 1 ? '' : 's'}`
                        : ''}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      <p className="mt-2 text-xs text-[color:var(--muted)] opacity-80">
        {current
          ? `Using “${current}”. Correct anything below and the change is saved back to that venue.`
          : 'Or just fill the fields below to add a venue that is not in the database yet.'}
      </p>
    </div>
  );
}
