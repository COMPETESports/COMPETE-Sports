import { sql } from './db';

/**
 * Everything the event form needs about one existing event.
 *
 * Shared by the edit page and by duplicate, which are the same read with
 * different things stripped out afterwards. Written as one loader on
 * 28 Oct so the two cannot drift: a column added for editing that
 * duplicate forgot to copy is a silent data-loss bug, and it would show
 * up as a field quietly blank on the copy.
 */

export interface EventFormRow {
  id: string;
  slug: string;
  name: string;
  event_type: string;
  sport_slug: string;
  starts_on: Date | string;
  ends_on: Date | string | null;
  registration_deadline: Date | string | null;
  entry_fee_cents: number | null;
  fee_basis: string;
  payout_text: string | null;
  event_page_url: string | null;
  flyer_url: string | null;
  notes: string | null;
  status: string;
  venue_name: string | null;
  address_line: string | null;
  city: string | null;
  state: string | null;
  postal_code: string | null;
  latitude: number | null;
  organizer_name: string | null;
  organizer_email: string | null;
  surfaces: string[] | null;
  formats: string[] | null;
  divisions: string[] | null;
}

export interface BracketGroupRow {
  surface: string | null;
  format: string;
  sub_format: string | null;
  divisions: string[] | null;
  confirmed: boolean;
}

export const isUuid = (s: string) => /^[0-9a-f-]{36}$/i.test(s);

/** A date column as the `type="date"` input wants it, or ''. */
export const iso = (v: Date | string | null): string =>
  v === null ? '' : v instanceof Date ? v.toISOString().slice(0, 10) : String(v).slice(0, 10);

export async function loadEvent(id: string): Promise<EventFormRow | null> {
  const [row] = await sql<EventFormRow[]>`
    select
      e.id, e.slug, e.name, e.event_type, sp.slug as sport_slug, e.starts_on, e.ends_on,
      e.registration_deadline, e.entry_fee_cents, e.fee_basis, e.payout_text,
      e.event_page_url, e.flyer_url, e.notes, e.status,
      v.name as venue_name, v.address_line, v.city, v.state, v.postal_code, v.latitude,
      o.name as organizer_name, o.contact_email as organizer_email,
      (select array_agg(s.slug) from event_surfaces es join surfaces s on s.id = es.surface_id where es.event_id = e.id) as surfaces,
      (select array_agg(f.slug) from event_formats ef join formats f on f.id = ef.format_id where ef.event_id = e.id) as formats,
      (select array_agg(d.slug) from event_divisions ed join divisions d on d.id = ed.division_id where ed.event_id = e.id) as divisions
    from events e
    join sports sp on sp.id = e.sport_id
    left join venues v on v.id = e.venue_id
    left join organizers o on o.id = e.organizer_id
    where e.id = ${id}`;
  return row ?? null;
}

/**
 * Brackets grouped back into what the builder edits: one row per
 * surface + format + sub-format, carrying its divisions.
 */
export async function loadBrackets(eventId: string): Promise<BracketGroupRow[]> {
  const rows = await sql<BracketGroupRow[]>`
    select su.slug as surface,
           f.slug  as format,
           sf.slug as sub_format,
           array_remove(array_agg(d.slug order by d.display_order), null) as divisions,
           bool_and(b.confirmed) as confirmed
      from event_brackets b
      join formats f on f.id = b.format_id
      left join divisions d on d.id = b.division_id
      left join sub_formats sf on sf.id = b.sub_format_id
      left join surfaces su on su.id = b.surface_id
     where b.event_id = ${eventId}
     group by su.slug, su.display_order, f.slug, f.display_order, sf.slug, sf.display_order
     order by su.display_order nulls first, f.display_order, sf.display_order nulls first`;
  return [...rows];
}
