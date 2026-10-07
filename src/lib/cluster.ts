import type { VenueCluster } from './queries';
import { projectToMap } from './project';

export interface ClusterVenue {
  id: string;
  name: string;
  city: string;
  approximate: boolean;
  event_count: number;
  events: Array<{ slug: string; name: string; starts_on: string }>;
}

export interface MapCluster {
  id: string;
  x: number;
  y: number;
  /** City when every venue shares one, otherwise a count. */
  label: string;
  event_count: number;
  next_on: string;
  approximate: boolean;
  venues: ClusterVenue[];
}

/**
 * Groups venues that would land on top of each other at the current zoom.
 *
 * Chicago's lakefront venues sit within a mile of one another; drawn as
 * separate pins they overlap, and whichever is underneath cannot be
 * hovered or clicked at all. Grouping them is both more usable and more
 * truthful about what the map can resolve — "three venues in Chicago" is
 * what the reader can actually distinguish at this scale.
 *
 * `threshold` is in viewBox units, derived from the size of the frame, so
 * a big state and a small one both cluster at the same apparent distance.
 */
export function clusterVenues(
  venues: VenueCluster[],
  threshold: number,
): MapCluster[] {
  interface Placed extends ClusterVenue {
    x: number;
    y: number;
    next_on: string;
  }

  const placed: Placed[] = [];
  for (const v of venues) {
    const point = projectToMap(v.latitude, v.longitude);
    if (!point) continue;
    placed.push({
      id: v.id,
      name: v.name,
      city: v.city,
      approximate: v.geo_precision !== 'exact',
      event_count: v.event_count,
      events: v.events,
      next_on: v.next_on,
      x: point.x,
      y: point.y,
    });
  }

  // Busiest first, so a cluster forms around the most significant venue
  // rather than around whichever happened to be read first.
  placed.sort((a, b) => b.event_count - a.event_count);

  const groups: Placed[][] = [];
  for (const venue of placed) {
    const home = groups.find((g) => distance(g[0], venue) <= threshold);
    if (home) home.push(venue);
    else groups.push([venue]);
  }

  return groups.map((members) => {
    const cities = new Set(members.map((m) => m.city));
    const eventCount = members.reduce((sum, m) => sum + m.event_count, 0);

    return {
      id: members.map((m) => m.id).join('-'),
      // The anchor is the busiest venue's own position, not the average of
      // the group, so a single-venue cluster is exactly where it should be.
      x: members[0].x,
      y: members[0].y,
      label:
        cities.size === 1
          ? members[0].city
          : `${members.length} venues`,
      event_count: eventCount,
      next_on: members.map((m) => m.next_on).sort()[0],
      approximate: members.some((m) => m.approximate),
      venues: members.map(({ x: _x, y: _y, next_on: _n, ...rest }) => rest),
    };
  });
}

function distance(a: { x: number; y: number }, b: { x: number; y: number }): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}
