/**
 * The colour scale for the US map. Rebuilt 10 Nov 2026 around regions.
 *
 * Each state takes its REGION's hue, and within that hue it is stepped by
 * lightness for how many events it holds -- dim for one or two, bright for
 * eleven or more. So the map answers two questions at a glance: which part
 * of the country, and how busy.
 *
 * Regions are the Census Bureau's four (Tom, 10 Nov), with the West shown
 * as its two Census divisions, Pacific and Mountain, so the coast and the
 * desert read as different places. That gives five hues:
 *
 *   Northeast  teal    the site's indoor blue
 *   Midwest    orange  the site's beach orange
 *   South      purple  the site's turf purple
 *   Pacific    green   a new lime, kept clear of grass's mint
 *   Mountain   red     a new neon red
 *
 * THE MAP IS THE ONE PLACE surface hues mean something else. Everywhere
 * else orange is beach, teal is indoor and purple is turf; here they mean
 * a region. Tom's call, 10 Nov, made knowing that rule. It holds because
 * the map carries no surface chips, and its legend names the regions.
 *
 * Measured, not eyeballed (scripted WCAG luminance, 10 Nov):
 * - each step at least 1.6:1 from its neighbour, in every region
 * - the dimmest step at least 1.67:1 from "nothing listed" (a first draft
 *   of the old violet map failed this at 1.45)
 * - every count label at least 4.28:1 against the fill under it; the
 *   label colour is chosen per step rather than by a single cut-off
 *
 * Two states with nothing showing are *not* the same thing, so they do
 * not share a look. "Nothing has ever been listed here" is dark with a
 * faint edge. "There is a scene here, but nothing matches" is dark with
 * an edge in its region's hue. The dormant state used to be solid amber,
 * which would now read as a busy Midwest state.
 */

import { regionForMapState, type MapRegion } from './map-regions';

export interface ScaleStep {
  /** Inclusive lower bound of the bucket. */
  min: number;
  label: string;
  fill: string;
  stroke: string;
  /** Dormant states need a heavier outline to read at map scale. */
  strokeWidth: number;
  /** Colour for the count printed on the state. */
  text: string;
}

const DARK = '#0b0711';
const LIGHT = '#f7f2ea';

export const EMPTY_STEP: ScaleStep = {
  min: 0,
  label: 'No events listed',
  fill: '#171226',
  stroke: '#342b4d',
  strokeWidth: 0.75,
  text: LIGHT,
};

/** Bucket bounds and labels, highest first. Same buckets as before. */
export const BUCKETS = [
  { min: 11, label: '11 or more' },
  { min: 6, label: '6 – 10' },
  { min: 3, label: '3 – 5' },
  { min: 1, label: '1 – 2' },
] as const;

/** Index into a region's ramp (dimmest first) for an event count. */
function bucketIndex(upcoming: number): number {
  if (upcoming >= 11) return 3;
  if (upcoming >= 6) return 2;
  if (upcoming >= 3) return 1;
  return 0;
}

/**
 * One steady colour per region (Tom, 21 Nov). The four-step ramp made the
 * busiest states washed-out peach and the quietest muddy brown -- Missouri
 * and Kansas looked "ugly", Ohio (the vivid step) looked right. So every
 * state with events now takes its region's vivid step, whatever the count;
 * the count is printed on the state and in the hover card.
 *
 * Borders are drawn in the page background, not a lighter shade of the
 * fill. Two neighbours in the same region are now the same colour, and the
 * old "next step up" outline vanished at the top step -- which is why the
 * Missouri/Kansas line disappeared.
 */
export const ACTIVE_STEP = 2;

export function stepFor(upcoming: number, total: number, state: string): ScaleStep {
  const region = regionForMapState(state);
  if (upcoming > 0 && region) {
    return {
      min: 1,
      label: 'Events listed',
      fill: region.ramp[ACTIVE_STEP],
      stroke: DARK,
      strokeWidth: 1.25,
      text: region.text[ACTIVE_STEP] === 'dark' ? DARK : LIGHT,
    };
  }
  if (total > 0 && region) return dormantStep(region);
  return EMPTY_STEP;
}

export function dormantStep(region: MapRegion): ScaleStep {
  return {
    min: 0,
    label: 'Events here, none match',
    fill: EMPTY_STEP.fill,
    stroke: region.hue,
    strokeWidth: 1.25,
    text: LIGHT,
  };
}
