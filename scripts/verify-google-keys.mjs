/**
 * verify-google-keys.mjs
 * ---------------------------------------------------------------------
 * Proves the Google Cloud setup works, rather than looking at console
 * screens and hoping.
 *
 * Run:  node scripts/verify-google-keys.mjs
 *
 * Two assertions, and the second matters as much as the first:
 *
 *   1. POSITIVE — the Places key can look up a business. This is the call
 *      the partner-CRM enrichment job will make a few hundred times, so if
 *      it works here it works there.
 *
 *   2. NEGATIVE — the same key is REFUSED by the Geocoding API. A key that
 *      can call anything is a key whose leak is unbounded. The restriction
 *      is the whole security model for a server key (there is no referrer
 *      to lock it to, because Vercel's IPs move), so an untested
 *      restriction is an assumption, not a control.
 *
 * A pass on (1) and a fail-as-expected on (2) is the green light.
 *
 * The key is read from the environment and never printed.
 */

import { readFileSync } from 'node:fs';

/**
 * Read the key from .env.local if it is not already in the environment.
 *
 * Node does not load .env files by itself — that is Next.js doing it, and
 * this script runs outside Next. Rather than make the reader remember an
 * `export $(grep ...)` incantation, just read the file: it sits next to
 * this script's project root and is the only place the key lives.
 */
function keyFromEnvFile() {
  for (const path of ['.env.local', '.env']) {
    try {
      for (const line of readFileSync(path, 'utf8').split('\n')) {
        const m = line.match(/^\s*(?:export\s+)?GOOGLE_PLACES_KEY\s*=\s*(.*)$/);
        if (m) return m[1].trim().replace(/^["']|["']$/g, '');
      }
    } catch {
      /* file absent — try the next one */
    }
  }
  return '';
}

const KEY = process.env.GOOGLE_PLACES_KEY || keyFromEnvFile();

// Mirrors what enrichment does: organization name + city, which is all the
// database has for the 258 organizations with no contact route.
const QUERIES = process.argv.slice(2).length
  ? process.argv.slice(2)
  : [
      'Volleyball of the Rockies, Denver CO',
      'Pinheads, Fishers IN',
      'The Sandbox volleyball, Groton CT',
    ];

const ok = (s) => `\x1b[32m${s}\x1b[0m`;
const bad = (s) => `\x1b[31m${s}\x1b[0m`;
const dim = (s) => `\x1b[2m${s}\x1b[0m`;

if (!KEY) {
  console.error(bad('GOOGLE_PLACES_KEY is not set.'));
  console.error('Open .env.local and paste the key between the quotes:');
  console.error(dim('  open -e .env.local'));
  console.error('Then run this again from the project folder.');
  process.exit(1);
}

/** Places API (New). Field mask is required — without it the call 400s. */
async function searchNew(q) {
  const res = await fetch('https://places.googleapis.com/v1/places:searchText', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Goog-Api-Key': KEY,
      'X-Goog-FieldMask':
        'places.displayName,places.formattedAddress,places.nationalPhoneNumber,places.websiteUri',
    },
    body: JSON.stringify({ textQuery: q, maxResultCount: 1 }),
  });
  const body = await res.json().catch(() => ({}));
  return { api: 'Places API (New)', status: res.status, body };
}

/** Legacy Places, in case that is the box that got ticked. */
async function searchLegacy(q) {
  const url = new URL('https://maps.googleapis.com/maps/api/place/textsearch/json');
  url.searchParams.set('query', q);
  url.searchParams.set('key', KEY);
  const res = await fetch(url);
  const body = await res.json().catch(() => ({}));
  return { api: 'Places API (legacy)', status: res.status, body };
}

function explain(body) {
  const msg = body?.error?.message ?? body?.error_message ?? '';
  if (/not authoriz|not enabled|has not been used/i.test(msg))
    return 'The key cannot call this API. Either the API is not enabled on the project, or the key\'s API restriction does not include it.';
  if (/referer|referrer/i.test(msg))
    return 'The key has a website/referrer restriction. A server key must have Application restrictions set to None.';
  if (/expired|invalid/i.test(msg)) return 'The key string itself is wrong — re-copy it from the console.';
  if (/billing/i.test(msg)) return 'Billing is not linked to this project.';
  return msg || '(no message)';
}

console.log('\nCOMPETE — Google Cloud verification');
console.log('='.repeat(62));

// ---- 1. positive -----------------------------------------------------
console.log('\n1. Places lookup  ' + dim('(what CRM enrichment will do)'));

let placesWorked = false;
let flavour = '';

for (const q of QUERIES) {
  let r = await searchNew(q);
  if (r.status !== 200) {
    const legacy = await searchLegacy(q);
    if (legacy.status === 200 && legacy.body.status === 'OK') r = legacy;
  }

  const hit =
    r.body?.places?.[0] ??
    (r.body?.results?.[0]
      ? {
          displayName: { text: r.body.results[0].name },
          formattedAddress: r.body.results[0].formatted_address,
        }
      : null);

  if (hit) {
    placesWorked = true;
    flavour = r.api;
    const name = hit.displayName?.text ?? '?';
    console.log(`   ${ok('PASS')}  ${q}`);
    console.log(dim(`          -> ${name}`));
    console.log(dim(`             ${hit.formattedAddress ?? 'no address'}`));
    if (hit.nationalPhoneNumber) console.log(dim(`             ${hit.nationalPhoneNumber}`));
    if (hit.websiteUri) console.log(dim(`             ${hit.websiteUri}`));
  } else if (r.body?.places || r.body?.results) {
    console.log(`   ${dim('----')}  ${q} ${dim('(no match — not a key problem)')}`);
    placesWorked = true;
    flavour = r.api;
  } else {
    console.log(`   ${bad('FAIL')}  ${q}  [HTTP ${r.status}]`);
    console.log(dim(`          ${explain(r.body)}`));
  }
}

// ---- 2. negative -----------------------------------------------------
console.log('\n2. Restriction check  ' + dim('(this call SHOULD be refused)'));

const geo = new URL('https://maps.googleapis.com/maps/api/geocode/json');
geo.searchParams.set('address', 'St. Louis, MO');
geo.searchParams.set('key', KEY);
const gRes = await fetch(geo);
const gBody = await gRes.json().catch(() => ({}));

let restricted = false;
if (gBody.status === 'REQUEST_DENIED' || gRes.status === 403) {
  restricted = true;
  console.log(`   ${ok('PASS')}  Geocoding refused the key, as intended.`);
  console.log(dim(`          ${gBody.error_message ?? ''}`));
} else if (gBody.status === 'OK') {
  console.log(`   ${bad('FAIL')}  The key CAN call Geocoding.`);
  console.log(dim('          It is not restricted to Places. Go to Credentials ->'));
  console.log(dim('          COMPETE server (Places) -> API restrictions -> Places only.'));
} else {
  console.log(`   ${dim('----')}  Inconclusive: ${gBody.status ?? gRes.status}`);
}

// ---- verdict ---------------------------------------------------------
console.log('\n' + '='.repeat(62));
if (placesWorked && restricted) {
  console.log(ok('READY') + ` — Places works (${flavour}), and nothing else does.`);
} else if (placesWorked) {
  console.log(bad('PARTIAL') + ' — Places works, but the key is over-permissioned.');
} else {
  console.log(bad('NOT WORKING') + ' — see the failures above.');
}
console.log();
