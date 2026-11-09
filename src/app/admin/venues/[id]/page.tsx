import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { isSignedIn } from '@/lib/auth';
import { venueProfile, venueSiblings } from '@/lib/venues-admin';
import { MergeVenue } from '@/components/admin/MergeVenue';
import { DeleteVenue } from '@/components/admin/DeleteVenue';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Venue', robots: { index: false, follow: false } };

/**
 * One venue, and who runs events there.
 *
 * The mirror of the organizer page. That one answers "where do they
 * play"; this answers "who plays here" — the question that matters when
 * the venue is the prospect, which it is for every parks department and
 * bar court in the directory.
 */
export default async function VenuePage({ params }: { params: Promise<{ id: string }> }) {
  if (!(await isSignedIn())) redirect('/admin');

  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();

  const found = await venueProfile(id);
  if (!found) notFound();

  const { venue: v, organizers, events } = found;
  const siblings = await venueSiblings(id);
  const exact = v.geo_precision === 'exact';
  const mapHref =
    v.latitude !== null && v.longitude !== null
      ? `https://www.google.com/maps/search/?api=1&query=${v.latitude},${v.longitude}`
      : null;

  return (
    <div className="wrap py-8">
      <Link href="/admin/venues" className="t-kicker text-[color:var(--muted)] hover:text-[color:var(--surf-ink)]">
        ← All venues
      </Link>

      <h1 className="t-display mt-3 text-2xl sm:text-3xl">{v.name}</h1>
      <p className="mt-1 text-sm text-[color:var(--muted)]">
        {[v.address_line, `${v.city}, ${v.state}`, v.postal_code].filter(Boolean).join(' · ') ||
          'No address recorded'}
      </p>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <span
          className="t-mono rounded-full border px-3 py-1 text-[10px] uppercase tracking-wider"
          style={
            exact
              ? { borderColor: 'var(--grass)', color: 'var(--grass)' }
              : { borderColor: 'var(--beach)', color: 'var(--beach)' }
          }
        >
          {exact ? 'exact pin' : `${v.geo_precision} pin`}
        </span>
        {v.business_status && v.business_status.startsWith('CLOSED') && (
          <span
            className="t-mono rounded-full border px-3 py-1 text-[10px] uppercase tracking-wider"
            style={{ borderColor: 'var(--beach)', color: 'var(--beach)' }}
          >
            {v.business_status.toLowerCase().replace(/_/g, ' ')}
          </span>
        )}
        {mapHref && (
          <a href={mapHref} target="_blank" rel="noopener noreferrer" className="btn-ghost !py-1.5 !text-xs">
            See the pin on Google Maps ↗
          </a>
        )}
        {!exact && (
          <Link href="/admin/venues/pins" className="btn-primary !py-1.5 !text-xs">
            Give it a real pin →
          </Link>
        )}
      </div>

      {siblings.length > 0 && (
        <MergeVenue winnerId={v.id} winnerName={v.name} siblings={siblings} />
      )}

      {/* Who runs events here — the link Tom asked for on 4 Nov. */}
      <h2 className="t-kicker mt-8 text-[color:var(--muted)]">
        Organizers who run events here
      </h2>
      {organizers.length === 0 ? (
        <p className="panel mt-3 p-4 text-sm text-[color:var(--muted)]">
          No events at this venue yet.
        </p>
      ) : (
        <ul className="mt-3 grid gap-2">
          {organizers.map((o) => (
            <li key={o.id ?? 'none'}>
              {o.id ? (
                <Link
                  href={`/admin/organizers/${o.id}`}
                  className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 rounded-xl border px-4 py-3 hover:bg-[color:var(--raised)]"
                  style={{ borderColor: 'var(--line)' }}
                >
                  <span className="t-head min-w-0 text-sm">{o.name}</span>
                  <span className="t-mono text-[11px] text-[color:var(--muted)]">
                    {o.events} {o.events === 1 ? 'event' : 'events'}
                    {o.upcoming > 0 && (
                      <span style={{ color: 'var(--grass)' }}> · {o.upcoming} upcoming</span>
                    )}
                    {o.earliest && ` · ${o.earliest.slice(0, 4)}–${o.latest?.slice(0, 4)}`}
                  </span>
                </Link>
              ) : (
                <p
                  className="rounded-xl border px-4 py-3 text-sm"
                  style={{ borderColor: 'var(--line)', color: 'var(--beach)' }}
                >
                  {o.events} {o.events === 1 ? 'event has' : 'events have'} no organizer
                  recorded at all.
                </p>
              )}
            </li>
          ))}
        </ul>
      )}

      <h2 className="t-kicker mt-8 text-[color:var(--muted)]">
        Every event here ({events.length})
      </h2>
      <ul className="mt-3 grid gap-1">
        {events.map((e) => (
          <li key={e.id}>
            <Link
              href={`/admin/events/${e.id}`}
                    target="_blank"
                    rel="noopener"
              className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-0.5 rounded-lg px-3 py-2 hover:bg-[color:var(--raised)]"
            >
              <span className="min-w-0 text-sm">{e.name}</span>
              <span className="t-mono text-[11px] text-[color:var(--muted)]">
                {e.starts_on} · {e.status}
                {e.organizer && ` · ${e.organizer}`}
              </span>
            </Link>
          </li>
        ))}
      </ul>

      <DeleteVenue
        id={v.id}
        name={v.name}
        events={events.length}
        organizers={organizers.length}
      />
    </div>
  );
}
