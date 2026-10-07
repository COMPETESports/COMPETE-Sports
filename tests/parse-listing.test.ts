import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseListing } from '../src/lib/parse-listing';

/**
 * The posts below are written the way organizers actually write them —
 * emoji, inconsistent punctuation, shorthand, missing years. "NOW" fixes
 * the clock so year inference is testable.
 */
const NOW = new Date(Date.UTC(2026, 8, 22)); // 22 September 2026

test('reads a typical Facebook tournament post', () => {
  const post = `
🏐 SAND SLAM SUMMER SERIES #4 🏐

Saturday, June 14th
Check-in 8:00am | First serve 9:00am

📍 North Avenue Beach, Chicago, IL 60611

Divisions: AA / A / BB
Men's Doubles, Women's Doubles & Coed Quads

Entry: $45 per player
Payout: cash for AA, prizes for A and BB

Register: https://example.com/sandslam4
Questions? hit up director@sandslamvb.com
`;
  const { fields, missing } = parseListing(post, NOW);

  assert.equal(fields.starts_on, '2027-06-14', 'June is past, so it means next June');
  assert.equal(fields.entry_fee, '45');
  assert.equal(fields.fee_basis, 'per_player');
  assert.deepEqual(fields.surfaces, ['beach']);
  assert.deepEqual(fields.divisions.sort(), ['a', 'aa', 'bb']);
  assert.deepEqual(
    fields.formats.sort(),
    ['coed-quads', 'mens-doubles', 'womens-doubles'],
  );
  assert.equal(fields.city, 'Chicago');
  assert.equal(fields.state, 'IL');
  assert.equal(fields.postal_code, '60611');
  assert.equal(fields.event_page_url, 'https://example.com/sandslam4');
  assert.equal(fields.organizer_email, 'director@sandslamvb.com');
  assert.match(fields.name ?? '', /SAND SLAM SUMMER SERIES/);
  assert.match(fields.notes ?? '', /Check-in/);
  assert.equal(missing.length, 0, `nothing should be missing, got ${missing.join(', ')}`);
});

test('keeps the payout out of the entry fee', () => {
  const post = `
Fall Grass Classic
October 11, 2026
Grass · Kansas City, MO
$500 payout to the winning team
Entry fee $75/player
`;
  const { fields } = parseListing(post, NOW);
  assert.equal(fields.entry_fee, '75', 'should not pick up the $500 payout');
  assert.equal(fields.fee_basis, 'per_player');
  assert.match(fields.payout_text ?? '', /500/);
});

test('handles per-team pricing and a date range', () => {
  const post = `
Mother Lode Weekender
September 5-6, 2026
Beach and grass, Aspen, CO
Men's Trips / Women's Trips
$150 per team
Divisions: Open, A
`;
  const { fields } = parseListing(post, NOW);
  assert.equal(fields.starts_on, '2026-09-05');
  assert.equal(fields.ends_on, '2026-09-06');
  assert.equal(fields.entry_fee, '150');
  assert.equal(fields.fee_basis, 'per_team');
  assert.deepEqual(fields.surfaces.sort(), ['beach', 'grass']);
  assert.deepEqual(fields.formats.sort(), ['mens-triples', 'womens-triples']);
  assert.deepEqual(fields.divisions.sort(), ['a', 'open']);
});

test('reads numeric shorthand for team size', () => {
  const post = `
Turf Wars 6s
11/7/26
Turf — Milwaukee, WI
Coed 6s and Men's 4s
Rec and BB divisions
$30pp
`;
  const { fields } = parseListing(post, NOW);
  assert.equal(fields.starts_on, '2026-11-07');
  assert.deepEqual(fields.surfaces, ['turf']);
  assert.deepEqual(fields.formats.sort(), ['coed-sixes', 'mens-quads']);
  assert.deepEqual(fields.divisions.sort(), ['bb', 'recreational']);
  assert.equal(fields.entry_fee, '30');
});

test('separates a registration deadline from the event date', () => {
  const post = `
Beach Bash
Date: August 8, 2026
Register by August 1, 2026
Sand, Tampa, FL
Coed Doubles
$60 per person
Divisions: BB, B
`;
  const { fields } = parseListing(post, NOW);
  assert.equal(fields.starts_on, '2026-08-08');
  assert.equal(fields.registration_deadline, '2026-08-01');
});

test('does not mistake ordinary letters for divisions', () => {
  const post = `
A Great Day For Volleyball
July 4, 2026
Grass in Springfield, IL
This is a fun event and a good time for everyone.
Coed Quads
$25 per player
`;
  const { fields } = parseListing(post, NOW);
  assert.deepEqual(
    fields.divisions,
    [],
    `"a" and "A Great Day" must not become divisions, got ${fields.divisions.join(',')}`,
  );
});

test('picks up reverse coed without also claiming plain coed', () => {
  const post = `
Reverse Coed Madness
May 16, 2026
Reverse Coed Quads only
Beach, Charleston, SC
Divisions: AA, BB
$50 per player
`;
  const { fields } = parseListing(post, NOW);
  assert.deepEqual(fields.formats, ['reverse-coed-quads']);
});

test('reports what it could not find instead of inventing it', () => {
  const post = `Hey everyone, we are running something fun soon. Details to follow!`;
  const { fields, missing } = parseListing(post, NOW);

  assert.equal(fields.starts_on, undefined);
  assert.equal(fields.entry_fee, undefined);
  assert.equal(fields.city, undefined);
  assert.deepEqual(fields.divisions, []);
  assert.ok(missing.includes('Start date'));
  assert.ok(missing.includes('Entry fee'));
  assert.ok(missing.includes('City and state'));
});

test('finds a street address and venue name', () => {
  const post = `
Gateway Grass Open
June 20, 2026
Location: Forest Park Sand Courts
5595 Grand Dr, St. Louis, MO 63112
Grass
Coed Quads
Divisions: A, BB
$40 per player
`;
  const { fields } = parseListing(post, NOW);
  assert.equal(fields.venue_name, 'Forest Park Sand Courts');
  assert.match(fields.address_line ?? '', /5595 Grand Dr/);
  assert.equal(fields.city, 'St. Louis');
  assert.equal(fields.state, 'MO');
  assert.equal(fields.postal_code, '63112');
});

test('does not read a weekday as a city', () => {
  const post = `
Sunday Funday Doubles
Sunday, October 4, 2026
Beach, Destin, FL
Coed Doubles
$35 per player
Divisions: BB
`;
  const { fields } = parseListing(post, NOW);
  assert.equal(fields.city, 'Destin');
  assert.equal(fields.state, 'FL');
});

test('reads a terse flyer with slash pricing and a shared size word', () => {
  const post = `901 VOLLEYBALL GRASS SERIES #7
Sat 10/17
Tobey Park - Memphis, TN
Mens & Womens Doubles
Open / A / BB
$40/player
Check-in 8:15 AM, players meeting 8:50 AM`;
  const { fields, missing } = parseListing(post, NOW);

  assert.equal(fields.name, '901 VOLLEYBALL GRASS SERIES #7', '# is part of the name');
  assert.equal(fields.entry_fee, '40', '"$40/player" must register as a fee');
  assert.equal(fields.fee_basis, 'per_player');
  assert.equal(fields.venue_name, 'Tobey Park', 'no dangling separator');
  assert.deepEqual(
    fields.formats.sort(),
    ['mens-doubles', 'womens-doubles'],
    '"Mens & Womens Doubles" is two formats sharing one size word',
  );
  assert.deepEqual(fields.divisions.sort(), ['a', 'bb', 'open']);
  assert.deepEqual(missing, []);
});

test('refuses to name an event from a chatty paragraph', () => {
  const post = `Hey volleyball fam!! We are BACK for our annual Blocktoberfest on Saturday October 24th at Creve Coeur Park in St. Louis, Missouri. Grass courts, beer garden, the whole thing.

Coed 4s only this year. We'll run BB and Rec brackets.
$120 a team, includes a shirt.
Sign up by October 20 - spots go fast!`;
  const { fields, missing } = parseListing(post, NOW);

  assert.equal(fields.name, undefined, 'a sentence must not become the name');
  assert.ok(missing.includes('Tournament name'));

  // The rest of the post is still read correctly.
  assert.equal(fields.starts_on, '2026-10-24');
  assert.equal(fields.registration_deadline, '2026-10-20');
  assert.equal(fields.entry_fee, '120');
  assert.equal(fields.fee_basis, 'per_team');
  assert.equal(fields.city, 'St. Louis');
  assert.equal(fields.state, 'MO');
  assert.deepEqual(fields.formats, ['coed-quads']);
  assert.deepEqual(fields.divisions.sort(), ['bb', 'recreational']);
});

test('the same text always parses the same way', () => {
  const post = `Spring Opener\nApril 4, 2026\nGrass, Memphis, TN\nMen's Doubles\n$40 per player\nDivisions: Open, A`;
  const a = parseListing(post, NOW);
  const b = parseListing(post, NOW);
  assert.deepEqual(a, b);
});
