/**
 * prepare-seed.ts
 * ---------------------------------------------------------------------
 * Converts an Airtable CSV export of the COMPETE event database into the
 * normalised JSON that `scripts/seed.ts` loads into Postgres.
 *
 * Run:  npm run data:prepare -- data/Compete_Sports_Database.csv
 *
 * This is a one-way, re-runnable transform. It never talks to the network:
 * coordinates come from a bundled US postal-code table, so a fresh export
 * can be prepared offline. Anything it cannot resolve is reported at the
 * end rather than silently dropped.
 */

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import zipcodes from 'zipcodes';

// --------------------------------------------------------------- helpers

const STATES: Record<string, string> = {
  alabama: 'AL', alaska: 'AK', arizona: 'AZ', arkansas: 'AR', california: 'CA',
  colorado: 'CO', connecticut: 'CT', delaware: 'DE', florida: 'FL', georgia: 'GA',
  hawaii: 'HI', idaho: 'ID', illinois: 'IL', indiana: 'IN', iowa: 'IA',
  kansas: 'KS', kentucky: 'KY', louisiana: 'LA', maine: 'ME', maryland: 'MD',
  massachusetts: 'MA', michigan: 'MI', minnesota: 'MN', mississippi: 'MS',
  missouri: 'MO', montana: 'MT', nebraska: 'NE', nevada: 'NV',
  'new hampshire': 'NH', 'new jersey': 'NJ', 'new mexico': 'NM', 'new york': 'NY',
  'north carolina': 'NC', 'north dakota': 'ND', ohio: 'OH', oklahoma: 'OK',
  oregon: 'OR', pennsylvania: 'PA', 'rhode island': 'RI', 'south carolina': 'SC',
  'south dakota': 'SD', tennessee: 'TN', texas: 'TX', utah: 'UT', vermont: 'VT',
  virginia: 'VA', washington: 'WA', 'west virginia': 'WV', wisconsin: 'WI',
  wyoming: 'WY', 'district of columbia': 'DC',
};

function toStateCode(raw: string): string | null {
  const v = raw.trim();
  if (/^[A-Za-z]{2}$/.test(v)) return v.toUpperCase();
  return STATES[v.toLowerCase()] ?? null;
}

/**
 * The postal table spells these out, while hosts abbreviate them.
 * Without this, "St. Louis" silently loses its coordinates.
 */
function cityLookupNames(city: string): string[] {
  const out = [city];
  const expanded = city
    .replace(/^St\.?\s+/i, 'Saint ')
    .replace(/^Ft\.?\s+/i, 'Fort ')
    .replace(/^Mt\.?\s+/i, 'Mount ');
  if (expanded !== city) out.push(expanded);
  const bare = city.replace(/\./g, '');
  if (!out.includes(bare)) out.push(bare);
  return out;
}

/**
 * COMPETE Phase 1 is a domestic US product. A destination event hosted
 * abroad is kept in the database but never auto-approved, so it cannot
 * quietly appear in a "within 50 miles" result.
 */
const NON_US_HINTS = /\b(costa rica|mexico|bahamas|jamaica|dominican|aruba|canada|punta cana|cancun)\b/i;

function slugify(s: string): string {
  return s
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
}

/** Minimal RFC-4180 CSV parser: handles quotes, embedded commas and newlines. */
function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;
  const src = text.replace(/^﻿/, '').replace(/\r\n/g, '\n');

  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (quoted) {
      if (c === '"') {
        if (src[i + 1] === '"') { field += '"'; i++; } else { quoted = false; }
      } else field += c;
    } else if (c === '"') quoted = true;
    else if (c === ',') { row.push(field); field = ''; }
    else if (c === '\n') { row.push(field); rows.push(row); row = []; field = ''; }
    else field += c;
  }
  if (field.length || row.length) { row.push(field); rows.push(row); }
  return rows.filter((r) => r.some((c) => c.trim() !== ''));
}

const clean = (v: string | undefined): string =>
  (v ?? '').replace(/\s+/g, ' ').trim();

const splitList = (v: string | undefined): string[] =>
  clean(v).split(',').map((s) => s.trim()).filter(Boolean);

/**
 * Hosts type "N/A", "None" or "TBD" into free-text cells. Storing those
 * verbatim puts "Payout / prizes: N/A" on a public page, which reads worse
 * than showing nothing, so they are treated as empty.
 */
const PLACEHOLDER = /^(n\/?a|none|no|tbd|tba|-+|\.+)$/i;
const meaningful = (v: string | undefined): string | null => {
  const s = clean(v);
  return s && !PLACEHOLDER.test(s) ? s : null;
};

/** "February 28, 2026" or "3/12/2026" -> "2026-02-28" */
function toIsoDate(raw: string): string | null {
  const v = clean(raw);
  if (!v) return null;
  const long = Date.parse(v);
  if (!Number.isNaN(long)) {
    const d = new Date(long);
    if (d.getFullYear() > 2000 && d.getFullYear() < 2100) {
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    }
  }
  const m = v.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
  if (m) {
    const yr = m[3].length === 2 ? `20${m[3]}` : m[3];
    return `${yr}-${m[1].padStart(2, '0')}-${m[2].padStart(2, '0')}`;
  }
  return null;
}

/** "$42.50" -> 4250 */
function toCents(raw: string): number | null {
  const m = clean(raw).match(/([\d,]+(?:\.\d{1,2})?)/);
  if (!m) return null;
  const n = Number(m[1].replace(/,/g, ''));
  return Number.isFinite(n) ? Math.round(n * 100) : null;
}

/**
 * Airtable attachment cell: `flyer.png (https://v5.airtableusercontent...)`.
 *
 * Those URLs are short-lived signed links that stop resolving within hours
 * of the export, so importing them would fill the database with addresses
 * that 404. Only a durable link is kept; the flyer name is reported instead
 * so the images can be re-hosted deliberately.
 */
function firstAttachment(raw: string): { url: string | null; name: string | null } {
  const value = clean(raw);
  const url = value.match(/\((https?:\/\/[^)]+)\)/)?.[1] ?? null;
  const name = value.match(/^([^(]+?)\s*\(/)?.[1]?.trim() ?? null;
  if (url && /airtableusercontent\.com/i.test(url)) return { url: null, name };
  return { url, name };
}

/** A US ZIP written anywhere inside a free-text address. */
function zipFromAddress(addr: string): string | null {
  const m = clean(addr).match(/\b(\d{5})(?:-\d{4})?\b(?!.*\b\d{5}\b)/);
  return m ? m[1] : null;
}

// ------------------------------------------------------- reference lookups

const SURFACES: Record<string, string> = {
  beach: 'beach', sand: 'beach', grass: 'grass', turf: 'turf',
  indoor: 'indoor', court: 'indoor',
};

/** Canonical format slug + the gender facet it implies. */
const FORMATS: Record<string, { slug: string; gender: string }> = {
  "men's doubles":        { slug: 'mens-doubles',        gender: 'mens' },
  "men's trips":          { slug: 'mens-triples',        gender: 'mens' },
  "men's triples":        { slug: 'mens-triples',        gender: 'mens' },
  "men's quads":          { slug: 'mens-quads',          gender: 'mens' },
  "men's sixes":          { slug: 'mens-sixes',          gender: 'mens' },
  "women's doubles":      { slug: 'womens-doubles',      gender: 'womens' },
  "women's trips":        { slug: 'womens-triples',      gender: 'womens' },
  "women's triples":      { slug: 'womens-triples',      gender: 'womens' },
  "women's quads":        { slug: 'womens-quads',        gender: 'womens' },
  "women's sixes":        { slug: 'womens-sixes',        gender: 'womens' },
  'coed doubles':         { slug: 'coed-doubles',        gender: 'coed' },
  'coed trips':           { slug: 'coed-triples',        gender: 'coed' },
  'coed triples':         { slug: 'coed-triples',        gender: 'coed' },
  'coed quads':           { slug: 'coed-quads',          gender: 'coed' },
  'coed sixes':           { slug: 'coed-sixes',          gender: 'coed' },
  'reverse coed doubles': { slug: 'reverse-coed-doubles', gender: 'coed' },
  'reverse coed trips':   { slug: 'reverse-coed-triples', gender: 'coed' },
  'reverse coed triples': { slug: 'reverse-coed-triples', gender: 'coed' },
  'reverse coed quads':   { slug: 'reverse-coed-quads',   gender: 'coed' },
  'king & queen of the beach': { slug: 'king-queen-of-the-beach', gender: 'coed' },
  'king and queen of the beach': { slug: 'king-queen-of-the-beach', gender: 'coed' },
  'beach volleyball vacation/mixer': { slug: 'mixer', gender: 'open' },
  'mixer':                { slug: 'mixer',               gender: 'open' },
};

const DIVISIONS: Record<string, string> = {
  open: 'open', aaa: 'aaa', aa: 'aa', a: 'a', bb: 'bb', b: 'b', c: 'c',
  recreational: 'recreational', rec: 'recreational', masters: 'masters',
};

// ------------------------------------------------------------------ types

type Warning = { row: number; event: string; issue: string };

interface SeedVenue {
  key: string; name: string; address_line: string | null;
  city: string; state: string; postal_code: string | null;
  latitude: number | null; longitude: number | null; geo_precision: string;
}
interface SeedOrganizer {
  slug: string; name: string; contact_email: string | null; website_url: string | null;
}
interface SeedEvent {
  slug: string; name: string; sport: string; surfaces: string[];
  venue_key: string | null; organizer_slug: string | null;
  starts_on: string; registration_deadline: string | null;
  entry_fee_cents: number | null; payout_text: string | null;
  event_page_url: string | null; flyer_url: string | null; notes: string | null;
  formats: string[]; divisions: string[]; status: string; created_by: string | null;
}

// ------------------------------------------------------------------- main

const inputPath = resolve(process.argv[2] ?? 'data/Compete_Sports_Database.csv');
const outputPath = resolve(process.argv[3] ?? 'data/events.seed.json');

const rowsRaw = parseCsv(readFileSync(inputPath, 'utf8'));
const header = rowsRaw[0].map((h) => clean(h));
const records = rowsRaw.slice(1).map((cells) => {
  const o: Record<string, string> = {};
  header.forEach((h, i) => { o[h] = cells[i] ?? ''; });
  return o;
});

const warnings: Warning[] = [];
const venues = new Map<string, SeedVenue>();
const organizers = new Map<string, SeedOrganizer>();
const events: SeedEvent[] = [];
const usedSlugs = new Set<string>();

records.forEach((r, idx) => {
  const rowNo = idx + 2;
  const name = clean(r['Tournament Name']);
  if (!name) { warnings.push({ row: rowNo, event: '(blank)', issue: 'No tournament name — row skipped' }); return; }

  const startsOn = toIsoDate(r['Date']);
  if (!startsOn) { warnings.push({ row: rowNo, event: name, issue: `Unreadable date "${clean(r['Date'])}" — row skipped` }); return; }

  const city = clean(r['City']);
  const state = toStateCode(clean(r['State']));
  if (!state) { warnings.push({ row: rowNo, event: name, issue: `Unrecognised state "${clean(r['State'])}" — row skipped` }); return; }

  // ---- venue + coordinates ----
  const venueName = clean(r['Venue Name']) || `${city} (venue TBD)`;
  const address = clean(r['Venue Address (Full Address)']);
  const addressIsPlaceholder = /^(tbd|tba|n\/?a)$/i.test(address);
  const addressLine = address && !addressIsPlaceholder ? address : null;

  const zipInAddress = addressLine ? zipFromAddress(addressLine) : null;
  const zipColumn = /^\d{5}$/.test(clean(r['Zip Code'])) ? clean(r['Zip Code']) : null;

  let postal: string | null = null;
  let lat: number | null = null;
  let lng: number | null = null;
  let precision = 'unknown';

  // The ZIP written into the address is trusted over the ZIP column: the
  // export contains 32 rows where the column disagrees with the address.
  const zipCandidate = zipInAddress ?? zipColumn;
  if (zipInAddress && zipColumn && zipInAddress !== zipColumn) {
    warnings.push({ row: rowNo, event: name, issue: `ZIP column ${zipColumn} disagrees with address ZIP ${zipInAddress}; used ${zipInAddress}` });
  }

  if (zipCandidate) {
    const hit = zipcodes.lookup(zipCandidate) as
      | { latitude: number; longitude: number; state: string } | undefined;
    if (hit && hit.state === state) {
      postal = zipCandidate; lat = hit.latitude; lng = hit.longitude; precision = 'postal';
    } else if (hit) {
      warnings.push({ row: rowNo, event: name, issue: `ZIP ${zipCandidate} is in ${hit.state}, not ${state}; fell back to city centre` });
    }
  }

  if (lat === null && city) {
    for (const candidate of cityLookupNames(city)) {
      const hits = zipcodes.lookupByName(candidate, state) as
        | Array<{ latitude: number; longitude: number; zip: string }> | undefined;
      if (hits && hits.length) {
        lat = hits.reduce((s, h) => s + h.latitude, 0) / hits.length;
        lng = hits.reduce((s, h) => s + h.longitude, 0) / hits.length;
        precision = 'city';
        break;
      }
    }
  }

  const looksNonUs = NON_US_HINTS.test(`${city} ${name} ${addressLine ?? ''}`);
  if (looksNonUs) {
    warnings.push({ row: rowNo, event: name, issue: `Looks like a destination event outside the US — held as draft` });
  } else if (lat === null) {
    warnings.push({ row: rowNo, event: name, issue: `No coordinates for ${city}, ${state} — will not appear in radius search until geocoded` });
  }

  const venueKey = slugify(`${venueName}-${city}-${state}`);
  if (!venues.has(venueKey)) {
    venues.set(venueKey, {
      key: venueKey, name: venueName, address_line: addressLine,
      city, state, postal_code: postal, latitude: lat, longitude: lng,
      geo_precision: precision,
    });
  }

  // ---- organizer ----
  const orgName = clean(r['Organizer Name']);
  let orgSlug: string | null = null;
  if (orgName) {
    orgSlug = slugify(orgName);
    const email = clean(r['Organizer Contact Email']) || null;
    const existing = organizers.get(orgSlug);
    if (!existing) {
      organizers.set(orgSlug, { slug: orgSlug, name: orgName, contact_email: email, website_url: null });
    } else if (!existing.contact_email && email) {
      existing.contact_email = email;
    }
  }

  // ---- surface / formats / divisions ----
  const surfaces: string[] = [];
  for (const s of splitList(r['Surface'])) {
    const hit = SURFACES[s.toLowerCase()];
    if (hit) { if (!surfaces.includes(hit)) surfaces.push(hit); }
    else warnings.push({ row: rowNo, event: name, issue: `Unknown surface "${s}"` });
  }
  if (!surfaces.length) warnings.push({ row: rowNo, event: name, issue: 'No surface listed' });

  const formats: string[] = [];
  for (const f of splitList(r['Format'])) {
    const hit = FORMATS[f.toLowerCase()];
    if (hit) { if (!formats.includes(hit.slug)) formats.push(hit.slug); }
    else warnings.push({ row: rowNo, event: name, issue: `Unknown format "${f}"` });
  }

  const divisions: string[] = [];
  for (const d of splitList(r['Division'])) {
    const hit = DIVISIONS[d.toLowerCase()];
    if (hit) { if (!divisions.includes(hit)) divisions.push(hit); }
    else warnings.push({ row: rowNo, event: name, issue: `Unknown division "${d}"` });
  }
  if (!divisions.length) warnings.push({ row: rowNo, event: name, issue: 'No divisions listed' });

  // ---- slug ----
  let slug = slugify(`${name}-${city}-${startsOn}`);
  let n = 2;
  while (usedSlugs.has(slug)) slug = `${slugify(`${name}-${city}-${startsOn}`)}-${n++}`;
  usedSlugs.add(slug);

  const attachment = firstAttachment(r['Attachments']);
  if (!attachment.url && attachment.name) {
    warnings.push({ row: rowNo, event: name, issue: `Flyer "${attachment.name}" is an expiring Airtable link — not imported; re-host the image to show it` });
  }

  // A blank Status in the export means the row was entered but never
  // marked. Those import as 'draft' so nothing reaches the public site
  // without a person approving it.
  const statusRaw = clean(r['Status']).toLowerCase();
  const status = statusRaw === 'approved' && !looksNonUs ? 'approved' : 'draft';

  events.push({
    slug, name, sport: 'volleyball', surfaces,
    venue_key: venueKey, organizer_slug: orgSlug,
    starts_on: startsOn,
    registration_deadline: toIsoDate(r['Registration Deadline']),
    entry_fee_cents: toCents(r['Entry Fee Per Player']),
    payout_text: meaningful(r['Payout']),
    event_page_url: clean(r['Event Page URL']) || null,
    flyer_url: attachment.url,
    notes: clean(r['Notes']) || null,
    formats, divisions, status,
    created_by: clean(r['Created By']) || null,
  });
});

const payload = {
  generated_at: new Date().toISOString(),
  source_file: inputPath.split('/').pop(),
  venues: [...venues.values()],
  organizers: [...organizers.values()],
  events,
};

mkdirSync(dirname(outputPath), { recursive: true });
writeFileSync(outputPath, JSON.stringify(payload, null, 2));

// ------------------------------------------------------------- the report

const byPrecision = [...venues.values()].reduce<Record<string, number>>((a, v) => {
  a[v.geo_precision] = (a[v.geo_precision] ?? 0) + 1; return a;
}, {});

console.log(`\nCOMPETE seed prepared -> ${outputPath}`);
console.log(`  events      ${events.length}  (approved ${events.filter((e) => e.status === 'approved').length}, draft ${events.filter((e) => e.status === 'draft').length})`);
console.log(`  venues      ${venues.size}   ${JSON.stringify(byPrecision)}`);
console.log(`  organizers  ${organizers.size}`);

if (warnings.length) {
  console.log(`\n  ${warnings.length} item(s) need a human look:`);
  const grouped = warnings.reduce<Record<string, Warning[]>>((a, w) => {
    const k = w.issue.replace(/"[^"]*"/g, '"…"').replace(/\d{5}/g, 'NNNNN').replace(/[A-Z][a-z]+, [A-Z]{2}/g, '…');
    (a[k] ??= []).push(w); return a;
  }, {});
  for (const [kind, list] of Object.entries(grouped).sort((a, b) => b[1].length - a[1].length)) {
    console.log(`\n   ${list.length}x  ${kind}`);
    list.slice(0, 4).forEach((w) => console.log(`        row ${w.row}: ${w.event} — ${w.issue}`));
    if (list.length > 4) console.log(`        …and ${list.length - 4} more`);
  }
}
console.log('');
