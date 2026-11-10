/**
 * How a league reads to a player.
 *
 * A tournament is a date. A league is a night -- "Tuesdays" -- and a
 * season, and a player deciding whether to join asks three things a single
 * date cannot answer: which night, for how long, and has it started.
 *
 * Pure functions, no database, so they are unit-tested in
 * tests/league.test.ts. `today` is always passed in rather than read, for
 * the same reason.
 */

const NIGHTS = ['Sundays', 'Mondays', 'Tuesdays', 'Wednesdays', 'Thursdays', 'Fridays', 'Saturdays'];
const SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

/** "Tuesdays", or "Tuesdays & Thursdays". Empty when the source does not say. */
export function nightsLabel(days: number[] | null | undefined): string {
  const list = sortedDays(days);
  if (!list.length) return '';
  if (list.length === 1) return NIGHTS[list[0]];
  return `${list.slice(0, -1).map((d) => NIGHTS[d]).join(', ')} & ${NIGHTS[list[list.length - 1]]}`;
}

/** "TUE" or "TUE · THU" -- the card's date block has room for very little. */
export function nightsShort(days: number[] | null | undefined): string {
  return sortedDays(days)
    .map((d) => SHORT[d])
    .join(' · ');
}

function sortedDays(days: number[] | null | undefined): number[] {
  return [...new Set((days ?? []).map(Number))]
    .filter((d) => Number.isInteger(d) && d >= 0 && d <= 6)
    .sort((a, b) => a - b);
}

export type LeaguePhase = 'upcoming' | 'underway' | 'finished' | 'unknown';

export interface LeagueStatus {
  phase: LeaguePhase;
  /** The next night it plays, today included. Null once the season is over. */
  nextNight: string | null;
  /** Playing nights already behind us. */
  played: number;
  /** Playing nights in the season, skipped ones not counted. */
  total: number;
}

/**
 * Where the season stands on `today`.
 *
 * `nights` are the dates it actually plays -- skipped nights are already
 * gone. Counted in NIGHTS, not weeks, on purpose: a season billed as eight
 * weeks with Thanksgiving off plays seven nights, and "week 8 of 8" would
 * never arrive. "Night 3 of 7" is simply true.
 *
 * Tonight counts as still to come, not played: a player looking at 5pm
 * can still turn up.
 */
export function leagueStatus(nights: string[] | null | undefined, today: string): LeagueStatus {
  const list = [...(nights ?? [])].sort();
  const total = list.length;
  if (!total) return { phase: 'unknown', nextNight: null, played: 0, total: 0 };

  const played = list.filter((n) => n < today).length;
  const nextNight = list.find((n) => n >= today) ?? null;
  const phase: LeaguePhase =
    played === 0 ? 'upcoming' : played === total ? 'finished' : 'underway';
  return { phase, nextNight, played, total };
}

/** "Night 3 of 8" while it runs. Empty otherwise. */
export function underwayLabel(status: LeagueStatus): string {
  return status.phase === 'underway' ? `Night ${status.played + 1} of ${status.total}` : '';
}

/** "19:00:00" -> "7:00 PM". Postgres `time` arrives as a string. */
export function formatClock(value: string | null | undefined): string {
  const m = /^(\d{1,2}):(\d{2})/.exec(value ?? '');
  if (!m) return '';
  const h = Number(m[1]);
  const suffix = h >= 12 ? 'PM' : 'AM';
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${m[2]} ${suffix}`;
}

/**
 * The season in one line: "8 weeks · 7:00 PM · Playoffs".
 *
 * Every part is optional and only shown when the organizer stated it --
 * no guessed season length, no invented tip-off.
 */
export function seasonLine(event: {
  league_weeks: number | null;
  start_time: string | null;
  playoffs: boolean;
}): string {
  const parts: string[] = [];
  if (event.league_weeks) parts.push(`${event.league_weeks} ${event.league_weeks === 1 ? 'week' : 'weeks'}`);
  const clock = formatClock(event.start_time);
  if (clock) parts.push(clock);
  if (event.playoffs) parts.push('Playoffs');
  return parts.join(' · ');
}

export const EVENT_TYPE_LABELS: Record<string, string> = {
  tournament: 'Tournaments',
  league: 'Leagues',
  open_play: 'Open play',
};
