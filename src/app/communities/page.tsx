import Link from 'next/link';
import { getActiveSports, getStateCounts } from '@/lib/queries';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'Communities',
  description:
    'Pick your sport and see where adult recreational events are happening across the United States.',
};

/**
 * The Communities landing page: choose a sport, then browse the country.
 *
 * A sport with no listings is shown rather than hidden, because "we are
 * building this next" is useful information to a pickleball player and an
 * invitation to an organizer. It is clearly marked, never a dead link.
 */
export default async function CommunitiesPage() {
  const sports = await getActiveSports();

  const withCounts = await Promise.all(
    sports.map(async (sport) => {
      const counts = await getStateCounts(sport.slug);
      return {
        ...sport,
        states: counts.filter((c) => c.upcoming > 0).length,
        upcoming: counts.reduce((sum, c) => sum + c.upcoming, 0),
        organizers: counts.reduce((sum, c) => sum + c.organizers, 0),
      };
    }),
  );

  return (
    <>
      <div className="band-sun border-b-2 border-[color:var(--line)]">
        <div className="wrap py-12 sm:py-16">
          <p className="t-kicker text-[color:var(--surf-ink)]">Communities</p>
          <h1 className="t-display mt-3 max-w-2xl text-3xl leading-[1.05] sm:text-4xl">
            Pick your sport.
            <br />
            <span className="text-[color:var(--coral-ink)]">Find your people.</span>
          </h1>
          <p className="mt-4 max-w-xl text-base leading-relaxed text-[color:var(--muted)]">
            Every adult sport on COMPETE, and a map of where it is being
            played. Start with the game, then pick the state.
          </p>
        </div>
      </div>

      <div className="wrap py-12">
        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {withCounts.map((sport) => (
            <li key={sport.slug} className="flex">
              <SportCard sport={sport} />
            </li>
          ))}
          <li className="flex">
            <div className="panel flex w-full flex-col justify-between p-5">
              <div>
                <p className="t-kicker text-[color:var(--faint)]">Your sport missing?</p>
                <h2 className="t-head mt-2 text-lg">Tell us what to add</h2>
                <p className="mt-2 text-sm leading-relaxed text-[color:var(--muted)]">
                  Softball, kickball, disc golf, dodgeball — if adults are
                  playing it and organizers are running it, it belongs here.
                </p>
              </div>
              <a
                href="mailto:hello@joincompete.com?subject=Sport%20request%20for%20COMPETE"
                className="btn-ghost mt-5 w-full"
              >
                Request a sport
              </a>
            </div>
          </li>
        </ul>
      </div>
    </>
  );
}

function SportCard({
  sport,
}: {
  sport: {
    slug: string;
    name: string;
    is_active: boolean;
    states: number;
    upcoming: number;
    organizers: number;
  };
}) {
  const live = sport.is_active && sport.upcoming > 0;

  if (!live) {
    return (
      <div className="panel flex w-full flex-col justify-between p-5 opacity-80">
        <div>
          <span className="chip-muted">Coming soon</span>
          <h2 className="t-head mt-3 text-lg">{sport.name}</h2>
          <p className="mt-2 text-sm leading-relaxed text-[color:var(--muted)]">
            {sport.name} is set up and ready for listings. It goes live on the
            map as soon as there are events to show.
          </p>
        </div>
        <a
          href={`mailto:hello@joincompete.com?subject=${encodeURIComponent(
            `${sport.name} events for COMPETE`,
          )}`}
          className="btn-ghost mt-5 w-full"
        >
          Run {sport.name.toLowerCase()} events? List one
        </a>
      </div>
    );
  }

  return (
    <Link
      href={`/communities/${sport.slug}`}
      className="card flex w-full flex-col justify-between p-5"
    >
      <div>
        <span className="chip-accent">Live</span>
        <h2 className="t-head mt-3 text-lg">{sport.name}</h2>
        <p className="mt-2 text-sm leading-relaxed text-[color:var(--muted)]">
          Browse the map and pick a state.
        </p>
      </div>

      <dl className="mt-5 flex flex-wrap gap-x-5 gap-y-2 border-t-2 border-[color:var(--line)] pt-4">
        {[
          [sport.upcoming, 'upcoming'],
          [sport.states, sport.states === 1 ? 'state' : 'states'],
          [sport.organizers, sport.organizers === 1 ? 'organizer' : 'organizers'],
        ].map(([value, label]) => (
          <div key={label as string} className="flex items-baseline gap-1.5">
            <dt className="sr-only">{label as string}</dt>
            <dd className="t-head text-lg text-[color:var(--coral-ink)]">{value as number}</dd>
            <span className="t-mono text-[10px] uppercase tracking-wider text-[color:var(--faint)]">
              {label as string}
            </span>
          </div>
        ))}
      </dl>
    </Link>
  );
}
