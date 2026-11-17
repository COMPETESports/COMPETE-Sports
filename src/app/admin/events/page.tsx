import Link from 'next/link';
import { redirect } from 'next/navigation';
import { isSignedIn } from '@/lib/auth';
import { sql } from '@/lib/db';
import { signOut } from '@/app/admin/actions';
import { StatusControl } from '@/components/admin/StatusControl';
import { FeatureToggle } from '@/components/admin/FeatureToggle';
import { formatDate } from '@/lib/format';
import { AutoSubmitSelect } from '@/components/admin/AutoSubmitSelect';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Events', robots: { index: false, follow: false } };

interface Row {
  id: string;
  slug: string;
  name: string;
  starts_on: string | Date;
  status: string;
  city: string | null;
  state: string | null;
  organizer_name: string | null;
  has_coords: boolean;
  featured: boolean;
  /** Days until an open play series' last session; null otherwise. */
  ends_in: number | null;
}

export default async function AdminEventsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; q?: string; sort?: string; dir?: string }>;
}) {
  if (!(await isSignedIn())) redirect('/admin');

  // Live by default (Tom, 17 Nov): signing in lands on what players can
  // see right now. "All" is one click away in the Status filter.
  const { status = 'live', q = '', sort: sortRaw = 'date', dir: dirRaw = 'asc' } = await searchParams;
  const sort = ['name', 'organizer', 'date', 'where'].includes(sortRaw) ? sortRaw : 'date';
  const dir = dirRaw === 'desc' ? 'desc' : 'asc';
  const search = q.trim();

  // "Approved" is not the same as "on the site right now", which is what
  // Tom actually wanted to see. An approved event from 2023 is approved
  // and long gone. Live means approved AND still to come - the same two
  // conditions the public site applies - so the Live count should match
  // the number of events a player sees. If the two ever disagree,
  // something is wrong, which makes this a check as well as a filter.
  // A league or open play series is live until its LAST session, the same
  // rule search uses since 10 Nov -- so Live here matches what players see.
  // It used to test the start date only, so a running series showed as past.
  // Still running until its last day: multi-day tournaments, leagues and open
  // play included. The same rule archives finished events each night
  // (supabase/024_auto_archive.sql), so the two never disagree.
  const isUpcoming = sql`(coalesce(e.ends_on, e.starts_on) >= current_date)`;

  // Click a column heading to sort by it; click again to reverse (17 Nov).
  const orderBy = {
    name: sql`lower(e.name)`,
    organizer: sql`lower(coalesce(o.name, 'zzzz'))`,
    date: sql`e.starts_on`,
    where: sql`coalesce(v.state, 'zz'), coalesce(v.city, 'zz')`,
  }[sort]!;
  const direction = dir === 'desc' ? sql`desc` : sql`asc`;

  const where = (s: string) =>
    s === 'live'
      ? sql`e.status = 'approved' and ${isUpcoming}`
      : s === 'all'
          ? sql`true`
          : sql`e.status = ${s}`;

  const rows = await sql<Row[]>`
    select e.id, e.slug, e.name, e.starts_on, e.status,
           v.city, v.state, o.name as organizer_name,
           (v.latitude is not null) as has_coords, e.featured,
           case when e.event_type = 'open_play' and e.status = 'approved'
                then (coalesce(e.ends_on, e.starts_on) - current_date)::int end as ends_in
    from events e
    left join venues v on v.id = e.venue_id
    left join organizers o on o.id = e.organizer_id
    where ${where(status)}
      and (${search} = '' or e.name ilike ${'%' + search + '%'} or v.city ilike ${'%' + search + '%'}
           or o.name ilike ${'%' + search + '%'})
    order by ${orderBy} ${direction}, e.starts_on asc
    limit 300`;

  const [tally] = await sql<
    { all: number; live: number; draft: number;
      approved: number; cancelled: number; archived: number }[]
  >`
    select
      count(*)::int as all,
      count(*) filter (where status = 'approved' and ${isUpcoming})::int as live,
      count(*) filter (where status = 'draft')::int     as draft,
      count(*) filter (where status = 'approved')::int  as approved,
      count(*) filter (where status = 'cancelled')::int as cancelled,
      count(*) filter (where status = 'archived')::int  as archived
    from events e`;
  const countFor = (s: string) => (tally as unknown as Record<string, number>)[s] ?? 0;

  const missingCoords = rows.filter((r) => !r.has_coords).length;

  return (
    <div className="wrap py-10">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="t-kicker text-[color:var(--surf-ink)]">COMPETE staff</p>
          <h1 className="t-head mt-1 text-2xl">Events</h1>
        </div>
        <div className="flex gap-2">
          <Link href="/admin/events/new" className="btn-primary">
            + New event
          </Link>
          <Link href="/admin/organizers" className="btn-ghost">
            Organizers
          </Link>
          <Link href="/admin/compliance" className="btn-ghost">
            Age gate
          </Link>
          <form action={signOut}>
            <button type="submit" className="btn-ghost">
              Sign out
            </button>
          </form>
        </div>
      </div>

      {missingCoords > 0 && (
        <p className="panel tone-warn mt-5 p-3 text-sm">
          {missingCoords} of these have no map coordinates and will not appear in
          radius search. Open one and re-save it to geocode the venue.
        </p>
      )}

      <form method="get" className="mt-6 flex flex-wrap items-end gap-2">
        <div className="min-w-[200px] flex-1">
          <label className="label" htmlFor="q">
            Search
          </label>
          <input
            id="q"
            name="q"
            defaultValue={search}
            placeholder="Event, organizer or city"
            className="field"
          />
        </div>
        <div>
          <label className="label" htmlFor="status">
            Status
          </label>
          {/* Changing the status filter applies it at once (17 Nov) -- no
              Filter button to press. */}
          <AutoSubmitSelect id="status" name="status" defaultValue={status} className="field">
            {[
              ['all', 'All'],
              ['live', 'Live on the site'],
              ['draft', 'Draft'],
              ['cancelled', 'Cancelled'],
              ['archived', 'Archived'],
            ].map(([s, label]) => (
              <option key={s} value={s}>
                {label} ({countFor(s)})
              </option>
            ))}
          </AutoSubmitSelect>
        </div>
        <input type="hidden" name="sort" value={sort} />
        <input type="hidden" name="dir" value={dir} />
        <button type="submit" className="btn-ghost">
          Search
        </button>
      </form>

      <div className="panel mt-5 overflow-x-auto">
        <table className="w-full min-w-[720px] text-left text-sm">
          <thead>
            <tr className="border-b-2 border-[color:var(--line)]">
              {(
                [
                  ['Event', 'name'],
                  ['Organizer', 'organizer'],
                  ['Date', 'date'],
                  ['Where', 'where'],
                  ['Status', null],
                  ['Homepage', null],
                  ['', null],
                ] as const
              ).map(([h, key]) => {
                if (!key) {
                  return (
                    <th key={h || 'actions'} className="t-kicker px-4 py-3 text-[color:var(--faint)]">
                      {h}
                    </th>
                  );
                }
                const active = sort === key;
                const nextDir = active && dir === 'asc' ? 'desc' : 'asc';
                const qs = new URLSearchParams({ status, sort: key, dir: nextDir, ...(search ? { q: search } : {}) });
                return (
                  <th key={h} className="t-kicker px-4 py-3" aria-sort={active ? (dir === 'asc' ? 'ascending' : 'descending') : 'none'}>
                    <Link
                      href={`/admin/events?${qs.toString()}`}
                      className={active ? 'text-[color:var(--surf-ink)]' : 'text-[color:var(--faint)] hover:text-[color:var(--ink)]'}
                    >
                      {h} {active ? (dir === 'asc' ? '▲' : '▼') : '↕'}
                    </Link>
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const iso =
                row.starts_on instanceof Date
                  ? row.starts_on.toISOString().slice(0, 10)
                  : String(row.starts_on).slice(0, 10);
              return (
                <tr key={row.id} className="border-b border-[color:var(--line)]">
                  <td className="px-4 py-3">
                    <Link
                      href={`/admin/events/${row.id}`}
                    target="_blank"
                    rel="noopener"
                      className="font-medium hover:text-[color:var(--surf-ink)]"
                    >
                      {row.name}
                    </Link>
                    {!row.has_coords && (
                      <span className="chip-warn ml-2">
                        no map
                      </span>
                    )}
                    {/* Two weeks' warning before an open play series runs
                        out (Tom, 15 Nov), so renewing is a call to the
                        organizer, not a listing that quietly vanished. */}
                    {row.ends_in !== null && row.ends_in >= 0 && row.ends_in <= 14 && (
                      <Link href={`/admin/events/new?from=${row.id}&renew=1`} className="chip-warn ml-2">
                        {row.ends_in === 0 ? 'ends today' : `ends in ${row.ends_in} ${row.ends_in === 1 ? 'day' : 'days'}`} — renew
                      </Link>
                    )}
                  </td>
                  <td className="px-4 py-3 text-[color:var(--muted)]">
                    {row.organizer_name ?? '—'}
                  </td>
                  <td className="t-mono px-4 py-3 text-xs text-[color:var(--muted)]">
                    {`${formatDate(iso, 'short')}, ${iso.slice(0, 4)}`}
                  </td>
                  <td className="px-4 py-3 text-[color:var(--muted)]">
                    {[row.city, row.state].filter(Boolean).join(', ') || '—'}
                  </td>
                  <td className="px-4 py-3">
                    <StatusControl id={row.id} status={row.status} />
                  </td>
                  <td className="px-4 py-3">
                    {row.status === 'approved' ? (
                      <FeatureToggle id={row.id} featured={row.featured} />
                    ) : (
                      <span className="t-mono text-[11px] text-[color:var(--faint)]">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <span className="flex justify-end gap-3">
                      <Link
                        href={`/admin/events/new?from=${row.id}`}
                        className="t-mono text-[11px] uppercase tracking-wider text-[color:var(--faint)] hover:text-[color:var(--surf-ink)]"
                      >
                        Duplicate
                      </Link>
                      {row.status === 'approved' && (
                        <Link
                          href={`/events/${row.slug}`}
                          className="t-mono text-[11px] uppercase tracking-wider text-[color:var(--faint)] hover:text-[color:var(--surf-ink)]"
                        >
                          View ↗
                        </Link>
                      )}
                    </span>
                  </td>
                </tr>
              );
            })}
            {rows.length === 0 && (
              <tr>
                <td colSpan={7} className="px-4 py-10 text-center text-[color:var(--faint)]">
                  Nothing matches that filter.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
