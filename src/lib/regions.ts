/**
 * US regions, for the personalised "tournaments in your region" rail.
 *
 * Why not the Census Bureau's four regions: their "South" runs from Maryland
 * to Texas, which is 1.1 million square miles and not a thing anyone drives
 * across for a Saturday tournament. Their nine divisions are the right
 * granularity but carry names nobody says out loud — a rail headed "East
 * North Central tournaments" reads like a government form.
 *
 * So these are the Census divisions regrouped and renamed to what players
 * actually call the place they live. Every state and DC belongs to exactly
 * one, and the assignment never changes, so a region is a stable thing to
 * build a page title out of.
 *
 * This is a travel heuristic, not geography. A region should be roughly
 * "far enough to drive for a good event" — which is why Texas and Oklahoma
 * are their own thing rather than being filed under the South, and why the
 * Mountain states are separate from the coast.
 */

export interface Region {
  slug: string;
  /** Used in a heading: "Upcoming in the {name}" */
  name: string;
  states: readonly string[];
}

export const REGIONS: readonly Region[] = [
  {
    slug: 'northeast',
    name: 'Northeast',
    states: ['CT', 'MA', 'ME', 'NH', 'NJ', 'NY', 'RI', 'VT'],
  },
  {
    slug: 'mid-atlantic',
    name: 'Mid-Atlantic',
    states: ['DC', 'DE', 'MD', 'PA', 'VA', 'WV'],
  },
  {
    slug: 'southeast',
    name: 'Southeast',
    states: ['AL', 'FL', 'GA', 'KY', 'MS', 'NC', 'SC', 'TN'],
  },
  {
    slug: 'midwest',
    name: 'Midwest',
    states: ['IA', 'IL', 'IN', 'KS', 'MI', 'MN', 'MO', 'ND', 'NE', 'OH', 'SD', 'WI'],
  },
  {
    slug: 'south-central',
    name: 'South Central',
    states: ['AR', 'LA', 'OK', 'TX'],
  },
  {
    slug: 'mountain-west',
    name: 'Mountain West',
    states: ['AZ', 'CO', 'ID', 'MT', 'NM', 'NV', 'UT', 'WY'],
  },
  {
    slug: 'west-coast',
    name: 'West Coast',
    states: ['CA', 'OR', 'WA'],
  },
  {
    // Alaska and Hawaii share a rail because neither has a drivable
    // neighbour. Grouping them is honest about that rather than pretending
    // either belongs to the West Coast.
    slug: 'pacific-noncontiguous',
    name: 'Alaska & Hawaii',
    states: ['AK', 'HI'],
  },
];

/** state code -> region, built once at module load. */
const BY_STATE: ReadonlyMap<string, Region> = new Map(
  REGIONS.flatMap((region) => region.states.map((code) => [code, region] as const)),
);

/**
 * The region a two-letter state code belongs to, or null for anything not
 * on the list — a territory, a typo, or a null from an unplaced venue.
 * Callers treat null as "no regional rail", never as a default region.
 */
export function regionForState(code: string | null | undefined): Region | null {
  if (!code) return null;
  return BY_STATE.get(code.trim().toUpperCase()) ?? null;
}

export function regionBySlug(slug: string): Region | null {
  return REGIONS.find((r) => r.slug === slug) ?? null;
}
