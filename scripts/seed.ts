/**
 * seed.ts
 * ---------------------------------------------------------------------
 * Loads reference data (sports, surfaces, formats, divisions) and the
 * prepared event export into Postgres.
 *
 * Run:  npm run db:seed
 *
 * Safe to run repeatedly. Everything upserts on a natural key, so a
 * re-run updates existing rows rather than creating duplicates.
 */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import postgres from 'postgres';

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error('\n  DATABASE_URL is not set. Copy .env.example to .env and fill it in.\n');
  process.exit(1);
}

const sql = postgres(DATABASE_URL, { prepare: false, max: 4 });

// ------------------------------------------------------- reference tables

const SPORTS = [
  { slug: 'volleyball', name: 'Volleyball', display_order: 1, is_active: true },
  // Seeded but inactive: proves the model carries a second sport with no
  // schema change, and lets pickleball be switched on when listings exist.
  { slug: 'pickleball', name: 'Pickleball', display_order: 2, is_active: false },
];

const SURFACES: Record<string, Array<[string, string]>> = {
  volleyball: [['beach', 'Beach'], ['grass', 'Grass'], ['turf', 'Turf'], ['indoor', 'Indoor']],
  pickleball: [['indoor', 'Indoor'], ['outdoor', 'Outdoor']],
};

const FORMATS: Record<string, Array<[string, string, string, number | null]>> = {
  volleyball: [
    ['mens-doubles', "Men's Doubles", 'mens', 2],
    ['womens-doubles', "Women's Doubles", 'womens', 2],
    ['coed-doubles', 'Coed Doubles', 'coed', 2],
    // Reverse co-ed is its own gender value, not a flavour of coed: the
    // format inverts which positions each gender may play, so showing a
    // reverse co-ed bracket to someone who filtered for Co-ed is a wrong
    // answer rather than a near-enough one. 32 imported events run it.
    ['reverse-coed-doubles', 'Reverse Coed Doubles', 'reverse_coed', 2],
    ['mens-triples', "Men's Triples", 'mens', 3],
    ['womens-triples', "Women's Triples", 'womens', 3],
    ['coed-triples', 'Coed Triples', 'coed', 3],
    ['reverse-coed-triples', 'Reverse Coed Triples', 'reverse_coed', 3],
    ['mens-quads', "Men's Quads", 'mens', 4],
    ['womens-quads', "Women's Quads", 'womens', 4],
    ['coed-quads', 'Coed Quads', 'coed', 4],
    ['reverse-coed-quads', 'Reverse Coed Quads', 'reverse_coed', 4],
    ['mens-sixes', "Men's Sixes", 'mens', 6],
    ['womens-sixes', "Women's Sixes", 'womens', 6],
    ['coed-sixes', 'Coed Sixes', 'coed', 6],
    ['reverse-coed-sixes', 'Reverse Coed Sixes', 'reverse_coed', 6],
    ['king-queen-of-the-beach', 'King & Queen of the Beach', 'coed', 1],
    ['mixer', 'Mixer / Social', 'open', null],
    // Blind draw is a registration style — you enter alone and are
    // assigned a partner — and Tom's call is to surface it under Format.
    // A null team_size keeps its own name through the facet's
    // size-collapsing logic, so it reads "Blind Draw" rather than a
    // meaningless number. Probably the strongest single filter on the
    // site: not having a partner is the most common reason a player
    // doesn't enter.
    ['blind-draw', 'Blind Draw', 'open', null],
  ],
  pickleball: [
    ['mens-doubles', "Men's Doubles", 'mens', 2],
    ['womens-doubles', "Women's Doubles", 'womens', 2],
    ['mixed-doubles', 'Mixed Doubles', 'coed', 2],
    ['singles', 'Singles', 'open', 1],
    // Shuffle / blind-draw play is common in pickleball too, so the
    // format exists for both sports rather than volleyball alone.
    ['blind-draw', 'Blind Draw', 'open', null],
  ],
};

// A "division" is the competitive skill tier. That is Tom's vocabulary,
// stated 2 Oct 2026, and it is what organizers print on a flyer:
//
//   Division — Open (Semi Pro), AAA (High Competitive), AA, A (Low
//              Competitive), BBB (Advanced Recreational), BB, B (Low
//              Recreational)
//
// Gender is a separate axis, carried on `formats`.
//
// The descriptors are not decoration. "BB" means nothing to anyone who
// has not already played in this scene, and a player who cannot work out
// which tier they belong in does not enter an event at all.
//
// `C` and `Recreational` are NOT seeded. They exist in already-deployed
// databases and 004_brackets.sql hides them there rather than deleting,
// because real events used them: Recreational folds into BB (same
// meaning in this vocabulary), and C is left attached to the two events
// that published it rather than being promoted into B.
const DIVISIONS: Record<string, Array<[string, string, number, string | null]>> = {
  volleyball: [
    ['open', 'Open', 1, 'Semi Pro'],
    ['aaa',  'AAA', 2, 'High Competitive'],
    ['aa',   'AA',  3, 'Competitive'],
    ['a',    'A',   4, 'Low Competitive'],
    ['bbb',  'BBB', 5, 'Advanced Recreational'],
    ['bb',   'BB',  6, 'Recreational'],
    ['b',    'B',   7, 'Low Recreational'],
    // Age bracket rather than a skill tier, but this is the axis
    // organizers print it on, so this is where players will look for it.
    ['masters', 'Masters (55+)', 8, 'Age 55 and over'],
  ],
  pickleball: [
    ['open', 'Open', 1, null], ['5-0', '5.0+', 2, null], ['4-5', '4.5', 3, null],
    ['4-0', '4.0', 4, null], ['3-5', '3.5', 5, null], ['3-0', '3.0 & under', 6, null],
  ],
};

// ------------------------------------------------------------------ types

interface SeedFile {
  generated_at: string;
  venues: Array<{
    key: string; name: string; address_line: string | null; city: string;
    state: string; postal_code: string | null; latitude: number | null;
    longitude: number | null; geo_precision: string;
  }>;
  organizers: Array<{ slug: string; name: string; contact_email: string | null; website_url: string | null }>;
  events: Array<{
    slug: string; name: string; sport: string; surfaces: string[];
    venue_key: string | null; organizer_slug: string | null; starts_on: string;
    registration_deadline: string | null; entry_fee_cents: number | null;
    payout_text: string | null; event_page_url: string | null;
    flyer_url: string | null; notes: string | null; formats: string[];
    divisions: string[]; status: string; created_by: string | null;
  }>;
}

// ------------------------------------------------------------------- main

async function main() {
  const file = resolve(process.argv[2] ?? 'data/events.seed.json');
  const seed: SeedFile = JSON.parse(readFileSync(file, 'utf8'));
  console.log(`\nSeeding from ${file} (prepared ${seed.generated_at})`);

  // ---- sports -------------------------------------------------------
  const sportIds = new Map<string, string>();
  for (const s of SPORTS) {
    const [row] = await sql<{ id: string }[]>`
      insert into sports (slug, name, display_order, is_active)
      values (${s.slug}, ${s.name}, ${s.display_order}, ${s.is_active})
      on conflict (slug) do update
        set name = excluded.name,
            display_order = excluded.display_order,
            is_active = excluded.is_active
      returning id`;
    sportIds.set(s.slug, row.id);
  }
  console.log(`  sports      ${sportIds.size}`);

  // ---- surfaces / formats / divisions -------------------------------
  const surfaceIds = new Map<string, string>();  // `${sport}:${slug}` -> id
  const formatIds = new Map<string, string>();
  const divisionIds = new Map<string, string>();

  for (const [sportSlug, list] of Object.entries(SURFACES)) {
    const sportId = sportIds.get(sportSlug)!;
    for (const [i, [slug, name]] of list.entries()) {
      const [row] = await sql<{ id: string }[]>`
        insert into surfaces (sport_id, slug, name, display_order)
        values (${sportId}, ${slug}, ${name}, ${i + 1})
        on conflict (sport_id, slug) do update
          set name = excluded.name, display_order = excluded.display_order
        returning id`;
      surfaceIds.set(`${sportSlug}:${slug}`, row.id);
    }
  }

  for (const [sportSlug, list] of Object.entries(FORMATS)) {
    const sportId = sportIds.get(sportSlug)!;
    for (const [i, [slug, name, gender, teamSize]] of list.entries()) {
      const [row] = await sql<{ id: string }[]>`
        insert into formats (sport_id, slug, name, gender, team_size, display_order)
        values (${sportId}, ${slug}, ${name}, ${gender}, ${teamSize}, ${i + 1})
        on conflict (sport_id, slug) do update
          set name = excluded.name, gender = excluded.gender,
              team_size = excluded.team_size, display_order = excluded.display_order
        returning id`;
      formatIds.set(`${sportSlug}:${slug}`, row.id);
    }
  }

  for (const [sportSlug, list] of Object.entries(DIVISIONS)) {
    const sportId = sportIds.get(sportSlug)!;
    for (const [i, [slug, name, rank, descriptor]] of list.entries()) {
      const [row] = await sql<{ id: string }[]>`
        insert into divisions (sport_id, slug, name, skill_rank, display_order, descriptor, is_active)
        values (${sportId}, ${slug}, ${name}, ${rank}, ${i + 1}, ${descriptor}, true)
        on conflict (sport_id, slug) do update
          set name = excluded.name, skill_rank = excluded.skill_rank,
              display_order = excluded.display_order,
              descriptor = excluded.descriptor,
              is_active = true
        returning id`;
      divisionIds.set(`${sportSlug}:${slug}`, row.id);
    }
  }
  console.log(`  surfaces    ${surfaceIds.size}\n  formats     ${formatIds.size}\n  divisions   ${divisionIds.size}`);

  // ---- organizers ---------------------------------------------------
  const organizerIds = new Map<string, string>();
  for (const o of seed.organizers) {
    const [row] = await sql<{ id: string }[]>`
      insert into organizers (slug, name, contact_email, website_url)
      values (${o.slug}, ${o.name}, ${o.contact_email}, ${o.website_url})
      on conflict (slug) do update
        set name = excluded.name,
            contact_email = coalesce(excluded.contact_email, organizers.contact_email),
            website_url   = coalesce(excluded.website_url, organizers.website_url)
      returning id`;
    organizerIds.set(o.slug, row.id);
  }
  console.log(`  organizers  ${organizerIds.size}`);

  // ---- venues -------------------------------------------------------
  // Venues have no natural unique key in the source data, so the import
  // key is matched explicitly rather than with ON CONFLICT.
  const venueIds = new Map<string, string>();
  for (const v of seed.venues) {
    const [existing] = await sql<{ id: string }[]>`
      select id from venues
      where name = ${v.name} and city = ${v.city} and state = ${v.state}
      limit 1`;
    if (existing) {
      await sql`
        update venues set
          address_line = ${v.address_line}, postal_code = ${v.postal_code},
          latitude = ${v.latitude}, longitude = ${v.longitude},
          geo_precision = ${v.geo_precision},
          geocoded_at = ${v.latitude === null ? null : sql`now()`}
        where id = ${existing.id}`;
      venueIds.set(v.key, existing.id);
    } else {
      const [row] = await sql<{ id: string }[]>`
        insert into venues (name, address_line, city, state, postal_code,
                            latitude, longitude, geo_precision, geocoded_at)
        values (${v.name}, ${v.address_line}, ${v.city}, ${v.state},
                ${v.postal_code}, ${v.latitude}, ${v.longitude},
                ${v.geo_precision}, ${v.latitude === null ? null : sql`now()`})
        returning id`;
      venueIds.set(v.key, row.id);
    }
  }
  console.log(`  venues      ${venueIds.size}`);

  // ---- events -------------------------------------------------------
  let inserted = 0;
  let updated = 0;
  const skipped: string[] = [];

  for (const e of seed.events) {
    const sportId = sportIds.get(e.sport);
    if (!sportId) { skipped.push(`${e.slug} (unknown sport ${e.sport})`); continue; }

    const [row] = await sql<{ id: string; was_insert: boolean }[]>`
      insert into events (
        slug, sport_id, venue_id, organizer_id, name, event_type, starts_on,
        registration_deadline, entry_fee_cents, fee_basis, payout_text,
        event_page_url, flyer_url, notes, status, source, created_by, published_at
      ) values (
        ${e.slug}, ${sportId},
        ${e.venue_key ? venueIds.get(e.venue_key) ?? null : null},
        ${e.organizer_slug ? organizerIds.get(e.organizer_slug) ?? null : null},
        ${e.name}, 'tournament', ${e.starts_on},
        ${e.registration_deadline}, ${e.entry_fee_cents}, 'per_player',
        ${e.payout_text}, ${e.event_page_url}, ${e.flyer_url}, ${e.notes},
        ${e.status}, 'import', ${e.created_by},
        ${e.status === 'approved' ? sql`now()` : null}
      )
      on conflict (slug) do update set
        sport_id = excluded.sport_id, venue_id = excluded.venue_id,
        organizer_id = excluded.organizer_id, name = excluded.name,
        starts_on = excluded.starts_on,
        registration_deadline = excluded.registration_deadline,
        entry_fee_cents = excluded.entry_fee_cents,
        payout_text = excluded.payout_text,
        event_page_url = excluded.event_page_url,
        flyer_url = excluded.flyer_url, notes = excluded.notes,
        status = excluded.status
      returning id, (xmax = 0) as was_insert`;

    row.was_insert ? inserted++ : updated++;

    await sql`delete from event_surfaces where event_id = ${row.id}`;
    for (const s of e.surfaces) {
      const id = surfaceIds.get(`${e.sport}:${s}`);
      if (id) await sql`insert into event_surfaces (event_id, surface_id) values (${row.id}, ${id}) on conflict do nothing`;
    }

    await sql`delete from event_formats where event_id = ${row.id}`;
    for (const f of e.formats) {
      const id = formatIds.get(`${e.sport}:${f}`);
      if (id) await sql`insert into event_formats (event_id, format_id) values (${row.id}, ${id}) on conflict do nothing`;
    }

    await sql`delete from event_divisions where event_id = ${row.id}`;
    for (const d of e.divisions) {
      const id = divisionIds.get(`${e.sport}:${d}`);
      if (id) await sql`insert into event_divisions (event_id, division_id) values (${row.id}, ${id}) on conflict do nothing`;
    }
  }

  console.log(`  events      ${inserted} inserted, ${updated} updated`);
  if (skipped.length) console.log(`  skipped     ${skipped.length}: ${skipped.slice(0, 5).join(', ')}`);
  console.log('\nDone.\n');
  await sql.end();
}

main().catch(async (err) => {
  console.error('\nSeed failed:', err instanceof Error ? err.message : err, '\n');
  await sql.end({ timeout: 1 }).catch(() => {});
  process.exit(1);
});
