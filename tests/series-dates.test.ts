import { test } from 'node:test';
import assert from 'node:assert/strict';
import { generateLeagueDates, renewalStart } from '../src/lib/series-dates';

test('open play: Tue + Thu for 12 weeks is 24 sessions', () => {
  const dates = generateLeagueDates('2026-11-17', [2, 4], 12);
  assert.equal(dates.length, 24);
  assert.equal(dates[0].plays_on, '2026-11-17');
  assert.equal(dates[1].plays_on, '2026-11-19');
  assert.equal(dates[23].plays_on, '2027-02-04');
});

test('renewing carries on from the night after the last session, no gap or overlap', () => {
  assert.equal(renewalStart('2027-02-04', [2, 4]), '2027-02-09'); // Thu -> next Tue
  assert.equal(renewalStart('2027-02-02', [2, 4]), '2027-02-04'); // Tue -> Thu
  assert.equal(renewalStart('2026-12-28', [1]), '2027-01-04'); // across the new year
  assert.equal(renewalStart('2027-02-04', []), null);
});
