import type { SearchFilters } from './types';
import { today } from './dates';

export type RawParams = Record<string, string | string[] | undefined>;

export const RADIUS_CHOICES = [10, 25, 50, 100, 250] as const;
export const DEFAULT_RADIUS = 50;

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
  const radiusRaw = Number(asString(params.radius));
  const radius = (RADIUS_CHOICES as readonly number[]).includes(radiusRaw)
    ? radiusRaw
    : DEFAULT_RADIUS;

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
