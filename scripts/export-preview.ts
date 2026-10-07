/**
 * Dumps the live database into a single JSON bundle for the offline
 * preview page.
 *
 * The preview is a static page with no server, so everything it needs has
 * to travel with it: the events, the reference vocabulary, the state
 * outlines, and venue positions already projected into map space (d3-geo
 * runs here, never in the browser — exactly as the real app does it).
 *
 *   npx tsx --tsconfig tsconfig.json scripts/export-preview.ts > preview/data.json
 */

import { sql } from '../src/lib/db';
import { projectToMap } from '../src/lib/project';
import { MAP_VIEWBOX, US_STATES } from '../src/lib/us-states';
import { DORMANT_STEP, EMPTY_STEP, SCALE } from '../src/lib/map-scale';

interface Row {
  [key: string]: unknown;
}

/** Postgres hands back `date` as a Date or a string depending on the driver path. */
function day(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return String(value).slice(0, 10);
}

async function main() {
  const sports = await sql<Row[]>`
    select slug, name, is_active from sports order by display_order, name`;

  const surfaces = await sql<Row[]>`
    select s.slug, s.name, sp.slug as sport from surfaces s
      join sports sp on sp.id = s.sport_id order by sp.display_order, s.display_order`;

  const formats = await sql<Row[]>`
    select f.slug, f.name, f.gender, f.team_size, sp.slug as sport from formats f
      join sports sp on sp.id = f.sport_id order by sp.display_order, f.display_order`;

  const divisions = await sql<Row[]>`
    select d.slug, d.name, d.skill_rank, sp.slug as sport from divisions d
      join sports sp on sp.id = d.sport_id order by sp.display_order, d.display_order`;

  const organizers = await sql<Row[]>`
    select id, name, contact_email, website_url from organizers order by name`;

  const venueRows = await sql<Row[]>`
    select id, name, address_line, city, state, postal_code,
           latitude, longitude, geo_precision
      from venues order by state, city, name`;

  const venues = venueRows.map((v) => {
    const lat = v.latitude as number | null;
    const lng = v.longitude as number | null;
    const point = lat !== null && lng !== null ? projectToMap(lat, lng) : null;
    return {
      id: v.id,
      name: v.name,
      address: v.address_line,
      city: v.city,
      state: v.state,
      zip: v.postal_code,
      lat,
      lng,
      x: point?.x ?? null,
      y: point?.y ?? null,
      precision: v.geo_precision,
    };
  });

  // Approved events only: the preview is the public site, and a draft is
  // not public. The draft count travels separately so the admin screen can
  // say how many are waiting.
  const events = await sql<Row[]>`
    select e.id, e.slug, e.name, e.event_type, e.starts_on, e.ends_on,
           e.start_time, e.registration_deadline, e.entry_fee_cents,
           e.fee_basis, e.payout_text, e.event_page_url, e.notes,
           e.featured, e.featured_rank,
           sp.slug as sport, e.venue_id, e.organizer_id,
           coalesce((select array_agg(sf.slug order by sf.display_order)
                       from event_surfaces es join surfaces sf on sf.id = es.surface_id
                      where es.event_id = e.id), '{}') as surfaces,
           coalesce((select array_agg(fm.slug order by fm.display_order)
                       from event_formats ef join formats fm on fm.id = ef.format_id
                      where ef.event_id = e.id), '{}') as formats,
           coalesce((select array_agg(distinct fm.gender)
                       from event_formats ef join formats fm on fm.id = ef.format_id
                      where ef.event_id = e.id), '{}') as genders,
           coalesce((select array_agg(dv.slug order by dv.display_order)
                       from event_divisions ed join divisions dv on dv.id = ed.division_id
                      where ed.event_id = e.id), '{}') as divisions
      from events e
      join sports sp on sp.id = e.sport_id
     where e.status = 'approved'
     order by e.starts_on
  `;

  const [counts] = await sql<Row[]>`
    select count(*) filter (where status = 'draft')::int as drafts,
           count(*) filter (where status = 'approved')::int as approved,
           count(*)::int as total
      from events`;

  const bundle = {
    generatedAt: new Date().toISOString(),
    counts,
    sports: sports.map((s) => ({ slug: s.slug, name: s.name, active: s.is_active })),
    surfaces,
    formats: formats.map((f) => ({
      slug: f.slug,
      name: f.name,
      gender: f.gender,
      teamSize: f.team_size,
      sport: f.sport,
    })),
    divisions: divisions.map((d) => ({
      slug: d.slug,
      name: d.name,
      rank: d.skill_rank,
      sport: d.sport,
    })),
    organizers: organizers.map((o) => ({
      id: o.id,
      name: o.name,
      email: o.contact_email,
      website: o.website_url,
    })),
    venues,
    events: events.map((e) => ({
      id: e.id,
      slug: e.slug,
      name: e.name,
      type: e.event_type,
      startsOn: day(e.starts_on),
      endsOn: day(e.ends_on),
      startTime: e.start_time ? String(e.start_time).slice(0, 5) : null,
      deadline: day(e.registration_deadline),
      feeCents: e.entry_fee_cents,
      feeBasis: e.fee_basis,
      payout: e.payout_text,
      url: e.event_page_url,
      notes: e.notes,
      featured: e.featured,
      featuredRank: e.featured_rank,
      sport: e.sport,
      venueId: e.venue_id,
      organizerId: e.organizer_id,
      surfaces: e.surfaces,
      formats: e.formats,
      genders: e.genders,
      divisions: e.divisions,
    })),
    map: {
      viewBox: MAP_VIEWBOX,
      states: US_STATES.map((s) => ({
        code: s.code,
        name: s.name,
        d: s.d,
        cx: s.cx,
        cy: s.cy,
        small: s.small,
        bounds: s.bounds,
      })),
    },
    scale: { steps: SCALE, dormant: DORMANT_STEP, empty: EMPTY_STEP },
  };

  process.stdout.write(JSON.stringify(bundle));
  await sql.end();
}

void main();
