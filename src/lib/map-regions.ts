/**
 * Regions for COLOURING THE MAP. Not the same as `regions.ts`.
 *
 * `regions.ts` drives the homepage "Upcoming in your region" rail and is a
 * travel heuristic -- eight regions sized for "far enough to drive". This
 * file is the Census Bureau's four regions, which Tom chose for the map on
 * 10 Nov 2026, with the West split into its two Census divisions so it can
 * carry the two colours he asked for:
 *   https://www2.census.gov/geo/pdfs/maps-data/maps/reference/us_regdiv.pdf
 *
 * Every state and DC belongs to exactly one. tests/map-regions.test.ts
 * holds that, and checks every state on the map has a colour.
 *
 * `ramp` runs dimmest to brightest, for 1–2, 3–5, 6–10 and 11+ events.
 * `text` is which label colour reads on each step. Values and contrast
 * ratios are in the header of map-scale.ts.
 */

export interface MapRegion {
  slug: string;
  name: string;
  /** The full-strength colour: legend swatch, dormant outline. */
  hue: string;
  ramp: readonly [string, string, string, string];
  text: readonly ['light' | 'dark', 'light' | 'dark', 'light' | 'dark', 'light' | 'dark'];
  states: readonly string[];
}

export const MAP_REGIONS: readonly MapRegion[] = [
  {
    slug: 'northeast',
    name: 'Northeast',
    hue: '#22c8ff',
    ramp: ['#194d69', '#1d7ba1', '#20b2e4', '#9ce6ff'],
    text: ['light', 'light', 'dark', 'dark'],
    states: ['CT', 'MA', 'ME', 'NH', 'NJ', 'NY', 'PA', 'RI', 'VT'],
  },
  {
    slug: 'midwest',
    name: 'Midwest',
    hue: '#ff7a1a',
    ramp: ['#69361d', '#ab541c', '#f3751a', '#ffc398'],
    text: ['light', 'light', 'dark', 'dark'],
    states: ['IA', 'IL', 'IN', 'KS', 'MI', 'MN', 'MO', 'ND', 'NE', 'OH', 'SD', 'WI'],
  },
  {
    slug: 'south',
    name: 'South',
    hue: '#b14aff',
    ramp: ['#532779', '#8239bc', '#b14aff', '#d8a4ff'],
    text: ['light', 'light', 'dark', 'dark'],
    states: [
      'AL', 'AR', 'DC', 'DE', 'FL', 'GA', 'KY', 'LA', 'MD', 'MS',
      'NC', 'OK', 'SC', 'TN', 'TX', 'VA', 'WV',
    ],
  },
  {
    slug: 'mountain',
    name: 'Mountain West',
    hue: '#ff3b5c',
    ramp: ['#6e2036', '#b42d48', '#ff3b5c', '#ff9dae'],
    text: ['light', 'light', 'dark', 'dark'],
    states: ['AZ', 'CO', 'ID', 'MT', 'NM', 'NV', 'UT', 'WY'],
  },
  {
    slug: 'pacific',
    name: 'Pacific',
    hue: '#7dff3a',
    ramp: ['#345827', '#4b8c2d', '#68cf35', '#c4ffa6'],
    text: ['light', 'dark', 'dark', 'dark'],
    states: ['AK', 'CA', 'HI', 'OR', 'WA'],
  },
];

const BY_STATE: ReadonlyMap<string, MapRegion> = new Map(
  MAP_REGIONS.flatMap((r) => r.states.map((code) => [code, r] as const)),
);

export function regionForMapState(code: string | null | undefined): MapRegion | null {
  return BY_STATE.get((code ?? '').trim().toUpperCase()) ?? null;
}
