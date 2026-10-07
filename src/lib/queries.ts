import { sql } from './db';
import { boundingBox, geocode } from './geocode';
import { today } from './dates';
import type {
  DiscoveryEvent,
  FacetOption,
  Facets,
  SearchFilters,
  SearchResult,
} from './types';

export const PAGE_SIZE = 24;

type Frag = ReturnType<typeof sql>;

function andAll(parts: Frag[]): Frag {
  return parts.reduce((acc, part) => sql`${acc} and ${part}`);
}

/**
 * The Phase 1 discovery query.
 *
 * Location filtering runs a bounding box first so the planner can use the
 * (latitude, longitude) index, then refines with a true great-circle
 * distance. Facet counts are computed over the date + location + sport
 * scope, so the numbers beside each checkbox tell you what you would get
 * if you ticked it, rather than collapsing to zero as you narrow.
 */
export async function searchEvents(filters: SearchFilters): Promise<SearchResult> {
  const origin = filters.near ? await geocode(filters.near) : null;

  const scope: Frag[] = [sql`status = 'approved'`, sql`sport_slug = ${filters.sport}`];

  scope.push(sql`starts_on >= ${filters.from ?? today()}`);
  if (filters.to) scope.push(sql`starts_on <= ${filters.to}`);

  // A state chosen on the Communities map narrows the same scope the date
  // and location filters use, so the facet counts beside each checkbox stay
  // truthful within that state.
  if (filters.state) scope.push(sql`state = ${filters.state}`);

  if (origin) {
    const box = boundingBox(origin.lat, origin.lng, filters.radius);
    scope.push(sql`
      latitude is not null
      and latitude between ${box.minLat} and ${box.maxLat}
      and longitude between ${box.minLng} and ${box.maxLng}
      and miles_between(${origin.lat}, ${origin.lng}, latitude, longitude) <= ${filters.radius}
    `);
  }

  const selections: Frag[] = [];
  if (filters.surfaces.length) selections.push(sql`surface_slugs && ${filters.surfaces}`);

  // Format, gender and division are not three independent properties of an
  // event — together they name ONE BRACKET. "Is there a Coed Quads BB
  // bracket here?" is the question a player is actually asking, and three
  // separate array-overlap tests cannot answer it: they match an event that
  // runs coed somewhere, quads somewhere and BB somewhere, which may be
  // three different brackets.
  //
  // So when two or more of the three are chosen, the filter asks
  // event_brackets for a single row satisfying all of them.
  //
  // Honest about today's precision: every bracket currently in the table
  // was derived by 004's backfill as the cross product of the event's flat
  // lists, so for now this returns the same rows the old test did. It has
  // to, because the source sheets state Sex, Format and Division(s) as
  // independent comma lists and genuinely never record which combinations
  // ran. The value is that precision arrives on its own the moment real
  // brackets land — organizer submissions record them per bracket — with
  // no further change here.
  const bracketTests: Frag[] = [];
  if (filters.formats.length) {
    // A format filter is chosen by team size — Doubles, Triples, Quads —
    // because who you play with is already the Gender filter's job.
    bracketTests.push(
      sql`coalesce('size-' || f.team_size::text, f.slug) = any(${filters.formats})`,
    );
  }
  if (filters.genders.length) bracketTests.push(sql`f.gender = any(${filters.genders})`);
  if (filters.divisions.length) bracketTests.push(sql`d.slug = any(${filters.divisions})`);

  if (bracketTests.length > 1) {
    selections.push(sql`
      exists (
        select 1
        from event_brackets b
        join formats f on f.id = b.format_id
        left join divisions d on d.id = b.division_id
        where b.event_id = event_discovery.id
          and ${andAll(bracketTests)}
      )`);
  } else {
    // One axis on its own needs no join: the flattened arrays on the view
    // answer it directly and cheaply.
    if (filters.formats.length) {
      selections.push(sql`
        format_slugs && (
          select coalesce(array_agg(f.slug), '{}')
          from formats f
          join sports sp on sp.id = f.sport_id and sp.slug = ${filters.sport}
          where coalesce('size-' || f.team_size::text, f.slug) = any(${filters.formats})
        )`);
    }
    if (filters.genders.length) selections.push(sql`genders && ${filters.genders}`);
    if (filters.divisions.length) selections.push(sql`division_slugs && ${filters.divisions}`);
  }

  const scopeWhere = andAll(scope);
  const fullWhere = selections.length ? andAll([scopeWhere, ...selections]) : scopeWhere;

  const distance = origin
    ? sql`miles_between(${origin.lat}, ${origin.lng}, latitude, longitude)`
    : sql`null::double precision`;

  const order =
    filters.sort === 'distance' && origin
      ? sql`${distance} asc nulls last, starts_on asc`
      : filters.sort === 'price'
        ? sql`entry_fee_cents asc nulls last, starts_on asc`
        : sql`starts_on asc, name asc`;

  const offset = (filters.page - 1) * PAGE_SIZE;

  const [rows, countRow, facets] = await Promise.all([
    sql<DiscoveryEvent[]>`
      select *, ${distance} as distance_miles
      from event_discovery
      where ${fullWhere}
      order by ${order}
      limit ${PAGE_SIZE} offset ${offset}`,
    sql<{ total: number }[]>`
      select count(*)::int as total from event_discovery where ${fullWhere}`,
    loadFacets(scopeWhere, filters.sport),
  ]);

  return {
    events: rows.map(normalise),
    total: countRow[0]?.total ?? 0,
    facets,
    page: filters.page,
    pageSize: PAGE_SIZE,
    origin: origin ? { label: origin.label, lat: origin.lat, lng: origin.lng } : null,
  };
}

/**
 * Facet options and counts for every upcoming event in a sport.
 *
 * The homepage filter panel needs the same checkboxes the search page has,
 * but nothing has been searched yet, so there is no result set to derive
 * them from. Running a whole `searchEvents` just to throw the rows away
 * would cost a page query and a count for nothing.
 */
export async function getFacetsForSport(sportSlug: string): Promise<Facets> {
  return loadFacets(
    andAll([
      sql`status = 'approved'`,
      sql`sport_slug = ${sportSlug}`,
      sql`starts_on >= ${today()}`,
    ]),
    sportSlug,
  );
}

async function loadFacets(scopeWhere: Frag, sportSlug: string): Promise<Facets> {
  const [surfaces, formats, genders, divisions] = await Promise.all([
    sql<FacetOption[]>`
      with scoped as (select * from event_discovery where ${scopeWhere})
      select s.slug, s.name, count(e.id)::int as count
      from surfaces s
      join sports sp on sp.id = s.sport_id and sp.slug = ${sportSlug}
      left join scoped e on s.slug = any(e.surface_slugs)
      group by s.slug, s.name, s.display_order
      order by s.display_order`,
    // Formats collapse to team size. "Men's Doubles", "Women's Doubles",
    // "Coed Doubles" and "Reverse Coed Doubles" are one choice — Doubles —
    // and the Gender facet beside it says who is playing. A size with only
    // one format in it keeps its own name, so "King & Queen of the Beach"
    // and "Singles" do not get flattened into a meaningless "1".
    sql<FacetOption[]>`
      with scoped as (select * from event_discovery where ${scopeWhere})
      select
        coalesce('size-' || f.team_size::text, f.slug) as slug,
        case when count(distinct f.slug) = 1 then min(f.name)
             else coalesce(
               case min(f.team_size)
                 when 2 then 'Doubles' when 3 then 'Triples'
                 when 4 then 'Quads'   when 6 then 'Sixes'
               end, min(f.name))
        end as name,
        count(distinct e.id)::int as count
      from formats f
      join sports sp on sp.id = f.sport_id and sp.slug = ${sportSlug}
      left join scoped e on f.slug = any(e.format_slugs)
      group by coalesce('size-' || f.team_size::text, f.slug)
      order by min(f.display_order)`,
    sql<FacetOption[]>`
      with scoped as (select * from event_discovery where ${scopeWhere})
      select g.slug, g.slug as name, count(e.id)::int as count
      from (values ('mens'),('womens'),('coed'),('reverse_coed'),('open')) as g(slug)
      left join scoped e on g.slug = any(e.genders)
      group by g.slug
      order by array_position(
        array['mens','womens','coed','reverse_coed','open'], g.slug)`,
    // Division = competitive skill tier, in Tom's vocabulary. `is_active`
    // hides the three tiers retired by 004 (C, Recreational, Masters)
    // without deleting them, so the events that published them keep their
    // data while the picker only offers the current seven.
    sql<FacetOption[]>`
      with scoped as (select * from event_discovery where ${scopeWhere})
      select d.slug, d.name, d.descriptor, count(e.id)::int as count
      from divisions d
      join sports sp on sp.id = d.sport_id and sp.slug = ${sportSlug}
      left join scoped e on d.slug = any(e.division_slugs)
      where d.is_active
      group by d.slug, d.name, d.descriptor, d.display_order
      order by d.display_order`,
  ]);

  // A facet nobody is running is noise on the page, not a useful choice.
  const used = (xs: FacetOption[]) => xs.filter((x) => x.count > 0);
  return {
    surfaces: used(surfaces),
    formats: used(formats),
    genders: used(genders),
    divisions: used(divisions),
  };
}

export async function getEventBySlug(slug: string): Promise<DiscoveryEvent | null> {
  const [row] = await sql<DiscoveryEvent[]>`
    select *, null::double precision as distance_miles
    from event_discovery
    where slug = ${slug} and status = 'approved'
    limit 1`;
  return row ? normalise(row) : null;
}

export async function getNearbyEvents(
  event: DiscoveryEvent,
  limit = 3,
): Promise<DiscoveryEvent[]> {
  if (event.latitude === null || event.longitude === null) return [];
  const rows = await sql<DiscoveryEvent[]>`
    select *, miles_between(${event.latitude}, ${event.longitude}, latitude, longitude) as distance_miles
    from event_discovery
    where status = 'approved'
      and id <> ${event.id}
      and starts_on >= ${today()}
      and latitude is not null
      and miles_between(${event.latitude}, ${event.longitude}, latitude, longitude) <= 150
    order by distance_miles asc, starts_on asc
    limit ${limit}`;
  return rows.map(normalise);
}

export interface StateCount {
  state: string;
  upcoming: number;
  /** Everything ever listed there, used to mark a dormant community. */
  total: number;
  organizers: number;
}

/**
 * Per-state counts for the Communities map.
 *
 * `upcoming` drives the shading. `total` lets the map distinguish "no
 * volleyball here" from "there is a scene here, nothing on the calendar
 * right now", which is a real and useful difference to a player deciding
 * whether a state is worth watching.
 */
export async function getStateCounts(sportSlug: string): Promise<StateCount[]> {
  const rows = await sql<StateCount[]>`
    select
      state,
      count(*) filter (where starts_on >= ${today()})::int as upcoming,
      count(*)::int                                        as total,
      count(distinct organizer_name)::int                  as organizers
    from event_discovery
    where status = 'approved' and sport_slug = ${sportSlug} and state is not null
    group by state`;
  return [...rows];
}

export interface VenueCluster {
  id: string;
  name: string;
  city: string;
  latitude: number;
  longitude: number;
  geo_precision: string;
  event_count: number;
  next_on: string;
  events: Array<{ slug: string; name: string; starts_on: string }>;
}

/**
 * Venues in one state that have upcoming events, for the zoomed state map.
 *
 * Grouped by venue rather than returned per event, because a weekly series
 * at one park is one pin with seven dates behind it, not seven pins stacked
 * on the same pixel.
 */
export async function getStateVenues(
  sportSlug: string,
  state: string,
): Promise<VenueCluster[]> {
  const rows = await sql<VenueCluster[]>`
    select
      v.id, v.name, v.city, v.latitude, v.longitude, v.geo_precision,
      count(e.id)::int as event_count,
      min(e.starts_on)  as next_on,
      json_agg(
        json_build_object('slug', e.slug, 'name', e.name, 'starts_on', e.starts_on)
        order by e.starts_on
      ) as events
    from venues v
    join events e on e.venue_id = v.id
    join sports sp on sp.id = e.sport_id
    where sp.slug = ${sportSlug}
      and v.state = ${state}
      and e.status = 'approved'
      and e.starts_on >= ${today()}
      and v.latitude is not null
      and v.longitude is not null
    group by v.id
    order by count(e.id) desc, min(e.starts_on) asc`;

  return rows.map((r) => ({
    ...r,
    next_on: asIsoDate(r.next_on),
    events: r.events.map((e) => ({ ...e, starts_on: asIsoDate(e.starts_on) })),
  }));
}

/** Venues in a state whose events cannot be placed on the map. */
export async function countUnmappedVenues(
  sportSlug: string,
  state: string,
): Promise<number> {
  const [row] = await sql<{ n: number }[]>`
    select count(distinct v.id)::int as n
    from venues v
    join events e on e.venue_id = v.id
    join sports sp on sp.id = e.sport_id
    where sp.slug = ${sportSlug}
      and v.state = ${state}
      and e.status = 'approved'
      and e.starts_on >= ${today()}
      and (v.latitude is null or v.longitude is null)`;
  return row?.n ?? 0;
}

export async function getActiveSports() {
  const rows = await sql<{ slug: string; name: string; is_active: boolean }[]>`
    select slug, name, is_active from sports order by display_order`;
  return [...rows];
}

/** Counts for the landing strip. Cheap enough to run on every request. */
export async function getSiteStats() {
  const [row] = await sql<{ events: number; states: number; organizers: number }[]>`
    select
      count(*)::int                                   as events,
      count(distinct state)::int                      as states,
      count(distinct organizer_name)::int             as organizers
    from event_discovery
    where status = 'approved' and starts_on >= ${today()}`;
  return row ?? { events: 0, states: 0, organizers: 0 };
}

function normalise(row: DiscoveryEvent): DiscoveryEvent {
  return {
    ...row,
    starts_on: asIsoDate(row.starts_on),
    ends_on: row.ends_on ? asIsoDate(row.ends_on) : null,
    registration_deadline: row.registration_deadline
      ? asIsoDate(row.registration_deadline)
      : null,
    surface_slugs: row.surface_slugs ?? [],
    surface_names: row.surface_names ?? [],
    format_slugs: row.format_slugs ?? [],
    format_names: row.format_names ?? [],
    genders: row.genders ?? [],
    division_slugs: row.division_slugs ?? [],
    division_names: row.division_names ?? [],
    distance_miles:
      row.distance_miles === null || row.distance_miles === undefined
        ? null
        : Number(row.distance_miles),
  };
}

/**
 * postgres.js hands back `date` columns as JS Date objects in UTC. Reading
 * them with local getters would shift an event a day backwards for anyone
 * west of Greenwich, so the UTC parts are used deliberately.
 */
function asIsoDate(value: string | Date): string {
  if (value instanceof Date) {
    return `${value.getUTCFullYear()}-${String(value.getUTCMonth() + 1).padStart(2, '0')}-${String(
      value.getUTCDate(),
    ).padStart(2, '0')}`;
  }
  return String(value).slice(0, 10);
}

export { today };

/**
 * The two homepage rails.
 *
 * Featuring is editorial first: staff-flagged events lead, in the order
 * staff set. When there are fewer flagged events than slots — which is
 * most weeks on a young platform — the remainder is filled automatically
 * rather than leaving a half-empty rail. The automatic picks favour
 * events that are worth a player's attention: a real payout, a wide
 * division spread, and soon enough to still enter.
 *
 * A filled slot is never passed off as a staff pick; the caller gets the
 * `featured` flag per row and labels them differently.
 */
export async function getFeaturedEvents(
  sportSlug: string,
  limit = 3,
): Promise<DiscoveryEvent[]> {
  const rows = await sql<DiscoveryEvent[]>`
    with picked as (
      select *, null::double precision as distance_miles
      from event_discovery
      where status = 'approved'
        and sport_slug = ${sportSlug}
        and starts_on >= ${today()}
        and featured
        and (featured_until is null or featured_until >= ${today()})
      order by featured_rank nulls last, starts_on
      limit ${limit}
    ),
    filler as (
      select *, null::double precision as distance_miles
      from event_discovery
      where status = 'approved'
        and sport_slug = ${sportSlug}
        and starts_on >= ${today()}
        and id not in (select id from picked)
      order by
        (payout_text is not null) desc,
        coalesce(array_length(division_slugs, 1), 0) desc,
        starts_on
      limit ${limit}
    )
    select * from (
      select *, 0 as tier from picked
      union all
      select *, 1 as tier from filler
    ) combined
    order by tier, featured_rank nulls last, starts_on
    limit ${limit}`;
  return rows.map(normalise);
}

/** Upcoming events near a point, for the "near you" rail. */
export async function getLocalEvents(
  sportSlug: string,
  lat: number,
  lng: number,
  radiusMiles: number,
  limit = 6,
): Promise<DiscoveryEvent[]> {
  const box = boundingBox(lat, lng, radiusMiles);
  const rows = await sql<DiscoveryEvent[]>`
    select *, miles_between(${lat}, ${lng}, latitude, longitude) as distance_miles
    from event_discovery
    where status = 'approved'
      and sport_slug = ${sportSlug}
      and starts_on >= ${today()}
      and latitude is not null
      and latitude between ${box.minLat} and ${box.maxLat}
      and longitude between ${box.minLng} and ${box.maxLng}
      and miles_between(${lat}, ${lng}, latitude, longitude) <= ${radiusMiles}
    order by starts_on, distance_miles
    limit ${limit}`;
  return rows.map(normalise);
}

/**
 * Upcoming events across a whole region, for the "Upcoming in the Midwest"
 * rail — the step between "within 90 miles of me" and the national map.
 *
 * `excludeIds` takes whatever the local rail already showed, so the two
 * sections do not print the same tournament twice. Without it, a visitor in
 * Columbus sees the same Ohio event under both headings and the page looks
 * like it has less in it than it does.
 *
 * Ordered by date alone. There is no distance here: the point of a region
 * is that it is somewhere you'd travel to, so "soonest" is the useful sort,
 * not "nearest".
 */
export async function getRegionalEvents(
  sportSlug: string,
  stateCodes: readonly string[],
  excludeIds: readonly string[] = [],
  limit = 6,
): Promise<DiscoveryEvent[]> {
  if (stateCodes.length === 0) return [];

  // postgres.js expands an empty array to `in ()`, which is a syntax error,
  // so the no-exclusions case gets a sentinel that matches no uuid.
  const excluded = excludeIds.length > 0 ? excludeIds : ['00000000-0000-0000-0000-000000000000'];

  const rows = await sql<DiscoveryEvent[]>`
    select *, null::double precision as distance_miles
    from event_discovery
    where status = 'approved'
      and sport_slug = ${sportSlug}
      and starts_on >= ${today()}
      and state = any(${stateCodes as string[]})
      and id <> all(${excluded as string[]}::uuid[])
    order by starts_on
    limit ${limit}`;
  return rows.map(normalise);
}

/** Toggles the editorial flag. Used by the admin list. */
export async function setEventFeatured(id: string, featured: boolean): Promise<void> {
  await sql`
    update events
    set featured = ${featured},
        featured_rank = case when ${featured}
          then coalesce((select max(featured_rank) + 1 from events where featured), 1)
          else null end
    where id = ${id}`;
}
