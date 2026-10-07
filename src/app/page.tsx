import Link from 'next/link';
import { cookies } from 'next/headers';
import { EventCard } from '@/components/EventCard';
import { HomeSearch } from '@/components/HomeSearch';
import { StateMap } from '@/components/StateMap';
import {
  getFeaturedEvents,
  getLocalEvents,
  getSiteStats,
  getStateCounts,
} from '@/lib/queries';
import { geocode } from '@/lib/geocode';
import { currentAccount, getAthleteProfile } from '@/lib/accounts';
import { HOME_ZIP_COOKIE, LOCAL_RADIUS_MILES } from '@/lib/home-location';
import type { DiscoveryEvent } from '@/lib/types';
import type { StateCount } from '@/lib/queries';

export const dynamic = 'force-dynamic';

export default async function HomePage() {
  const sport = 'volleyball';

  // Where "near you" comes from, in order of how much we trust it: the
  // signed-in player's profile — their ZIP and the radius they actually said
  // they would drive — then the ZIP a visitor last searched, remembered in a
  // cookie. Signed out, the cookie is all there is, and that is fine.
  const account = await currentAccount();
  const profile = account ? await getAthleteProfile(account.id) : null;

  const store = await cookies();
  const cookieZip = store.get(HOME_ZIP_COOKIE)?.value ?? null;

  const origin =
    profile?.latitude != null && profile.longitude != null
      ? { lat: profile.latitude, lng: profile.longitude, label: profile.home_city ?? '' }
      : cookieZip
        ? await geocode(cookieZip)
        : null;

  const radius = profile?.travel_radius_miles ?? LOCAL_RADIUS_MILES;

  const [featured, local, stats, stateCounts] = await Promise.all([
    getFeaturedEvents(sport, 3),
    origin
      ? getLocalEvents(sport, origin.lat, origin.lng, radius, 6)
      : Promise.resolve([]),
    getSiteStats(),
    getStateCounts(sport),
  ]);

  return (
    <>
      <Hero stats={stats} homeZip={profile?.home_postal_code ?? cookieZip} />
      <FeaturedRail events={featured} />
      <LocalRail events={local} origin={origin} hasZip={Boolean(profile?.home_postal_code ?? cookieZip)} />
      <MapStrip sport={sport} counts={stateCounts} />
    </>
  );
}

/* ------------------------------------------------------------------ hero */

function Hero({
  stats,
  homeZip,
}: {
  stats: { events: number; states: number; organizers: number };
  homeZip: string | null;
}) {
  return (
    /* The hero is a POSTER MOMENT: dark ground, perspective chevrons,
       display type with layered offset shadows. Short text, big type, all
       the attitude. The cards below it go back to ecru paper, because a
       database of forty-field cards is unreadable on black. */
    <section className="pat-chevron relative overflow-hidden">
      <div className="wrap relative py-14 sm:py-20">
        <p className="t-kicker !text-[color:var(--grass)]">
          Adult recreational sports · United States
        </p>
        {/* The survey said "we save you time" lands for about a quarter of
            players — a fifth do not search at all. What they do not have is a
            way to find the events nobody told them about. So the promise is
            discovery, and the second line is the community it adds up to. */}
        <h1 className="t-display t-3d mt-5 text-[2.05rem] leading-[1.45] sm:text-[4.1rem] sm:leading-[1.18]">
          Find the events
          <br />
          you never knew existed.
        </h1>
        <p className="mt-7 max-w-xl text-lg leading-relaxed text-white/80">
          Every adult tournament, league and open play in one place — connecting
          the people who run events with the people looking for their next one.
        </p>

        <div className="mt-8 max-w-xl">
          <HomeSearch defaultZip={homeZip} />
        </div>

        <dl className="mt-9 flex flex-wrap gap-x-9 gap-y-3">
          {[
            [stats.events, 'upcoming events'],
            [stats.states, 'states'],
            [stats.organizers, 'organizers'],
          ].map(([value, label]) => (
            <div key={label as string} className="flex items-baseline gap-2">
              <dt className="sr-only">{label as string}</dt>
              <dd className="t-head text-3xl text-[color:var(--indoor)]">
                {value as number}
              </dd>
              <span className="t-kicker !text-white/70">{label as string}</span>
            </div>
          ))}
        </dl>
      </div>

    </section>
  );
}

/* -------------------------------------------------------------- sections */

function SectionHead({
  kicker,
  title,
  accent,
  href,
  linkLabel,
}: {
  kicker: string;
  title: string;
  accent: string;
  href?: string;
  linkLabel?: string;
}) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
      <div>
        <p className="t-kicker" style={{ color: accent }}>
          {kicker}
        </p>
        <h2 className="t-display mt-1.5 text-2xl sm:text-3xl">{title}</h2>
      </div>
      {href && linkLabel && (
        <Link href={href} className="btn-ghost">
          {linkLabel}
        </Link>
      )}
    </div>
  );
}

function FeaturedRail({ events }: { events: DiscoveryEvent[] }) {
  if (!events.length) return null;

  return (
    <section className="relative">
      <div className="wrap py-12 sm:py-14">
        <SectionHead
          kicker="Hand picked"
          title="Featured events"
          accent="var(--coral-ink)"
          href="/events"
          linkLabel="Browse all"
        />

        <ul className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {events.map((event) => (
            <li key={event.id} className="flex min-w-0">
              <div className="flex w-full min-w-0 flex-col">
                {/* A staff pick is labelled as one. The rest fill the rail
                    and claim only that they are worth a look. */}
                <span
                  data-testid="rail-label"
                  className={`${event.featured ? 'chip-featured' : 'chip-muted'} mb-2 self-start`}
                >
                  {event.featured ? 'Featured' : 'Worth a look'}
                </span>
                <EventCard event={event} />
              </div>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

function LocalRail({
  events,
  origin,
  hasZip,
}: {
  events: DiscoveryEvent[];
  origin: { label: string } | null;
  hasZip: boolean;
}) {
  return (
    <section className="band-aqua relative">
      <div className="wrap py-12 sm:py-14">
        <SectionHead
          kicker={
            origin ? `Within ${LOCAL_RADIUS_MILES} miles of ${origin.label}` : 'Near you'
          }
          title="Events near you"
          accent="var(--surf-ink)"
          href={origin ? '/events' : undefined}
          linkLabel={origin ? 'Browse all' : undefined}
        />

        {!hasZip ? (
          <div className="panel p-6 sm:p-8">
            <p className="t-head text-lg">Tell us where you play</p>
            <p className="mt-2 max-w-md leading-relaxed text-[color:var(--muted)]">
              Put your ZIP code in the search above and this fills with
              everything within {LOCAL_RADIUS_MILES} miles of you. We remember
              it, so it is here next time.
            </p>
          </div>
        ) : !origin ? (
          <div className="panel tone-warn p-6">
            <p className="font-semibold">We couldn&apos;t place that ZIP code.</p>
            <p className="mt-1.5 text-sm leading-relaxed">
              Search again above with a five-digit ZIP, or a city and state like
              &ldquo;St. Louis, MO&rdquo;.
            </p>
          </div>
        ) : events.length === 0 ? (
          <div className="panel p-6 sm:p-8">
            <p className="t-head text-lg">
              Nothing within {LOCAL_RADIUS_MILES} miles yet
            </p>
            <p className="mt-2 max-w-md leading-relaxed text-[color:var(--muted)]">
              No volleyball is on the calendar near {origin.label} right now.
              The map below shows where the scene is — every state that has
              hosted before is marked, even the ones between seasons.
            </p>
            <Link href="/communities/volleyball" className="btn-primary mt-5">
              See the map
            </Link>
          </div>
        ) : (
          <ul className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {events.map((event) => (
              <li key={event.id} className="flex min-w-0">
                <div className="flex w-full">
                  <EventCard event={event} />
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

    </section>
  );
}

function MapStrip({ sport, counts }: { sport: string; counts: StateCount[] }) {
  return (
    <section className="wrap py-12 sm:py-14">
      <SectionHead
        kicker="Every state"
        title="Browse the country"
        accent="var(--grape)"
        href="/communities"
        linkLabel="All communities"
      />
      <StateMap sport={sport} counts={counts} />
    </section>
  );
}
