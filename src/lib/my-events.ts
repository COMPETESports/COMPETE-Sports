import { sql } from './db';
import { today } from './dates';
import type { DiscoveryEvent } from './types';

/**
 * An account's own events, split into the three lists a player thinks in:
 * saved, registered-and-coming-up, and history.
 *
 * Which list an event lands in is a function of its relation AND its date,
 * so a registered event moves into history by itself the day after it
 * ends. There is no nightly job to fall behind, and nothing to reconcile
 * if one does.
 */

export type EventRelation = 'saved' | 'registered' | 'attended';

export interface MyEvent extends DiscoveryEvent {
  relation: EventRelation;
  note: string | null;
  marked_at: string;
}

/**
 * Forces the two date columns to YYYY-MM-DD strings.
 *
 * The Postgres driver hands back a `date` column as either a string or a
 * JavaScript Date depending on how the module was loaded, and the difference
 * is vicious: comparing a Date against '2026-09-26' with `>=` does not throw,
 * it silently evaluates false, so every list quietly comes back empty. The
 * rest of the codebase types these as strings, so they are made strings here
 * once, at the edge, rather than guarded at every use.
 */
function asDateStrings(row: MyEvent): MyEvent {
  const text = (value: string | Date | null): string | null => {
    if (value === null) return null;
    return typeof value === 'string' ? value.slice(0, 10) : value.toISOString().slice(0, 10);
  };
  return {
    ...row,
    starts_on: text(row.starts_on)!,
    ends_on: text(row.ends_on),
  };
}

export interface MyEventLists {
  saved: MyEvent[];
  upcoming: MyEvent[];
  history: MyEvent[];
}

export async function getMyEvents(accountId: string): Promise<MyEventLists> {
  const day = today();

  // Written out in full rather than composed from a shared fragment: a
  // postgres.js template is a pending query, not a string, and reusing one
  // across calls is a trap worth avoiding for the sake of four saved lines.
  const raw = await sql<MyEvent[]>`
    select d.*, ae.relation, ae.note, ae.created_at::text as marked_at
      from account_events ae
      join event_discovery d on d.id = ae.event_id
     where ae.account_id = ${accountId}
       and d.status in ('approved','cancelled')
     order by d.starts_on asc
  `;

  const rows = raw.map(asDateStrings);
  const ends = (e: MyEvent) => e.ends_on ?? e.starts_on;

  return {
    // Saved: still to come, not yet registered for.
    saved: rows.filter((e) => e.relation === 'saved' && ends(e) >= day),
    // Registered and still in the future — the list you check on a Friday.
    upcoming: rows.filter((e) => e.relation === 'registered' && ends(e) >= day),
    // History: anything registered or marked attended that has finished,
    // newest first, because recent history is the interesting end.
    history: rows
      .filter((e) => e.relation !== 'saved' && ends(e) < day)
      .reverse(),
  };
}

/** The relations for a set of events, for rendering save buttons in a list. */
export async function getRelations(
  accountId: string,
  eventIds: string[],
): Promise<Map<string, EventRelation>> {
  if (!eventIds.length) return new Map();
  const rows = await sql<{ event_id: string; relation: EventRelation }[]>`
    select event_id, relation from account_events
     where account_id = ${accountId} and event_id = any(${eventIds}::uuid[])
  `;
  return new Map(rows.map((r) => [r.event_id, r.relation]));
}

export async function getRelation(
  accountId: string,
  eventId: string,
): Promise<EventRelation | null> {
  const rows = await sql<{ relation: EventRelation }[]>`
    select relation from account_events
     where account_id = ${accountId} and event_id = ${eventId} limit 1
  `;
  return rows[0]?.relation ?? null;
}

/** Sets or clears an account's relationship to one event. */
export async function setRelation(
  accountId: string,
  eventId: string,
  relation: EventRelation | null,
): Promise<void> {
  if (!relation) {
    await sql`
      delete from account_events
       where account_id = ${accountId} and event_id = ${eventId}
    `;
    return;
  }

  await sql`
    insert into account_events (account_id, event_id, relation)
    values (${accountId}, ${eventId}, ${relation})
    on conflict (account_id, event_id)
      do update set relation = excluded.relation, updated_at = now()
  `;
}

/** How many accounts have saved or registered for an event — organizer signal. */
export async function getInterestCount(eventId: string): Promise<number> {
  const rows = await sql<{ n: number }[]>`
    select count(*)::int as n from account_events
     where event_id = ${eventId} and relation in ('saved','registered')
  `;
  return rows[0]?.n ?? 0;
}
