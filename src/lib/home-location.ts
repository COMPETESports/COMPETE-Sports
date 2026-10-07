import { DEFAULT_RADIUS } from './search-params';

/** Where the homepage's "near you" rail gets its location from. */
export const HOME_ZIP_COOKIE = 'compete_home_zip';
export const HOME_ZIP_MAX_AGE = 60 * 60 * 24 * 365;

/**
 * The radius used when nobody has said otherwise. Re-exported from
 * search-params so the homepage rail and the search page cannot drift
 * apart: there is one default in the codebase, and it is 90 miles.
 *
 * A signed-in athlete's own `travel_radius_miles` wins over this. Whichever
 * one is in play must also be the number printed in the heading — labelling
 * a 200-mile result set "within 90 miles" is the kind of small lie that
 * makes someone stop trusting the whole page.
 */
export const LOCAL_RADIUS_MILES = DEFAULT_RADIUS;
