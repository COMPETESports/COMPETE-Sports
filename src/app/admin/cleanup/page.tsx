import Link from 'next/link';
import { redirect } from 'next/navigation';
import { isSignedIn } from '@/lib/auth';
import { sql } from '@/lib/db';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Cleanup', robots: { index: false, follow: false } };

/**
 * Events with something missing that makes them invisible or wrong.
 *
 * Temporary by design. Tom, 4 Nov: "we can end up removing the cleanup
 * page once I'm finished with that." Each section empties itself as the
 * problem is fixed, and when they are all empty the page says so and can
 * be deleted. A permanent dashboard of problems becomes wallpaper; a
 * page that can finish gets finished.
 *
 * Ordered within each section by how much is at stake - upcoming events
 * first, because a 2027 event nobody can find is a real loss and a 2022
 * one is a footnote.
 */

interface Gap {
  id: string;
  name: string;
  starts_on: string;
  status: string;
  organizer: string | null;
  venue: string | null;
  registration_deadline: string | null;
  upcoming: boolean;
}

const byStake = (rows: Gap[]) =>
  [...rows].sort((a, b) => Number(b.upcoming) - Number(a.upcoming) || b.starts_on.localeCompare(a.starts_on));

async function gaps() {
  const common = sql`
    e.id, e.name, e.starts_on::text, e.status,
    o.name as organizer, v.name as venue,
    e.registration_deadline::text,
    (e.starts_on >= current_date) as upcoming`;

  const [noVenue, noOrganizer, badDeadline, noBrackets] = await Promise.all([
    sql<Gap[]>`select ${common} from events e
       left join organizers o on o.id = e.organizer_id
       left join venues v on v.id = e.venue_id
      where e.venue_id is null`,
    sql<Gap[]>`select ${common} from events e
       left join organizers o on o.id = e.organizer_id
       left join venues v on v.id = e.venue_id
      where e.organizer_id is null`,
    sql<Gap[]>`select ${common} from events e
       left join organizers o on o.id = e.organizer_id
       left join venues v on v.id = e.venue_id
      where e.registration_deadline is not null
        and e.registration_deadline > e.starts_on`,
    sql<Gap[]>`select ${common} from events e
       left join organizers o on o.id = e.organizer_id
       left join venues v on v.id = e.venue_id
      where not exists (select 1 from event_brackets b where b.event_id = e.id)`,
  ]);

  return {
    noVenue: byStake([...noVenue]),
    noOrganizer: byStake([...noOrganizer]),
    badDeadline: byStake([...badDeadline]),
    noBrackets: byStake([...noBrackets]),
  };
}

function Section({
  title,
  why,
  rows,
}: {
  title: string;
  why: string;
  rows: Gap[];
}) {
  const upcoming = rows.filter((r) => r.upcoming).length;

  return (
    <section className="panel mt-5 p-5">
      <header className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="t-head text-base">{title}</h2>
        <span className="t-mono text-[11px] text-[color:var(--muted)]">
          {rows.length} {rows.length === 1 ? 'event' : 'events'}
          {upcoming > 0 && (
            <span style={{ color: 'var(--beach)' }}> · {upcoming} upcoming</span>
          )}
        </span>
      </header>
      <p className="mt-1 text-sm text-[color:var(--muted)]">{why}</p>

      {rows.length === 0 ? (
        <p className="mt-3 text-sm" style={{ color: 'var(--grass)' }}>
          Nothing here. Done.
        </p>
      ) : (
        <ul className="mt-3 grid gap-1">
          {rows.slice(0, 40).map((e) => (
            <li key={e.id}>
              <Link
                href={`/admin/events/${e.id}`}
                target="_blank"
                rel="noopener"
                className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-0.5 rounded-lg px-3 py-2 hover:bg-[color:var(--raised)]"
              >
                <span className="min-w-0 text-sm">
                  {e.upcoming && <span style={{ color: 'var(--beach)' }}>● </span>}
                  {e.name}
                </span>
                <span className="t-mono text-[11px] text-[color:var(--muted)]">
                  {e.starts_on}
                  {e.registration_deadline && ` · closes ${e.registration_deadline}`}
                  {e.organizer && ` · ${e.organizer}`}
                  {e.venue && ` · ${e.venue}`}
                  {` · ${e.status}`}
                </span>
              </Link>
            </li>
          ))}
          {rows.length > 40 && (
            <li className="t-mono px-3 py-2 text-[11px] text-[color:var(--faint)]">
              …and {rows.length - 40} more. Fix these first and reload.
            </li>
          )}
        </ul>
      )}
    </section>
  );
}

export default async function CleanupPage() {
  if (!(await isSignedIn())) redirect('/admin');

  const g = await gaps();
  const total = g.noVenue.length + g.noOrganizer.length + g.badDeadline.length + g.noBrackets.length;

  return (
    <div className="wrap max-w-3xl py-8">
      <Link href="/admin/events" className="t-kicker text-[color:var(--muted)] hover:text-[color:var(--surf-ink)]">
        ← Events
      </Link>
      <h1 className="t-display mt-3 text-2xl sm:text-3xl">Cleanup</h1>
      <p className="mt-2 max-w-2xl text-sm text-[color:var(--muted)]">
        Events with something missing that makes them invisible or wrong.
        Each one opens in its own tab. <strong>A dot means it has not happened yet</strong> —
        those are the ones that cost you something.
      </p>

      {total === 0 ? (
        <p className="panel tone-good mt-6 p-5">
          <strong className="t-head">Every section is empty.</strong> Nothing left
          to clean up — this page has done its job and can be deleted.
        </p>
      ) : (
        <p className="panel tone-warn mt-4 p-4 text-sm">
          {total} {total === 1 ? 'problem' : 'problems'} across four checks. This
          page is meant to be finished and then removed, not watched forever.
        </p>
      )}

      <Section
        title="No venue"
        why="These cannot appear in any location search, which is most of how players find anything. A player searching their own city will never see them."
        rows={g.noVenue}
      />
      <Section
        title="No organizer"
        why="Nobody to attribute them to, and they are missing from the organizer page that the whole partner pitch depends on."
        rows={g.noOrganizer}
      />
      <Section
        title="Registration closes after the event starts"
        why="Came in with the 2022-24 import. Saving now refuses this, so the list can only shrink."
        rows={g.badDeadline}
      />
      <Section
        title="No brackets"
        why="Invisible to every surface, format, gender and division filter. The event exists but answers no question a player asks."
        rows={g.noBrackets}
      />
    </div>
  );
}
