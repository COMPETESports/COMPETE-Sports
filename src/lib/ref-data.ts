import { sql } from './db';

export interface RefOption {
  slug: string;
  name: string;
}

/** Surfaces, formats and divisions available for one sport. */
export async function loadRefOptions(sportSlug: string) {
  const [surfaces, formats, divisions] = await Promise.all([
    sql<RefOption[]>`
      select s.slug, s.name from surfaces s
      join sports sp on sp.id = s.sport_id
      where sp.slug = ${sportSlug} order by s.display_order`,
    sql<RefOption[]>`
      select f.slug, f.name from formats f
      join sports sp on sp.id = f.sport_id
      where sp.slug = ${sportSlug} order by f.display_order`,
    sql<RefOption[]>`
      select d.slug, d.name from divisions d
      join sports sp on sp.id = d.sport_id
      where sp.slug = ${sportSlug} order by d.display_order`,
  ]);

  return {
    surfaces: [...surfaces],
    formats: [...formats],
    divisions: [...divisions],
  };
}

export interface RefRow {
  id: string;
  slug: string;
  name: string;
  sport_slug: string;
  sport_name: string;
}

/**
 * Everything a player can express a preference about, with ids.
 *
 * Grouped by sport because surfaces, formats and divisions all belong to
 * one, and a pickleball player should never be offered "Grass" — the
 * vocabulary comes from the same tables the event filters use, so the two
 * can never drift apart.
 */
export async function loadPreferenceOptions() {
  const [sports, surfaces, formats, divisions] = await Promise.all([
    sql<{ id: string; slug: string; name: string }[]>`
      select id, slug, name from sports where is_active order by display_order, name`,
    sql<RefRow[]>`
      select s.id, s.slug, s.name, sp.slug as sport_slug, sp.name as sport_name
        from surfaces s join sports sp on sp.id = s.sport_id
       order by sp.display_order, s.display_order`,
    sql<RefRow[]>`
      select f.id, f.slug, f.name, sp.slug as sport_slug, sp.name as sport_name
        from formats f join sports sp on sp.id = f.sport_id
       order by sp.display_order, f.display_order`,
    sql<RefRow[]>`
      select d.id, d.slug, d.name, sp.slug as sport_slug, sp.name as sport_name
        from divisions d join sports sp on sp.id = d.sport_id
       order by sp.display_order, d.display_order`,
  ]);

  return {
    sports: [...sports],
    surfaces: [...surfaces],
    formats: [...formats],
    divisions: [...divisions],
  };
}
