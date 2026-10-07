import zipcodes from 'zipcodes';

export interface GeoPoint {
  label: string;
  lat: number;
  lng: number;
  /**
   * Two-letter USPS code, when the lookup knew one. The postal table and a
   * "City, ST" query always do; Mapbox returns a formatted string and is
   * not parsed back apart, so it reports null rather than a guess.
   *
   * Used to pick the visitor's region, so a wrong value here would put
   * someone in Missouri under a Southeast heading. Null means "no regional
   * rail", which is the honest outcome.
   */
  state: string | null;
  source: 'postal' | 'city' | 'mapbox';
}

const STATE_CODES = new Set([
  'AL','AK','AZ','AR','CA','CO','CT','DE','FL','GA','HI','ID','IL','IN','IA',
  'KS','KY','LA','ME','MD','MA','MI','MN','MS','MO','MT','NE','NV','NH','NJ',
  'NM','NY','NC','ND','OH','OK','OR','PA','RI','SC','SD','TN','TX','UT','VT',
  'VA','WA','WV','WI','WY','DC',
]);

/**
 * Resolves what a person typed into the location box.
 *
 * A bundled US postal table answers ZIP codes and "City, ST" instantly and
 * for free, which covers the overwhelming majority of real searches. Mapbox
 * is called only when the local table cannot answer, so the geocoding bill
 * stays near zero and the site keeps working if Mapbox is unreachable.
 */
export async function geocode(input: string): Promise<GeoPoint | null> {
  const query = input.trim();
  if (!query) return null;

  // "63110" or "63110-1234"
  const zipMatch = query.match(/^(\d{5})(?:-\d{4})?$/);
  if (zipMatch) {
    const hit = zipcodes.lookup(zipMatch[1]) as
      | { latitude: number; longitude: number; city: string; state: string }
      | undefined;
    if (hit) {
      return {
        label: `${hit.city}, ${hit.state} ${zipMatch[1]}`,
        lat: hit.latitude,
        lng: hit.longitude,
        state: hit.state,
        source: 'postal',
      };
    }
  }

  // "St. Louis, MO" / "Saint Louis MO"
  const cityState = query.match(/^(.+?)[,\s]+([A-Za-z]{2})$/);
  if (cityState) {
    const state = cityState[2].toUpperCase();
    if (STATE_CODES.has(state)) {
      const city = cityState[1].trim();
      for (const candidate of cityVariants(city)) {
        const hits = zipcodes.lookupByName(candidate, state) as
          | Array<{ latitude: number; longitude: number }>
          | undefined;
        if (hits && hits.length) {
          return {
            label: `${candidate}, ${state}`,
            lat: avg(hits.map((h) => h.latitude)),
            lng: avg(hits.map((h) => h.longitude)),
            state,
            source: 'city',
          };
        }
      }
    }
  }

  return geocodeWithMapbox(query);
}

async function geocodeWithMapbox(query: string): Promise<GeoPoint | null> {
  const token = process.env.MAPBOX_TOKEN;
  if (!token) return null;

  const url =
    `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(query)}.json` +
    `?access_token=${token}&country=us&types=postcode,place,locality,neighborhood,address&limit=1`;

  try {
    const res = await fetch(url, { next: { revalidate: 60 * 60 * 24 * 30 } });
    if (!res.ok) return null;
    const body = (await res.json()) as {
      features?: Array<{ place_name: string; center: [number, number] }>;
    };
    const feature = body.features?.[0];
    if (!feature) return null;
    return {
      label: feature.place_name.replace(/, United States$/, ''),
      lat: feature.center[1],
      lng: feature.center[0],
      state: null,
      source: 'mapbox',
    };
  } catch {
    // A geocoding outage degrades location search; it must not take the
    // whole discovery page down.
    return null;
  }
}

function cityVariants(city: string): string[] {
  const out = [city];
  const expanded = city
    .replace(/^St\.?\s+/i, 'Saint ')
    .replace(/^Ft\.?\s+/i, 'Fort ')
    .replace(/^Mt\.?\s+/i, 'Mount ');
  if (expanded !== city) out.push(expanded);
  const bare = city.replace(/\./g, '');
  if (!out.includes(bare)) out.push(bare);
  return out;
}

const avg = (xs: number[]): number => xs.reduce((a, b) => a + b, 0) / xs.length;

/** Degrees of latitude/longitude covering `miles` at a given latitude. */
export function boundingBox(lat: number, lng: number, miles: number) {
  const latDelta = miles / 69;
  const lngDelta = miles / (69 * Math.max(Math.cos((lat * Math.PI) / 180), 0.01));
  return {
    minLat: lat - latDelta,
    maxLat: lat + latDelta,
    minLng: lng - lngDelta,
    maxLng: lng + lngDelta,
  };
}
