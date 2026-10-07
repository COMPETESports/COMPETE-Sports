'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import { sql } from './db';
import { setEventFeatured } from './queries';
import { isSignedIn } from './auth';
import { geocode } from './geocode';

/**
 * The Phase 1 admin-managed event entry workflow: create, edit and
 * publish event records until Host publishing arrives in Phase 3.
 */

const EventInput = z.object({
  id: z.string().uuid().optional(),
  name: z.string().trim().min(3, 'Give the event a name.').max(200),
  sport: z.string().trim().min(1),
  starts_on: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Pick a start date.'),
  ends_on: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).or(z.literal('')).optional(),
  registration_deadline: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).or(z.literal('')).optional(),
  entry_fee: z.string().trim().optional(),
  fee_basis: z.enum(['per_player', 'per_team']).default('per_player'),
  payout_text: z.string().trim().max(500).optional(),
  event_page_url: z.string().trim().url('Event page must be a full URL.').or(z.literal('')).optional(),
  flyer_url: z.string().trim().url().or(z.literal('')).optional(),
  notes: z.string().trim().max(4000).optional(),
  venue_name: z.string().trim().min(2, 'Give the venue a name.').max(200),
  address_line: z.string().trim().max(300).optional(),
  city: z.string().trim().min(2, 'City is required.').max(120),
  state: z.string().trim().length(2, 'Use the two-letter state code.'),
  postal_code: z.string().trim().regex(/^\d{5}$/).or(z.literal('')).optional(),
  organizer_name: z.string().trim().max(200).optional(),
  organizer_email: z.string().trim().email().or(z.literal('')).optional(),
  surfaces: z.array(z.string()).default([]),
  formats: z.array(z.string()).min(1, 'Choose at least one format.'),
  divisions: z.array(z.string()).min(1, 'Choose at least one division.'),
  status: z.enum(['draft', 'approved', 'cancelled', 'archived']).default('draft'),
});

export type ActionState = { ok: boolean; message: string; fieldErrors?: Record<string, string> };

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

function parseFee(raw: string | undefined): number | null {
  if (!raw || !raw.trim()) return null;
  const match = raw.replace(/[$,]/g, '').match(/\d+(?:\.\d{1,2})?/);
  if (!match) return null;
  return Math.round(Number(match[0]) * 100);
}

export async function saveEvent(
  _prev: ActionState | null,
  formData: FormData,
): Promise<ActionState> {
  if (!(await isSignedIn())) redirect('/admin');

  const raw = {
    id: (formData.get('id') as string) || undefined,
    name: formData.get('name'),
    sport: formData.get('sport') ?? 'volleyball',
    starts_on: formData.get('starts_on'),
    ends_on: formData.get('ends_on'),
    registration_deadline: formData.get('registration_deadline'),
    entry_fee: formData.get('entry_fee'),
    fee_basis: formData.get('fee_basis') ?? 'per_player',
    payout_text: formData.get('payout_text'),
    event_page_url: formData.get('event_page_url'),
    flyer_url: formData.get('flyer_url'),
    notes: formData.get('notes'),
    venue_name: formData.get('venue_name'),
    address_line: formData.get('address_line'),
    city: formData.get('city'),
    state: String(formData.get('state') ?? '').toUpperCase(),
    postal_code: formData.get('postal_code'),
    organizer_name: formData.get('organizer_name'),
    organizer_email: formData.get('organizer_email'),
    surfaces: formData.getAll('surfaces').map(String),
    formats: formData.getAll('formats').map(String),
    divisions: formData.getAll('divisions').map(String),
    status: formData.get('status') ?? 'draft',
  };

  const parsed = EventInput.safeParse(raw);
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      const key = String(issue.path[0] ?? 'form');
      fieldErrors[key] ??= issue.message;
    }
    return { ok: false, message: 'Some fields need fixing.', fieldErrors };
  }
  const input = parsed.data;

  if (input.ends_on && input.ends_on < input.starts_on) {
    return {
      ok: false,
      message: 'Some fields need fixing.',
      fieldErrors: { ends_on: 'End date cannot be before the start date.' },
    };
  }

  const [sport] = await sql<{ id: string }[]>`select id from sports where slug = ${input.sport}`;
  if (!sport) return { ok: false, message: `Unknown sport "${input.sport}".` };

  // ---- venue (reused when the same name/city/state already exists) ----
  const [existingVenue] = await sql<{ id: string; latitude: number | null }[]>`
    select id, latitude from venues
    where name = ${input.venue_name} and city = ${input.city} and state = ${input.state}
    limit 1`;

  let venueId: string;
  if (existingVenue) {
    venueId = existingVenue.id;
    await sql`
      update venues set
        address_line = ${input.address_line || null},
        postal_code = ${input.postal_code || null}
      where id = ${venueId}`;
  } else {
    const [row] = await sql<{ id: string }[]>`
      insert into venues (name, address_line, city, state, postal_code)
      values (${input.venue_name}, ${input.address_line || null}, ${input.city},
              ${input.state}, ${input.postal_code || null})
      returning id`;
    venueId = row.id;
  }

  // Geocode whenever coordinates are missing, so a new venue is findable by
  // radius search the moment it is published.
  const needsGeocode = !existingVenue || existingVenue.latitude === null;
  if (needsGeocode) {
    const query =
      input.postal_code ||
      [input.address_line, input.city, input.state].filter(Boolean).join(', ') ||
      `${input.city}, ${input.state}`;
    const point = await geocode(query);
    if (point) {
      await sql`
        update venues set
          latitude = ${point.lat}, longitude = ${point.lng},
          geo_precision = ${point.source === 'mapbox' ? 'exact' : point.source},
          geocoded_at = now()
        where id = ${venueId}`;
    }
  }

  // ---- organizer ----
  let organizerId: string | null = null;
  if (input.organizer_name) {
    const orgSlug = slugify(input.organizer_name);
    const [row] = await sql<{ id: string }[]>`
      insert into organizers (slug, name, contact_email)
      values (${orgSlug}, ${input.organizer_name}, ${input.organizer_email || null})
      on conflict (slug) do update
        set name = excluded.name,
            contact_email = coalesce(excluded.contact_email, organizers.contact_email)
      returning id`;
    organizerId = row.id;
  }

  // ---- event ----
  const feeCents = parseFee(input.entry_fee);
  let eventId: string;

  if (input.id) {
    const [row] = await sql<{ id: string }[]>`
      update events set
        name = ${input.name}, sport_id = ${sport.id}, venue_id = ${venueId},
        organizer_id = ${organizerId}, starts_on = ${input.starts_on},
        ends_on = ${input.ends_on || null},
        registration_deadline = ${input.registration_deadline || null},
        entry_fee_cents = ${feeCents}, fee_basis = ${input.fee_basis},
        payout_text = ${input.payout_text || null},
        event_page_url = ${input.event_page_url || null},
        flyer_url = ${input.flyer_url || null},
        notes = ${input.notes || null}, status = ${input.status},
        published_at = case
          when ${input.status} = 'approved' and published_at is null then now()
          else published_at end
      where id = ${input.id}
      returning id`;
    if (!row) return { ok: false, message: 'That event no longer exists.' };
    eventId = row.id;
  } else {
    let slug = slugify(`${input.name}-${input.city}-${input.starts_on}`);
    const [clash] = await sql<{ id: string }[]>`select id from events where slug = ${slug}`;
    if (clash) slug = `${slug}-${Date.now().toString(36).slice(-4)}`;

    const [row] = await sql<{ id: string }[]>`
      insert into events (
        slug, name, sport_id, venue_id, organizer_id, starts_on, ends_on,
        registration_deadline, entry_fee_cents, fee_basis, payout_text,
        event_page_url, flyer_url, notes, status, source, created_by, published_at
      ) values (
        ${slug}, ${input.name}, ${sport.id}, ${venueId}, ${organizerId},
        ${input.starts_on}, ${input.ends_on || null},
        ${input.registration_deadline || null}, ${feeCents}, ${input.fee_basis},
        ${input.payout_text || null}, ${input.event_page_url || null},
        ${input.flyer_url || null}, ${input.notes || null}, ${input.status},
        'admin', 'admin', ${input.status === 'approved' ? sql`now()` : null}
      )
      returning id`;
    eventId = row.id;
  }

  await replaceLinks(eventId, sport.id, input.surfaces, 'event_surfaces', 'surfaces', 'surface_id');
  await replaceLinks(eventId, sport.id, input.formats, 'event_formats', 'formats', 'format_id');
  await replaceLinks(eventId, sport.id, input.divisions, 'event_divisions', 'divisions', 'division_id');

  revalidatePath('/');
  revalidatePath('/admin/events');
  return { ok: true, message: input.id ? 'Event updated.' : 'Event created.' };
}

async function replaceLinks(
  eventId: string,
  sportId: string,
  slugs: string[],
  joinTable: string,
  refTable: string,
  refColumn: string,
): Promise<void> {
  await sql`delete from ${sql(joinTable)} where event_id = ${eventId}`;
  if (!slugs.length) return;

  const ids = await sql<{ id: string }[]>`
    select id from ${sql(refTable)}
    where sport_id = ${sportId} and slug = any(${slugs})`;

  for (const { id } of ids) {
    await sql`
      insert into ${sql(joinTable)} (event_id, ${sql(refColumn)})
      values (${eventId}, ${id})
      on conflict do nothing`;
  }
}

export async function setEventStatus(id: string, status: string): Promise<void> {
  if (!(await isSignedIn())) redirect('/admin');
  if (!['draft', 'approved', 'cancelled', 'archived'].includes(status)) return;

  await sql`
    update events set
      status = ${status},
      published_at = case
        when ${status} = 'approved' and published_at is null then now()
        else published_at end
    where id = ${id}`;

  revalidatePath('/');
  revalidatePath('/admin/events');
}

/** Adds or removes an event from the homepage Featured rail. */
export async function toggleFeatured(id: string, featured: boolean): Promise<void> {
  if (!(await isSignedIn())) redirect('/admin');
  await setEventFeatured(id, featured);
  revalidatePath('/');
  revalidatePath('/admin/events');
}
