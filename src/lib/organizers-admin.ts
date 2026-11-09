'use server';

import { revalidatePath } from 'next/cache';
import { sql } from './db';
import { isSignedIn } from './auth';
import { PAGE_SIZE, ORGANIZER_STATUSES } from './organizer-fields';
import type {
  OrganizerListRow, OrganizerFilters, OrganizerContact, OrganizerProfileForm,
} from './organizer-fields';

/**
 * Organizer records, and putting the duplicates back together.
 *
 * Angry Dragon is four records: "Angry Dragon" (11 events, 2022), "Angry
 * Dragons" (7, 2023), "Angry Dragons Volleyball" (8, 2024) and "Angry
 * Dragon Volleyball" (10, 2026-27). One organization, split four ways,
 * and the split is chronological -- each import era named them slightly
 * differently. So this is systematic, and most multi-season organizers
 * in the database look the same.
 *
 * It matters because the whole partner pitch is "here is your page, it
 * is free, your schedule is already on it." A page showing a quarter of
 * someone's history makes that pitch weaker, not stronger.
 *
 * saveEvent matches an organizer by slug, so it will keep producing
 * these until the form offers the existing record the way the venue
 * picker does. Merging is the repair; the picker is the cure.
 */

export interface OrganizerRow {
  id: string;
  slug: string;
  name: string;
  contact_email: string | null;
  website_url: string | null;
  events: number;
  earliest: string | null;
  latest: string | null;
  venues: number;
  /** Organizers whose names collapse to this once punctuation, case and a
   *  trailing plural are stripped. Used to cluster likely duplicates. */
  match_key: string;
}

/** "Angry Dragons Volleyball" and "Angry Dragon" both reduce to "angrydragon". */
const KEY_SQL = sql`
  regexp_replace(
    regexp_replace(lower(o.name), '[^a-z0-9]', '', 'g'),
    '(volleyball|vb|sports|s)+$', ''
  )`;

export async function listOrganizers(): Promise<OrganizerRow[]> {
  if (!(await isSignedIn())) return [];
  const rows = await sql<OrganizerRow[]>`
    select o.id, o.slug, o.name, o.contact_email, o.website_url,
           count(e.id)::int                           as events,
           min(e.starts_on)::text                     as earliest,
           max(e.starts_on)::text                     as latest,
           count(distinct e.venue_id)::int            as venues,
           ${KEY_SQL}                                 as match_key
      from organizers o
      left join events e on e.organizer_id = o.id
     group by o.id, o.slug, o.name, o.contact_email, o.website_url
     order by ${KEY_SQL}, count(e.id) desc`;
  return [...rows];
}

export interface OrganizerVenue {
  venue_id: string | null;
  venue_name: string | null;
  address_line: string | null;
  city: string | null;
  state: string | null;
  postal_code: string | null;
  geo_precision: string | null;
  events: {
    id: string;
    name: string;
    slug: string;
    starts_on: string;
    status: string;
    event_type: string;
    brackets: number;
  }[];
}

/** One organizer's whole history, grouped by the venue it happened at. */
export async function organizerProfile(id: string) {
  if (!(await isSignedIn())) return null;

  const [org] = await sql<
    { id: string; slug: string; name: string; contact_email: string | null; website_url: string | null }[]
  >`select id, slug, name, contact_email, website_url from organizers where id = ${id}`;
  if (!org) return null;

  const rows = await sql<
    {
      venue_id: string | null;
      venue_name: string | null;
      address_line: string | null;
      city: string | null;
      state: string | null;
      postal_code: string | null;
      geo_precision: string | null;
      id: string;
      name: string;
      slug: string;
      starts_on: string;
      status: string;
      event_type: string;
      brackets: number;
    }[]
  >`
    select v.id as venue_id, v.name as venue_name, v.address_line, v.city, v.state,
           v.postal_code, v.geo_precision,
           e.id, e.name, e.slug, e.starts_on::text, e.status, e.event_type,
           (select count(*)::int from event_brackets b where b.event_id = e.id) as brackets
      from events e
      left join venues v on v.id = e.venue_id
     where e.organizer_id = ${id}
     order by v.name nulls last, e.starts_on desc`;

  // Group in code rather than SQL: the shape the page wants is a list of
  // venues each holding its events, which json aggregation makes harder
  // to read than it makes fast.
  const byVenue = new Map<string, OrganizerVenue>();
  for (const r of rows) {
    const key = r.venue_id ?? 'none';
    if (!byVenue.has(key)) {
      byVenue.set(key, {
        venue_id: r.venue_id,
        venue_name: r.venue_name,
        address_line: r.address_line,
        city: r.city,
        state: r.state,
        postal_code: r.postal_code,
        geo_precision: r.geo_precision,
        events: [],
      });
    }
    byVenue.get(key)!.events.push({
      id: r.id, name: r.name, slug: r.slug, starts_on: r.starts_on,
      status: r.status, event_type: r.event_type, brackets: r.brackets,
    });
  }

  // Other records that look like the same organization.
  const siblings = await sql<{ id: string; name: string; events: number }[]>`
    with keyed as (
      select o.id, o.name, ${KEY_SQL} as k,
             (select count(*)::int from events e where e.organizer_id = o.id) as events
        from organizers o
    )
    select id, name, events from keyed
     where k = (select k from keyed where id = ${id})
       and id <> ${id}
     order by events desc`;

  return {
    organizer: org,
    venues: [...byVenue.values()],
    total: rows.length,
    siblings: [...siblings],
  };
}

export interface LinkedVenue {
  venue_id: string;
  name: string;
  address_line: string | null;
  city: string;
  state: string;
  postal_code: string | null;
  geo_precision: string;
  is_home: boolean;
  source: string;
  events: number;
}

/**
 * The venues an organizer uses, as a stated fact rather than an
 * inference from their events. See 018 for why both exist.
 */
export async function organizerVenues(organizerId: string): Promise<LinkedVenue[]> {
  if (!(await isSignedIn())) return [];
  const rows = await sql<LinkedVenue[]>`
    select v.id as venue_id, v.name, v.address_line, v.city, v.state,
           v.postal_code, v.geo_precision, ov.is_home, ov.source,
           (select count(*)::int from events e
             where e.venue_id = v.id and e.organizer_id = ${organizerId}) as events
      from organizer_venues ov
      join venues v on v.id = ov.venue_id
     where ov.organizer_id = ${organizerId}
     order by ov.is_home desc, v.name`;
  return [...rows];
}

/** Record that an organizer uses a venue, because somebody said so. */
export async function linkVenue(
  organizerId: string,
  venueId: string,
): Promise<{ ok: boolean; message: string }> {
  if (!(await isSignedIn())) return { ok: false, message: 'Sign in first.' };
  const [venue] = await sql<{ name: string }[]>`select name from venues where id = ${venueId}`;
  if (!venue) return { ok: false, message: 'That venue no longer exists.' };

  // A stated link outranks one inferred from events, so saying it out
  // loud upgrades the record rather than colliding with it.
  await sql`
    insert into organizer_venues (organizer_id, venue_id, source)
    values (${organizerId}, ${venueId}, 'stated')
    on conflict (organizer_id, venue_id) do update set source = 'stated'`;

  revalidatePath(`/admin/organizers/${organizerId}`);
  return { ok: true, message: `${venue.name} linked.` };
}

export async function unlinkVenue(
  organizerId: string,
  venueId: string,
): Promise<{ ok: boolean; message: string }> {
  if (!(await isSignedIn())) return { ok: false, message: 'Sign in first.' };
  // Events are untouched. Removing a link says "they do not use this
  // place", not "that event never happened".
  await sql`
    delete from organizer_venues
     where organizer_id = ${organizerId} and venue_id = ${venueId}`;
  revalidatePath(`/admin/organizers/${organizerId}`);
  return { ok: true, message: 'Venue unlinked. Events are unchanged.' };
}

/** Mark one venue as this organizer's main room. */
export async function setHomeVenue(
  organizerId: string,
  venueId: string,
): Promise<{ ok: boolean; message: string }> {
  if (!(await isSignedIn())) return { ok: false, message: 'Sign in first.' };
  await sql`
    update organizer_venues set is_home = (venue_id = ${venueId})
     where organizer_id = ${organizerId}`;
  revalidatePath(`/admin/organizers/${organizerId}`);
  return { ok: true, message: 'Home venue set.' };
}

/** The CRM record for this organizer, if anyone has said which one it is. */
export async function organizerProspect(organizerId: string) {
  if (!(await isSignedIn())) return null;
  const [row] = await sql<
    {
      id: string; name: string; category: string | null; city: string | null;
      state: string | null; address: string | null; phone: string | null;
      email: string | null; website: string | null; status: string;
    }[]
  >`select id, name, category, city, state, address, phone, email, website, status
      from partner_prospects where organizer_id = ${organizerId} limit 1`;
  return row ?? null;
}

/** CRM records not yet claimed by an organizer, for the linking picker. */
export async function unlinkedProspects(query: string) {
  if (!(await isSignedIn())) return [];
  const q = query.trim();
  if (q.length < 2) return [];
  const rows = await sql<
    { id: string; name: string; city: string | null; state: string | null; status: string }[]
  >`select id, name, city, state, status
      from partner_prospects
     where organizer_id is null
       and name ilike ${'%' + q + '%'}
     order by name limit 8`;
  return [...rows];
}

/**
 * Say that this organizer and this CRM record are the same organization.
 *
 * The join nobody has made: 0 of 1,310 prospects point at an organizer.
 * Until they do, an organizer page cannot show a phone number and a CRM
 * page cannot show an event history, which is the disconnect Tom hit on
 * 4 Nov. Done one at a time, during the call, because a bulk name match
 * across 1,310 rows would be wrong often enough to poison the data it
 * was meant to connect.
 */
export async function linkProspect(
  organizerId: string,
  prospectId: string,
): Promise<{ ok: boolean; message: string }> {
  if (!(await isSignedIn())) return { ok: false, message: 'Sign in first.' };
  const [p] = await sql<{ name: string }[]>`
    select name from partner_prospects where id = ${prospectId}`;
  if (!p) return { ok: false, message: 'That record no longer exists.' };

  await sql`
    update partner_prospects set organizer_id = ${organizerId} where id = ${prospectId}`;
  revalidatePath(`/admin/organizers/${organizerId}`);
  return { ok: true, message: `Linked to ${p.name}.` };
}

export async function unlinkProspect(
  organizerId: string,
): Promise<{ ok: boolean; message: string }> {
  if (!(await isSignedIn())) return { ok: false, message: 'Sign in first.' };
  await sql`
    update partner_prospects set organizer_id = null where organizer_id = ${organizerId}`;
  revalidatePath(`/admin/organizers/${organizerId}`);
  return { ok: true, message: 'Unlinked. Neither record was deleted.' };
}

/** Edit the organizer's own details — the ones the public page shows. */
export async function updateOrganizer(
  id: string,
  fields: { name: string; contact_email: string; website_url: string },
): Promise<{ ok: boolean; message: string }> {
  if (!(await isSignedIn())) return { ok: false, message: 'Sign in first.' };

  const name = fields.name.trim();
  if (name.length < 2) return { ok: false, message: 'Give the organizer a name.' };

  const email = fields.contact_email.trim();
  if (email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    return { ok: false, message: 'That email address is not usable.' };
  }

  let website = fields.website_url.trim();
  if (website && !/^https?:\/\//i.test(website)) website = `https://${website}`;

  await sql`
    update organizers set
      name = ${name},
      contact_email = ${email || null},
      website_url = ${website || null},
      updated_at = now()
    where id = ${id}`;

  revalidatePath(`/admin/organizers/${id}`);
  revalidatePath('/admin/organizers');
  return { ok: true, message: 'Saved.' };
}

/**
 * Delete an organizer outright.
 *
 * Refused while they hold events. events.organizer_id is `on delete set
 * null`, so deleting one that has history would not fail - it would
 * quietly strip the organizer off every event they ever ran and leave
 * them attributed to nobody. Silent data loss dressed as a success
 * message.
 *
 * The honest options for a record with events are merge (it was a
 * duplicate) or edit (the name was wrong). Deleting is for the records
 * that hold nothing: the 2Legit Volleyballs and 692 NEXTs sitting at
 * zero events because an import created a row that was never used.
 */
export async function deleteOrganizer(
  id: string,
): Promise<{ ok: boolean; message: string }> {
  if (!(await isSignedIn())) return { ok: false, message: 'Sign in first.' };

  // Counted here rather than trusted from the page, which may have been
  // open while an event was attached in another tab.
  const [row] = await sql<{ name: string; events: number }[]>`
    select o.name,
           (select count(*)::int from events e where e.organizer_id = o.id) as events
      from organizers o where o.id = ${id}`;

  if (!row) return { ok: false, message: 'That organizer no longer exists.' };

  if (row.events > 0) {
    return {
      ok: false,
      message: `"${row.name}" has ${row.events} ${
        row.events === 1 ? 'event' : 'events'
      }. Deleting would leave ${
        row.events === 1 ? 'it' : 'them'
      } attributed to nobody. Merge into the right record instead, or rename this one.`,
    };
  }

  // organizer_venues cascades; a CRM row pointing here is set to null by
  // its own foreign key, so the prospect survives without the link.
  await sql`delete from organizers where id = ${id}`;

  revalidatePath('/admin/organizers');
  return { ok: true, message: `"${row.name}" deleted. It held no events.` };
}

/**
 * Fold one organizer into another: every event repointed, the loser gone.
 *
 * Repointing before deleting matters. events.organizer_id is `on delete
 * set null`, so deleting first would quietly orphan the very history
 * being rescued -- the events would survive with no organizer at all,
 * and nothing would show it had happened.
 */
export async function mergeOrganizers(
  loserId: string,
  winnerId: string,
): Promise<{ ok: boolean; message: string }> {
  if (!(await isSignedIn())) return { ok: false, message: 'Sign in first.' };
  if (loserId === winnerId) return { ok: false, message: 'Those are the same record.' };

  const [winner] = await sql<{ name: string }[]>`select name from organizers where id = ${winnerId}`;
  const [loser] = await sql<{ name: string }[]>`select name from organizers where id = ${loserId}`;
  if (!winner || !loser) return { ok: false, message: 'One of those records no longer exists.' };

  const moved = await sql`
    update events set organizer_id = ${winnerId} where organizer_id = ${loserId}`;

  // Keep any contact detail the loser had and the winner lacked, rather
  // than losing researched information to a tidy-up.
  await sql`
    update organizers w set
      contact_email = coalesce(w.contact_email, l.contact_email),
      website_url   = coalesce(w.website_url,   l.website_url)
    from organizers l
    where w.id = ${winnerId} and l.id = ${loserId}`;

  // Venue links follow as well, or merging would lose the knowledge of
  // where the absorbed record used to play.
  await sql`
    insert into organizer_venues (organizer_id, venue_id, is_home, source, note)
    select ${winnerId}, venue_id, false, source, note
      from organizer_venues where organizer_id = ${loserId}
    on conflict (organizer_id, venue_id) do nothing`;
  await sql`delete from organizer_venues where organizer_id = ${loserId}`;

  // Anything in the CRM pointing at the loser follows the events.
  await sql`
    update partner_prospects set organizer_id = ${winnerId}
     where organizer_id = ${loserId}`;

  // ---- after the merge of 9 Nov, the research has to follow too ----
  // organizer_private cascades on delete, so without this the losing
  // record's phone, notes, pipeline and call history would be destroyed
  // by a merge. Everything the winner lacks is taken from the loser;
  // nothing the winner already has is overwritten.
  await sql`
    insert into organizer_private (organizer_id)
    values (${winnerId})
    on conflict (organizer_id) do nothing`;

  await sql`
    update organizer_private w set
      category     = coalesce(w.category,     l.category),
      region       = coalesce(w.region,       l.region),
      address      = coalesce(w.address,      l.address),
      postal_code  = coalesce(w.postal_code,  l.postal_code),
      phone        = coalesce(w.phone,        l.phone),
      email        = coalesce(w.email,        l.email),
      website      = coalesce(w.website,      l.website),
      instagram    = coalesce(w.instagram,    l.instagram),
      facebook     = coalesce(w.facebook,     l.facebook),
      tiktok       = coalesce(w.tiktok,       l.tiktok),
      social       = coalesce(w.social,       l.social),
      courts       = coalesce(w.courts,       l.courts),
      offerings    = coalesce(w.offerings,    l.offerings),
      sports_basis = coalesce(w.sports_basis, l.sports_basis),
      booking_platform = coalesce(w.booking_platform, l.booking_platform),
      source_url   = coalesce(w.source_url,   l.source_url),
      source_file  = coalesce(w.source_file,  l.source_file),
      verified_at  = greatest(w.verified_at,  l.verified_at),
      last_contacted_at = greatest(w.last_contacted_at, l.last_contacted_at),
      next_action    = coalesce(w.next_action,    l.next_action),
      next_action_on = least(w.next_action_on,    l.next_action_on),
      status_note    = coalesce(w.status_note,    l.status_note),
      -- A sport confirmed on either record is confirmed. 'unknown' only
      -- survives if neither record knew.
      sports = case when w.sports <> 'unknown' then w.sports else l.sports end,
      -- Whichever record got further down the pipeline wins. Merging
      -- must never walk a relationship backwards.
      status = case
        when (case w.status when 'partner' then 4 when 'in_conversation' then 3
                            when 'contacted' then 2 when 'prospect' then 1 else 0 end)
           >= (case l.status when 'partner' then 4 when 'in_conversation' then 3
                            when 'contacted' then 2 when 'prospect' then 1 else 0 end)
        then w.status else l.status end,
      -- Notes are researched prose, so they are joined rather than one
      -- of them being dropped.
      notes = case
        when coalesce(w.notes,'') = '' then l.notes
        when coalesce(l.notes,'') = '' then w.notes
        else w.notes || E'\n\n--- merged from ' || ${loser.name} || E' ---\n' || l.notes end,
      updated_at = now()
    from organizer_private l
    where w.organizer_id = ${winnerId} and l.organizer_id = ${loserId}`;

  // Named people follow. is_primary is cleared on the way across,
  // because the winner may already have one and only one is allowed.
  await sql`
    update organizer_contacts set organizer_id = ${winnerId}, is_primary = false
     where organizer_id = ${loserId}`;
  // If that left the winner with contacts but no primary, promote the oldest.
  await sql`
    update organizer_contacts set is_primary = true
     where id = (select id from organizer_contacts
                  where organizer_id = ${winnerId}
                  order by created_at limit 1)
       and not exists (select 1 from organizer_contacts
                        where organizer_id = ${winnerId} and is_primary)`;

  // The call log follows the organization, not the record it was typed on.
  await sql`
    update prospect_interactions set organizer_id = ${winnerId}
     where organizer_id = ${loserId}`;

  await sql`delete from organizers where id = ${loserId}`;

  revalidatePath('/admin/organizers');
  revalidatePath('/admin/events');
  revalidatePath('/');

  const n = moved.count ?? 0;
  return {
    ok: true,
    message: `Merged "${loser.name}" into "${winner.name}" — ${n} ${n === 1 ? 'event' : 'events'} moved.`,
  };
}


/* ---------------------------------------------------------------------
 * The organizer list, after the merge of 9 Nov
 * -------------------------------------------------------------------*/
/**
 * One searchable, filtered, paged list over every organization.
 *
 * Before the merge this table held ~300 records and listOrganizers()
 * could load all of them, group them in memory and render the lot. After
 * the merge it holds ~1,580, so that approach renders an unusable page.
 * This is the replacement; listOrganizers() stays for the merge view,
 * which genuinely does want every record at once.
 *
 * LEFT join, not inner: saveEvent creates an organizer by slug and does
 * not create its organizer_private row, so a brand-new organizer typed
 * into the event form would silently vanish from an inner join -- the
 * exact failure this merge existed to end. Defaults below stand in until
 * the row is written.
 */
export async function listOrganizersPaged(f: OrganizerFilters) {
  if (!(await isSignedIn())) {
    return { rows: [] as OrganizerListRow[], total: 0, page: 1, lastPage: 1 };
  }

  const page = Math.max(1, f.page ?? 1);
  const offset = (page - 1) * PAGE_SIZE;

  const where = [sql`true`];

  if (f.q?.trim()) {
    const like = `%${f.q.trim()}%`;
    where.push(sql`(o.name ilike ${like} or o.city ilike ${like} or x.notes ilike ${like})`);
  }
  if (f.state) where.push(sql`o.state = ${f.state}`);
  if (f.status) where.push(sql`coalesce(x.status, 'prospect') = ${f.status}`);

  if (f.sports === 'volleyball') {
    // "Volleyball" means anything that touches it, including rows where
    // pickleball was simply never asked about. Excluding `volleyball?`
    // here would hide hundreds of real volleyball venues behind a
    // research artefact. Same rule as the CRM list.
    where.push(sql`coalesce(x.sports, 'unknown') in ('volleyball','both','volleyball?')`);
  } else if (f.sports) {
    where.push(sql`coalesce(x.sports, 'unknown') = ${f.sports}`);
  }

  if (f.contactable === 'yes') {
    where.push(sql`(coalesce(x.phone,'') <> '' or coalesce(x.email,'') <> ''
                    or coalesce(o.contact_email,'') <> '')`);
  } else if (f.contactable === 'no') {
    where.push(sql`coalesce(x.phone,'') = '' and coalesce(x.email,'') = ''
                   and coalesce(o.contact_email,'') = ''`);
  }

  if (f.events === 'yes') {
    where.push(sql`exists (select 1 from events e where e.organizer_id = o.id)`);
  } else if (f.events === 'no') {
    where.push(sql`not exists (select 1 from events e where e.organizer_id = o.id)`);
  }

  // '0' is a real answer (Disqualified), so this cannot test truthiness.
  if (f.confidence !== undefined && f.confidence !== '') {
    where.push(sql`x.confidence_score = ${Number(f.confidence)}`);
  }

  if (f.review === 'yes') where.push(sql`x.needs_review`);

  const clause = where.reduce((a, b) => sql`${a} and ${b}`);

  // Default: anything with a date on it first, because a commitment made
  // is the only thing here that can be missed. Then by pipeline stage,
  // then whoever has been quiet longest. Carried over from the CRM list.
  // 'confidence' instead leads with the most promising, for working a
  // call list top-down. Unjudged records sink either way -- null is not
  // a low score, it just has not been looked at.
  const order = f.sort === 'confidence'
    ? sql`order by x.confidence_score desc nulls last,
           (x.next_action_on is not null and x.next_action_on <= current_date + 7) desc,
           x.next_action_on asc nulls last,
           o.name`
    : sql`order by
           (x.next_action_on is not null and x.next_action_on <= current_date + 7) desc,
           x.next_action_on asc nulls last,
           case coalesce(x.status, 'prospect')
             when 'in_conversation' then 1 when 'partner' then 2
             when 'contacted' then 3 when 'prospect' then 4 else 5 end,
           x.last_contacted_at asc nulls first,
           o.name`;

  // The counts sit in the select list rather than in joins so Postgres
  // evaluates them only for the 50 rows that survive the limit.
  const rows = await sql<OrganizerListRow[]>`
    select o.id, o.slug, o.name, o.city, o.state, o.website_url,
           coalesce(x.status, 'prospect')   as status,
           x.category,
           coalesce(x.sports, 'unknown')    as sports,
           x.phone,
           coalesce(x.email, o.contact_email) as email,
           x.verified_at::text,
           x.last_contacted_at::text,
           x.next_action,
           x.next_action_on::text,
           coalesce(x.needs_review, false)  as needs_review,
           x.confidence_score,
           coalesce(x.origin, 'manual')     as origin,
           case when x.last_contacted_at is null then null
                else extract(day from now() - x.last_contacted_at)::int end as days_quiet,
           (select count(*)::int from prospect_interactions i where i.organizer_id = o.id) as touches,
           (select count(*)::int from events e where e.organizer_id = o.id)                as events,
           (select count(distinct e.venue_id)::int from events e where e.organizer_id = o.id) as venues,
           (select count(*)::int from organizer_contacts c where c.organizer_id = o.id)    as contacts
      from organizers o
      left join organizer_private x on x.organizer_id = o.id
     where ${clause}
     -- Anything with a date on it comes first, because a commitment made
     -- is the only thing here that can be missed. Then the ones already
     -- in play, then everything untouched. Carried over from the CRM
     -- list, which got this right.
     ${order}
     limit ${PAGE_SIZE} offset ${offset}
  `;

  const [{ total }] = await sql<{ total: number }[]>`
    select count(*)::int as total
      from organizers o
      left join organizer_private x on x.organizer_id = o.id
     where ${clause}
  `;

  return { rows: [...rows], total, page, lastPage: Math.max(1, Math.ceil(total / PAGE_SIZE)) };
}

/** The four numbers that answer "where am I" before any filtering. */
export async function organizerCounts() {
  if (!(await isSignedIn())) {
    return { total: 0, contactable: 0, working: 0, review: 0, with_events: 0 };
  }
  const [row] = await sql<{
    total: number; contactable: number; working: number;
    review: number; with_events: number;
  }[]>`
    select count(*)::int as total,
           count(*) filter (
             where coalesce(x.phone,'') <> '' or coalesce(x.email,'') <> ''
                or coalesce(o.contact_email,'') <> ''
           )::int as contactable,
           count(*) filter (
             where coalesce(x.status,'prospect') not in ('prospect','not_a_fit')
           )::int as working,
           count(*) filter (where coalesce(x.needs_review,false))::int as review,
           count(*) filter (
             where exists (select 1 from events e where e.organizer_id = o.id)
           )::int as with_events
      from organizers o
      left join organizer_private x on x.organizer_id = o.id
  `;
  return row;
}

/** States that actually appear, with counts, for the filter dropdown. */
export async function organizerStates() {
  if (!(await isSignedIn())) return [];
  const rows = await sql<{ state: string; n: number }[]>`
    select state, count(*)::int as n
      from organizers
     where state is not null
     group by state
     order by state
  `;
  return [...rows];
}


/* ---------------------------------------------------------------------
 * The organizer profile: one screen for one organization
 * -------------------------------------------------------------------*/

/** '' from a form input means "empty", which in the database is null. */
function orNull(v: string | undefined): string | null {
  const t = (v ?? '').trim();
  return t === '' ? null : t;
}

/** Everything one organization is: public record, private record, people. */
export async function organizerFull(id: string) {
  if (!(await isSignedIn())) return null;

  const [row] = await sql<Array<Record<string, unknown>>>`
    select o.id, o.slug, o.name, o.city, o.state, o.website_url, o.contact_email,
           coalesce(x.status, 'prospect')  as status,
           coalesce(x.sports, 'unknown')   as sports,
           x.category, x.address, x.postal_code, x.courts, x.offerings,
           x.booking_platform, x.phone, x.email,
           x.instagram, x.facebook, x.tiktok, x.social,
           x.status_note, x.next_action, x.next_action_on::text,
           x.notes, x.confidence_score, x.verified_at::text, x.last_contacted_at::text,
           x.legacy_status, coalesce(x.needs_review, false) as needs_review,
           coalesce(x.origin, 'manual') as origin
      from organizers o
      left join organizer_private x on x.organizer_id = o.id
     where o.id = ${id}`;
  if (!row) return null;

  const contacts = await sql<OrganizerContact[]>`
    select id, name, title, email, phone, notes, is_primary
      from organizer_contacts
     where organizer_id = ${id}
     order by is_primary desc, created_at`;

  return { row, contacts: [...contacts] };
}

/**
 * Save the whole profile.
 *
 * Writes the five public fields to `organizers` and the rest to
 * `organizer_private`, upserting the latter because an organizer created
 * by the event form has no private row yet.
 */
export async function saveOrganizerProfile(
  id: string,
  f: OrganizerProfileForm,
): Promise<{ ok: boolean; message: string }> {
  if (!(await isSignedIn())) return { ok: false, message: 'Sign in first.' };

  const name = f.name.trim();
  if (!name) return { ok: false, message: 'An organization needs a name.' };

  // organizers.state is guarded by a two-letter check constraint, so a
  // half-typed "Mis" has to be refused here rather than blow up as a
  // database error the form cannot explain.
  const state = orNull(f.state)?.toUpperCase() ?? null;
  if (state !== null && !/^[A-Z]{2}$/.test(state)) {
    return { ok: false, message: 'State must be the two-letter code, like MO.' };
  }

  if (!ORGANIZER_STATUSES.includes(f.status as (typeof ORGANIZER_STATUSES)[number])) {
    return { ok: false, message: 'That is not one of the five statuses.' };
  }

  // '' means not yet judged. 0 is a decision, so it must survive as 0.
  const raw = (f.confidence_score ?? '').trim();
  const score = raw === '' ? null : Number(raw);
  if (score !== null && (!Number.isInteger(score) || score < 0 || score > 5)) {
    return { ok: false, message: 'Confidence has to be one of the six steps.' };
  }

  const due = orNull(f.next_action_on);
  if (due !== null && !/^\d{4}-\d{2}-\d{2}$/.test(due)) {
    return { ok: false, message: 'The next-action date needs to be a real date.' };
  }

  await sql`
    update organizers set
      name          = ${name},
      city          = ${orNull(f.city)},
      state         = ${state},
      website_url   = ${orNull(f.website_url)},
      contact_email = ${orNull(f.contact_email)},
      updated_at    = now()
    where id = ${id}`;

  await sql`
    insert into organizer_private (
      organizer_id, category, sports, address, postal_code, courts, offerings,
      booking_platform, phone, email, instagram, facebook, tiktok,
      status, status_note, next_action, next_action_on, notes, confidence_score, origin
    ) values (
      ${id}, ${orNull(f.category)}, ${f.sports || 'unknown'}, ${orNull(f.address)},
      ${orNull(f.postal_code)}, ${orNull(f.courts)}, ${orNull(f.offerings)},
      ${orNull(f.booking_platform)}, ${orNull(f.phone)}, ${orNull(f.email)},
      ${orNull(f.instagram)}, ${orNull(f.facebook)}, ${orNull(f.tiktok)},
      ${f.status}, ${orNull(f.status_note)}, ${orNull(f.next_action)},
      ${due}, ${orNull(f.notes)}, ${score}, 'manual'
    )
    on conflict (organizer_id) do update set
      category = excluded.category, sports = excluded.sports,
      address = excluded.address, postal_code = excluded.postal_code,
      courts = excluded.courts, offerings = excluded.offerings,
      booking_platform = excluded.booking_platform,
      phone = excluded.phone, email = excluded.email,
      instagram = excluded.instagram, facebook = excluded.facebook,
      tiktok = excluded.tiktok,
      status = excluded.status, status_note = excluded.status_note,
      next_action = excluded.next_action, next_action_on = excluded.next_action_on,
      notes = excluded.notes,
      confidence_score = excluded.confidence_score,
      -- Saving the profile by hand IS the verification. Same rule the
      -- CRM form already used.
      verified_at = now(),
      updated_at = now()`;

  revalidatePath(`/admin/organizers/${id}`);
  revalidatePath('/admin/organizers');
  revalidatePath('/');
  return { ok: true, message: 'Saved and marked verified.' };
}

/** Add another person. The first one added becomes the primary. */
export async function addOrganizerContact(
  organizerId: string,
  f: {
    name: string; title?: string; email?: string; phone?: string;
    notes?: string; is_primary?: boolean;
  },
): Promise<{ ok: boolean; message: string }> {
  if (!(await isSignedIn())) return { ok: false, message: 'Sign in first.' };
  const name = f.name.trim();
  if (!name) return { ok: false, message: 'A contact needs a name.' };

  const [{ n }] = await sql<{ n: number }[]>`
    select count(*)::int as n from organizer_contacts where organizer_id = ${organizerId}`;

  // The first person added is the primary by default -- an organization
  // with contacts and nobody marked is a gap you would only notice on a
  // call. After that it is a deliberate choice on the form.
  const primary = f.is_primary === true || n === 0;

  // Only one primary is allowed, so the old one is stood down first;
  // setting the new one first would be rejected by the database.
  if (primary) {
    await sql`
      update organizer_contacts set is_primary = false
       where organizer_id = ${organizerId} and is_primary`;
  }

  await sql`
    insert into organizer_contacts (organizer_id, name, title, email, phone, notes, is_primary)
    values (${organizerId}, ${name}, ${orNull(f.title)}, ${orNull(f.email)},
            ${orNull(f.phone)}, ${orNull(f.notes)}, ${primary})`;

  revalidatePath(`/admin/organizers/${organizerId}`);
  return { ok: true, message: `${name} added${primary ? ' as primary contact' : ''}.` };
}

export async function saveOrganizerContact(
  contactId: string,
  f: { name: string; title?: string; email?: string; phone?: string; notes?: string },
): Promise<{ ok: boolean; message: string }> {
  if (!(await isSignedIn())) return { ok: false, message: 'Sign in first.' };
  const name = f.name.trim();
  if (!name) return { ok: false, message: 'A contact needs a name.' };

  const rows = await sql<{ organizer_id: string }[]>`
    update organizer_contacts set
      name = ${name}, title = ${orNull(f.title)}, email = ${orNull(f.email)},
      phone = ${orNull(f.phone)}, notes = ${orNull(f.notes)}, updated_at = now()
    where id = ${contactId}
    returning organizer_id`;
  if (rows.length === 0) return { ok: false, message: 'That contact no longer exists.' };

  revalidatePath(`/admin/organizers/${rows[0].organizer_id}`);
  return { ok: true, message: 'Saved.' };
}

export async function deleteOrganizerContact(
  contactId: string,
): Promise<{ ok: boolean; message: string }> {
  if (!(await isSignedIn())) return { ok: false, message: 'Sign in first.' };

  const rows = await sql<{ organizer_id: string; was_primary: boolean }[]>`
    delete from organizer_contacts where id = ${contactId}
    returning organizer_id, is_primary as was_primary`;
  if (rows.length === 0) return { ok: false, message: 'That contact no longer exists.' };

  // Never leave an organization with contacts but nobody marked primary.
  if (rows[0].was_primary) {
    await sql`
      update organizer_contacts set is_primary = true
       where id = (select id from organizer_contacts
                    where organizer_id = ${rows[0].organizer_id}
                    order by created_at limit 1)`;
  }

  revalidatePath(`/admin/organizers/${rows[0].organizer_id}`);
  return { ok: true, message: 'Contact removed.' };
}

/**
 * Promote someone to primary.
 *
 * Clears the old primary first: the database allows only one per
 * organization, so setting the new one first would be rejected.
 */
export async function makeContactPrimary(
  organizerId: string,
  contactId: string,
): Promise<{ ok: boolean; message: string }> {
  if (!(await isSignedIn())) return { ok: false, message: 'Sign in first.' };

  await sql`
    update organizer_contacts set is_primary = false
     where organizer_id = ${organizerId} and is_primary and id <> ${contactId}`;
  await sql`
    update organizer_contacts set is_primary = true
     where id = ${contactId} and organizer_id = ${organizerId}`;

  revalidatePath(`/admin/organizers/${organizerId}`);
  return { ok: true, message: 'Primary contact changed.' };
}
