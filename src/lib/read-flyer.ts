'use server';

import { z } from 'zod';
import { sql } from './db';
import { isSignedIn } from './auth';
import { currentAccount } from './accounts';
import { tooManyAttempts } from './rate-limit';
import { FIELD_LABELS as LABELS } from './field-labels';
import { STATES, type ParsedListing } from './parse-listing';

/**
 * Read a flyer with a vision model and pre-fill the submission form.
 *
 * The existing paste box parses TEXT with regexes, in the browser, free and
 * instantly. This is the other half: most events are announced as an image,
 * and a flyer is a hard read -- stylised type, text over photographs, dates
 * written six different ways. Regexes cannot do it; a vision model can.
 *
 * ## The one rule
 *
 * **A field is dropped unless the model quotes the source text for it.**
 *
 * This is the whole design. A model asked to fill a form will fill it,
 * inventing a plausible entry fee for a flyer that never states one. A
 * blank box Tom fills in himself costs thirty seconds. A confidently wrong
 * date gets published, and a player drives to an event that is not
 * happening. The quote makes the difference visible: every filled field
 * shows what it was read from, so checking the work is scanning a list
 * rather than re-reading the flyer.
 *
 * For pasted text the quote is verified mechanically -- it must actually
 * appear in the source. For an image it cannot be, so the quote is shown
 * to Tom instead. Different guarantees, and the UI says which is which.
 *
 * Deliberately not using the Anthropic SDK: a plain fetch to the Messages
 * API is a dozen lines, and adding a dependency to the project means a
 * platform-specific install that cannot be run from the Linux shell I work
 * in without replacing Tom's macOS binaries.
 */

const API_URL = 'https://api.anthropic.com/v1/messages';
const MODEL = 'claude-sonnet-5-5';

/** A flyer is a hard read and accuracy is the point; see claude/sunday-setup.md
 *  for the cost comparison. About a cent per flyer. */

const Quoted = z.object({
  value: z.string().trim().min(1),
  quote: z.string().trim().min(1),
});

const QuotedList = z.object({
  value: z.array(z.string().trim().min(1)),
  quote: z.string().trim().min(1),
});

const ModelReply = z
  .object({
    name: Quoted.optional(),
    starts_on: Quoted.optional(),
    ends_on: Quoted.optional(),
    registration_deadline: Quoted.optional(),
    start_time: Quoted.optional(),
    check_in_time: Quoted.optional(),
    meeting_time: Quoted.optional(),
    entry_fee: Quoted.optional(),
    fee_basis: Quoted.optional(),
    payout_text: Quoted.optional(),
    event_page_url: Quoted.optional(),
    venue_name: Quoted.optional(),
    address_line: Quoted.optional(),
    city: Quoted.optional(),
    state: Quoted.optional(),
    postal_code: Quoted.optional(),
    organizer_name: Quoted.optional(),
    organizer_email: Quoted.optional(),
    surfaces: QuotedList.optional(),
    formats: QuotedList.optional(),
    divisions: QuotedList.optional(),
    notes: Quoted.optional(),
  })
  .partial();

export interface FlyerReadResult {
  ok: boolean;
  message?: string;
  fields?: ParsedListing;
  filled?: string[];
  found?: string[];
  missing?: string[];
  /** field key -> the source text the model says it read. Shown, not trusted. */
  quotes?: Record<string, string>;
  /** True when quotes were checked against the source rather than displayed. */
  verified?: boolean;
}

const DATE_FIELDS = ['starts_on', 'ends_on', 'registration_deadline'] as const;
const TIME_FIELDS = ['start_time', 'check_in_time', 'meeting_time'] as const;


/** Loose comparison for checking a quote really came from the pasted text. */
const flatten = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');

async function vocabulary(sportSlug: string) {
  const [surfaces, formats, divisions] = await Promise.all([
    sql<{ slug: string; name: string }[]>`
      select s.slug, s.name from surfaces s join sports sp on sp.id = s.sport_id
       where sp.slug = ${sportSlug} order by s.display_order`,
    sql<{ slug: string; name: string }[]>`
      select f.slug, f.name from formats f join sports sp on sp.id = f.sport_id
       where sp.slug = ${sportSlug} and f.is_active order by f.display_order`,
    sql<{ slug: string; name: string }[]>`
      select d.slug, d.name from divisions d join sports sp on sp.id = d.sport_id
       where sp.slug = ${sportSlug} and d.is_active order by d.display_order`,
  ]);
  return { surfaces: [...surfaces], formats: [...formats], divisions: [...divisions] };
}

function buildPrompt(
  vocab: Awaited<ReturnType<typeof vocabulary>>,
  today: string,
  source: { images: number; page: boolean },
) {
  const list = (rows: { slug: string; name: string }[]) =>
    rows.map((r) => `${r.slug} (${r.name})`).join(', ');

  const what =
    source.images > 1
      ? `${source.images} images of the SAME event -- screenshots or flyer pages that together carry its details. Combine what they say into one event; where two images disagree, omit the field and mention the conflict in notes`
      : source.images === 1
        ? 'a flyer image'
        : source.page
          ? 'the text of an event web page'
          : 'a pasted announcement';

  return `You are reading ${what} for an adult recreational volleyball event. Your output pre-fills a submission form that a person checks line by line before saving.

Return ONLY a JSON object. No prose, no markdown fence.

Every field is an object: {"value": ..., "quote": "..."}.
- "quote" is text that genuinely appears in the source, copied exactly.
- **If you cannot point at source text that states a field, omit the field entirely.**
- Omitting is correct and expected. A blank box costs the person thirty seconds. A wrong value gets published and sends a player to an event that is not happening. Never infer, calculate, average, or assume a typical value.

Fields, all optional:
  name              event title
  starts_on         YYYY-MM-DD
  ends_on           YYYY-MM-DD, only if it genuinely runs across several days
  registration_deadline  YYYY-MM-DD
  start_time        24-hour HH:MM. When play begins - "first serve", "games start".
  check_in_time     24-hour HH:MM. When check-in or doors open.
  meeting_time      24-hour HH:MM. The captain's or players meeting, only if
                    the source names it separately from check-in.
  entry_fee         a plain number, e.g. "75" or "42.50". No currency symbol.
  fee_basis         exactly "per_player" or "per_team"
  payout_text       prizes or payout, as written
  event_page_url    full registration or event URL
  venue_name        the facility or park name
  address_line      street address only
  city
  state             two-letter code
  postal_code       five digits
  organizer_name    the organization running it
  organizer_email
  surfaces          array of slugs from: ${list(vocab.surfaces)}
  formats           array of slugs from: ${list(vocab.formats)}
  divisions         array of slugs from: ${list(vocab.divisions)}
  notes             anything a player needs that has no field of its own

Rules:
- Today is ${today}. If a date gives no year, choose the next occurrence still in the future, and make the quote show the date exactly as written.
- For surfaces, formats and divisions, use ONLY the slugs listed. If the source names something not on the list, leave it out of the array and mention it in notes.
- A format carries its gender: "Men's Doubles" is one slug, not a gender plus a size.
- Never put a value in notes that belongs in a real field.
- If the source is not an event announcement at all, return {}.`;
}

/** Most images per read. Each costs about a cent; five covers a flyer
 *  front and back plus three screenshots of a long post. */
const MAX_IMAGES = 5; // also in PasteBox.tsx -- a 'use server' file may only export async functions

export async function readFlyer(input: {
  /** Several images of the same event, read together (14 Nov 2026). */
  images?: { base64: string; mediaType: string }[];
  /** Single-image form, kept so older callers still work. */
  imageBase64?: string;
  imageMediaType?: string;
  text?: string;
  /** An event web page to fetch and read as text. */
  url?: string;
  sport?: string;
}): Promise<FlyerReadResult> {
  // Staff can read images and links. A signed-in account with a confirmed
  // email may read a LINK only, 10 a day (public submission form, Tom
  // 22 Nov: images stay staff-only, each read costs about a cent).
  if (!(await isSignedIn())) {
    const account = await currentAccount();
    if (!account || !account.email_verified_at) {
      return { ok: false, message: 'Sign in with a confirmed account first.' };
    }
    const hasImages = (input.images?.length ?? 0) > 0 || !!input.imageBase64;
    if (hasImages || !input.url?.trim()) {
      return { ok: false, message: 'Paste a link to the event page, or paste its text into the box.' };
    }
    if (tooManyAttempts(`link-read:${account.id}`, 10, 60 * 60 * 24).limited) {
      return { ok: false, message: "That's 10 links today. Paste the event's text instead — that's unlimited." };
    }
  }

  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) {
    return {
      ok: false,
      message:
        'No ANTHROPIC_API_KEY is set, so the flyer reader is switched off. Add it to .env.local and restart the dev server.',
    };
  }

  const images = [
    ...(input.images ?? []),
    ...(input.imageBase64 && input.imageMediaType
      ? [{ base64: input.imageBase64, mediaType: input.imageMediaType }]
      : []),
  ].filter((i) => i.base64 && /^image\/(jpeg|png|gif|webp)$/.test(i.mediaType));
  if (images.length > MAX_IMAGES) {
    return { ok: false, message: `Up to ${MAX_IMAGES} images at a time.` };
  }

  // A link is fetched here, on the server, and read as text -- which means
  // its quotes CAN be checked against what the page says, unlike an image.
  let pageText = '';
  const url = input.url?.trim();
  if (url) {
    const page = await fetchPageText(url);
    if (!page.ok) return { ok: false, message: page.message };
    pageText = page.text;
  }

  const sourceText = [input.text?.trim(), pageText].filter(Boolean).join('\n\n');
  const hasImage = images.length > 0;
  const hasText = sourceText.length > 20;
  if (!hasImage && !hasText) {
    return { ok: false, message: 'Give it a flyer image, a link or some text to read.' };
  }

  const sport = input.sport || 'volleyball';
  const vocab = await vocabulary(sport);
  const today = new Date().toISOString().slice(0, 10);
  const prompt = buildPrompt(vocab, today, { images: images.length, page: Boolean(pageText) });

  const content: unknown[] = [];
  images.forEach((img, i) => {
    if (images.length > 1) content.push({ type: 'text', text: `Image ${i + 1} of ${images.length}:` });
    content.push({
      type: 'image',
      source: { type: 'base64', media_type: img.mediaType, data: img.base64 },
    });
  });
  if (hasText) {
    content.push({ type: 'text', text: `Source text:\n\n${sourceText}` });
  }
  content.push({ type: 'text', text: prompt });

  let raw: string;
  try {
    const res = await fetch(API_URL, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': key,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 2000,
        messages: [{ role: 'user', content }],
      }),
    });

    if (!res.ok) {
      const detail = await res.text().catch(() => '');
      // Never echo the key back, and keep the useful part short.
      const short = detail.slice(0, 300);
      if (res.status === 401) {
        return { ok: false, message: 'The API key was rejected. Check ANTHROPIC_API_KEY in .env.local.' };
      }
      if (res.status === 429) {
        return { ok: false, message: 'Rate limited by the API. Wait a moment and try again.' };
      }
      if (res.status === 400 && short.includes('credit')) {
        return { ok: false, message: 'The Claude account is out of credit. Top it up in the Console billing page.' };
      }
      return { ok: false, message: `The reader failed (HTTP ${res.status}). ${short}` };
    }

    const body = (await res.json()) as { content?: { type: string; text?: string }[] };
    raw = (body.content ?? [])
      .filter((b) => b.type === 'text')
      .map((b) => b.text ?? '')
      .join('')
      .trim();
  } catch (err) {
    return {
      ok: false,
      message: `Could not reach the API: ${err instanceof Error ? err.message : 'unknown error'}`,
    };
  }

  // The model is told not to fence the JSON, but strip one if it appears.
  const cleaned = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');

  let parsedJson: unknown;
  try {
    parsedJson = JSON.parse(cleaned);
  } catch {
    return { ok: false, message: 'The reader returned something that was not valid JSON. Try again.' };
  }

  const checked = ModelReply.safeParse(parsedJson);
  if (!checked.success) {
    return { ok: false, message: 'The reader returned fields in an unexpected shape. Try again.' };
  }

  const reply = checked.data;
  const fields: ParsedListing = { surfaces: [], formats: [], divisions: [] };
  const filled: string[] = [];
  const found: string[] = [];
  const missing: string[] = [];
  const quotes: Record<string, string> = {};

  const sourceFlat = hasText && !hasImage ? flatten(sourceText) : null;

  /** The rule, in one place: no quote, or a quote that is not in the
   *  source when we can check, means the field does not get used. */
  const accept = (keyName: string, quote: string): boolean => {
    if (!quote.trim()) return false;
    if (sourceFlat) {
      const q = flatten(quote);
      if (q.length >= 4 && !sourceFlat.includes(q)) {
        missing.push(`${LABELS[keyName] ?? keyName} — dropped, the quoted text is not in what you pasted`);
        return false;
      }
    }
    return true;
  };

  const validSurfaces = new Set(vocab.surfaces.map((s) => s.slug));
  const validFormats = new Set(vocab.formats.map((f) => f.slug));
  const validDivisions = new Set(vocab.divisions.map((d) => d.slug));

  const takeList = (keyName: 'surfaces' | 'formats' | 'divisions', allowed: Set<string>) => {
    const entry = reply[keyName];
    if (!entry || !accept(keyName, entry.quote)) return;
    const kept = entry.value.filter((s) => allowed.has(s));
    if (!kept.length) return;
    fields[keyName] = kept;
    filled.push(keyName);
    quotes[keyName] = entry.quote;
    found.push(`${LABELS[keyName]}: ${kept.join(', ')}`);
  };

  for (const [keyName, entry] of Object.entries(reply)) {
    if (keyName === 'surfaces' || keyName === 'formats' || keyName === 'divisions') continue;
    const q = entry as { value: string; quote: string } | undefined;
    if (!q || !accept(keyName, q.quote)) continue;

    let value = q.value.trim();

    if ((DATE_FIELDS as readonly string[]).includes(keyName) && !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
      missing.push(`${LABELS[keyName] ?? keyName} — dropped, the date was not a real date`);
      continue;
    }
    if ((TIME_FIELDS as readonly string[]).includes(keyName)) {
      // Accept 9:00, 09:00 or 9:00 AM and normalise to the HH:MM the form wants.
      const m = /^(\d{1,2}):(\d{2})\s*([ap]\.?m\.?)?$/i.exec(value);
      if (!m) {
        missing.push(`${LABELS[keyName] ?? keyName} — dropped, could not be read as a time`);
        continue;
      }
      let hour = Number(m[1]);
      const mer = m[3]?.toLowerCase().replace(/\./g, '');
      if (mer === 'pm' && hour < 12) hour += 12;
      if (mer === 'am' && hour === 12) hour = 0;
      if (hour > 23) {
        missing.push(`${LABELS[keyName] ?? keyName} — dropped, not a real time`);
        continue;
      }
      value = `${String(hour).padStart(2, '0')}:${m[2]}`;
    }

    if (keyName === 'fee_basis' && value !== 'per_player' && value !== 'per_team') continue;

    if (keyName === 'state') {
      // Truncating was wrong: "Texas" became "TE", which passes a length
      // check and is not a state. Map the name, or drop the field.
      const mapped =
        value.length === 2 ? value.toUpperCase() : STATES[value.toLowerCase()];
      if (!mapped) {
        missing.push(`${LABELS.state} — dropped, "${value}" is not a state we recognise`);
        continue;
      }
      value = mapped;
    }

    if (keyName === 'postal_code') {
      // Flyers print ZIP+4. The form wants the five.
      const five = value.match(/\d{5}/)?.[0];
      if (!five) continue;
      value = five;
    }

    if (keyName === 'event_page_url') {
      // A flyer prints "sandslam.com", not "https://sandslam.com", and the
      // form requires a full URL - this was a silent save failure.
      if (!/^https?:\/\//i.test(value)) value = `https://${value}`;
      try {
        new URL(value);
      } catch {
        missing.push(`${LABELS.event_page_url} — dropped, could not be read as a web address`);
        continue;
      }
    }

    if (keyName === 'organizer_email' && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(value)) {
      missing.push(`${LABELS.organizer_email} — dropped, not a usable email address`);
      continue;
    }

    if (keyName === 'entry_fee') value = value.replace(/[^0-9.]/g, '');

    (fields as unknown as Record<string, unknown>)[keyName] = value;
    filled.push(keyName);
    quotes[keyName] = q.quote;
    found.push(`${LABELS[keyName] ?? keyName}: ${value}`);
  }

  takeList('surfaces', validSurfaces);
  takeList('formats', validFormats);
  takeList('divisions', validDivisions);

  // The link Tom pasted is, by definition, a page about this event. Used
  // only when the page itself named no better registration link.
  if (url && pageText && !filled.includes('event_page_url')) {
    fields.event_page_url = url;
    filled.push('event_page_url');
    quotes.event_page_url = 'the link you pasted';
    found.push(`${LABELS.event_page_url}: ${url} (the link you pasted)`);
  }

  if (!filled.length) {
    return {
      ok: true,
      fields,
      filled: [],
      found: [],
      missing: [
        ...missing,
        'Nothing could be read from this with a source to point at. Fill the form in by hand.',
      ],
      quotes,
      verified: Boolean(sourceFlat),
    };
  }

  for (const keyName of ['starts_on', 'venue_name', 'city', 'entry_fee']) {
    if (!filled.includes(keyName)) missing.push(`${LABELS[keyName]} — not stated, add it yourself`);
  }

  return { ok: true, fields, filled, found, missing, quotes, verified: Boolean(sourceFlat) };
}

/* ------------------------------------------------------------- web pages */

/**
 * Fetch a web page and reduce it to readable text.
 *
 * Three kinds of page cannot be read, and each gets a plain answer rather
 * than an empty form:
 * - Facebook and Instagram show a sign-in page to anything that is not a
 *   logged-in person, so the reader would get "Log in" instead of the post.
 *   Screenshots are the way in for those.
 * - Pages that build themselves with JavaScript arrive nearly empty.
 * - Anything on a private network is refused outright, so this box can
 *   never be pointed at a machine inside Vercel's or anyone's network.
 */
async function fetchPageText(
  raw: string,
): Promise<{ ok: true; text: string } | { ok: false; message: string }> {
  let target: URL;
  try {
    target = new URL(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`);
  } catch {
    return { ok: false, message: 'That does not look like a web address.' };
  }
  if (target.protocol !== 'https:' && target.protocol !== 'http:') {
    return { ok: false, message: 'Only web addresses (http or https) can be read.' };
  }

  const host = target.hostname.toLowerCase();
  if (/(^|\.)(facebook\.com|fb\.com|fb\.me|instagram\.com)$/.test(host)) {
    return {
      ok: false,
      message:
        'Facebook and Instagram only show posts to people who are signed in, so the reader would get their sign-in page instead of the event. Take screenshots of the post and add them as images instead — you can add up to five.',
    };
  }
  if (!(await isPublicHost(host))) {
    return { ok: false, message: 'That address is not a public website.' };
  }

  let html: string;
  try {
    const res = await fetch(target, {
      redirect: 'follow',
      signal: AbortSignal.timeout(10_000),
      headers: {
        // Some sites refuse requests that do not look like a browser.
        'user-agent': 'Mozilla/5.0 (compatible; COMPETE event reader; +https://joincompete.com)',
        accept: 'text/html,application/xhtml+xml',
      },
    });
    if (!res.ok) {
      return { ok: false, message: `That page answered with an error (HTTP ${res.status}). Try screenshots instead.` };
    }
    const type = res.headers.get('content-type') ?? '';
    if (!type.includes('html') && !type.includes('text')) {
      return { ok: false, message: 'That link is not a web page. If it is an image or PDF, save it and add it as an image.' };
    }
    html = (await res.text()).slice(0, 2_000_000);
  } catch (err) {
    const timedOut = err instanceof Error && err.name === 'TimeoutError';
    return {
      ok: false,
      message: timedOut
        ? 'That page took too long to answer. Try again, or use screenshots.'
        : 'Could not reach that page. Check the link, or use screenshots.',
    };
  }

  const text = htmlToText(html).slice(0, 30_000);
  if (text.length < 80) {
    return {
      ok: false,
      message:
        'That page has almost no text until it runs in a browser, so there is nothing to read. Take screenshots of it instead.',
    };
  }
  return { ok: true, text };
}

/** Title, description and the visible text of a page, without the markup. */
function htmlToText(html: string): string {
  const meta = (name: string) =>
    new RegExp(
      `<meta[^>]+(?:property|name)=["']${name}["'][^>]*content=["']([^"']*)["']`,
      'i',
    ).exec(html)?.[1] ?? '';
  const title = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(html)?.[1] ?? '';

  const body = html
    .replace(/<(script|style|noscript|svg|template)[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<(br|\/p|\/div|\/li|\/h[1-6]|\/tr)[^>]*>/gi, '\n')
    .replace(/<[^>]+>/g, ' ');

  return [title, meta('og:title'), meta('og:description'), meta('description'), body]
    .map(decodeEntities)
    .join('\n')
    .replace(/[ \t ]+/g, ' ')
    .replace(/\s*\n\s*/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function decodeEntities(s: string): string {
  const named: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', ndash: '–', mdash: '—', rsquo: '’', lsquo: '‘', rdquo: '”', ldquo: '“' };
  return s
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&([a-z]+);/gi, (m, n) => named[n.toLowerCase()] ?? m);
}

/** False for localhost, private and link-local addresses -- checked after
 *  DNS, so a public-looking name that points inside a network is refused. */
async function isPublicHost(host: string): Promise<boolean> {
  if (host === 'localhost' || host.endsWith('.local') || host.endsWith('.internal')) return false;
  const { lookup } = await import('node:dns/promises');
  let addresses: { address: string }[];
  try {
    addresses = await lookup(host, { all: true });
  } catch {
    return false;
  }
  return addresses.length > 0 && addresses.every(({ address }) => !isPrivateIp(address));
}

function isPrivateIp(ip: string): boolean {
  if (ip.includes(':')) {
    const v6 = ip.toLowerCase();
    if (v6.startsWith('::ffff:')) return isPrivateIp(v6.slice(7));
    return v6 === '::1' || v6 === '::' || v6.startsWith('fc') || v6.startsWith('fd') || v6.startsWith('fe80');
  }
  const [a, b] = ip.split('.').map(Number);
  return (
    a === 10 || a === 127 || a === 0 ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 100 && b >= 64 && b <= 127)
  );
}
