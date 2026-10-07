import type { SearchFilters } from './types';
import { today } from './dates';

export type RawParams = Record<string, string | string[] | undefined>;

/**
 * How far someone will travel is a dial, not a menu. Five fixed options
 * (10/25/50/100/250) forced a choice between "too close" and "half the
 * country", so it is now a continuous range the visitor sets themselves.
 *
 * Stepped in tens so the value in the URL stays tidy and shareable, and so
 * the slider has 51 stops rather than 501 — fine motor control on a phone
 * is not a thing to rely on.
 *
 * 0 is legal and means "this postcode only". It will usually find nothing,
 * which is the honest answer to that question.
 */
export const RADIUS_MIN = 0;
export const RADIUS_MAX = 500;
export const RADIUS_STEP = 10;

/** 90 miles: roughly an hour and a half, which is a Saturday, not a trip. */
export const DEFAULT_RADIUS = 90;

/** Snaps anything to a legal radius. Out-of-range and junk fall back. */
export function clampRadius(value: unknown): number {
  const n = Number(value);
  if (!Number.isFinite(n) || n < RADIUS_MIN || n > RADIUS_MAX) return DEFAULT_RADIUS;
  return Math.round(n / RADIUS_STEP) * RADIUS_STEP;
}

const asArray = (v: string | string[] | undefined): string[] => {
  if (!v) return [];
  const list = Array.isArray(v) ? v : v.split(',');
  return list.map((s) => s.trim()).filter(Boolean);
};

const asString = (v: string | string[] | undefined): string | null => {
  const s = Array.isArray(v) ? v[0] : v;
  const trimmed = (s ?? '').trim();
  return trimmed ? trimmed : null;
};

const isIsoDate = (s: string | null): s is string => !!s && /^\d{4}-\d{2}-\d{2}$/.test(s);

/** Turns a URL query string into validated filters. Unknown input is dropped. */
export function parseFilters(params: RawParams): SearchFilters {
  const radius = params.radius === undefined ? DEFAULT_RADIUS : clampRadius(asString(params.radius));

  const sortRaw = asString(params.sort);
  const sort: SearchFilters['sort'] =
    sortRaw === 'distance' || sortRaw === 'price' ? sortRaw : 'date';

  const pageRaw = Number(asString(params.page));
  const page = Number.isFinite(pageRaw) && pageRaw >= 1 ? Math.floor(pageRaw) : 1;

  const from = asString(params.from);
  const to = asString(params.to);

  return {
    sport: asString(params.sport) ?? 'volleyball',
    from: isIsoDate(from) ? from : today(),
    to: isIsoDate(to) ? to : null,
    surfaces: asArray(params.surface),
    formats: asArray(params.format),
    genders: asArray(params.gender).filter((g) =>
      ['mens', 'womens', 'coed', 'open'].includes(g),
    ),
    divisions: asArray(params.division),
    near: asString(params.near),
    radius,
    state: (() => {
      const raw = asString(params.state);
      return raw && /^[A-Za-z]{2}$/.test(raw) ? raw.toUpperCase() : null;
    })(),
    lat: null,
    lng: null,
    sort,
    page,
  };
}

/** Rebuilds a query string with one value changed. Used by sort and paging. */
export function buildQuery(
  params: RawParams,
  overrides: Record<string, string | number | null>,
): string {
  const out = new URLSearchParams();

  for (const [key, value] of Object.entries(params)) {
    if (key in overrides) continue;
    for (const v of asArray(value)) out.append(key, v);
  }
  for (const [key, value] of Object.entries(overrides)) {
    if (value === null || value === '') continue;
    out.append(key, String(value));
  }

  const qs = out.toString();
  return qs ? `?${qs}` : '';
}

export function hasAnyFilter(f: SearchFilters): boolean {
  return (
    f.surfaces.length > 0 ||
    f.formats.length > 0 ||
    f.genders.length > 0 ||
    f.divisions.length > 0 ||
    !!f.near ||
    !!f.state ||
    !!f.to
  );
}
