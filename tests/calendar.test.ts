import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildIcs, calendarLinks, type CalendarEvent } from '../src/lib/calendar';

const base: CalendarEvent = {
  id: 'abc',
  slug: 'tuesday-coed-sixes',
  name: 'Tuesday Coed Sixes',
  event_type: 'league',
  starts_on: '2026-11-03',
  ends_on: '2026-12-01',
  start_time: '19:00:00',
  entry_fee_cents: 40000,
  fee_basis: 'per_team',
  organizer_name: 'Example Sports',
  event_page_url: 'https://example.com/register',
  venue_name: 'Example Gym',
  address_line: '1 Main St',
  city: 'St. Louis',
  state: 'MO',
  postal_code: '63101',
  format_names: ['Coed Sixes'],
  division_names: [],
};

const schedule = [
  { plays_on: '2026-11-03', skipped: false, note: null },
  { plays_on: '2026-11-10', skipped: false, note: null },
  { plays_on: '2026-11-24', skipped: true, note: 'Thanksgiving' },
  { plays_on: '2026-12-01', skipped: false, note: null },
];
const site = 'https://joincompete.com';
const now = new Date('2026-11-10T12:00:00Z');

/** Unfold continuation lines so assertions see whole values. */
const unfold = (ics: string) => ics.replace(/\r\n /g, '');

test('a league puts its whole season in the file: one entry per night it plays', () => {
  const ics = unfold(buildIcs({ event: base, siteUrl: site, schedule, now }));
  assert.equal(ics.match(/BEGIN:VEVENT/g)?.length, 3, 'the skipped night gets no entry');
  assert.match(ics, /DTSTART:20261103T190000\r\n/);
  assert.match(ics, /DTSTART:20261201T190000\r\n/);
  assert.doesNotMatch(ics, /20261124T/);
  assert.match(ics, /SUMMARY:Tuesday Coed Sixes · Night 3 of 3/);
  assert.match(ics, /No play: Nov 24 \(Thanksgiving\)/);
  // Stable per-night ids, so a subscribed calendar updates instead of duplicating.
  assert.match(ics, /UID:abc-20261110@joincompete.com/);
  assert.match(ics, /X-WR-CALNAME:Tuesday Coed Sixes/);
});

test('no end time is invented for a league', () => {
  const ics = buildIcs({ event: base, siteUrl: site, schedule, now });
  assert.doesNotMatch(ics, /DTEND/);
  const withEnd = buildIcs({ event: base, siteUrl: site, schedule, now, endTime: '21:00:00' });
  assert.match(withEnd, /DTEND:20261103T210000/);
});

test('a league with no stated time is all-day on each night', () => {
  const ics = buildIcs({ event: { ...base, start_time: null }, siteUrl: site, schedule, now });
  assert.match(ics, /DTSTART;VALUE=DATE:20261110\r\nDTEND;VALUE=DATE:20261111/);
});

test('a tournament is still one all-day entry', () => {
  const t = { ...base, event_type: 'tournament', starts_on: '2026-12-05', ends_on: '2026-12-06' };
  const ics = buildIcs({ event: t, siteUrl: site, now });
  assert.equal(ics.match(/BEGIN:VEVENT/g)?.length, 1);
  assert.match(ics, /DTSTART;VALUE=DATE:20261205\r\nDTEND;VALUE=DATE:20261207/);
  assert.doesNotMatch(ics, /X-WR-CALNAME/);
});

test('league links subscribe to the season feed in every app', () => {
  const links = calendarLinks(base, site);
  assert.deepEqual(
    links.map((l) => l.key),
    ['google', 'apple', 'outlook', 'download'],
  );
  const feed = 'webcal://joincompete.com/events/tuesday-coed-sixes/calendar.ics';
  assert.equal(links[1].href, feed);
  assert.ok(links[0].href.includes(encodeURIComponent(feed)));
  assert.ok(links[2].href.includes(encodeURIComponent(feed)));
  assert.ok(links[3].href.endsWith('calendar.ics?download=1'));
});

test('tournament links open a pre-filled entry', () => {
  const t = { ...base, event_type: 'tournament', starts_on: '2026-12-05', ends_on: null };
  const google = calendarLinks(t, site)[0].href;
  assert.ok(google.startsWith('https://calendar.google.com/calendar/render?action=TEMPLATE'));
  assert.ok(google.includes('dates=20261205%2F20261206'));
});
