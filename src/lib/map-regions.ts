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
 * Narrowed 21 Nov (Tom): the old ramps ran from near-black to pastel, so
 * busy states washed out to peach and quiet ones went muddy brown. The
 * hues he liked stay -- forest green Pacific, deep blue to teal Northeast
 * -- but each ramp now spans only the middle of its range.
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
    ramp: ['#1a5f80', '#1d7ba1', '#1f96c4', '#20b2e4'],
    text: ['light', 'light', 'dark', 'dark'],
    states: ['CT', 'MA', 'ME', 'NH', 'NJ', 'NY', 'PA', 'RI', 'VT'],
  },
  {
    slug: 'midwest',
    // Lemon yellow, ending at #FFF44F for the busiest states (Tom, 22 Nov).
    // Tried before it: orange, calamansi yellow, Benjamin Moore browns, orchid.
    name: 'Midwest',
    hue: '#eee140',
    ramp: ['#c9be2c', '#dccf36', '#eee140', '#fff44f'],
    text: ['dark', 'dark', 'dark', 'dark'],
    states: ['IA', 'IL', 'IN', 'KS', 'MI', 'MN', 'MO', 'ND', 'NE', 'OH', 'SD', 'WI'],
  },
  {
    slug: 'south',
    name: 'South',
    hue: '#b14aff',
    ramp: ['#6a30a0', '#8239bc', '#9a42de', '#b14aff'],
    text: ['light', 'light', 'light', 'dark'],
    states: [
      'AL', 'AR', 'DC', 'DE', 'FL', 'GA', 'KY', 'LA', 'MD', 'MS',
      'NC', 'OK', 'SC', 'TN', 'TX', 'VA', 'WV',
    ],
  },
  {
    slug: 'mountain',
    name: 'Mountain West',
    hue: '#ff3b5c',
    ramp: ['#8e2640', '#b42d48', '#d93452', '#ff3b5c'],
    text: ['light', 'light', 'light', 'dark'],
    states: ['AZ', 'CO', 'ID', 'MT', 'NM', 'NV', 'UT', 'WY'],
  },
  {
    slug: 'pacific',
    name: 'Pacific',
    hue: '#7dff3a',
    ramp: ['#345827', '#3f7029', '#4b8c2d', '#5aa830'],
    text: ['light', 'light', 'dark', 'dark'],
    states: ['AK', 'CA', 'HI', 'OR', 'WA'],
  },
];

const BY_STATE: ReadonlyMap<string, MapRegion> = new Map(
  MAP_REGIONS.flatMap((r) => r.states.map((code) => [code, r] as const)),
);

export function regionForMapState(code: string | null | undefined): MapRegion | null {
  return BY_STATE.get((code ?? '').trim().toUpperCase()) ?? null;
}
