import Link from 'next/link';
import { sql } from '@/lib/db';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'List your events',
  description:
    'Put your tournaments and leagues in front of players already looking for them. Free, and registration stays wherever you already run it.',
  alternates: { canonical: '/organizers' },
};

/**
 * The organizer front door.
 *
 * Until now the host profile existed but had no entrance — you had to create
 * a player account and find an account sub-page. This is the page Tom sends
 * people to, and the one an organizer finds on their own.
 *
 * It deliberately does NOT list organizers. A browsable index of every
 * organization on COMPETE is the single most copyable thing the business
 * owns, and publishing one would hand a competitor the prospecting list that
 * took a fortnight to build. Organizations are reachable from their events,
 * one at a time, like everything else.
 */
export default async function OrganizersPage() {
  // Counts rather than names. The pitch needs to show the site is real and
  // regional without enumerating anything worth scraping.
  const [stats] = await sql<{ events: number; states: number; venues: number }[]>`
    select count(*)::int as events,
           count(distinct v.state)::int as states,
           count(distinct v.id)::int as venues
      from events e join venues v on v.id = e.venue_id
     where e.status = 'approved'
  `;

  return (
    <>
      <section className="pat-chevron border-b-2 border-[color:var(--line)]">
        <div className="wrap py-10 sm:py-14">
          <p className="t-kicker text-[color:var(--grass)]">For organizers</p>
          <h1 className="t-display mt-3 max-w-3xl text-[1.9rem] leading-[1.3] sm:text-[3rem] sm:leading-[1.14]">
            Your events, in front of players already looking.
          </h1>
          <p className="mt-5 max-w-xl text-base leading-relaxed text-[color:var(--muted)]">
            COMPETE is where adult recreational players come to find their next
            tournament or league. Listing is free, takes a few minutes, and
            registration stays exactly where you already run it — we send
            players to you.
          </p>
          <div className="mt-7 flex flex-wrap gap-3">
            <Link href="/join?as=organizer" className="btn-primary !py-3">
              List your events
            </Link>
            <Link href="/events" className="btn-ghost !py-3">
              See what is on COMPETE
            </Link>
          </div>
        </div>
      </section>

      <div className="wrap grid gap-12 py-12">
        <section className="grid gap-6 sm:grid-cols-3">
          <Point
            title="We do not take your registrations"
            body="No entry fees through us, no cut of your event, no second system for your players to learn. Your listing links straight to however you already take entries — your site, a Google form, a Facebook post."
          />
          <Point
            title="Players find you by what they play"
            body="Someone searching for coed grass quads within 60 miles of St. Louis sees your event. Surface, format, division and distance are all filters, so you reach the players your event is actually for."
          />
          <Point
            title="Your contact details stay private"
            body="We publish your event and a link to your own page. Your phone number and email are never shown publicly and never sold — they exist so we can reach you, not so anyone else can."
          />
        </section>

        <section className="panel p-6 sm:p-8">
          <h2 className="t-head text-xl">How it works</h2>
          <ol className="mt-5 grid gap-5">
            <Step n={1} title="Create an account">
              Email and a password, or your Google account. Same login whether
              you are listing events or playing in them.
            </Step>
            <Step n={2} title="Tell us who you are">
              Organization name, how players reach you, and where you run
              events. If COMPETE already lists events under your name, this is
              where you claim them — they become yours to correct and keep
              current.
            </Step>
            <Step n={3} title="Add your events">
              Date, venue, formats, divisions, entry fee, and where to
              register. Paste your announcement and we will read most of it for
              you.
            </Step>
          </ol>
          <p className="mt-6 text-sm leading-relaxed text-[color:var(--muted)]">
            Already had a conversation with us and been sent a link? Use that
            link rather than this page — it attaches your account to the events
            already listed under your organization.
          </p>
        </section>

        {stats && stats.events > 0 && (
          <section className="grid gap-4 sm:grid-cols-3">
            <Stat n={stats.events} label="Events listed" />
            <Stat n={stats.venues} label="Venues" />
            <Stat n={stats.states} label="States" />
          </section>
        )}

        <section className="panel p-6 sm:p-8">
          <h2 className="t-head text-xl">What it costs</h2>
          <p className="mt-3 max-w-2xl text-sm leading-relaxed text-[color:var(--muted)]">
            Nothing at the moment. Listing is free while COMPETE grows, and if
            that ever changes you will be told plainly and well beforehand —
            anything already listed stays listed on the terms you got it under.
            Players are never charged to find your event.
          </p>
          <div className="mt-6 flex flex-wrap gap-3">
            <Link href="/join?as=organizer" className="btn-primary">
              Get started
            </Link>
            <a
              href="mailto:hello@joincompete.com?subject=Listing%20my%20events%20on%20COMPETE"
              className="btn-ghost"
            >
              Ask a question first
            </a>
          </div>
        </section>
      </div>
    </>
  );
}

function Point({ title, body }: { title: string; body: string }) {
  return (
    <div>
      <h2 className="t-head text-lg leading-snug">{title}</h2>
      <p className="mt-2 text-sm leading-relaxed text-[color:var(--muted)]">{body}</p>
    </div>
  );
}

function Step({ n, title, children }: { n: number; title: string; children: React.ReactNode }) {
  return (
    <li className="grid grid-cols-[32px_1fr] gap-4">
      <span className="t-head grid h-8 w-8 place-items-center rounded-lg bg-[color:var(--coral-ink)] text-sm text-[color:var(--ink)]">
        {n}
      </span>
      <div>
        <p className="t-head text-base">{title}</p>
        <p className="mt-1 text-sm leading-relaxed text-[color:var(--muted)]">{children}</p>
      </div>
    </li>
  );
}

function Stat({ n, label }: { n: number; label: string }) {
  return (
    <div className="panel p-5">
      <div className="t-head text-3xl leading-none text-[color:var(--coral-ink)]">
        {n.toLocaleString()}
      </div>
      <div className="t-mono mt-1.5 text-[10px] uppercase tracking-[0.14em] text-[color:var(--muted)]">
        {label}
      </div>
    </div>
  );
}
