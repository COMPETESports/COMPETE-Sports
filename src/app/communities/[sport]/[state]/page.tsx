import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { StateDetailMap } from '@/components/StateDetailMap';
import {
  countUnmappedVenues,
  getActiveSports,
  getStateVenues,
} from '@/lib/queries';
import { clusterVenues } from '@/lib/cluster';
import { STATE_NAMES, US_STATES } from '@/lib/us-states';

export const dynamic = 'force-dynamic';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ sport: string; state: string }>;
}): Promise<Metadata> {
  const { sport, state } = await params;
  const code = state.toUpperCase();
  const name = STATE_NAMES[code];
  const sports = await getActiveSports();
  const match = sports.find((s) => s.slug === sport);
  if (!name || !match) return { title: 'Not found' };

  return {
    title: `${match.name} in ${name}`,
    description: `Where adult ${match.name.toLowerCase()} events are being held across ${name}. See the venues on a map and what is coming up at each.`,
    alternates: { canonical: `/communities/${match.slug}/${code.toLowerCase()}` },
  };
}

export default async function StateDetailPage({
  params,
}: {
  params: Promise<{ sport: string; state: string }>;
}) {
  const { sport, state } = await params;
  const code = state.toUpperCase();
  const name = STATE_NAMES[code];
  if (!name) notFound();

  const sports = await getActiveSports();
  const match = sports.find((s) => s.slug === sport);
  if (!match) notFound();

  const [venues, unmapped] = await Promise.all([
    getStateVenues(match.slug, code),
    countUnmappedVenues(match.slug, code),
  ]);

  // Cluster at roughly 3% of the frame, which is about the distance at
  // which two pins start to overlap and the one behind becomes unclickable.
  const shape = US_STATES.find((s) => s.code === code);
  const frame = shape
    ? Math.max(shape.bounds[1][0] - shape.bounds[0][0], shape.bounds[1][1] - shape.bounds[0][1])
    : 100;
  const clusters = clusterVenues(venues, frame * 0.03);

  const eventTotal = clusters.reduce((sum, c) => sum + c.event_count, 0);
  const venueTotal = clusters.reduce((sum, c) => sum + c.venues.length, 0);

  return (
    <>
      <div className="band-sun border-b-2 border-[color:var(--line)]">
        <div className="wrap py-8 sm:py-10">
          <nav className="t-mono flex flex-wrap items-center gap-2 text-[11px] uppercase tracking-[0.15em] text-[color:var(--faint)]">
            <Link href="/communities" className="hover:text-[color:var(--surf-ink)]">
              Communities
            </Link>
            <span aria-hidden>/</span>
            <Link
              href={`/communities/${match.slug}`}
              className="hover:text-[color:var(--surf-ink)]"
            >
              {match.name}
            </Link>
            <span aria-hidden>/</span>
            <span className="text-[color:var(--muted)]">{name}</span>
          </nav>

          <h1 className="t-display mt-4 text-2xl sm:text-4xl">
            {match.name} in <span className="text-[color:var(--coral-ink)]">{name}</span>
          </h1>
          <p className="mt-3 max-w-xl text-base leading-relaxed text-[color:var(--muted)]">
            {eventTotal > 0
              ? `${eventTotal} upcoming ${eventTotal === 1 ? 'event' : 'events'} at ${venueTotal} ${
                  venueTotal === 1 ? 'venue' : 'venues'
                }. Hover a pin to see what is on there.`
              : `Nothing is on the calendar in ${name} right now.`}
          </p>
        </div>
      </div>

      <div className="wrap py-10">
        {clusters.length > 0 ? (
          <StateDetailMap stateCode={code} clusters={clusters} />
        ) : (
          <div className="panel px-6 py-14 text-center">
            <p className="t-display text-2xl text-[color:var(--coral-ink)]">
              Nothing scheduled here
            </p>
            <p className="mx-auto mt-3 max-w-sm text-sm leading-relaxed text-[color:var(--muted)]">
              No {match.name.toLowerCase()} events are coming up in {name}. If you
              run events here, yours can be the first.
            </p>
            <div className="mt-6 flex flex-wrap justify-center gap-2">
              <Link href={`/communities/${match.slug}`} className="btn-primary">
                Back to the map
              </Link>
              <a
                href="mailto:hello@joincompete.com?subject=List%20my%20event%20on%20COMPETE"
                className="btn-ghost"
              >
                List an event
              </a>
            </div>
          </div>
        )}

        {unmapped > 0 && (
          <p className="panel tone-warn mt-8 p-4 text-sm leading-relaxed">
            {unmapped} {unmapped === 1 ? 'venue has' : 'venues have'} no
            coordinates yet, so {unmapped === 1 ? 'it is' : 'they are'} not on
            the map. Those events still show in the list below.
          </p>
        )}

        <div className="mt-8 flex flex-wrap gap-2">
          <Link href={`/events?sport=${match.slug}&state=${code}`} className="btn-primary">
            See all {name} events as a list
          </Link>
          <Link href={`/communities/${match.slug}`} className="btn-ghost">
            ← Back to the US map
          </Link>
        </div>
      </div>
    </>
  );
}
