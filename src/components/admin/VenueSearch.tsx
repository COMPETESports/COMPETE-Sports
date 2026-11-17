'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { loadMaps, readComponents, type AddressComponent, type PlaceResult } from './PlacesAutocomplete';
import type { VenueOption } from './VenuePicker';

/**
 * One search box for venues: COMPETE's own first, Google's underneath.
 *
 * There used to be two boxes - "find a venue already in the database" and
 * "or look it up on Google" - and picking from the wrong one added the
 * same gym twice. Now both answer the same typing, in one list:
 *
 *   Already on COMPETE   venues we have, best match first
 *   New from Google      places we do not have yet
 *
 * A Google result we already hold (same Google place id, or same name,
 * city and state) is shown under "Already on COMPETE" instead, and picking
 * it from Google anyway still lands on our existing venue. Tom, 17 Nov.
 *
 * Google's ready-made autocomplete box cannot mix in our own rows, so the
 * suggestions are fetched directly (AutocompleteSuggestion, Places API New)
 * and drawn here. Same API and same billing as the old box.
 */

export interface VenueSearchProps {
  venues: VenueOption[];
  /** The venue name currently in the form. */
  current: string;
  /** An existing venue. `place` is set when it was picked via Google, for its exact pin. */
  onPickVenue: (venue: VenueOption, place: PlaceResult | null) => void;
  /** A place from Google that is not in the database yet. */
  onPickPlace: (place: PlaceResult) => void;
}

interface Suggestion {
  placeId: string;
  main: string;
  secondary: string;
  toPlace: () => GooglePlace;
}

interface GooglePlace {
  fetchFields: (o: { fields: string[] }) => Promise<unknown>;
  id?: string;
  displayName?: string;
  formattedAddress?: string;
  addressComponents?: AddressComponent[];
  businessStatus?: string;
  types?: string[];
  location?: { lat: () => number; lng: () => number };
}

interface PlacesLib {
  AutocompleteSuggestion: {
    fetchAutocompleteSuggestions: (req: Record<string, unknown>) => Promise<{
      suggestions: {
        placePrediction: {
          placeId: string;
          text: { text: string };
          mainText?: { text: string };
          secondaryText?: { text: string };
          toPlace: () => GooglePlace;
        } | null;
      }[];
    }>;
  };
  AutocompleteSessionToken: new () => unknown;
}

const MAX_OURS = 6;
const MAX_GOOGLE = 5;
const norm = (s: string | null | undefined) => (s ?? '').trim().toLowerCase().replace(/\s+/g, ' ');

/** Our venue for a Google place, if we already have it. */
function findExisting(venues: VenueOption[], p: { place_id?: string; name: string; city: string; state: string }) {
  return (
    (p.place_id && venues.find((v) => v.google_place_id === p.place_id)) ||
    venues.find(
      (v) =>
        norm(v.name) === norm(p.name) &&
        norm(v.city) === norm(p.city) &&
        norm(v.state) === norm(p.state),
    ) ||
    null
  );
}

export function VenueSearch({ venues, current, onPickVenue, onPickPlace }: VenueSearchProps) {
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [google, setGoogle] = useState<Suggestion[]>([]);
  const [googleState, setGoogleState] = useState<'idle' | 'loading' | 'off' | 'error'>('idle');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [active, setActive] = useState(0);
  const lib = useRef<PlacesLib | null>(null);
  const token = useRef<unknown>(null);
  const box = useRef<HTMLDivElement>(null);
  const key = process.env.NEXT_PUBLIC_GOOGLE_MAPS_KEY;

  // Ours: name first, then city, then most-used.
  const ours = useMemo(() => {
    const q = norm(query);
    if (q.length < 2) return [];
    return venues
      .map((v) => {
        const name = norm(v.name);
        const city = norm(v.city);
        const rank = name.startsWith(q) ? 0 : name.includes(q) ? 1 : city.startsWith(q) ? 2 : city.includes(q) ? 3 : -1;
        return { v, rank };
      })
      .filter((x) => x.rank >= 0)
      .sort((a, b) => a.rank - b.rank || b.v.event_count - a.v.event_count)
      .slice(0, MAX_OURS)
      .map((x) => x.v);
  }, [venues, query]);

  // Google: debounced, from 3 letters.
  useEffect(() => {
    const q = query.trim();
    if (!key) { setGoogleState('off'); return; }
    if (q.length < 3) { setGoogle([]); setGoogleState('idle'); return; }
    let cancelled = false;
    setGoogleState('loading');
    const timer = window.setTimeout(async () => {
      try {
        if (!lib.current) {
          await loadMaps(key);
          const g = (window as unknown as {
            google: { maps: { importLibrary: (n: string) => Promise<unknown> } };
          }).google;
          lib.current = (await g.maps.importLibrary('places')) as PlacesLib;
        }
        if (!token.current) token.current = new lib.current.AutocompleteSessionToken();
        const { suggestions } = await lib.current.AutocompleteSuggestion.fetchAutocompleteSuggestions({
          input: q,
          sessionToken: token.current,
          includedRegionCodes: ['us'],
        });
        if (cancelled) return;
        setGoogle(
          suggestions
            .map((s) => s.placePrediction)
            .filter((p): p is NonNullable<typeof p> => !!p)
            .map((p) => ({
              placeId: p.placeId,
              main: p.mainText?.text ?? p.text.text,
              secondary: p.secondaryText?.text ?? '',
              toPlace: () => p.toPlace(),
            })),
        );
        setGoogleState('idle');
      } catch {
        if (!cancelled) { setGoogle([]); setGoogleState('error'); }
      }
    }, 300);
    return () => { cancelled = true; window.clearTimeout(timer); };
  }, [query, key]);

  // A Google row we already have moves up into "Already on COMPETE".
  const known = new Set(venues.map((v) => v.google_place_id).filter(Boolean));
  const googleNew = google.filter((s) => !known.has(s.placeId)).slice(0, MAX_GOOGLE);
  const googleKnown = google
    .map((s) => venues.find((v) => v.google_place_id === s.placeId))
    .filter((v): v is VenueOption => !!v && !ours.some((o) => o.id === v.id));
  const oursAll = [...ours, ...googleKnown].slice(0, MAX_OURS);

  type Row = { kind: 'ours'; v: VenueOption } | { kind: 'google'; s: Suggestion };
  const rows: Row[] = [
    ...oursAll.map((v) => ({ kind: 'ours' as const, v })),
    ...googleNew.map((s) => ({ kind: 'google' as const, s })),
  ];

  // Close when clicking elsewhere.
  useEffect(() => {
    const close = (e: MouseEvent) => {
      if (box.current && !box.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, []);

  function reset() {
    setQuery('');
    setGoogle([]);
    setOpen(false);
    setActive(0);
    token.current = null; // a pick ends Google's billing session
  }

  async function pickGoogle(s: Suggestion) {
    setBusy(true);
    setMessage(null);
    try {
      const place = s.toPlace();
      // Same fields, same billing tier as the old box.
      await place.fetchFields({
        fields: ['id', 'displayName', 'formattedAddress', 'addressComponents', 'businessStatus', 'types', 'location'],
      });
      const parts = readComponents(place.addressComponents);
      const street = [parts.streetNumber, parts.route].filter(Boolean).join(' ');
      const result: PlaceResult = {
        name: place.displayName ?? s.main,
        place_id: place.id ?? s.placeId,
        business_status: place.businessStatus ?? '',
        place_types: place.types ?? [],
        address_line: street || (place.formattedAddress ?? '').split(',')[0] || '',
        city: parts.city,
        state: parts.state,
        postal_code: parts.postal,
        latitude: place.location ? place.location.lat() : null,
        longitude: place.location ? place.location.lng() : null,
      };
      const existing = findExisting(venues, result);
      if (existing) {
        onPickVenue(existing, result);
        setMessage(`“${existing.name}” is already on COMPETE, so this event uses it.`);
      } else {
        onPickPlace(result);
      }
      reset();
    } catch {
      setMessage('Google returned that place but not its details. Fill the fields in below.');
    } finally {
      setBusy(false);
    }
  }

  function pick(row: Row) {
    if (row.kind === 'ours') {
      onPickVenue(row.v, null);
      setMessage(null);
      reset();
    } else {
      void pickGoogle(row.s);
    }
  }

  const showList = open && query.trim().length >= 2;
  const heading = 't-mono block px-4 pt-3 pb-1 text-[10px] uppercase tracking-[0.18em] text-[color:var(--faint)]';
  const rowClass = (i: number) =>
    `block w-full border-b px-4 py-2.5 text-left transition-colors last:border-b-0 hover:bg-[color:var(--raised)] ${
      i === active ? 'bg-[color:var(--raised)]' : ''
    }`;

  return (
    <div className="sm:col-span-2" ref={box}>
      <label className="grid gap-1.5">
        <span className="t-head text-sm text-[color:var(--muted)]">Find the venue</span>
        <input
          value={query}
          onChange={(e) => { setQuery(e.target.value); setOpen(true); setActive(0); }}
          onFocus={() => setOpen(true)}
          onKeyDown={(e) => {
            if (!showList || rows.length === 0) return;
            if (e.key === 'ArrowDown') { e.preventDefault(); setActive((a) => Math.min(a + 1, rows.length - 1)); }
            else if (e.key === 'ArrowUp') { e.preventDefault(); setActive((a) => Math.max(a - 1, 0)); }
            else if (e.key === 'Enter') { e.preventDefault(); pick(rows[active]); }
            else if (e.key === 'Escape') setOpen(false);
          }}
          placeholder="Venue name, address or city"
          className="field"
          autoComplete="off"
          disabled={busy}
        />
      </label>

      {showList && (
        <div className="mt-2 overflow-hidden rounded-xl border" style={{ borderColor: 'var(--line)' }}>
          <span className={heading}>Already on COMPETE</span>
          {oursAll.length === 0 ? (
            <p className="px-4 pb-3 text-xs text-[color:var(--muted)]">No match among our {venues.length} venues.</p>
          ) : (
            <ul>
              {oursAll.map((m, i) => (
                <li key={m.id}>
                  <button type="button" onClick={() => pick({ kind: 'ours', v: m })} className={rowClass(i)} style={{ borderColor: 'var(--line)' }}>
                    <span className="t-head block text-sm text-[color:var(--ink)]">{m.name}</span>
                    <span className="block text-xs text-[color:var(--muted)]">
                      {[m.address_line, `${m.city}, ${m.state}`, m.postal_code].filter(Boolean).join(' · ')}
                      {m.event_count > 0 ? ` — ${m.event_count} event${m.event_count === 1 ? '' : 's'}` : ''}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}

          {googleState !== 'off' && (
            <div className="border-t" style={{ borderColor: 'var(--line)' }}>
              <span className={heading}>New from Google</span>
              {googleState === 'loading' && googleNew.length === 0 ? (
                <p className="px-4 pb-3 text-xs text-[color:var(--faint)]">Searching Google…</p>
              ) : googleState === 'error' ? (
                <p className="px-4 pb-3 text-xs" style={{ color: 'var(--beach)' }}>
                  Google search is not answering. Fill the fields below by hand.
                </p>
              ) : query.trim().length < 3 ? (
                <p className="px-4 pb-3 text-xs text-[color:var(--faint)]">Keep typing…</p>
              ) : googleNew.length === 0 ? (
                <p className="px-4 pb-3 text-xs text-[color:var(--muted)]">Nothing new on Google.</p>
              ) : (
                <ul>
                  {googleNew.map((s, j) => (
                    <li key={s.placeId}>
                      <button type="button" onClick={() => pick({ kind: 'google', s })} className={rowClass(oursAll.length + j)} style={{ borderColor: 'var(--line)' }}>
                        <span className="t-head block text-sm text-[color:var(--ink)]">{s.main}</span>
                        <span className="block text-xs text-[color:var(--muted)]">{s.secondary}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
              <p className="px-4 pb-2 text-right text-[10px] text-[color:var(--faint)]">powered by Google</p>
            </div>
          )}
        </div>
      )}

      <p className="mt-2 text-xs text-[color:var(--muted)] opacity-80">
        {busy
          ? 'Getting the details from Google…'
          : message ??
            (current
              ? `Using “${current}”. Correct anything below and the change is saved to that venue.`
              : 'Pick one above. A Google pick also sets an exact map pin. Nothing found? Fill the fields below.')}
      </p>
    </div>
  );
}
