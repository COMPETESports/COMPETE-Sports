'use client';

import Link from 'next/link';
import { useState, useTransition } from 'react';
import { VenuePicker, type VenueOption } from './VenuePicker';
import {
  linkVenue, setHomeVenue, unlinkVenue, createVenueFromPlace, type LinkedVenue,
} from '@/lib/organizers-admin';
import { PlacesAutocomplete } from './PlacesAutocomplete';

/**
 * The venues an organizer uses, and a way to say so.
 *
 * Tom, 4 Nov: Legacy VTC and their venue were both in the database with
 * nothing connecting them, because no event had been entered naming
 * both. The relationship is real before the first event exists — it is
 * what a phone call produces — so it needs somewhere to live that is not
 * an event.
 */
export function OrganizerVenues({
  organizerId,
  linked,
  allVenues,
}: {
  organizerId: string;
  linked: LinkedVenue[];
  allVenues: VenueOption[];
}) {
  const [msg, setMsg] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const run = (fn: () => Promise<{ ok: boolean; message: string }>) =>
    start(async () => setMsg((await fn()).message));

  const linkedIds = new Set(linked.map((l) => l.venue_id));

  return (
    <section className="panel mt-6 p-5">
      {/* Created from Google, not typed. The picker below can only offer
          venues that already exist, which is no help for an organizer
          like Stratman Sports whose venue is not in the database at all
          -- and that is exactly when you learn it, on the call. */}
      <PlacesAutocomplete
        onPick={(place) => run(() => createVenueFromPlace(organizerId, place))}
      />

      {linked.length === 0 ? (
        <p className="mt-3 text-sm" style={{ color: 'var(--beach)' }}>
          No venues linked yet — not even from their events.
        </p>
      ) : (
        <ul className="mt-4 grid gap-2">
          {linked.map((v) => (
            <li
              key={v.venue_id}
              className="rounded-xl border p-3"
              style={{
                borderColor: v.is_home
                  ? 'color-mix(in srgb, var(--grass) 45%, transparent)'
                  : 'var(--line)',
              }}
            >
              <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                <Link href={`/admin/venues/${v.venue_id}`} className="t-head text-sm underline-offset-2 hover:underline">
                  {v.name}
                </Link>
                <span className="t-mono text-[11px] text-[color:var(--muted)]">
                  {v.is_home && <span style={{ color: 'var(--grass)' }}>home · </span>}
                  {v.events} {v.events === 1 ? 'event' : 'events'}
                  {v.source === 'event' && ' · from events'}
                  {v.geo_precision !== 'exact' && (
                    <span style={{ color: 'var(--beach)' }}> · {v.geo_precision} pin</span>
                  )}
                </span>
              </div>
              <p className="mt-0.5 text-xs text-[color:var(--muted)]">
                {[v.address_line, `${v.city}, ${v.state}`, v.postal_code].filter(Boolean).join(' · ')}
              </p>
              <div className="mt-2 flex flex-wrap gap-2">
                {!v.is_home && (
                  <button
                    type="button"
                    disabled={pending}
                    onClick={() => run(() => setHomeVenue(organizerId, v.venue_id))}
                    className="btn-ghost !py-1 !text-[11px]"
                  >
                    Make this their home
                  </button>
                )}
                <button
                  type="button"
                  disabled={pending}
                  onClick={() => run(() => unlinkVenue(organizerId, v.venue_id))}
                  className="btn-ghost !py-1 !text-[11px]"
                >
                  Unlink
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}

      <div className="mt-5 grid gap-2 border-t pt-4" style={{ borderColor: 'var(--line)' }}>
        <VenuePicker
          venues={allVenues.filter((v) => !linkedIds.has(v.id))}
          current=""
          onPick={(v) => run(() => linkVenue(organizerId, v.id))}
        />
      </div>

      {msg && (
        <p role="status" className="panel tone-good mt-3 p-3 text-xs">
          {msg}
        </p>
      )}
    </section>
  );
}
