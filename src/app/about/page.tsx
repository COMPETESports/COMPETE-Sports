import Link from 'next/link';
import { getSiteStats } from '@/lib/queries';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'About',
  description:
    'COMPETE is a discovery platform for adult recreational sports in the United States. One place to find events, instead of six Facebook groups.',
};

export default async function AboutPage() {
  const stats = await getSiteStats();

  return (
    <>
      <div className="band-sun border-b-2 border-[color:var(--line)]">
        <div className="wrap py-12">
          <p className="t-kicker text-[color:var(--surf-ink)]">About</p>
          <h1 className="t-display mt-3 max-w-2xl text-3xl leading-tight sm:text-4xl">
            One place to find your next game.
          </h1>
        </div>
      </div>

      <div className="wrap grid max-w-3xl gap-8 py-12">
        <section>
          <h2 className="t-head text-xl">The problem</h2>
          <p className="mt-3 leading-relaxed text-[color:var(--muted)]">
            Adult recreational sport is thriving, and finding it is miserable.
            Events live in Facebook groups, group texts, screenshots of
            flyers, and half a dozen registration platforms that do not talk to
            each other. Players miss events happening forty minutes from their
            house. Organizers fill late or not at all.
          </p>
          <p className="mt-3 leading-relaxed text-[color:var(--muted)]">
            Time is the one thing none of us gets back. Spending it hunting for
            a Saturday game is a bad trade.
          </p>
        </section>

        <section>
          <h2 className="t-head text-xl">What COMPETE does</h2>
          <p className="mt-3 leading-relaxed text-[color:var(--muted)]">
            COMPETE puts adult events in one searchable place. Filter by
            how far you will drive, the weekend you are free, the surface you
            like, the format you play, and the division you belong in. Open the
            event, see the details, add it to your calendar, and register with
            the organizer.
          </p>
          <p className="mt-3 leading-relaxed text-[color:var(--muted)]">
            We are starting with volleyball, where the community is loudest and
            the fragmentation is worst. Other adult sports follow.
          </p>
        </section>

        <section className="panel p-5">
          <h2 className="t-kicker text-[color:var(--muted)]">Right now</h2>
          <dl className="mt-4 grid grid-cols-3 gap-4">
            {[
              [stats.events, 'upcoming events'],
              [stats.states, 'states'],
              [stats.organizers, 'organizers'],
            ].map(([value, label]) => (
              <div key={label as string}>
                <dd className="t-head text-2xl text-[color:var(--coral-ink)]">{value as number}</dd>
                <dt className="t-mono mt-1 text-[10px] uppercase tracking-[0.15em] text-[color:var(--faint)]">
                  {label as string}
                </dt>
              </div>
            ))}
          </dl>
        </section>

        <section>
          <h2 className="t-head text-xl">Organizers</h2>
          <p className="mt-3 leading-relaxed text-[color:var(--muted)]">
            Listing is free. Send us the event and it goes up. Registration
            stays wherever you already run it — COMPETE sends players to your
            page, it does not take your entries.
          </p>
          <a
            href="mailto:hello@joincompete.com?subject=List%20my%20event%20on%20COMPETE"
            className="btn-primary mt-5"
          >
            List an event
          </a>
        </section>

        <section className="border-t-2 border-[color:var(--line)] pt-6">
          <h2 className="t-head text-xl">Adult events, and who can enter them</h2>
          <p className="mt-3 leading-relaxed text-[color:var(--muted)]">
            COMPETE lists adult recreational events only. We do not list youth
            events or age-group play, and we are not going to.
          </p>
          <p className="mt-3 leading-relaxed text-[color:var(--muted)]">
            Accounts are a separate question. A 16-year-old who plays in open
            events can have one — accounts are for ages 13 and up — but
            whether any particular event will take an under-18 player is the
            organizer&apos;s call, not ours. Plenty require 18 and over. Ask
            them before you register. We never store a date of birth, and we
            never text anyone under 18.
          </p>
          <Link href="/" className="btn-ghost mt-5">
            Browse events
          </Link>
        </section>
      </div>
    </>
  );
}
