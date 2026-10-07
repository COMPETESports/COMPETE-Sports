import { geoAlbersUsa } from 'd3-geo';
import { ALBERS } from './us-states';

/**
 * Projects a venue's latitude and longitude into the same coordinate space
 * the state outlines were generated in, so a pin lands where the venue
 * actually is rather than somewhere approximately right.
 *
 * This runs on the server only. `d3-geo` never reaches the browser — the
 * page ships plain numbers.
 *
 * Albers USA is defined only over the United States and its insets, so a
 * point outside it (a destination event abroad, a bad coordinate) returns
 * null rather than a nonsense position off the edge of the map.
 */
const projection = geoAlbersUsa().scale(ALBERS.scale).translate(ALBERS.translate);

export interface MapPoint {
  x: number;
  y: number;
}

export function projectToMap(latitude: number, longitude: number): MapPoint | null {
  const result = projection([longitude, latitude]);
  if (!result) return null;
  const [x, y] = result;
  if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
  return { x: Math.round(x * 10) / 10, y: Math.round(y * 10) / 10 };
}
