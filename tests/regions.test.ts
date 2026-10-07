import { test } from 'node:test';
import assert from 'node:assert/strict';
import { REGIONS, regionForState, regionBySlug } from '../src/lib/regions';
import { US_STATES } from '../src/lib/us-states';

test('every state on the map belongs to exactly one region', () => {
  const assigned = REGIONS.flatMap((r) => r.states);
  const duplicates = assigned.filter((c, i) => assigned.indexOf(c) !== i);
  assert.deepEqual(duplicates, [], 'a state is listed in two regions');

  // The map is the source of truth for which states exist, so a state that
  // can be clicked but has no region would render a rail with no heading.
  const missing = US_STATES.map((s) => s.code).filter((code) => !regionForState(code));
  assert.deepEqual(missing, [], 'a state on the map has no region');
});

test('lookup is case and whitespace tolerant, and honest about misses', () => {
  assert.equal(regionForState('MO')?.slug, 'midwest');
  assert.equal(regionForState(' mo ')?.slug, 'midwest');
  assert.equal(regionForState('mO')?.name, 'Midwest');

  // Null means "no regional rail", never a default region — a visitor with
  // no known location must not be told they are in the Midwest.
  assert.equal(regionForState(null), null);
  assert.equal(regionForState(undefined), null);
  assert.equal(regionForState(''), null);
  assert.equal(regionForState('PR'), null);
  assert.equal(regionForState('ZZ'), null);
});

test('slugs are unique and resolvable', () => {
  const slugs = REGIONS.map((r) => r.slug);
  assert.equal(new Set(slugs).size, slugs.length);
  for (const slug of slugs) assert.equal(regionBySlug(slug)?.slug, slug);
  assert.equal(regionBySlug('atlantis'), null);
});

test("the states COMPETE currently has events in resolve as expected", () => {
  assert.equal(regionForState('OH')?.name, 'Midwest');
  assert.equal(regionForState('IL')?.name, 'Midwest');
  assert.equal(regionForState('SC')?.name, 'Southeast');
  assert.equal(regionForState('TN')?.name, 'Southeast');
});
