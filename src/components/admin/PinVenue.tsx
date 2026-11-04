'use client';

import { useState, useTransition } from 'react';
import { PlacesAutocomplete, type PlaceResult } from './PlacesAutocomplete';
import { applyPin, type BackfillVenue } from '@/lib/venue-backfill';

/**
 * One venue, one lookup, one confirmation.
 *
 * The found address is shown beside the stored one before anything is
 * written, because the whole value of this pass is that a person looked.
 * Google will confidently offer a gym in the wrong state if the name is
 * generic enough, and "Riverside Park" exists in forty places.
 */
export function PinVenue({ venue }: { venue: BackfillVenue }) {
  const [found, setFound] = useState<PlaceResult | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const [warn, setWarn] = useState<string | null>(null);
  const [pending, start] = useTransition();

  if (done) {
    return (
      <div className="panel tone-good p-4">
        <p className="text-sm">{done}</p>
        {warn && <p className="mt-1 text-xs" style={{ color: 'var(--beach)' }}>{warn}</p>}
      </div>
    );
  }

  const stored = [venue.address_line, `${venue.city}, ${venue.state}`, venue.postal_code]
    .filter(Boolean)
    .join(' · ');
  const foundAddress = found
    ? [found.address_line, `${found.city}, ${found.state}`, found.postal_code].filter(Boolean).join(' · ')
    : '';

  const differentState = found && found.state && found.state !== venue.state;

  function confirm() {
    if (!found || found.latitude === null || found.longitude === null) return;
    start(async () => {
      const res = await applyPin({
        venueId: venue.id,
        latitude: found.latitude!,
        longitude: found.longitude!,
        placeId: found.place_id,
        businessStatus: found.business_status,
        name: found.name,
        address_line: found.address_line,
        city: found.city,
        state: found.state,
        postal_code: found.postal_code,
      });
      if (res.ok) setDone(res.message);
      else setWarn(res.message);
    });
  }

  return (
    <div className="panel p-5">
      <header className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="t-head text-base">{venue.name}</h2>
        <span className="t-mono text-[11px] text-[color:var(--muted)]">
          {venue.events} {venue.events === 1 ? 'event' : 'events'}
          {venue.upcoming > 0 && (
            <span style={{ color: 'var(--grass)' }}> · {venue.upcoming} upcoming</span>
          )}
          {' · '}
          <span style={{ color: 'var(--beach)' }}>{venue.geo_precision} pin</span>
        </span>
      </header>

      <p className="mt-1 text-sm text-[color:var(--muted)]">
        {stored || 'No address recorded'}
      </p>

      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <PlacesAutocomplete onPick={(p) => { setFound(p); setWarn(null); }} />
      </div>

      {found && (
        <div
          className="mt-4 rounded-xl border p-4"
          style={{ borderColor: 'color-mix(in srgb, var(--grass) 45%, transparent)' }}
        >
          <p className="t-kicker" style={{ color: 'var(--grass)' }}>Google found</p>
          <p className="t-head mt-1 text-sm">{found.name}</p>
          <p className="text-sm text-[color:var(--muted)]">{foundAddress}</p>

          {differentState && (
            <p className="mt-2 text-xs" style={{ color: 'var(--beach)' }}>
              <strong>This is in {found.state}, but the venue is recorded in {venue.state}.</strong>{' '}
              Check it is the right place before saving.
            </p>
          )}
          {found.business_status.startsWith('CLOSED') && (
            <p className="mt-2 text-xs" style={{ color: 'var(--beach)' }}>
              Google reports this place as {found.business_status.toLowerCase().replace(/_/g, ' ')}.
            </p>
          )}

          <div className="mt-3 flex flex-wrap gap-2">
            <button type="button" onClick={confirm} disabled={pending} className="btn-primary !py-2 !text-xs disabled:opacity-50">
              {pending ? 'Saving…' : 'This is the place — pin it'}
            </button>
            <button type="button" onClick={() => setFound(null)} className="btn-ghost !py-2 !text-xs">
              Not it
            </button>
          </div>
          <p className="t-mono mt-2 text-[10px] text-[color:var(--faint)]">
            Saving overwrites the stored address with Google&rsquo;s, so the record
            describes one place rather than two.
          </p>
        </div>
      )}

      {warn && <p className="panel tone-bad mt-3 p-3 text-xs">{warn}</p>}
    </div>
  );
}
