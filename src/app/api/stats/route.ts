import { sql } from '@/lib/db';
import { today } from '@/lib/dates';

export const dynamic = 'force-dynamic';

/**
 * Public counts for the build-progress page (Tom, 22 Nov 2026): read at
 * the start and end of every session so "What's in it right now" is exact.
 *
 * Totals only -- nothing here names an organizer, venue, player or event,
 * and nothing about accounts. The same counts are already visible in
 * aggregate on the homepage and /organizers.
 */
export async function GET() {
  const t = today();
  const [row] = await sql<Record<string, number>[]>`
    select
      count(*) filter (where status = 'approved'
                         and coalesce(ends_on, starts_on) >= ${t}::date)::int          as upcoming,
      count(distinct v.state) filter (where e.status = 'approved'
                         and coalesce(e.ends_on, e.starts_on) >= ${t}::date)::int       as upcoming_states,
      count(*) filter (where status in ('approved','archived'))::int                     as listed_all_time,
      count(*) filter (where status in ('approved','archived')
                         and extract(year from starts_on) = 2027)::int                   as listed_2027,
      count(*) filter (where status = 'pending')::int                                    as awaiting_review
    from events e left join venues v on v.id = e.venue_id`;
  const [more] = await sql<Record<string, number>[]>`
    select
      (select count(*)::int from organizers)                                 as organizations,
      (select count(distinct organizer_id)::int from events
        where status in ('approved','archived'))                             as organizations_listed,
      (select count(*)::int from venues)                                     as venues,
      (select count(*)::int from venues where geo_precision = 'exact')       as venues_exact_pin,
      (select count(*)::int from event_brackets)                             as brackets`;

  return Response.json(
    { as_of: new Date().toISOString(), today_central: t, ...row, ...more },
    { headers: { 'Cache-Control': 'no-store' } },
  );
}
