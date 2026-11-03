'use client';

import { useMemo, useState } from 'react';

/**
 * Pick the organizer who already exists, instead of typing their name again.
 *
 * Angry Dragon was four records before the merge tools existed: "Angry
 * Dragon" (2022), "Angry Dragons" (2023), "Angry Dragons Volleyball"
 * (2024) and "Angry Dragon Volleyball" (2026-27). One organization, four
 * records, because saveEvent matches on a slug made from whatever was
 * typed. Merging repairs that. This is what stops it recurring.
 *
 * The event count and most recent city are shown because they are what
 * tells near duplicates apart: between two similar names, the one with
 * 36 events in Jonesboro is obviously the real one.
 */

export interface OrganizerOption {
  id: string;
  name: string;
  contact_email: string | null;
  event_count: number;
  last_event: string | null;
  last_city: string | null;
  last_state: string | null;
}

const MAX_SHOWN = 8;

export function OrganizerPicker({
  organizers,
  current,
  onPick,
}: {
  organizers: OrganizerOption[];
  current: string;
  onPick: (o: OrganizerOption) => void;
}) {
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (q.length < 2) return [];
    const scored = organizers
      .map((o) => {
        const name = o.name.toLowerCase();
        if (name.startsWith(q)) return { o, rank: 0 };
        if (name.includes(q)) return { o, rank: 1 };
        return null;
      })
      .filter((x): x is { o: OrganizerOption; rank: number } => x !== null);
    scored.sort((a, b) => a.rank - b.rank || b.o.event_count - a.o.event_count);
    return scored.slice(0, MAX_SHOWN).map((x) => x.o);
  }, [organizers, query]);

  /** A name close to one that exists, that is not that one. The warning
   *  that would have caught all four Angry Dragons at the keyboard. */
  const nearMiss = useMemo(() => {
    const typed = current.trim().toLowerCase().replace(/[^a-z0-9]/g, '');
    if (typed.length < 4) return null;
    const exact = organizers.find((o) => o.name.trim().toLowerCase() === current.trim().toLowerCase());
    if (exact) return null;
    return (
      organizers.find((o) => {
        const k = o.name.toLowerCase().replace(/[^a-z0-9]/g, '');
        return k.startsWith(typed) || typed.startsWith(k);
      }) ?? null
    );
  }, [organizers, current]);

  function pick(o: OrganizerOption) {
    onPick(o);
    setQuery('');
    setOpen(false);
  }

  return (
    <div className="sm:col-span-2">
      <label className="grid gap-1.5">
        <span className="t-head text-sm text-[color:var(--muted)]">
          Find an organizer already in the database
        </span>
        <input
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          placeholder={`Search ${organizers.length} organizers by name`}
          className="field"
          autoComplete="off"
        />
      </label>

      {open && query.trim().length >= 2 && (
        <div className="mt-2 overflow-hidden rounded-xl border" style={{ borderColor: 'var(--line)' }}>
          {matches.length === 0 ? (
            <p className="px-4 py-3 text-xs text-[color:var(--muted)]">
              No organizer matches “{query.trim()}”. Type the name below and a new
              one will be created.
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
                    <span className="t-head block text-sm text-[color:var(--ink)]">{m.name}</span>
                    <span className="block text-xs text-[color:var(--muted)]">
                      {m.event_count} {m.event_count === 1 ? 'event' : 'events'}
                      {m.last_city && ` · last in ${m.last_city}, ${m.last_state}`}
                      {m.last_event && ` · ${m.last_event.slice(0, 4)}`}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {nearMiss && (
        <p
          className="mt-2 rounded-xl border px-3 py-2 text-xs"
          style={{
            borderColor: 'color-mix(in srgb, var(--beach) 50%, transparent)',
            color: 'var(--beach)',
          }}
        >
          <strong>{nearMiss.name}</strong> already exists with {nearMiss.event_count}{' '}
          {nearMiss.event_count === 1 ? 'event' : 'events'}. Saving under a
          different spelling creates a second record and splits their history.{' '}
          <button type="button" onClick={() => pick(nearMiss)} className="underline underline-offset-2">
            Use the existing one
          </button>
        </p>
      )}
    </div>
  );
}
