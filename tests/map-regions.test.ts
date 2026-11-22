import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MAP_REGIONS, regionForMapState } from '../src/lib/map-regions';
import { stepFor } from '../src/lib/map-scale';
import { US_STATES } from '../src/lib/us-states';

test('every state on the map has exactly one colour region', () => {
  const assigned = MAP_REGIONS.flatMap((r) => r.states);
  const dupes = assigned.filter((c, i) => assigned.indexOf(c) !== i);
  assert.deepEqual(dupes, [], 'a state is in two regions');
  const missing = US_STATES.map((s) => s.code).filter((c) => !regionForMapState(c));
  assert.deepEqual(missing, [], 'a state on the map has no region');
});

test('Census regions: Missouri is Midwest, Texas is South, Pennsylvania is Northeast', () => {
  assert.equal(regionForMapState('MO')?.slug, 'midwest');
  assert.equal(regionForMapState('TX')?.slug, 'south');
  assert.equal(regionForMapState('PA')?.slug, 'northeast');
  assert.equal(regionForMapState('CA')?.slug, 'pacific');
  assert.equal(regionForMapState('AZ')?.slug, 'mountain');
});

test('a state brightens with its count, in its own region colour', () => {
  const mo = MAP_REGIONS.find((r) => r.slug === 'midwest')!;
  assert.equal(stepFor(1, 1, 'MO').fill, mo.ramp[0]);
  assert.equal(stepFor(4, 4, 'MO').fill, mo.ramp[1]);
  assert.equal(stepFor(8, 8, 'MO').fill, mo.ramp[2]);
  assert.equal(stepFor(40, 40, 'MO').fill, mo.ramp[3]);
});

test('nothing matching is not the same as nothing ever listed', () => {
  const dormant = stepFor(0, 12, 'MO');
  const empty = stepFor(0, 0, 'MO');
  assert.notEqual(dormant.stroke, empty.stroke);
  assert.equal(dormant.fill, empty.fill);
});
