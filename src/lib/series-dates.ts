/** Longest open-play run before it must be renewed (Tom, 23 Nov: was 12). */
export const OPEN_PLAY_MAX_WEEKS = 22;

/**
 * The dates of a dated series -- a league, or open play since 15 Nov 2026.
 *
 * Moved out of LeagueSchedule.tsx (a browser-only file) on 15 Nov so the
 * server can use it too: the Renew page builds the next run's dates before
 * the form ever opens. LeagueSchedule re-exports these, so nothing that
 * imported them from there had to change.
 *
 * All arithmetic is in UTC. A schedule crosses the daylight-saving change
 * nearly every autumn, and local-time date maths quietly shifts a night by
 * one day when it does.
 */

export interface LeagueDate {
  /** yyyy-mm-dd */
  plays_on: string;
  skipped: boolean;
  note?: string | null;
}

function parseISO(s: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s ?? '');
  if (!m) return null;
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  return Number.isNaN(d.getTime()) ? null : d;
}

function toISO(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/**
 * Build the schedule from the four stated facts.
 *
 * `prior` carries skips and notes forward: changing the season from 8 to
 * 10 weeks must not silently un-skip Thanksgiving. Exported so the parent
 * form can regenerate when the first-night date changes, rather than
 * running an effect that watches its own output -- that pattern cost us a
 * laggy search box once already.
 */
export function generateLeagueDates(
  firstNight: string,
  days: number[],
  weeks: number,
  prior: LeagueDate[] = [],
): LeagueDate[] {
  const start = parseISO(firstNight);
  if (!start || days.length === 0 || !Number.isFinite(weeks) || weeks < 1) return [];

  const kept = new Map(prior.map((d) => [d.plays_on, d]));
  const out: LeagueDate[] = [];

  for (const day of days) {
    // How far from the stated first night to that weekday's first occurrence.
    const offset = (day - start.getUTCDay() + 7) % 7;
    for (let w = 0; w < Math.min(weeks, 52); w += 1) {
      const d = new Date(start.getTime());
      d.setUTCDate(d.getUTCDate() + offset + w * 7);
      const iso = toISO(d);
      const was = kept.get(iso);
      out.push({ plays_on: iso, skipped: was?.skipped ?? false, note: was?.note ?? null });
    }
  }

  out.sort((a, b) => a.plays_on.localeCompare(b.plays_on));
  return out.filter((d, i, arr) => i === 0 || d.plays_on !== arr[i - 1].plays_on);
}

/** First and last night actually played — what starts_on / ends_on become. */
export function playingRange(dates: LeagueDate[]): { first: string; last: string } | null {
  const playing = dates.filter((d) => !d.skipped).map((d) => d.plays_on).sort();
  if (playing.length === 0) return null;
  return { first: playing[0], last: playing[playing.length - 1] };
}

/**
 * Where a renewal starts: the first of the series' nights AFTER its last
 * scheduled date. A Tue/Thu series whose last date is Thu 18 Feb renews
 * from Tue 23 Feb, so the new run follows on with no gap and no overlap.
 */
export function renewalStart(lastIso: string, days: number[]): string | null {
  const last = parseISO(lastIso);
  if (!last || days.length === 0) return null;
  for (let i = 1; i <= 7; i += 1) {
    const d = new Date(last.getTime());
    d.setUTCDate(d.getUTCDate() + i);
    if (days.includes(d.getUTCDay())) return toISO(d);
  }
  return null;
}
