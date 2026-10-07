/**
 * Turns the normalized historical CSVs from merge-history.py into a seed
 * file in the same shape scripts/seed.ts already reads, so the history
 * loads through the existing idempotent upsert path:
 *
 *   python3 scripts/merge-history.py
 *   npm run data:history
 *   npx tsx scripts/seed.ts data/history.seed.json
 *
 * Every event here is written with status 'archived'. Search, event
 * detail, the communities pages and the homepage rails all filter on
 * status = 'approved', so nothing in this file can reach a visitor. The
 * point of importing it is the organizer record underneath: three seasons
 * of events is the evidence that an outfit is real and recurring, which
 * is what matters on a sales call and on an organization page.
 *
 * Coordinates come from the bundled `zipcodes` table, the same source
 * prepare-seed.ts uses — no network, no API key, no rate limit.
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import zipcodes from 'zipcodes';

const IN = resolve('data/import');
const OUT = resolve('data/history.seed.json');

// --------------------------------------------------------------- csv read

/** Minimal RFC4180 reader — the source has quoted commas and newlines. */
function parseCsv(text: string): Array<Record<string, string>> {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; } else quoted = false;
      } else field += ch;
      continue;
    }
    if (ch === '"') { quoted = true; continue; }
    if (ch === ',') { row.push(field); field = ''; continue; }
    if (ch === '\r') continue;
    if (ch === '\n') { row.push(field); rows.push(row); row = []; field = ''; continue; }
    field += ch;
  }
  if (field.length || row.length) { row.push(field); rows.push(row); }

  const [header, ...body] = rows.filter((r) => r.some((c) => c !== ''));
  return body.map((r) => Object.fromEntries(header.map((h, i) => [h, r[i] ?? ''])));
}

const read = (name: string) =>
  parseCsv(readFileSync(resolve(IN, name), 'utf8').replace(/^﻿/, ''));

const pipe = (s: string) => (s ? s.split('|').filter(Boolean) : []);
const nullable = (s: string) => (s && s.trim() ? s.trim() : null);

// ------------------------------------------------------- format slugging

const SIZE_WORD: Record<string, string> = { '2': 'doubles', '3': 'triples', '4': 'quads', '6': 'sixes' };
const GENDER_PREFIX: Record<string, string> = {
  mens: 'mens', womens: 'womens', coed: 'coed', reverse_coed: 'reverse-coed',
};
/** Slugs that exist in seed.ts FORMATS. Anything outside this is reported. */
const KNOWN_FORMATS = new Set([
  'mens-doubles', 'womens-doubles', 'coed-doubles', 'reverse-coed-doubles',
  'mens-triples', 'womens-triples', 'coed-triples', 'reverse-coed-triples',
  'mens-quads', 'womens-quads', 'coed-quads', 'reverse-coed-quads',
  'mens-sixes', 'womens-sixes', 'coed-sixes',
  'king-queen-of-the-beach', 'mixer',
]);

const unmapped = new Map<string, number>();
const note = (what: string) => unmapped.set(what, (unmapped.get(what) ?? 0) + 1);

/**
 * A gender bracket and a team size together name a format. The sheets
 * record them in separate columns, so the cross product is taken here —
 * "M/W Trips" is a men's triples bracket AND a women's triples bracket.
 */
function formatSlugs(genders: string[], sizes: string[]): string[] {
  if (!genders.length || !sizes.length) {
    if (genders.length !== sizes.length) note('format: only one of gender/size given');
    return [];
  }
  const out: string[] = [];
  for (const g of genders) {
    for (const s of sizes) {
      const prefix = GENDER_PREFIX[g];
      const word = SIZE_WORD[s];
      if (!prefix || !word) { note(`format: no slug for ${g} ${s}s`); continue; }
      const slug = `${prefix}-${word}`;
      if (!KNOWN_FORMATS.has(slug)) { note(`format: ${slug} not in reference data`); continue; }
      out.push(slug);
    }
  }
  return [...new Set(out)];
}

// ------------------------------------------------------------- geocoding

type Geo = { latitude: number | null; longitude: number | null; geo_precision: string };

/**
 * Spellings to try for one city, in order. The postal table writes
 * "Saint Petersburg" and "Mount Pleasant" in full, while the sheets use
 * "St." and "Mt.", so each abbreviation gets a spelled-out attempt.
 */
function cityVariants(city: string): string[] {
  const out = [city];
  const expanded = city
    .replace(/\bSt\.?\s+/gi, 'Saint ')
    .replace(/\bMt\.?\s+/gi, 'Mount ')
    .replace(/\bFt\.?\s+/gi, 'Fort ');
  if (expanded !== city) out.push(expanded);
  const bare = city.replace(/\./g, '');
  if (bare !== city) out.push(bare);
  return [...new Set(out)];
}

function geocode(postal: string, city: string, state: string): Geo {
  if (/^\d{5}$/.test(postal)) {
    const hit = zipcodes.lookup(postal) as { latitude: number; longitude: number } | undefined;
    if (hit) return { latitude: hit.latitude, longitude: hit.longitude, geo_precision: 'postal' };
  }
  if (city && state) {
    for (const variant of cityVariants(city)) {
      const hits = zipcodes.lookupByName(variant, state) as
        | Array<{ latitude: number; longitude: number }> | undefined;
      if (hits?.length) {
        // Centroid of the city's ZIPs. Good enough to place a pin on the
        // CRM map; deliberately labelled 'city' so nothing over-trusts it.
        return {
          latitude: hits.reduce((s, h) => s + h.latitude, 0) / hits.length,
          longitude: hits.reduce((s, h) => s + h.longitude, 0) / hits.length,
          geo_precision: 'city',
        };
      }
    }
  }
  return { latitude: null, longitude: null, geo_precision: 'unknown' };
}

// ------------------------------------------------------------------ main

const orgRows = read('organizers.csv');
const venueRows = read('venues.csv');
const eventRows = read('events_history.csv');

const organizers = orgRows.map((o) => ({
  slug: o.slug,
  name: o.name,
  contact_email: nullable(o.contact_email),
  website_url: nullable(o.website_url),
}));
const orgSlugByKey = new Map(orgRows.map((o) => [o.key, o.slug]));

let geoPostal = 0, geoCity = 0, geoNone = 0;
const venues = venueRows.map((v) => {
  const geo = geocode(v.postal_code, v.city, v.state);
  if (geo.geo_precision === 'postal') geoPostal++;
  else if (geo.geo_precision === 'city') geoCity++;
  else geoNone++;
  return {
    key: v.key,
    name: v.name,
    address_line: nullable(v.address_line),
    city: v.city,
    state: v.state,
    postal_code: nullable(v.postal_code),
    ...geo,
  };
});
const venueKeys = new Set(venueRows.map((v) => v.key));

const SEASON: Record<string, string> = {
  '2022': 'the 2022 season sheet',
  '2023': 'the 2023 season sheet',
  '2024': 'the 2024 season sheet',
};

const events = eventRows.map((e) => {
  // Provenance plus the fields the events table has nowhere to put yet,
  // so the import is lossless even where the schema is not ready.
  const extras: string[] = [`Imported from ${SEASON[e.source_year] ?? e.source_year}.`];
  if (e.raw_format) extras.push(`Source format: "${e.raw_format}".`);
  if (e.check_in_time) extras.push(`Check-in: ${e.check_in_time}.`);
  if (e.start_time) extras.push(`First serve: ${e.start_time}.`);

  return {
    slug: e.slug,
    name: e.name,
    sport: 'volleyball',
    surfaces: e.surface ? [e.surface] : [],
    venue_key: e.venue_key && venueKeys.has(e.venue_key) ? e.venue_key : null,
    organizer_slug: orgSlugByKey.get(e.organizer_key) ?? null,
    starts_on: e.starts_on,
    registration_deadline: nullable(e.registration_deadline),
    entry_fee_cents: e.entry_fee_cents ? Number(e.entry_fee_cents) : null,
    payout_text: nullable(e.payout_text),
    event_page_url: nullable(e.event_page_url),
    flyer_url: null,
    notes: extras.join(' '),
    formats: formatSlugs(pipe(e.genders), pipe(e.team_sizes)),
    divisions: pipe(e.divisions),
    // Never discoverable. Every read path in src/lib/queries.ts filters
    // on status = 'approved'.
    status: 'archived',
    created_by: 'historical import',
  };
});

writeFileSync(
  OUT,
  JSON.stringify(
    {
      generated_at: new Date().toISOString(),
      source_file: 'data/import/events_history.csv (2022, 2023, 2024 season sheets)',
      venues,
      organizers,
      events,
    },
    null,
    2,
  ),
);

// ---------------------------------------------------------------- report

const withFormats = events.filter((e) => e.formats.length).length;
const withVenue = events.filter((e) => e.venue_key).length;
const withOrg = events.filter((e) => e.organizer_slug).length;

console.log(`\nWrote ${OUT}`);
console.log(`  organizers  ${organizers.length}`);
console.log(`  venues      ${venues.length}   (${geoPostal} by ZIP, ${geoCity} by city centroid, ${geoNone} unplaced)`);
console.log(`  events      ${events.length}   all status='archived'`);
console.log(`    with a format      ${withFormats}`);
console.log(`    with a venue       ${withVenue}`);
console.log(`    with an organizer  ${withOrg}`);
if (unmapped.size) {
  console.log('\n  not mapped:');
  for (const [what, n] of [...unmapped].sort((a, b) => b[1] - a[1])) {
    console.log(`    ${String(n).padStart(4)}  ${what}`);
  }
}
console.log();
