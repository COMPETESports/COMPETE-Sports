import Link from 'next/link';
import { redirect } from 'next/navigation';
import { isSignedIn } from '@/lib/auth';
import { listVenues, venueSiblings } from '@/lib/venues-admin';
import { MergeVenue } from '@/components/admin/MergeVenue';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Venues', robots: { index: false, follow: false } };

/**
 * Every venue, with likely duplicates sitting together and merge in place.
 *
 * The match key is scoped to the city, so two gyms called "The Sandbox"
 * in different states are never proposed as one place.
 */
export default async function VenuesPage() {
  if (!(await isSignedIn())) redirect('/admin');

  const rows = await listVenues();

  const clusters = new Map<string, typeof rows>();
  for (const r of rows) {
    const list = clusters.get(r.match_key) ?? [];
    list.push(r);
    clusters.set(r.match_key, list);
  }
  const dupes = [...clusters.values()].filter((c) => c.length > 1);
  const stranded = dupes.reduce((n, c) => n + c.slice(1).reduce((m, r) => m + r.events, 0), 0);
  const vague = rows.filter((r) => r.geo_precision !== 'exact').length;

  // Siblings for the duplicated records only - one query per cluster
  // rather than per venue, because most venues have no twin.
  const siblingsFor = new Map<string, Awaited<ReturnType<typeof venueSiblings>>>();
  for (const c of dupes) {
    siblingsFor.set(c[0].id, await venueSiblings(c[0].id));
  }

  return (
    <div className="wrap py-8">
      <Link href="/admin" className="t-kicker text-[color:var(--muted)] hover:text-[color:var(--surf-ink)]">
        ← Admin
      </Link>
      <h1 className="t-display mt-3 text-2xl sm:text-3xl">Venues</h1>
      <p className="mt-2 max-w-2xl text-sm text-[color:var(--muted)]">
        {rows.length} records. Duplicates are grouped by name and city — the same
        gym entered twice is two map pins, and a radius search finds whichever
        one it finds.
      </p>

      {dupes.length > 0 && (
        <p className="panel tone-warn mt-4 p-4 text-sm">
          <strong>{dupes.length} {dupes.length === 1 ? 'place appears' : 'places appear'} more than once</strong>
          , with {stranded} {stranded === 1 ? 'event' : 'events'} on the spare records.
        </p>
      )}

      {vague > 0 && (
        <div className="panel mt-3 p-4 text-sm">
          <p className="text-[color:var(--muted)]">
            {vague} of {rows.length} venues sit on an approximate pin — placed from a
            ZIP code or a city rather than a street address.
          </p>
          <Link href="/admin/venues/pins" className="btn-primary mt-3 !py-2 !text-xs">
            Fix them with Google →
          </Link>
        </div>
      )}

      <ul className="mt-6 grid gap-2">
        {[...clusters.entries()].map(([key, group]) => {
          const isDupe = group.length > 1;
          return (
            <li
              key={key}
              className={isDupe ? 'rounded-2xl border p-3' : ''}
              style={isDupe ? { borderColor: 'color-mix(in srgb, var(--beach) 40%, transparent)' } : undefined}
            >
              {group.map((v) => (
                <div key={v.id} className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 px-1 py-1.5">
                  <span className="t-head min-w-0 text-sm">{v.name}</span>
                  <span className="t-mono text-[11px] text-[color:var(--muted)]">
                    {[v.address_line, `${v.city}, ${v.state}`, v.postal_code].filter(Boolean).join(' · ')}
                    {' — '}{v.events} {v.events === 1 ? 'event' : 'events'}
                    {v.geo_precision !== 'exact' && (
                      <span style={{ color: 'var(--beach)' }}> · {v.geo_precision} pin</span>
                    )}
                  </span>
                </div>
              ))}
              {isDupe && (
                <MergeVenue
                  winnerId={group[0].id}
                  winnerName={group[0].name}
                  siblings={siblingsFor.get(group[0].id) ?? []}
                />
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
