'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import type { OrganizerRow } from '@/lib/organizers-admin';

/**
 * 310 organizers, searchable, with the duplicates still clustered.
 *
 * Alphabetical is useless at this length and the duplicate grouping is
 * the point of the page, so search filters within that order rather than
 * replacing it. Tom, 4 Nov.
 *
 * The "no events" filter earns its place immediately: a large share of
 * these records hold nothing — rows an import created and never used —
 * and those are exactly the ones that can safely be deleted.
 */
export function OrganizerList({ rows }: { rows: OrganizerRow[] }) {
  const [query, setQuery] = useState('');
  const [only, setOnly] = useState<'all' | 'with' | 'without' | 'dupes'>('all');

  const clusters = useMemo(() => {
    const map = new Map<string, OrganizerRow[]>();
    for (const r of rows) {
      const list = map.get(r.match_key) ?? [];
      list.push(r);
      map.set(r.match_key, list);
    }
    return map;
  }, [rows]);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    const out: [string, OrganizerRow[]][] = [];
    for (const [key, group] of clusters) {
      if (only === 'dupes' && group.length < 2) continue;
      const kept = group.filter((o) => {
        if (only === 'with' && o.events === 0) return false;
        if (only === 'without' && o.events > 0) return false;
        if (!q) return true;
        return (
          o.name.toLowerCase().includes(q) ||
          (o.contact_email ?? '').toLowerCase().includes(q)
        );
      });
      // A duplicate cluster stays whole when any member matches, so the
      // thing you came to merge is never shown half of.
      if (kept.length) out.push([key, group.length > 1 && q ? group : kept]);
    }
    return out;
  }, [clusters, query, only]);

  const count = visible.reduce((n, [, g]) => n + g.length, 0);

  const FILTERS = [
    { k: 'all', label: 'All' },
    { k: 'with', label: 'Has events' },
    { k: 'without', label: 'No events' },
    { k: 'dupes', label: 'Duplicates' },
  ] as const;

  return (
    <div>
      <div className="mt-6 grid gap-3">
        <label className="grid gap-1.5">
          <span className="t-head text-sm text-[color:var(--muted)]">Find an organizer</span>
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Name or email"
            className="field"
            autoComplete="off"
          />
        </label>
        <div className="flex flex-wrap gap-2">
          {FILTERS.map((f) => (
            <button
              key={f.k}
              type="button"
              onClick={() => setOnly(f.k)}
              aria-pressed={only === f.k}
              className="t-head rounded-xl border px-3 py-1.5 text-xs transition-colors"
              style={
                only === f.k
                  ? { borderColor: 'var(--grass)', color: 'var(--grass)' }
                  : { borderColor: 'var(--line)', color: 'var(--muted)' }
              }
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      <p className="t-mono mt-3 text-[11px] text-[color:var(--muted)]">
        {count === rows.length ? `${rows.length} organizers` : `${count} of ${rows.length}`}
      </p>

      {visible.length === 0 ? (
        <p className="panel mt-4 p-4 text-sm text-[color:var(--muted)]">Nothing matches that.</p>
      ) : (
        <ul className="mt-4 grid gap-2">
          {visible.map(([key, group]) => (
            <li key={key}>
              <div
                className={group.length > 1 ? 'rounded-2xl border p-2' : ''}
                style={
                  group.length > 1
                    ? { borderColor: 'color-mix(in srgb, var(--beach) 40%, transparent)' }
                    : undefined
                }
              >
                {group.map((o) => (
                  <Link
                    key={o.id}
                    href={`/admin/organizers/${o.id}`}
                    className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 rounded-xl px-3 py-2.5 hover:bg-[color:var(--raised)]"
                  >
                    <span className="t-head min-w-0 text-sm">{o.name}</span>
                    <span className="t-mono text-[11px] text-[color:var(--muted)]">
                      {o.events === 0 ? (
                        <span style={{ color: 'var(--faint)' }}>no events</span>
                      ) : (
                        <>
                          {o.events} {o.events === 1 ? 'event' : 'events'}
                          {o.venues > 0 && ` · ${o.venues} ${o.venues === 1 ? 'venue' : 'venues'}`}
                          {o.earliest && ` · ${o.earliest.slice(0, 4)}–${o.latest?.slice(0, 4)}`}
                        </>
                      )}
                    </span>
                  </Link>
                ))}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
