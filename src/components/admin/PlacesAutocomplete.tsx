'use client';

import { useEffect, useRef, useState } from 'react';

/**
 * Look a venue up on Google and get an exact pin.
 *
 * Every one of the 165 venues in the database sits on an approximate
 * pin -- `geo_precision` is 'postal' or 'city' for all of them, 'exact'
 * for none. Radius search works off those, so "5 miles from me" is
 * currently answered from the middle of a postal district, and every
 * marker on the map is in the wrong place by some amount nobody can see.
 *
 * Picking a real place from Google fixes that at the source: the
 * coordinates come back from the lookup rather than being guessed from a
 * ZIP code afterwards.
 *
 * Uses the Places API (New) autocomplete element. The event is
 * `gmp-select`, and the prediction has to be turned into a Place and
 * have its fields fetched before any of them are readable -- the
 * prediction itself carries only enough to draw the dropdown row.
 */

export interface PlaceResult {
  name: string;
  address_line: string;
  city: string;
  state: string;
  postal_code: string;
  latitude: number | null;
  longitude: number | null;
}

interface AddressComponent {
  longText?: string;
  shortText?: string;
  long_name?: string;
  short_name?: string;
  types: string[];
}

/* The script is global and must load exactly once per page, however many
   components ask for it. */
let mapsLoader: Promise<void> | null = null;

function loadMaps(key: string): Promise<void> {
  if (typeof window === 'undefined') return Promise.resolve();
  const w = window as unknown as { google?: { maps?: { importLibrary?: unknown } } };
  if (w.google?.maps?.importLibrary) return Promise.resolve();
  if (mapsLoader) return mapsLoader;

  mapsLoader = new Promise<void>((resolve, reject) => {
    const script = document.createElement('script');
    script.src =
      `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(key)}` +
      '&v=weekly&libraries=places&loading=async';
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => {
      mapsLoader = null;
      reject(new Error('Google Maps failed to load.'));
    };
    document.head.appendChild(script);
  });
  return mapsLoader;
}

/** Pull the pieces the form needs out of Google's component list. */
function readComponents(components: AddressComponent[] | undefined) {
  const out = { streetNumber: '', route: '', city: '', state: '', postal: '' };
  for (const c of components ?? []) {
    // The new API returns longText/shortText; the older one long_name/short_name.
    const long = c.longText ?? c.long_name ?? '';
    const short = c.shortText ?? c.short_name ?? '';
    if (c.types.includes('street_number')) out.streetNumber = long;
    else if (c.types.includes('route')) out.route = long;
    else if (c.types.includes('locality')) out.city = long;
    // Some addresses carry no locality - a township or a rural address
    // uses one of these instead, so the city box is not left blank.
    else if (!out.city && c.types.includes('sublocality')) out.city = long;
    else if (!out.city && c.types.includes('administrative_area_level_3')) out.city = long;
    else if (c.types.includes('administrative_area_level_1')) out.state = short;
    else if (c.types.includes('postal_code')) out.postal = long.slice(0, 5);
  }
  return out;
}

export function PlacesAutocomplete({ onPick }: { onPick: (p: PlaceResult) => void }) {
  const host = useRef<HTMLDivElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [ready, setReady] = useState(false);

  const key = process.env.NEXT_PUBLIC_GOOGLE_MAPS_KEY;

  useEffect(() => {
    if (!key || !host.current) return;
    let cancelled = false;
    const mount = host.current;

    (async () => {
      try {
        await loadMaps(key);
        if (cancelled) return;

        const g = (window as unknown as {
          google: { maps: { importLibrary: (n: string) => Promise<Record<string, unknown>> } };
        }).google;

        const places = await g.maps.importLibrary('places');
        const Ctor = places.PlaceAutocompleteElement as
          | (new (opts?: Record<string, unknown>) => HTMLElement)
          | undefined;
        if (!Ctor) throw new Error('Places autocomplete is unavailable on this key.');
        if (cancelled) return;

        const el = new Ctor({ includedRegionCodes: ['us'] });
        el.setAttribute('placeholder', 'Search Google for the venue or its address');
        el.style.width = '100%';
        mount.replaceChildren(el);
        setReady(true);

        el.addEventListener('gmp-select', (async (ev: Event) => {
          const { placePrediction } = ev as unknown as {
            placePrediction: {
              toPlace: () => {
                fetchFields: (o: { fields: string[] }) => Promise<unknown>;
                displayName?: string;
                formattedAddress?: string;
                addressComponents?: AddressComponent[];
                location?: { lat: () => number; lng: () => number };
              };
            };
          };

          try {
            const place = placePrediction.toPlace();
            // A prediction carries only enough to draw its row; the real
            // fields have to be asked for explicitly, and each one asked
            // for is billable, so this list stays minimal.
            await place.fetchFields({
              fields: ['displayName', 'formattedAddress', 'addressComponents', 'location'],
            });

            const parts = readComponents(place.addressComponents);
            const street = [parts.streetNumber, parts.route].filter(Boolean).join(' ');

            onPick({
              name: place.displayName ?? '',
              // Fall back to the first line of the formatted address when
              // Google gives no street components - common for a park.
              address_line: street || (place.formattedAddress ?? '').split(',')[0] || '',
              city: parts.city,
              state: parts.state,
              postal_code: parts.postal,
              latitude: place.location ? place.location.lat() : null,
              longitude: place.location ? place.location.lng() : null,
            });
          } catch {
            setError('Google returned that place but not its details. Fill the fields in below.');
          }
        }) as EventListener);
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Google Maps could not start.');
        }
      }
    })();

    return () => {
      cancelled = true;
      mount.replaceChildren();
    };
  }, [key, onPick]);

  if (!key) {
    return (
      <p className="sm:col-span-2 rounded-xl border border-dashed px-4 py-3 text-xs text-[color:var(--muted)]"
         style={{ borderColor: 'var(--line)' }}>
        Google lookup is off — no <code>NEXT_PUBLIC_GOOGLE_MAPS_KEY</code> is set.
        Venues entered by hand still work; their pin comes from the ZIP code.
      </p>
    );
  }

  return (
    <div className="sm:col-span-2 grid gap-1.5">
      <span className="t-head text-sm text-[color:var(--muted)]">
        Or look it up on Google
      </span>
      <div ref={host} />
      {!ready && !error && (
        <p className="text-xs text-[color:var(--faint)]">Loading Google…</p>
      )}
      {ready && !error && (
        <p className="text-xs text-[color:var(--muted)] opacity-80">
          Picking a result fills the address <em>and</em> sets an exact map pin,
          instead of one estimated from the ZIP code.
        </p>
      )}
      {error && (
        <p className="text-xs" style={{ color: 'var(--beach)' }}>
          {error}
        </p>
      )}
    </div>
  );
}
