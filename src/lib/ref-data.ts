import { sql } from './db';

export interface RefOption {
  slug: string;
  name: string;
}

/**
 * A format carries its gender and team size, because in this schema a
 * format IS a gender and a headcount — "Men's Doubles" is one row, not two
 * fields. The bracket builder needs both: gender to group the choices, team
 * size to label them in Tom's vocabulary (Doubles 2v2, Triples 3v3) rather
 * than repeating the gender in every button.
 */
export interface FormatRefOption extends RefOption {
  gender: string;
  team_size: number | null;
  // False for formats retired by 012 — blind-draw and
  // king-queen-of-the-beach, which sub_formats replaces. They are still
  // returned, because an event that already uses one must stay editable;
  // the builder hides them unless a bracket already references them.
  is_active: boolean;
}

/**
 * Blind Draw, KOB and QOB — a property of the bracket, not a format of
 * its own. See 012_sub_formats.sql for why that reversed on 18 Oct.
 */
export interface SubFormatRefOption extends RefOption {
  registers_as: 'individual' | 'partner';
  requires_surface: string | null;
  requires_gender: string | null;
}

/** Surfaces, formats, sub-formats and divisions available for one sport. */
export async function loadRefOptions(sportSlug: string) {
  const [surfaces, formats, subFormats, divisions] = await Promise.all([
    sql<RefOption[]>`
      select s.slug, s.name from surfaces s
      join sports sp on sp.id = s.sport_id
      where sp.slug = ${sportSlug} order by s.display_order`,
    sql<FormatRefOption[]>`
      select f.slug, f.name, f.gender, f.team_size, f.is_active from formats f
      join sports sp on sp.id = f.sport_id
      where sp.slug = ${sportSlug} order by f.display_order`,
    sql<SubFormatRefOption[]>`
      select sf.slug, sf.name, sf.registers_as, sf.requires_surface, sf.requires_gender
      from sub_formats sf
      join sports sp on sp.id = sf.sport_id
      where sp.slug = ${sportSlug} order by sf.display_order`,
    sql<RefOption[]>`
      select d.slug, d.name from divisions d
      join sports sp on sp.id = d.sport_id
      where sp.slug = ${sportSlug} order by d.display_order`,
  ]);

  return {
    surfaces: [...surfaces],
    formats: [...formats],
    subFormats: [...subFormats],
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
