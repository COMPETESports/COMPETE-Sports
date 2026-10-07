/**
 * The colour scale for the Communities map.
 *
 * Event count is a magnitude, so this is a sequential encoding: one hue,
 * stepped by lightness. The page is dark, so the ramp runs the opposite
 * way from a light-mode one — the dimmest violet is the lowest value and
 * it brightens toward white as events pile up. On black, "more" reading
 * as "brighter" is the intuition people already have.
 *
 * VIOLET, not one of the surface hues. Beach orange, grass green and
 * indoor blue each carry a fixed meaning everywhere else on the site, and
 * borrowing one here would say "these states are indoor events". Violet
 * is the accent, and it is the only hue free to mean magnitude.
 *
 * Checked: monotone lightness, adjacent gaps of at least 0.06 (actual
 * 0.075 / 0.132 / 0.236), 9.7:1 at the bright end against the panel, and
 * — the one that failed a first draft at 1.45:1 — the dimmest bucket is
 * separable from "nothing listed" at 1.79:1.
 *
 * Two states with no upcoming events are *not* the same thing, so they do
 * not share a colour. "Nothing has ever been listed here" and "there is a
 * scene here, but nothing is on the calendar" are different answers to the
 * question a player is actually asking.
 */

export interface ScaleStep {
  /** Inclusive lower bound of the bucket. */
  min: number;
  label: string;
  fill: string;
  stroke: string;
  /** Dormant states need a heavier outline to read at map scale. */
  strokeWidth: number;
}

export const EMPTY_STEP: ScaleStep = {
  min: 0,
  label: 'No events listed',
  fill: '#171226',
  stroke: '#342b4d',
  strokeWidth: 0.75,
};

/**
 * Deliberately amber rather than a pale teal. Sitting it at the bottom of
 * the violet ramp would read as "almost no events", which is the wrong
 * meaning — a different hue says "different kind of thing" at a glance.
 * Separable from both neighbours on the dark ground: 2.7:1 against the
 * dimmest ramp step and 4.9:1 against "nothing listed".
 */
export const DORMANT_STEP: ScaleStep = {
  min: 0,
  label: 'Community here, nothing scheduled',
  fill: '#c0702a',
  stroke: '#ff7a1a',
  strokeWidth: 1.25,
};

/** Highest bucket first, so a lookup can return on the first match. */
export const SCALE: ScaleStep[] = [
  { min: 11, label: '11 or more', fill: '#d7a8ff', stroke: '#f0d6ff', strokeWidth: 0.75 },
  { min: 6, label: '6 – 10', fill: '#a86bff', stroke: '#d7a8ff', strokeWidth: 0.75 },
  { min: 3, label: '3 – 5', fill: '#7b48c4', stroke: '#a86bff', strokeWidth: 0.75 },
  { min: 1, label: '1 – 2', fill: '#4a3575', stroke: '#7b48c4', strokeWidth: 0.75 },
];

export function stepFor(upcoming: number, total: number): ScaleStep {
  if (upcoming > 0) {
    return SCALE.find((s) => upcoming >= s.min) ?? SCALE[SCALE.length - 1];
  }
  return total > 0 ? DORMANT_STEP : EMPTY_STEP;
}

/** Legend entries, quietest first, as they read left to right. */
export const LEGEND: ScaleStep[] = [EMPTY_STEP, DORMANT_STEP, ...[...SCALE].reverse()];
