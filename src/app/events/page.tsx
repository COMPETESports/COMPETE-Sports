import Link from 'next/link';
import { EventCard } from '@/components/EventCard';
import { FilterForm } from '@/components/FilterForm';
import { SaveButton } from '@/components/account/SaveButton';
import { currentAccount } from '@/lib/accounts';
import { getRelations, type EventRelation } from '@/lib/my-events';
import { searchEvents, PAGE_SIZE } from '@/lib/queries';
import { buildQuery, hasAnyFilter, parseFilters, type RawParams } from '@/lib/search-params';
import { GENDER_LABELS, type Facets } from '@/lib/types';
import { STATE_NAMES } from '@/lib/us-states';

export const dynamic = 'force-dynamic';

export default async function BrowsePage({
  searchParams,
}: {
  searchParams: Promise<RawParams>;
}) {
  const params = await searchParams;
  const filters = parseFilters(params);
  const result = await searchEvents(filters);

  const { events, total, facets, origin } = result;
  const lastPage = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const filtered = hasAnyFilter(filters);

  // One query for the whole page rather than one per card.
  const account = await currentAccount();
  const relations: Map<string, EventRelation> = account
    ? await getRelations(
        account.id,
        events.map((event) => event.id),
      )
    : new Map();

  // Where the Save button sends a signed-out visitor back to.
  const query = buildQuery(params, {});
  const returnTo = query ? `/events?${query}` : '/events';

  return (
    <>
      <BrowseHeader filters={filters} origin={origin} />

      <div className="wrap mt-10 grid gap-8 lg:grid-cols-[280px_minmax(0,1fr)]">
        <aside className="filter-rail">
          <FilterForm filters={filters} facets={facets} resultCount={total} />
        </aside>

        <section aria-label="Search results">
          <div className="mb-5 flex flex-wrap items-end justify-between gap-3 border-b-2 border-[color:var(--line)] pb-3">
            <div>
              <h2 className="t-head text-xl">
                {total} {total === 1 ? 'event' : 'events'}
              </h2>
              <p className="t-mono mt-1 text-[11px] uppercase tracking-[0.15em] text-[color:var(--faint)]">
                {origin
                  ? `Within ${filters.radius} miles of ${origin.label}`
                  : filters.state
                    ? `In ${STATE_NAMES[filters.state] ?? filters.state}`
                    : 'Everywhere in the United States'}
              </p>
            </div>

            <nav className="flex items-center gap-1" aria-label="Sort results">
              <span className="t-kicker mr-1 text-[color:var(--faint)]">Sort</span>
              {(
                [
                  ['date', 'Date'],
                  ['distance', 'Distance'],
                  ['price', 'Price'],
                ] as const
              ).map(([value, label]) => {
                const disabled = value === 'distance' && !origin;
                const active = filters.sort === value;
                return disabled ? (
                  <span
                    key={value}
                    title="Enter a location to sort by distance"
                    className="t-mono cursor-not-allowed px-2 py-1 text-[11px] uppercase tracking-wider text-[color:var(--faint)]"
                  >
                    {label}
                  </span>
                ) : (
                  <Link
                    key={value}
                    href={'/events' + buildQuery(params, { sort: value, page: null })}
                    aria-current={active ? 'true' : undefined}
                    className={`t-mono px-2 py-1 text-[11px] uppercase tracking-wider ${
                      active
                        ? 'bg-[color:var(--coral-ink)] text-[color:var(--ink)]'
                        : 'text-[color:var(--faint)] hover:text-[color:var(--surf-ink)]'
                    }`}
                  >
                    {label}
                  </Link>
                );
              })}
            </nav>
          </div>

          {filters.near && !origin && (
            <p role="status" className="panel tone-warn mb-5 p-3 text-sm">
              We couldn&apos;t find “{filters.near}”. Showing events everywhere
              instead — try a ZIP code, or a city with its state, like “St.
              Louis, MO”.
            </p>
          )}

          <ActiveFilterPills params={params} filters={filters} facets={facets} />

          {events.length === 0 ? (
            <EmptyState filtered={filtered} origin={origin} radius={filters.radius} />
          ) : (
            /* One card a row, full width. Two columns squeezed the date
               block, title, venue, surface chips, divisions and fee into
               about 300px and the result was unreadable — Tom's review,
               7 Oct 2026. The results page has the whole width available;
               there is no reason to spend half of it on a gutter. */
            <ul className="grid gap-4">
              {events.map((event) => (
                <li key={event.id} className="flex min-w-0 flex-col gap-2">
                  <div className="flex w-full flex-1">
                    <EventCard event={event} wide />
                  </div>
                  <div className="flex justify-end">
                    <SaveButton
                      eventId={event.id}
                      relation={relations.get(event.id) ?? null}
                      returnTo={returnTo}
                      size="sm"
                    />
                  </div>
                </li>
              ))}
            </ul>
          )}

          {lastPage > 1 && (
            <Pagination params={params} page={filters.page} lastPage={lastPage} />
          )}
        </section>
      </div>
    </>
  );
}

function BrowseHeader({
  filters,
  origin,
}: {
  filters: ReturnType<typeof parseFilters>;
  origin: { label: string } | null;
}) {
  return (
    <section className="band-sun border-b-2 border-[color:var(--line)]">
      <div className="wrap py-8 sm:py-10">
        <p className="t-kicker text-[color:var(--surf-ink)]">Browse</p>
        <h1 className="t-display mt-2 text-2xl sm:text-4xl">
          Every <span className="text-[color:var(--coral-ink)]">event</span>
        </h1>

        {/* The search bar is its own form so Enter searches from anywhere. */}
        <form method="get" action="/events" className="mt-7 flex max-w-xl flex-col gap-2 sm:flex-row">
          <label htmlFor="hero-near" className="sr-only">
            Search by ZIP code or city
          </label>
          <input
            id="hero-near"
            name="near"
            type="text"
            defaultValue={filters.near ?? ''}
            placeholder="ZIP code or city, ST"
            className="field flex-1 !py-3"
            autoComplete="postal-code"
            enterKeyHint="search"
          />
          <input type="hidden" name="radius" value={filters.radius} />
          <button type="submit" className="btn-primary !py-3">
            Search
          </button>
        </form>

        {origin && (
          <p className="t-mono mt-5 text-[11px] uppercase tracking-[0.15em] text-[color:var(--faint)]">
            Showing results near {origin.label}
          </p>
        )}
      </div>
    </section>
  );
}

function ActiveFilterPills({
  params,
  filters,
  facets,
}: {
  params: RawParams;
  filters: ReturnType<typeof parseFilters>;
  facets: Facets;
}) {
  const pills: Array<{ label: string; href: string }> = [];
  const drop = (key: string, value: string) => {
    const next = new URLSearchParams();
    for (const [k, v] of Object.entries(params)) {
      const list = Array.isArray(v) ? v : v ? [v] : [];
      for (const item of list) {
        if (k === key && item === value) continue;
        if (k === 'page') continue;
        next.append(k, item);
      }
    }
    const qs = next.toString();
    return qs ? `/events?${qs}` : '/events';
  };

  if (filters.state)
    pills.push({
      label: STATE_NAMES[filters.state] ?? filters.state,
      href: drop('state', filters.state),
    });
  for (const s of filters.surfaces) pills.push({ label: s, href: drop('surface', s) });
  for (const g of filters.genders)
    pills.push({ label: GENDER_LABELS[g] ?? g, href: drop('gender', g) });
  // Skill tiers are already their own name — "AA", "Open", "Rec" — so the
  // pill says the tier, not "Div AA". The `division` query key stays as it
  // is so links people have already shared keep working.
  for (const d of filters.divisions) {
    const match = facets.divisions.find((option) => option.slug === d);
    pills.push({ label: match?.name ?? d.toUpperCase(), href: drop('division', d) });
  }
  // Format keys are team-size keys like "size-4", so the readable name has
  // to come from the facet list rather than from the key itself.
  for (const f of filters.formats) {
    const match = facets.formats.find((option) => option.slug === f);
    pills.push({ label: match?.name ?? f.replace(/-/g, ' '), href: drop('format', f) });
  }
  if (filters.near)
    pills.push({ label: `near ${filters.near}`, href: drop('near', filters.near) });

  if (!pills.length) return null;

  return (
    <ul className="mb-5 flex flex-wrap gap-2">
      {pills.map((pill) => (
        <li key={`${pill.label}-${pill.href}`}>
          <Link
            href={pill.href}
            className="pill"
          >
            {pill.label}
            <span aria-hidden>×</span>
            <span className="sr-only">Remove filter</span>
          </Link>
        </li>
      ))}
    </ul>
  );
}

function EmptyState({
  filtered,
  origin,
  radius,
}: {
  filtered: boolean;
  origin: { label: string } | null;
  radius: number;
}) {
  return (
    <div className="panel px-6 py-14 text-center">
      <p className="t-display text-2xl text-[color:var(--coral-ink)]">Nothing here yet</p>
      <p className="mx-auto mt-3 max-w-sm text-sm leading-relaxed text-[color:var(--muted)]">
        {origin
          ? `No events within ${radius} miles of ${origin.label} match those filters. Try a wider radius or fewer filters.`
          : filtered
            ? 'No events match those filters. Try removing one.'
            : 'There are no upcoming events on the site right now.'}
      </p>
      <div className="mt-6 flex flex-wrap justify-center gap-2">
        <Link href="/events" className="btn-primary">
          Clear filters
        </Link>
        <a
          href="mailto:hello@joincompete.com?subject=List%20my%20event%20on%20COMPETE"
          className="btn-ghost"
        >
          Run an event? List it
        </a>
      </div>
    </div>
  );
}

function Pagination({
  params,
  page,
  lastPage,
}: {
  params: RawParams;
  page: number;
  lastPage: number;
}) {
  return (
    <nav className="mt-8 flex items-center justify-between gap-4" aria-label="Pagination">
      {page > 1 ? (
        <Link href={'/events' + buildQuery(params, { page: page - 1 })} className="btn-ghost">
          ← Previous
        </Link>
      ) : (
        <span />
      )}
      <span className="t-mono text-[11px] uppercase tracking-[0.15em] text-[color:var(--faint)]">
        Page {page} of {lastPage}
      </span>
      {page < lastPage ? (
        <Link href={'/events' + buildQuery(params, { page: page + 1 })} className="btn-ghost">
          Next →
        </Link>
      ) : (
        <span />
      )}
    </nav>
  );
}
