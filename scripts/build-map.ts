/**
 * build-map.ts
 * ---------------------------------------------------------------------
 * Turns the US Census state boundaries into flat SVG path data and writes
 * `src/lib/us-states.ts`.
 *
 * Run:  npx tsx scripts/build-map.ts
 *
 * This runs once, at authoring time, and its output is committed. The
 * browser therefore ships no mapping library and no TopoJSON — just a
 * string of path data per state, which is a few tens of kilobytes.
 *
 * The source is the Albers USA projection, which repositions Alaska and
 * Hawaii into insets so the whole country fits one readable frame.
 */

import { writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { geoPath } from 'd3-geo';
import { feature } from 'topojson-client';
import type { FeatureCollection, Geometry } from 'geojson';

const require = createRequire(import.meta.url);
const topology = require('us-atlas/states-albers-10m.json');

/** FIPS id -> postal code. The atlas identifies states by FIPS. */
const FIPS_TO_CODE: Record<string, string> = {
  '01': 'AL', '02': 'AK', '04': 'AZ', '05': 'AR', '06': 'CA', '08': 'CO',
  '09': 'CT', '10': 'DE', '11': 'DC', '12': 'FL', '13': 'GA', '15': 'HI',
  '16': 'ID', '17': 'IL', '18': 'IN', '19': 'IA', '20': 'KS', '21': 'KY',
  '22': 'LA', '23': 'ME', '24': 'MD', '25': 'MA', '26': 'MI', '27': 'MN',
  '28': 'MS', '29': 'MO', '30': 'MT', '31': 'NE', '32': 'NV', '33': 'NH',
  '34': 'NJ', '35': 'NM', '36': 'NY', '37': 'NC', '38': 'ND', '39': 'OH',
  '40': 'OK', '41': 'OR', '42': 'PA', '44': 'RI', '45': 'SC', '46': 'SD',
  '47': 'TN', '48': 'TX', '49': 'UT', '50': 'VT', '51': 'VA', '53': 'WA',
  '54': 'WV', '55': 'WI', '56': 'WY',
};

/**
 * States too small to hold a label. These get a leader line out to a label
 * placed in the margin, the way printed US maps have always handled the
 * north-east corner.
 */
const SMALL_STATES = new Set(['DC', 'DE', 'MD', 'RI', 'CT', 'NJ', 'MA', 'NH', 'VT']);

interface StateShape {
  code: string;
  name: string;
  d: string;
  cx: number;
  cy: number;
  small: boolean;
  /** [[minX, minY], [maxX, maxY]] — the frame to zoom to. */
  bounds: [[number, number], [number, number]];
}

const collection = feature(
  topology,
  topology.objects.states,
) as unknown as FeatureCollection<Geometry, { name: string }>;

const path = geoPath();
const states: StateShape[] = [];

for (const f of collection.features) {
  const fips = String(f.id).padStart(2, '0');
  const code = FIPS_TO_CODE[fips];
  // Territories (Puerto Rico and friends) are outside the Phase 1 domestic
  // scope, so they are dropped rather than drawn without data.
  if (!code) continue;

  const d = path(f);
  if (!d) continue;

  const [cx, cy] = path.centroid(f);
  const [[x0, y0], [x1, y1]] = path.bounds(f);

  states.push({
    code,
    name: f.properties.name,
    d: round(d),
    cx: Math.round(cx * 10) / 10,
    cy: Math.round(cy * 10) / 10,
    small: SMALL_STATES.has(code),
    bounds: [
      [Math.round(x0 * 10) / 10, Math.round(y0 * 10) / 10],
      [Math.round(x1 * 10) / 10, Math.round(y1 * 10) / 10],
    ],
  });
}

states.sort((a, b) => a.code.localeCompare(b.code));

/** Trims coordinate precision; sub-pixel decimals are invisible at this size. */
function round(d: string): string {
  return d.replace(/-?\d+\.\d+/g, (n) => String(Math.round(Number(n) * 10) / 10));
}

const header = `/**
 * us-states.ts — GENERATED FILE, do not edit by hand.
 *
 * Regenerate with:  npx tsx scripts/build-map.ts
 *
 * Source: us-atlas states-albers-10m (US Census cartographic boundaries),
 * pre-projected with Albers USA so Alaska and Hawaii sit as insets.
 * Coordinates are in the VIEWBOX space below.
 */

export const MAP_VIEWBOX = '0 0 975 610';

/**
 * The projection the paths above were generated with. Venue coordinates
 * must go through exactly this to land in the same space.
 */
export const ALBERS = { scale: 1300, translate: [487.5, 305] as [number, number] };

export interface StateShape {
  code: string;
  name: string;
  /** SVG path data in MAP_VIEWBOX coordinates. */
  d: string;
  /** Centroid, for label placement. */
  cx: number;
  cy: number;
  /** True when the state is too small to hold a label inside it. */
  small: boolean;
  /** [[minX, minY], [maxX, maxY]] — the frame to zoom to for this state. */
  bounds: [[number, number], [number, number]];
}

export const US_STATES: StateShape[] = ${JSON.stringify(states, null, 2)};

export const STATE_NAMES: Record<string, string> = Object.fromEntries(
  US_STATES.map((s) => [s.code, s.name]),
);
`;

writeFileSync('src/lib/us-states.ts', header);

const bytes = Buffer.byteLength(header);
console.log(
  `\nWrote src/lib/us-states.ts — ${states.length} states, ${(bytes / 1024).toFixed(0)} KB\n`,
);
