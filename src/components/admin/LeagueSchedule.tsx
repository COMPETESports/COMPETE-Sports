'use client';

import { generateLeagueDates, playingRange, type LeagueDate } from '@/lib/series-dates';

// Re-exported so existing imports from this file keep working.
export { generateLeagueDates, playingRange };
export type { LeagueDate };

/**
 * The league half of the submission form.
 *
 * A director does not think "the season ends on 22 December". He thinks
 * "Tuesdays, 7pm, eight weeks, starting the 4th -- off for Thanksgiving".
 * So those are the four things this asks for, and the actual dates are
 * generated from them and shown as something to look at and click, not a
 * field to fill in. Clicking a night marks it as not playing; the dates
 * are what gets saved, so the hole in the schedule survives.
 */


/** 0 = Sunday, matching JavaScript getDay() and Postgres extract(dow). */
const DAYS = [
  { n: 0, short: 'Sun' },
  { n: 1, short: 'Mon' },
  { n: 2, short: 'Tue' },
  { n: 3, short: 'Wed' },
  { n: 4, short: 'Thu' },
  { n: 5, short: 'Fri' },
  { n: 6, short: 'Sat' },
];

/* ---- date helpers ----
   All arithmetic is in UTC. A league schedule crosses the daylight-saving
   change nearly every autumn season, and local-time date maths quietly
   shifts a night by one day when it does. */

function parseISO(s: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s ?? '');
  if (!m) return null;
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  return Number.isNaN(d.getTime()) ? null : d;
}

function toISO(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export function formatNight(iso: string): string {
  const d = parseISO(iso);
  if (!d) return iso;
  return d.toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  });
}


export interface LeagueScheduleProps {
  firstNight: string;
  days: number[];
  weeks: string;
  dates: LeagueDate[];
  playoffs: boolean;
  onDaysChange: (days: number[]) => void;
  onWeeksChange: (weeks: string) => void;
  onDatesChange: (dates: LeagueDate[]) => void;
  onPlayoffsChange: (on: boolean) => void;
  error?: string | null;
  /** Open play reuses this schedule (15 Nov 2026) with its own wording, a
   *  12-week cap and no playoffs. */
  weeksLabel?: string;
  maxWeeks?: number;
  showPlayoffs?: boolean;
}

export function LeagueSchedule({
  firstNight,
  days,
  weeks,
  dates,
  playoffs,
  onDaysChange,
  onWeeksChange,
  onDatesChange,
  onPlayoffsChange,
  error,
  weeksLabel = 'How many weeks?',
  maxWeeks = 52,
  showPlayoffs = true,
}: LeagueScheduleProps) {
  const weeksNum = Number(weeks);

  // Both handlers regenerate immediately, so the dates below are never
  // stale relative to the controls above them.
  function toggleDay(n: number) {
    const next = days.includes(n) ? days.filter((d) => d !== n) : [...days, n].sort();
    onDaysChange(next);
    onDatesChange(generateLeagueDates(firstNight, next, weeksNum, dates));
  }

  function setWeeks(value: string) {
    // Capped as typed, so "20" on an open play form becomes 12 on screen
    // rather than being refused on save.
    const capped = value && Number(value) > maxWeeks ? String(maxWeeks) : value;
    onWeeksChange(capped);
    onDatesChange(generateLeagueDates(firstNight, days, Number(capped), dates));
  }

  function toggleNight(iso: string) {
    onDatesChange(
      dates.map((d) => (d.plays_on === iso ? { ...d, skipped: !d.skipped } : d)),
    );
  }

  const range = playingRange(dates);
  const playing = dates.filter((d) => !d.skipped).length;
  const skipped = dates.length - playing;

  return (
    <div className="sm:col-span-2 grid gap-5">
      {/* 1 - which night */}
      <fieldset>
        <legend className="t-head mb-2 block text-sm text-[color:var(--muted)]">
          Which night does it play?
        </legend>
        <div className="flex flex-wrap gap-2">
          {DAYS.map((d) => {
            const on = days.includes(d.n);
            return (
              <button
                key={d.n}
                type="button"
                onClick={() => toggleDay(d.n)}
                aria-pressed={on}
                className="t-head rounded-xl border px-4 py-2 text-sm transition-colors"
                style={
                  on
                    ? { borderColor: 'var(--grass)', color: 'var(--grass)' }
                    : { borderColor: 'var(--line)', color: 'var(--muted)' }
                }
              >
                {d.short}
              </button>
            );
          })}
        </div>
        <p className="mt-2 text-xs text-[color:var(--muted)] opacity-70">
          Most leagues play one night. Pick two if yours runs twice a week.
        </p>
      </fieldset>

      {/* 2 - how long */}
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="grid gap-1.5">
          <span className="t-head text-sm text-[color:var(--muted)]">{weeksLabel}</span>
          <input
            value={weeks}
            onChange={(e) => setWeeks(e.target.value.replace(/[^0-9]/g, ''))}
            inputMode="numeric"
            placeholder={maxWeeks < 52 ? `Up to ${maxWeeks}` : '8'}
            className="field"
          />
        </label>
        {showPlayoffs && (
        <label className="grid content-end gap-1.5">
          <span className="t-head text-sm text-[color:var(--muted)]">Season ends with</span>
          <button
            type="button"
            onClick={() => onPlayoffsChange(!playoffs)}
            aria-pressed={playoffs}
            className="t-head rounded-xl border px-4 py-2.5 text-left text-sm transition-colors"
            style={
              playoffs
                ? { borderColor: 'var(--turf)', color: 'var(--turf)' }
                : { borderColor: 'var(--line)', color: 'var(--muted)' }
            }
          >
            {playoffs ? 'Playoffs / end-of-season tournament' : 'Regular season only'}
          </button>
        </label>
        )}
      </div>

      {/* 3 - the actual nights, to look at and correct */}
      {dates.length > 0 ? (
        <div>
          <p className="t-head mb-2 text-sm text-[color:var(--muted)]">
            These are the nights. Click any one it does <em>not</em> run — a holiday, a gym booking — and players see it crossed out.
          </p>
          <div className="flex flex-wrap gap-2">
            {dates.map((d) => (
              <button
                key={d.plays_on}
                type="button"
                onClick={() => toggleNight(d.plays_on)}
                aria-pressed={d.skipped}
                title={d.skipped ? 'Not playing - click to restore' : 'Playing - click to skip'}
                className="rounded-lg border px-3 py-1.5 text-xs transition-colors"
                style={
                  d.skipped
                    ? {
                        borderColor: 'var(--line)',
                        color: 'var(--muted)',
                        opacity: 0.55,
                        textDecoration: 'line-through',
                      }
                    : { borderColor: 'var(--indoor)', color: 'var(--indoor)' }
                }
              >
                {formatNight(d.plays_on)}
              </button>
            ))}
          </div>

          <p className="mt-3 text-xs text-[color:var(--muted)]">
            {playing} night{playing === 1 ? '' : 's'} playing
            {skipped > 0 ? ` · ${skipped} skipped` : ''}
            {range
              ? ` · ${formatNight(range.first)} through ${formatNight(range.last)}`
              : ''}
          </p>
          {playing === 0 && (
            <p className="mt-1 text-xs text-[color:var(--beach)]">
              Every night is skipped, so the season has no dates. Restore at least one.
            </p>
          )}
        </div>
      ) : (
        <p className="rounded-xl border border-dashed px-4 py-3 text-xs text-[color:var(--muted)]"
           style={{ borderColor: 'var(--line)' }}>
          Pick a night and a number of weeks, and the dates appear here for you to
          check before saving.
        </p>
      )}

      {/* Carried to the server as one field, so a skipped night cannot be
          lost between the list above and the database. */}
      <input type="hidden" name="league_days" value={JSON.stringify(days)} />
      <input type="hidden" name="league_weeks" value={weeks} />
      <input type="hidden" name="playoffs" value={playoffs ? 'on' : ''} />
      <input type="hidden" name="league_dates" value={JSON.stringify(dates)} />

      {error && (
        <p className="t-mono text-[10px] uppercase tracking-wider text-[color:var(--coral-ink)]">
          {error}
        </p>
      )}
    </div>
  );
}
