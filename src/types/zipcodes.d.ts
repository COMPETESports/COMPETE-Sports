/**
 * Minimal typings for the `zipcodes` package, which ships none.
 * Only the two lookups COMPETE uses are declared.
 */
declare module 'zipcodes' {
  export interface ZipRecord {
    zip: string;
    latitude: number;
    longitude: number;
    city: string;
    state: string;
    country: string;
  }

  export function lookup(zip: string | number): ZipRecord | undefined;
  export function lookupByName(city: string, state: string): ZipRecord[];
  export function lookupByState(state: string): ZipRecord[];
  export function distance(zipA: string, zipB: string): number | null;
  export function radius(zip: string, miles: number): string[];

  const zipcodes: {
    lookup: typeof lookup;
    lookupByName: typeof lookupByName;
    lookupByState: typeof lookupByState;
    distance: typeof distance;
    radius: typeof radius;
  };
  export default zipcodes;
}
