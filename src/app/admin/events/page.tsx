import Link from 'next/link';
import { redirect } from 'next/navigation';
import { isSignedIn } from '@/lib/auth';
import { sql } from '@/lib/db';
import { signOut } from '@/app/admin/actions';
import { StatusControl } from '@/components/admin/StatusControl';
import { FeatureToggle } from '@/components/admin/FeatureToggle';
import { formatDate } from '@/lib/format';

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
  has_coords: boolean;
  featured: boolean;
}

export default async function AdminEventsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; q?: string }>;
}) {
  if (!(await isSignedIn())) redirect('/admin');

  const { status = 'all', q = '' } = await searchParams;
  const search = q.trim();

  // "Approved" is not the same as "on the site right now", which is what
  // Tom actually wanted to see. An approved event from 2023 is approved
  // and long gone. Live means approved AND still to come - the same two
  // conditions the public site applies - so the Live count should match
  // the number of events a player sees. If the two ever disagree,
  // something is wrong, which makes this a check as well as a filter.
  const where = (s: string) =>
    s === 'live'
      ? sql`e.status = 'approved' and e.starts_on >= current_date`
      : s === 'past'
        ? sql`e.status = 'approved' and e.starts_on < current_date`
        : s === 'all'
          ? sql`true`
          : sql`e.status = ${s}`;

  const rows = await sql<Row[]>`
    select e.id, e.slug, e.name, e.starts_on, e.status,
           v.city, v.state, (v.latitude is not null) as has_coords, e.featured
    from events e
    left join venues v on v.id = e.venue_id
    where ${where(status)}
      and (${search} = '' or e.name ilike ${'%' + search + '%'} or v.city ilike ${'%' + search + '%'})
    order by e.starts_on asc
    limit 300`;

  const [tally] = await sql<
    { all: number; live: number; past: number; draft: number;
      approved: number; cancelled: number; archived: number }[]
  >`
    select
      count(*)::int as all,
      count(*) filter (where status = 'approved' and starts_on >= current_date)::int as live,
      count(*) filter (where status = 'approved' and starts_on <  current_date)::int as past,
      count(*) filter (where status = 'draft')::int     as draft,
      count(*) filter (where status = 'approved')::int  as approved,
      count(*) filter (where status = 'cancelled')::int as cancelled,
      count(*) filter (where status = 'archived')::int  as archived
    from events`;
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
          <Link href="/admin/crm" className="btn-ghost">
            Partners
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
            placeholder="Event name or city"
            className="field"
          />
        </div>
        <div>
          <label className="label" htmlFor="status">
            Status
          </label>
          <select id="status" name="status" defaultValue={status} className="field">
            {[
              ['all', 'All'],
              ['live', 'Live on the site'],
              ['draft', 'Draft'],
              ['past', 'Past'],
              ['approved', 'Approved (any date)'],
              ['cancelled', 'Cancelled'],
              ['archived', 'Archived'],
            ].map(([s, label]) => (
              <option key={s} value={s}>
                {label} ({countFor(s)})
              </option>
            ))}
          </select>
        </div>
        <button type="submit" className="btn-ghost">
          Filter
        </button>
      </form>

      <div className="panel mt-5 overflow-x-auto">
        <table className="w-full min-w-[720px] text-left text-sm">
          <thead>
            <tr className="border-b-2 border-[color:var(--line)]">
              {['Event', 'Date', 'Where', 'Status', 'Homepage', ''].map((h) => (
                <th key={h} className="t-kicker px-4 py-3 text-[color:var(--faint)]">
                  {h}
                </th>
              ))}
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
                      className="font-medium hover:text-[color:var(--surf-ink)]"
                    >
                      {row.name}
                    </Link>
                    {!row.has_coords && (
                      <span className="chip-warn ml-2">
                        no map
                      </span>
                    )}
                  </td>
                  <td className="t-mono px-4 py-3 text-xs text-[color:var(--muted)]">
                    {formatDate(iso, 'short')}
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
                <td colSpan={6} className="px-4 py-10 text-center text-[color:var(--faint)]">
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
