import Link from 'next/link';
import { cookies } from 'next/headers';
import { EventCard } from '@/components/EventCard';
import { FilterForm } from '@/components/FilterForm';
import { HomeSearch } from '@/components/HomeSearch';
import { StateMap } from '@/components/StateMap';
import {
  getFacetsForSport,
  getFeaturedEvents,
  getLocalEvents,
  getRegionalEvents,
  getStateCounts,
} from '@/lib/queries';
import { buildQuery, hasAnyFilter, parseFilters, type RawParams } from '@/lib/search-params';
import { geocode } from '@/lib/geocode';
import { regionForState, type Region } from '@/lib/regions';
import { currentAccount, getAthleteProfile } from '@/lib/accounts';
import { HOME_ZIP_COOKIE, LOCAL_RADIUS_MILES } from '@/lib/home-location';
import type { DiscoveryEvent, Facets, SearchFilters } from '@/lib/types';
import type { StateCount } from '@/lib/queries';

export const dynamic = 'force-dynamic';

/**
 * The landing page, rebuilt 7 Oct 2026 after Tom and a friend reviewed the
 * live site.
 *
 * What changed and why: the old page opened with a headline, a paragraph,
 * a search box and a stats row — about 500 pixels of reading before the
 * visitor could do anything. The map, the most interactive thing on the
 * site, was at the bottom where most people never scrolled.
 *
 * It now opens with one line and then hands over control: map, filters,
 * then events ordered by how close they are to you — featured, local,
 * regional. Nothing above the fold asks to be read.
 */
export default async function HomePage({
  searchParams,
}: {
  searchParams: Promise<RawParams>;
}) {
  const sport = 'volleyball';

  // The homepage filters submit back to the homepage (10 Nov 2026) and the
  // map recolours to what they match, rather than sending the visitor off
  // to a results list before they have seen where the matches are.
  const params = await searchParams;
  const filters = parseFilters({ ...params, sport });

  // Where "near you" comes from, in order of how much we trust it: the
  // signed-in player's profile — their ZIP and the radius they actually
  // said they would drive — then the ZIP a visitor last searched,
  // remembered in a cookie. Signed out, the cookie is all there is.
  const account = await currentAccount();
  const profile = account ? await getAthleteProfile(account.id) : null;

  const store = await cookies();
  const cookieZip = store.get(HOME_ZIP_COOKIE)?.value ?? null;

  const geocoded = cookieZip ? await geocode(cookieZip) : null;

  const origin =
    profile?.latitude != null && profile.longitude != null
      ? { lat: profile.latitude, lng: profile.longitude, label: profile.home_city ?? '' }
      : geocoded;

  // Whichever radius is in play must also be the number printed in the
  // heading. Labelling a 200-mile result set "within 90 miles" is a small
  // lie that teaches someone not to trust the rest of the page.
  const radius = profile?.travel_radius_miles ?? LOCAL_RADIUS_MILES;

  // The region comes from a state code, never from a guess: a signed-in
  // player's stated home state, else the state behind the ZIP they
  // searched. No location means no regional rail at all, rather than
  // defaulting someone into the Midwest.
  const region = regionForState(profile?.home_state ?? geocoded?.state ?? null);

  const [featured, local, stateCounts, facets] = await Promise.all([
    getFeaturedEvents(sport, 3),
    origin ? getLocalEvents(sport, origin.lat, origin.lng, radius, 6) : Promise.resolve([]),
    getStateCounts(sport, filters),
    getFacetsForSport(sport),
  ]);

  // Regional runs after local so it can skip whatever local already showed
  // — the same tournament under two headings makes the page look emptier
  // than it is.
  const regional = region
    ? await getRegionalEvents(
        sport,
        region.states,
        [...local.map((e) => e.id), ...featured.map((e) => e.id)],
        6,
      )
    : [];

  const homeZip = profile?.home_postal_code ?? cookieZip;

  return (
    <>
      <Masthead />
      <MapAndFilters sport={sport} counts={stateCounts} facets={facets} filters={filters} params={params} />
      <FeaturedRail events={featured} />
      <LocalRail
        events={local}
        origin={origin}
        hasZip={Boolean(homeZip)}
        homeZip={homeZip}
        radius={radius}
      />
      <RegionalRail region={region} events={regional} />
    </>
  );
}

/* -------------------------------------------------------------- masthead */

function Masthead() {
  return (
    /* One line, and then out of the way. The chevron ground and the layered
       display shadow keep the poster feel the brand is built on; what went
       is the paragraph, the stats row and the second search box, none of
       which a visitor needs before they can act. */
    <section className="pat-chevron relative overflow-hidden">
      <div className="wrap relative py-8 sm:py-11">
        {/* One line across, at every width: the size scales with the
            screen rather than wrapping (Tom, 19 Nov). */}
        <h1 className="t-display t-3d whitespace-nowrap text-[clamp(1.15rem,5.4vw,3.4rem)] leading-[1.2]">
          Discover your next event.
        </h1>
      </div>
    </section>
  );
}

/* --------------------------------------------------------- map + filters */

function MapAndFilters({
  sport,
  counts,
  facets,
  filters,
  params,
}: {
  sport: string;
  counts: StateCount[];
  facets: Facets;
  filters: SearchFilters;
  params: RawParams;
}) {
  const filtered = hasAnyFilter(filters);
  const matching = counts.reduce((n, c) => n + c.upcoming, 0);

  // The filters, carried onto every state link and the "see them" link, so
  // the cards a visitor lands on are exactly the ones the map counted.
  // `state` is dropped: the state comes from whichever one they click.
  const query = buildQuery(params, { state: null, page: null, sport: null }).replace(/^\?/, '');

  return (
    <section id="map" className="wrap scroll-mt-4 py-9 sm:py-11">
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          {/* A heading only when it says something: how many match. The
              unfiltered map needs no title (Tom, 19 Nov). */}
          {filtered && (
            <>
              <p className="t-kicker mb-1.5" style={{ color: 'var(--grape)' }}>
                Your filters
              </p>
              <h2 className="t-display text-2xl sm:text-3xl">
                {`${matching} ${matching === 1 ? 'event matches' : 'events match'}`}
              </h2>
            </>
          )}
        </div>
        {filtered && (
          <div className="flex flex-wrap gap-2">
            <Link href={`/events${query ? `?${query}` : ''}`} className="btn-primary">
              See them as cards
            </Link>
            <Link href="/#map" className="btn-ghost">
              Clear filters
            </Link>
          </div>
        )}
      </div>

      <StateMap sport={sport} counts={counts} linkQuery={query} filtered={filtered} showLegend={false} />

      <div className="mt-8">
        <Link href="/events" className="btn-ghost mb-4 w-full">
          Browse everything
        </Link>

        <FilterForm filters={filters} facets={facets} variant="landing" />
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
  kicker?: string;
  title: string;
  accent: string;
  href?: string;
  linkLabel?: string;
}) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
      <div>
        {kicker && (
          <p className="t-kicker mb-1.5" style={{ color: accent }}>
            {kicker}
          </p>
        )}
        <h2 className="t-display text-2xl sm:text-3xl">{title}</h2>
      </div>
      {href && linkLabel && (
        <Link href={href} className="btn-ghost">
          {linkLabel}
        </Link>
      )}
    </div>
  );
}

/**
 * Two cards a row, not three.
 *
 * At three columns the card was about 300px wide and its date, venue,
 * surface chips, divisions and fee were all competing for the same line
 * endings. Tom's review: "too condensed and too much to read." Two columns
 * gives each card roughly the width of two, which is what the content
 * needed all along.
 */
const CARD_GRID = 'grid gap-5 sm:grid-cols-2';

function FeaturedRail({ events }: { events: DiscoveryEvent[] }) {
  if (!events.length) return null;

  return (
    <section className="relative">
      <div className="wrap py-12 sm:py-14">
        <SectionHead
          title="Featured events"
          accent="var(--coral-ink)"
          href="/events"
          linkLabel="Browse all"
        />

        <ul className={CARD_GRID}>
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
  homeZip,
  radius,
}: {
  events: DiscoveryEvent[];
  origin: { label: string } | null;
  hasZip: boolean;
  homeZip: string | null;
  radius: number;
}) {
  return (
    <section className="band-aqua relative">
      <div className="wrap py-12 sm:py-14">
        <SectionHead
          kicker={origin ? `Within ${radius} miles of ${origin.label}` : undefined}
          title="Events near you"
          accent="var(--surf-ink)"
          href={origin ? '/events' : undefined}
          linkLabel={origin ? 'Browse all' : undefined}
        />

        {!hasZip ? (
          /* The location box lives here rather than in the masthead, beside
             the one section whose contents it changes. */
          <div className="panel p-6 sm:p-8">
            <p className="t-head text-lg">Tell us where you play</p>
            <p className="mt-2 max-w-md leading-relaxed text-[color:var(--muted)]">
              Put in your ZIP code and this fills with everything within{' '}
              {radius} miles of you. We remember it, so it is here next time.
            </p>
            <div className="mt-5 max-w-xl">
              <HomeSearch defaultZip={null} />
            </div>
          </div>
        ) : !origin ? (
          <div className="panel tone-warn p-6">
            <p className="font-semibold">We couldn&apos;t place that ZIP code.</p>
            <p className="mt-1.5 text-sm leading-relaxed">
              Try again with a five-digit ZIP, or a city and state like
              &ldquo;St. Louis, MO&rdquo;.
            </p>
            <div className="mt-4 max-w-xl">
              <HomeSearch defaultZip={homeZip} />
            </div>
          </div>
        ) : events.length === 0 ? (
          <div className="panel p-6 sm:p-8">
            <p className="t-head text-lg">Nothing within {radius} miles yet</p>
            <p className="mt-2 max-w-md leading-relaxed text-[color:var(--muted)]">
              No volleyball is on the calendar near {origin.label} right now.
              The map at the top shows where the scene is — every state that
              has hosted before is marked, even the ones between seasons.
            </p>
            <div className="mt-5 flex flex-wrap items-center gap-3">
              <Link href="/events" className="btn-primary">
                Widen the search
              </Link>
            </div>
            <div className="mt-5 max-w-xl">
              <HomeSearch defaultZip={homeZip} />
            </div>
          </div>
        ) : (
          <>
            <ul className={CARD_GRID}>
              {events.map((event) => (
                <li key={event.id} className="flex min-w-0">
                  <div className="flex w-full">
                    <EventCard event={event} />
                  </div>
                </li>
              ))}
            </ul>
            <details className="mt-6">
              <summary className="t-kicker cursor-pointer text-[color:var(--muted)] hover:text-[color:var(--surf-ink)]">
                Change your location
              </summary>
              <div className="mt-3 max-w-xl">
                <HomeSearch defaultZip={homeZip} />
              </div>
            </details>
          </>
        )}
      </div>
    </section>
  );
}

/**
 * The step between "within 90 miles of me" and the whole country.
 *
 * A named region — the Midwest, the Southeast — is a thing people already
 * belong to, which a radius never is. Nobody thinks of themselves as living
 * inside a 250-mile circle.
 */
function RegionalRail({
  region,
  events,
}: {
  region: Region | null;
  events: DiscoveryEvent[];
}) {
  // No region, or nothing in it, means no section. An empty rail headed
  // "Upcoming in the Midwest" is worse than no rail.
  if (!region || events.length === 0) return null;

  return (
    <section className="relative">
      <div className="wrap py-12 sm:py-14">
        <SectionHead
          kicker="Worth the drive"
          title={`Upcoming in the ${region.name}`}
          accent="var(--grape)"
          href="/events"
          linkLabel="Browse all"
        />
        <ul className={CARD_GRID}>
          {events.map((event) => (
            <li key={event.id} className="flex min-w-0">
              <div className="flex w-full">
                <EventCard event={event} />
              </div>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
