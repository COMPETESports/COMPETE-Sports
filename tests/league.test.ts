import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  formatClock,
  leagueStatus,
  nightsLabel,
  nightsShort,
  seasonLine,
  underwayLabel,
} from '../src/lib/league';

test('the night reads the way a flyer says it', () => {
  assert.equal(nightsLabel([2]), 'Tuesdays');
  assert.equal(nightsLabel([4, 2]), 'Tuesdays & Thursdays');
  assert.equal(nightsLabel([1, 3, 5]), 'Mondays, Wednesdays & Fridays');
  assert.equal(nightsShort([4, 2]), 'Tue · Thu');
  // The source not saying is an empty answer, never a guess.
  assert.equal(nightsLabel(null), '');
  assert.equal(nightsLabel([9]), '');
});

const season = ['2026-11-03', '2026-11-10', '2026-11-17', '2026-12-01'];

test('before the first night it is upcoming', () => {
  const s = leagueStatus(season, '2026-10-20');
  assert.equal(s.phase, 'upcoming');
  assert.equal(s.nextNight, '2026-11-03');
  assert.equal(underwayLabel(s), '');
});

test('mid-season it is underway, and tonight still counts as to come', () => {
  const tonight = leagueStatus(season, '2026-11-10');
  assert.equal(tonight.phase, 'underway');
  assert.equal(tonight.nextNight, '2026-11-10');
  assert.equal(underwayLabel(tonight), 'Night 2 of 4');

  // The skipped Thanksgiving week is not in the list, so the next night
  // after the 17th is 1 Dec -- and the count says 4 nights, not 5 weeks.
  const gap = leagueStatus(season, '2026-11-24');
  assert.equal(gap.nextNight, '2026-12-01');
  assert.equal(underwayLabel(gap), 'Night 4 of 4');
});

test('after the last night it is finished', () => {
  const s = leagueStatus(season, '2026-12-02');
  assert.equal(s.phase, 'finished');
  assert.equal(s.nextNight, null);
});

test('no stored nights is unknown, not upcoming', () => {
  assert.equal(leagueStatus([], '2026-11-10').phase, 'unknown');
});

test('the season line holds only what the organizer stated', () => {
  assert.equal(formatClock('19:00:00'), '7:00 PM');
  assert.equal(formatClock('00:30:00'), '12:30 AM');
  assert.equal(formatClock(null), '');
  assert.equal(
    seasonLine({ league_weeks: 8, start_time: '18:30:00', playoffs: true }),
    '8 weeks · 6:30 PM · Playoffs',
  );
  assert.equal(seasonLine({ league_weeks: null, start_time: null, playoffs: false }), '');
});
