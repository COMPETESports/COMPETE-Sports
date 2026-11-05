import Link from 'next/link';
import { redirect } from 'next/navigation';
import { isSignedIn } from '@/lib/auth';
import { listOrganizers } from '@/lib/organizers-admin';
import { OrganizerList } from '@/components/admin/OrganizerList';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Organizers', robots: { index: false, follow: false } };

/**
 * Every organizer, with likely duplicates sitting together.
 *
 * Sorted by a match key rather than by name, so "Angry Dragon", "Angry
 * Dragons" and "Angry Dragons Volleyball" are adjacent instead of
 * scattered through the alphabet. A cluster of more than one is the
 * thing to go and fix.
 */
export default async function OrganizersPage() {
  if (!(await isSignedIn())) redirect('/admin');

  const rows = await listOrganizers();

  const clusters = new Map<string, typeof rows>();
  for (const r of rows) {
    const list = clusters.get(r.match_key) ?? [];
    list.push(r);
    clusters.set(r.match_key, list);
  }
  const dupes = [...clusters.values()].filter((c) => c.length > 1);
  const splitEvents = dupes.reduce(
    (n, c) => n + c.slice(1).reduce((m, r) => m + r.events, 0),
    0,
  );

  return (
    <div className="wrap py-8">
      <Link href="/admin" className="t-kicker text-[color:var(--muted)] hover:text-[color:var(--surf-ink)]">
        ← Admin
      </Link>
      <h1 className="t-display mt-3 text-2xl sm:text-3xl">Organizers</h1>
      <p className="mt-2 max-w-2xl text-sm text-[color:var(--muted)]">
        {rows.length} records. Likely duplicates are grouped together — the same
        organization entered under a slightly different name in a different
        season.
      </p>

      {dupes.length > 0 && (
        <p className="panel tone-warn mt-4 p-4 text-sm">
          <strong>
            {dupes.length} {dupes.length === 1 ? 'organization appears' : 'organizations appear'} more
            than once
          </strong>
          , with {splitEvents} {splitEvents === 1 ? 'event' : 'events'} sitting on the
          spare records. Open one and merge them — a partner page showing part of
          someone&rsquo;s history undercuts the pitch that their schedule is already on it.
        </p>
      )}

      <OrganizerList rows={rows} />
    </div>
  );
}
