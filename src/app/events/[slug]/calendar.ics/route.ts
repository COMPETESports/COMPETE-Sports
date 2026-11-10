import { sql } from '@/lib/db';
import { getEventBySlug, getLeagueSchedule } from '@/lib/queries';
import { buildIcs } from '@/lib/calendar';

/**
 * Add to Calendar -- the .ics file.
 *
 * A tournament gets one all-day entry. A league gets its whole season, one
 * entry per night it plays (10 Nov 2026). What goes in the file is built in
 * src/lib/calendar.ts, which is unit-tested; this route only loads.
 *
 * The same address is the FEED that Google, Apple and Outlook subscribe to
 * for a league, so it is served inline by default -- a subscribing calendar
 * reads it as data. `?download=1` asks the browser to save it as a file.
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params;
  const event = await getEventBySlug(slug);
  if (!event) return new Response('Not found', { status: 404 });

  const isLeague = event.event_type === 'league';
  const [schedule, timing] = await Promise.all([
    isLeague ? getLeagueSchedule(event.id) : Promise.resolve([]),
    sql<{ end_time: string | null }[]>`select end_time from events where id = ${event.id}`,
  ]);

  const body = buildIcs({
    event,
    siteUrl: process.env.NEXT_PUBLIC_SITE_URL ?? 'https://joincompete.com',
    schedule,
    endTime: timing[0]?.end_time ?? null,
  });

  const download = new URL(request.url).searchParams.get('download') === '1';

  return new Response(body, {
    headers: {
      'Content-Type': 'text/calendar; charset=utf-8',
      'Content-Disposition': `${download ? 'attachment' : 'inline'}; filename="${event.slug}.ics"`,
      // An hour, not a day: a subscribed league calendar should see a
      // cancelled night the same evening.
      'Cache-Control': 'public, max-age=3600',
    },
  });
}
