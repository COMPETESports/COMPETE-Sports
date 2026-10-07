import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { StateMap } from '@/components/StateMap';
import { getActiveSports, getStateCounts } from '@/lib/queries';

export const dynamic = 'force-dynamic';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ sport: string }>;
}): Promise<Metadata> {
  const { sport } = await params;
  const sports = await getActiveSports();
  const match = sports.find((s) => s.slug === sport);
  if (!match) return { title: 'Community not found' };

  return {
    title: `${match.name} by state`,
    description: `Find adult ${match.name.toLowerCase()} events across the United States. Pick a state to see what is coming up.`,
    alternates: { canonical: `/communities/${match.slug}` },
  };
}

export default async function SportCommunityPage({
  params,
}: {
  params: Promise<{ sport: string }>;
}) {
  const { sport } = await params;
  const sports = await getActiveSports();
  const match = sports.find((s) => s.slug === sport);
  if (!match) notFound();

  const counts = await getStateCounts(match.slug);
  const upcoming = counts.reduce((sum, c) => sum + c.upcoming, 0);
  const liveStates = counts.filter((c) => c.upcoming > 0).length;
  const dormantStates = counts.filter((c) => c.upcoming === 0 && c.total > 0).length;

  return (
    <>
      <div className="band-sun border-b-2 border-[color:var(--line)]">
        <div className="wrap py-8 sm:py-12">
          <Link
            href="/communities"
            className="t-mono text-[11px] uppercase tracking-[0.15em] text-[color:var(--faint)] hover:text-[color:var(--surf-ink)]"
          >
            ← All communities
          </Link>
          <h1 className="t-display mt-4 text-2xl sm:text-4xl">
            {match.name} <span className="text-[color:var(--coral-ink)]">by state</span>
          </h1>
          <p className="mt-3 max-w-xl text-base leading-relaxed text-[color:var(--muted)]">
            {upcoming > 0
              ? `${upcoming} upcoming ${upcoming === 1 ? 'event' : 'events'} across ${liveStates} ${
                  liveStates === 1 ? 'state' : 'states'
                }. Pick one to see what is on.`
              : 'No events are on the calendar yet. States that have hosted before are still marked, so you can see where the scene is.'}
          </p>
        </div>
      </div>

      <div className="wrap py-10">
        <StateMap sport={match.slug} counts={counts} />

        {dormantStates > 0 && (
          <p className="panel mt-8 p-4 text-sm leading-relaxed text-[color:var(--muted)]">
            <span className="text-[color:var(--surf-ink)]">{dormantStates}</span>{' '}
            {dormantStates === 1 ? 'state has' : 'states have'} hosted{' '}
            {match.name.toLowerCase()} but {dormantStates === 1 ? 'has' : 'have'}{' '}
            nothing scheduled right now. Those are marked on the map — seasons
            end, and organizers post next year&apos;s dates when they are set.
          </p>
        )}

        <div className="mt-8 flex flex-wrap gap-2">
          <Link href={`/events?sport=${match.slug}`} className="btn-primary">
            Browse every {match.name.toLowerCase()} event
          </Link>
          <a
            href="mailto:hello@joincompete.com?subject=List%20my%20event%20on%20COMPETE"
            className="btn-ghost"
          >
            List an event
          </a>
        </div>
      </div>
    </>
  );
}
