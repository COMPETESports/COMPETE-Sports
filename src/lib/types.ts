export interface DiscoveryEvent {
  id: string;
  slug: string;
  name: string;
  event_type: 'tournament' | 'league';
  starts_on: string;
  ends_on: string | null;
  registration_deadline: string | null;
  entry_fee_cents: number | null;
  fee_basis: 'per_player' | 'per_team';
  payout_text: string | null;
  event_page_url: string | null;
  flyer_url: string | null;
  notes: string | null;
  status: string;
  featured: boolean;
  featured_rank: number | null;
  featured_until: string | null;
  sport_slug: string;
  sport_name: string;
  surface_slugs: string[];
  surface_names: string[];
  organizer_name: string | null;
  organizer_email: string | null;
  venue_name: string | null;
  address_line: string | null;
  city: string | null;
  state: string | null;
  postal_code: string | null;
  latitude: number | null;
  longitude: number | null;
  geo_precision: string | null;
  format_slugs: string[];
  format_names: string[];
  genders: string[];
  division_slugs: string[];
  division_names: string[];
  distance_miles: number | null;
}

export interface FacetOption {
  slug: string;
  name: string;
  count: number;
  /**
   * Plain-English gloss for a skill tier — "BB" is meaningless to anyone
   * who has not already played in this scene, and a player who cannot
   * tell which tier they belong in does not enter at all. Only the
   * division facet carries one.
   */
  descriptor?: string | null;
}

export interface Facets {
  surfaces: FacetOption[];
  formats: FacetOption[];
  genders: FacetOption[];
  divisions: FacetOption[];
}

export interface SearchFilters {
  sport: string;
  /**
   * Free text over event, organizer and venue name.
   *
   * Added 21 Oct 2026. Until then discovery had no text field at all, so a
   * player who heard "Anti-Turkey Trot" from a teammate and searched it
   * found nothing and concluded COMPETE did not have it.
   */
  q: string | null;
  /**
   * Set when a text search found nothing upcoming and we are looking back
   * instead. Drops the start-date floor and orders newest first, so the
   * answer is "that happened in November" rather than an empty page.
   */
  includePast: boolean;
  from: string | null;
  to: string | null;
  surfaces: string[];
  formats: string[];
  genders: string[];
  divisions: string[];
  near: string | null;
  radius: number;
  /** Two-letter USPS code, set by the Communities map. */
  state: string | null;
  lat: number | null;
  lng: number | null;
  sort: 'date' | 'distance' | 'price';
  page: number;
}

export interface SearchResult {
  events: DiscoveryEvent[];
  total: number;
  facets: Facets;
  page: number;
  pageSize: number;
  origin: { label: string; lat: number; lng: number } | null;
}

export const GENDER_LABELS: Record<string, string> = {
  mens: "Men's",
  womens: "Women's",
  coed: 'Coed',
  // Its own value, not a flavour of coed. Reverse co-ed inverts which
  // positions each gender may play, so a player who filtered for Co-ed
  // and got this would have been given a wrong answer. 32 events in the
  // 2022-24 history run it.
  reverse_coed: 'Reverse Coed',
  open: 'Open / Mixed',
};
