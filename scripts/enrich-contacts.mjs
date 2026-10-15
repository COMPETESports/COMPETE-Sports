/**
 * enrich-contacts.mjs
 * ---------------------------------------------------------------------
 * Finds phone numbers and websites for the organizations COMPETE has no
 * way to reach.
 *
 * Run:
 *   node scripts/enrich-contacts.mjs            # dry run — writes nothing
 *   node scripts/enrich-contacts.mjs --write    # actually saves
 *   node scripts/enrich-contacts.mjs --limit 20 # try a handful first
 *
 * 258 of 310 organizations in the database have no contact route at all,
 * which is the single thing standing between a list of names and a list
 * of calls. This asks Google Places for each one.
 *
 * Three decisions worth knowing about, because they are the difference
 * between a useful tool and one that quietly poisons the database.
 *
 * 1. DRY RUN BY DEFAULT. The first thing you want from a script that
 *    touches 258 rows is to see what it would do. Pass --write only once
 *    the output looks right.
 *
 * 2. IT REFUSES UNCERTAIN MATCHES. Searching "Gateway Volleyball" will
 *    always return *something* — Places is built to be helpful, not
 *    accurate. A returned business whose name does not resemble what we
 *    asked for is recorded as a suggestion for you to eyeball, never
 *    written. A wrong phone number is worse than no phone number: it
 *    costs a call, and it costs your credibility on that call.
 *
 * 3. IT NEVER OVERWRITES. If an organizer already has an email or a
 *    website, that came from a human and outranks anything Google says.
 *    Only empty fields are filled.
 *
 * Every value written records where it came from (`contact_source`) and
 * when (`contact_checked_at`), so six months from now you can tell a
 * number Google guessed from one a person confirmed.
 *
 * Cost: one Places call per organization, so roughly 260. Well inside the
 * free monthly allowance, and no charge is possible before 7 Jan 2027
 * while the trial credit is active.
 */

import postgres from 'postgres';
import { readFileSync } from 'node:fs';

// ---- configuration --------------------------------------------------

const WRITE = process.argv.includes('--write');
const LIMIT = (() => {
  const i = process.argv.indexOf('--limit');
  return i !== -1 ? Number(process.argv[i + 1]) : null;
})();

/** Node does not read .env files by itself — that is Next.js doing it. */
function fromEnvFile(key) {
  for (const path of ['.env.local', '.env']) {
    try {
      for (const line of readFileSync(path, 'utf8').split('\n')) {
        const m = line.match(new RegExp(`^\\s*(?:export\\s+)?${key}\\s*=\\s*(.*)$`));
        if (m) return m[1].trim().replace(/^["']|["']$/g, '');
      }
    } catch { /* next file */ }
  }
  return '';
}

const DATABASE_URL = process.env.DATABASE_URL || fromEnvFile('DATABASE_URL');
const PLACES_KEY   = process.env.GOOGLE_PLACES_KEY || fromEnvFile('GOOGLE_PLACES_KEY');

const g = (s) => `\x1b[32m${s}\x1b[0m`;
const y = (s) => `\x1b[33m${s}\x1b[0m`;
const r = (s) => `\x1b[31m${s}\x1b[0m`;
const d = (s) => `\x1b[2m${s}\x1b[0m`;

for (const [name, value] of [['DATABASE_URL', DATABASE_URL], ['GOOGLE_PLACES_KEY', PLACES_KEY]]) {
  if (!value) {
    console.error(r(`${name} is not set.`));
    console.error('Both live in .env.local. Run this from the project folder:');
    console.error(d('  cd ~/Desktop/COMPETE-Sports && node scripts/enrich-contacts.mjs'));
    process.exit(1);
  }
}

const sql = postgres(DATABASE_URL, { prepare: false, max: 2 });

// ---- name matching --------------------------------------------------

/**
 * Places returns the closest business it can find, which for a vague query
 * is frequently the wrong one. These two functions decide whether what came
 * back is plausibly who we asked about.
 */
function normalize(name) {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9 ]+/g, ' ')
    .replace(/\b(the|a|an|inc|llc|ltd|co|company|and|of)\b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function similarity(a, b) {
  const A = new Set(normalize(a).split(' ').filter(Boolean));
  const B = new Set(normalize(b).split(' ').filter(Boolean));
  if (!A.size || !B.size) return 0;
  const shared = [...A].filter((t) => B.has(t)).length;
  // Measured against the shorter name: "Archway Sports" matching
  // "Archway Sports Complex" should score high, not be punished for the
  // extra word Google adds.
  return shared / Math.min(A.size, B.size);
}

// Below this, the result is reported but never written.
const ACCEPT = 0.6;

// ---- Places ---------------------------------------------------------

async function lookup(query) {
  const res = await fetch('https://places.googleapis.com/v1/places:searchText', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Goog-Api-Key': PLACES_KEY,
      'X-Goog-FieldMask':
        'places.displayName,places.formattedAddress,places.nationalPhoneNumber,places.websiteUri',
    },
    body: JSON.stringify({ textQuery: query, maxResultCount: 1 }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body?.error?.message ?? `HTTP ${res.status}`);
  }
  const body = await res.json();
  return body.places?.[0] ?? null;
}

// ---- main -----------------------------------------------------------

console.log('\nCOMPETE — organizer contact enrichment');
console.log('='.repeat(64));
console.log(WRITE ? r('WRITE MODE — changes will be saved') : g('DRY RUN — nothing will be saved'));

/**
 * Organizers with no contact route, each with the city their events
 * actually happen in. The city matters: "Gateway Volleyball" alone could
 * be anywhere, "Gateway Volleyball, St. Louis MO" is a specific business.
 * Taken from the venue hosting the most of their events.
 */
const targets = await sql`
  with best_city as (
    select distinct on (e.organizer_id)
           e.organizer_id, v.city, v.state, count(*) as n
      from events e
      join venues v on v.id = e.venue_id
     where e.organizer_id is not null
     group by e.organizer_id, v.city, v.state
     order by e.organizer_id, n desc
  )
  select o.id, o.name, o.slug, bc.city, bc.state,
         o.contact_email, o.website_url, o.phone
    from organizers o
    left join best_city bc on bc.organizer_id = o.id
   where coalesce(o.phone, '') = ''
     and coalesce(o.website_url, '') = ''
     and coalesce(o.contact_email, '') = ''
   order by bc.n desc nulls last, o.name
   ${LIMIT ? sql`limit ${LIMIT}` : sql``}
`;

console.log(`${targets.length} organizations with no contact route\n`);

const accepted = [];
const uncertain = [];
const nothing = [];
let failed = 0;

for (const [i, org] of targets.entries()) {
  const where = org.city ? `, ${org.city} ${org.state ?? ''}`.trim() : '';
  const query = `${org.name}${where}`;
  process.stdout.write(d(`  [${i + 1}/${targets.length}] ${org.name.slice(0, 46)}… `));

  let hit;
  try {
    hit = await lookup(query);
  } catch (err) {
    console.log(r(`error: ${err.message}`));
    failed++;
    continue;
  }

  if (!hit) {
    console.log(d('no match'));
    nothing.push(org);
    continue;
  }

  const found = hit.displayName?.text ?? '';
  const score = similarity(org.name, found);
  const phone = hit.nationalPhoneNumber ?? '';
  const site = hit.websiteUri ?? '';

  if (score < ACCEPT) {
    console.log(y(`uncertain (${score.toFixed(2)}) → ${found.slice(0, 40)}`));
    uncertain.push({ org, found, score, phone, site, address: hit.formattedAddress });
    continue;
  }
  if (!phone && !site) {
    console.log(d('matched, but no contact details published'));
    nothing.push(org);
    continue;
  }

  console.log(g(`${phone || site}`));
  accepted.push({ org, found, score, phone, site, address: hit.formattedAddress });

  // Courtesy pause. 260 requests is nothing to Google, but hammering an
  // API as fast as the loop allows is a bad habit to build.
  await new Promise((r) => setTimeout(r, 120));
}

// ---- write ----------------------------------------------------------

if (WRITE && accepted.length) {
  console.log(`\nwriting ${accepted.length} records…`);
  for (const a of accepted) {
    // coalesce guards the no-overwrite rule at the database rather than
    // trusting the query above to have filtered correctly.
    await sql`
      update organizers set
        phone              = coalesce(nullif(phone, ''), ${a.phone || null}),
        website_url        = coalesce(nullif(website_url, ''), ${a.site || null}),
        city               = coalesce(nullif(city, ''), ${a.org.city || null}),
        state              = coalesce(nullif(state, ''), ${a.org.state || null}),
        contact_source     = 'google_places',
        contact_checked_at = now()
      where id = ${a.org.id}
    `;
  }
  console.log(g('done'));
}

// ---- report ---------------------------------------------------------

console.log('\n' + '='.repeat(64));
console.log(`${g('found')}      ${accepted.length}  contact details recovered`);
console.log(`${y('uncertain')}  ${uncertain.length}  name did not match well enough to trust`);
console.log(`${d('nothing')}    ${nothing.length}  no match, or no details published`);
if (failed) console.log(`${r('errors')}     ${failed}`);

if (uncertain.length) {
  console.log(y('\nWorth a look — these were NOT saved:'));
  for (const u of uncertain.slice(0, 25)) {
    console.log(`  ${u.org.name}`);
    console.log(d(`    Google returned: ${u.found}  (${u.address ?? 'no address'})`));
    console.log(d(`    ${u.phone || 'no phone'}  ${u.site || ''}`));
  }
  if (uncertain.length > 25) console.log(d(`  …and ${uncertain.length - 25} more`));
}

if (!WRITE && accepted.length) {
  console.log(d('\nThis was a dry run. To save these:'));
  console.log(d('  node scripts/enrich-contacts.mjs --write'));
}

await sql.end();
console.log();
