'use server';

import { z } from 'zod';
import { sql } from './db';
import { isSignedIn } from './auth';
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
  source: 'image' | 'text',
) {
  const list = (rows: { slug: string; name: string }[]) =>
    rows.map((r) => `${r.slug} (${r.name})`).join(', ');

  return `You are reading ${source === 'image' ? 'a flyer image' : 'a pasted announcement'} for an adult recreational volleyball event. Your output pre-fills a submission form that a person checks line by line before saving.

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

export async function readFlyer(input: {
  imageBase64?: string;
  imageMediaType?: string;
  text?: string;
  sport?: string;
}): Promise<FlyerReadResult> {
  if (!(await isSignedIn())) return { ok: false, message: 'Sign in first.' };

  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) {
    return {
      ok: false,
      message:
        'No ANTHROPIC_API_KEY is set, so the flyer reader is switched off. Add it to .env.local and restart the dev server.',
    };
  }

  const hasImage = Boolean(input.imageBase64 && input.imageMediaType);
  const hasText = Boolean(input.text && input.text.trim().length > 20);
  if (!hasImage && !hasText) {
    return { ok: false, message: 'Give it a flyer image or some text to read.' };
  }

  const sport = input.sport || 'volleyball';
  const vocab = await vocabulary(sport);
  const today = new Date().toISOString().slice(0, 10);
  const prompt = buildPrompt(vocab, today, hasImage ? 'image' : 'text');

  const content: unknown[] = [];
  if (hasImage) {
    content.push({
      type: 'image',
      source: {
        type: 'base64',
        media_type: input.imageMediaType,
        data: input.imageBase64,
      },
    });
  }
  if (hasText) {
    content.push({ type: 'text', text: `Source text:\n\n${input.text}` });
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

  const sourceFlat = hasText && !hasImage ? flatten(input.text ?? '') : null;

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
