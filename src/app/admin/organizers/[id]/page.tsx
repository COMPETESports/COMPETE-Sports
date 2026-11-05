import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { isSignedIn } from '@/lib/auth';
import { organizerProfile, organizerVenues } from '@/lib/organizers-admin';
import { loadVenueOptions } from '@/lib/ref-data';
import { MergeOrganizer } from '@/components/admin/MergeOrganizer';
import { OrganizerVenues } from '@/components/admin/OrganizerVenues';
import { DeleteOrganizer } from '@/components/admin/DeleteOrganizer';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Organizer', robots: { index: false, follow: false } };

/**
 * One organizer's whole history, grouped by where it happened.
 *
 * This is the page Tom asked for on 3 Nov: click a partner, see every
 * event they have run and the venue each was at, and if they use more
 * than one venue, see all of them. It is also the page to have open
 * during the call -- it is the pitch, rendered.
 */
export default async function OrganizerPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  if (!(await isSignedIn())) redirect('/admin');

  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();

  const found = await organizerProfile(id);
  if (!found) notFound();

  const [linkedVenues, allVenues] = await Promise.all([
    organizerVenues(id),
    loadVenueOptions(),
  ]);

  const { organizer: o, venues, total, siblings } = found;
  const placed = venues.filter((v) => v.venue_id);
  const vague = placed.filter((v) => v.geo_precision !== 'exact');

  return (
    <div className="wrap py-8">
      <Link href="/admin/organizers" className="t-kicker text-[color:var(--muted)] hover:text-[color:var(--surf-ink)]">
        ← All organizers
      </Link>

      <h1 className="t-display mt-3 text-2xl sm:text-3xl">{o.name}</h1>
      <p className="t-mono mt-1 text-[11px] uppercase tracking-[0.15em] text-[color:var(--faint)]">
        {total} {total === 1 ? 'event' : 'events'} · {placed.length}{' '}
        {placed.length === 1 ? 'venue' : 'venues'}
        {o.contact_email && <> · {o.contact_email}</>}
      </p>

      {o.website_url && (
        <p className="mt-2 text-sm">
          <a href={o.website_url} target="_blank" rel="noopener noreferrer" className="underline">
            {o.website_url} ↗
          </a>
        </p>
      )}

      <MergeOrganizer winnerId={o.id} winnerName={o.name} siblings={siblings} />

      <OrganizerVenues organizerId={o.id} linked={linkedVenues} allVenues={allVenues} />

      {vague.length > 0 && (
        <p className="panel tone-warn mt-6 p-4 text-sm">
          {vague.length} of these {vague.length === 1 ? 'venue sits' : 'venues sit'} on an
          approximate pin — placed from a ZIP code or a city rather than a street
          address. Close enough for radius search, wrong on a map.
        </p>
      )}

      {venues.length === 0 && (
        <p className="panel mt-6 p-4 text-sm text-[color:var(--muted)]">
          No events on this record yet.
        </p>
      )}

      <div className="mt-6 grid gap-5">
        {venues.map((v) => (
          <section key={v.venue_id ?? 'none'} className="panel p-5">
            <header className="flex flex-wrap items-baseline justify-between gap-2">
              <h2 className="t-head text-base">
                {v.venue_name ?? 'No venue recorded'}
              </h2>
              <span className="t-mono text-[11px] text-[color:var(--muted)]">
                {v.events.length} {v.events.length === 1 ? 'event' : 'events'}
              </span>
            </header>

            {v.venue_id ? (
              <p className="mt-1 text-sm text-[color:var(--muted)]">
                {[v.address_line, [v.city, v.state].filter(Boolean).join(', '), v.postal_code]
                  .filter(Boolean)
                  .join(' · ') || 'No address recorded'}
                {v.geo_precision && v.geo_precision !== 'exact' && (
                  <span className="t-mono ml-2 text-[10px] uppercase tracking-wider text-[color:var(--beach)]">
                    {v.geo_precision} pin
                  </span>
                )}
              </p>
            ) : (
              <p className="mt-1 text-sm text-[color:var(--beach)]">
                These events have no venue at all, so they cannot appear in any
                location search.
              </p>
            )}

            <ul className="mt-3 grid gap-1">
              {v.events.map((e) => (
                <li key={e.id}>
                  <Link
                    href={`/admin/events/${e.id}`}
                    target="_blank"
                    rel="noopener"
                    className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-0.5 rounded-lg px-2 py-1.5 hover:bg-[color:var(--raised)]"
                  >
                    <span className="min-w-0 text-sm">{e.name}</span>
                    <span className="t-mono text-[11px] text-[color:var(--muted)]">
                      {e.starts_on}
                      {' · '}
                      {e.status}
                      {e.event_type !== 'tournament' && ` · ${e.event_type.replace('_', ' ')}`}
                      {e.brackets === 0 && (
                        <span style={{ color: 'var(--beach)' }}> · no brackets</span>
                      )}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>

      <DeleteOrganizer id={o.id} name={o.name} events={total} />
    </div>
  );
}