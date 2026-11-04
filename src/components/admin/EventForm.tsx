'use client';

import Link from 'next/link';
import { useActionState, useEffect, useRef, useState } from 'react';
import { useFormStatus } from 'react-dom';
import { saveEvent, type ActionState } from '@/lib/admin';
import { DeleteDraft } from './DeleteDraft';
import { PasteBox } from './PasteBox';
import {
  BracketBuilder,
  type BracketGroup,
  type FormatOption,
  type SubFormatOption,
} from './BracketBuilder';
import {
  LeagueSchedule,
  generateLeagueDates,
  playingRange,
  type LeagueDate,
} from './LeagueSchedule';
import { OrganizerPicker, type OrganizerOption } from './OrganizerPicker';
import { PlacesAutocomplete } from './PlacesAutocomplete';
import { VenuePicker, type VenueOption } from './VenuePicker';
import { labelFor } from '@/lib/field-labels';
import type { ParsedListing } from '@/lib/parse-listing';

const WEEK = [
  { n: 0, short: 'Sun' }, { n: 1, short: 'Mon' }, { n: 2, short: 'Tue' },
  { n: 3, short: 'Wed' }, { n: 4, short: 'Thu' }, { n: 5, short: 'Fri' },
  { n: 6, short: 'Sat' },
];

/** Which nights open play runs. Same shape as the league night picker,
 *  without a season to generate - open play repeats, it does not have a
 *  fixed run of dates with a champion at the end. */
function OpenPlayNights({
  days,
  onChange,
  error,
}: {
  days: number[];
  onChange: (d: number[]) => void;
  error?: string | null;
}) {
  return (
    <fieldset className="sm:col-span-2">
      <legend className="t-head mb-2 block text-sm text-[color:var(--muted)]">
        Which nights does it run?
      </legend>
      <div className="flex flex-wrap gap-2">
        {WEEK.map((d) => {
          const on = days.includes(d.n);
          return (
            <button
              key={d.n}
              type="button"
              onClick={() =>
                onChange(on ? days.filter((x) => x !== d.n) : [...days, d.n].sort())
              }
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
      <input type="hidden" name="league_days" value={JSON.stringify(days)} />
      {error && (
        <p className="t-mono mt-2 text-[10px] uppercase tracking-wider text-[color:var(--coral-ink)]">
          {error}
        </p>
      )}
    </fieldset>
  );
}

export interface RefOption {
  slug: string;
  name: string;
}

export interface EventFormValues {
  id?: string;
  name: string;
  /** tournament | league | open_play. The first question on the form. */
  event_type: string;
  sport: string;
  starts_on: string;
  ends_on: string;
  /**
   * When play actually starts. Every event type has one: first serve at a
   * tournament, tip-off each week at a league, the hour the nets go up at
   * open play.
   */
  start_time: string;
  /** Tournament only: when the doors open and players sign in. */
  check_in_time: string;
  /**
   * Tournament only: the captain's meeting. Separate from check-in by
   * decision - Tom, 3 Nov - because organizers run them as two things.
   * Never required here; it matters most on the organizer-facing form,
   * where a captain needs to know whether to be there early.
   */
  meeting_time: string;
  registration_deadline: string;
  /** League only. 0 = Sunday. See 015_league_schedule.sql. */
  league_days: number[];
  league_weeks: string;
  league_dates: LeagueDate[];
  playoffs: boolean;
  /** Open play only: when the session ends, and whether it just keeps going. */
  end_time: string;
  is_ongoing: boolean;
  entry_fee: string;
  fee_basis: string;
  payout_text: string;
  event_page_url: string;
  flyer_url: string;
  notes: string;
  venue_name: string;
  /** Set only by a Google lookup. Blank means "geocode it the old way". */
  venue_latitude: string;
  venue_longitude: string;
  venue_place_id: string;
  venue_business_status: string;
  address_line: string;
  city: string;
  state: string;
  postal_code: string;
  organizer_name: string;
  organizer_email: string;
  surfaces: string[];
  formats: string[];
  divisions: string[];
  brackets: BracketGroup[];
  status: string;
}

type TextKey = Exclude<
  keyof EventFormValues,
  | 'surfaces'
  | 'formats'
  | 'divisions'
  | 'brackets'
  | 'id'
  | 'league_days'
  | 'league_dates'
  | 'playoffs'
  | 'is_ongoing'
>;

/**
 * The three kinds of event, and what each one is in Tom's words. The
 * description matters: "league" and "open play" are not obvious to
 * someone entering their first event, and a wrong choice here changes
 * every question after it.
 */
const EVENT_TYPES: { slug: string; name: string; blurb: string }[] = [
  { slug: 'tournament', name: 'Tournament', blurb: 'Single or multi-day event' },
  { slug: 'league', name: 'League', blurb: 'Weekly season competition' },
  { slug: 'open_play', name: 'Open Play', blurb: 'Drop in & ball' },
];

export function EventForm({
  values,
  options,
}: {
  values: EventFormValues;
  options: {
    surfaces: RefOption[];
    formats: FormatOption[];
    subFormats: SubFormatOption[];
    divisions: RefOption[];
    venues: VenueOption[];
    organizers: OrganizerOption[];
  };
}) {
  const [state, action] = useActionState<ActionState | null, FormData>(saveEvent, null);

  /**
   * Both panels that report the outcome of a save - the confirmation and
   * the error summary - render at the top of the form, and after a long
   * event the Save button is a screen or two below them. Without this the
   * page simply sits there and the save looks like it did nothing.
   *
   * Keyed on the id and on the error text so a second save of the same
   * event scrolls again. Safe as an effect: it reads the action state and
   * writes none of it, so there is no loop.
   */
  const outcome = state?.saved?.id ?? state?.message ?? null;
  const lastOutcome = useRef<string | null>(null);

  useEffect(() => {
    if (!state || outcome === lastOutcome.current) return;
    lastOutcome.current = outcome;
    const motion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    window.scrollTo({ top: 0, behavior: motion ? 'auto' : 'smooth' });
  }, [state, outcome]);

  // Inputs are controlled so the paste box can fill them. `autoFilled`
  // tracks which fields came from a paste, and a field drops out of it the
  // moment the person edits it by hand.
  const [v, setV] = useState<EventFormValues>(values);
  const [autoFilled, setAutoFilled] = useState<Set<string>>(new Set());

  const set = (
    key: keyof EventFormValues,
    value: string | string[] | number[] | boolean | BracketGroup[] | LeagueDate[],
  ) => {
    setV((prev) => ({ ...prev, [key]: value }));
    setAutoFilled((prev) => {
      if (!prev.has(key)) return prev;
      const next = new Set(prev);
      next.delete(key);
      return next;
    });
  };

  const toggle = (key: 'surfaces' | 'formats' | 'divisions', slug: string) => {
    setV((prev) => {
      const current = prev[key];
      return {
        ...prev,
        [key]: current.includes(slug)
          ? current.filter((s) => s !== slug)
          : [...current, slug],
      };
    });
    setAutoFilled((prev) => {
      if (!prev.has(key)) return prev;
      const next = new Set(prev);
      next.delete(key);
      return next;
    });
  };

  const applyParsed = (fields: ParsedListing, filled: string[]) => {
    setV((prev) => {
      const next = { ...prev };
      for (const [key, value] of Object.entries(fields)) {
        if (value === undefined) continue;
        if (Array.isArray(value)) {
          if (value.length) (next as Record<string, unknown>)[key] = value;
        } else {
          (next as Record<string, unknown>)[key] = String(value);
        }
      }

      // A pasted announcement gives flat lists, which by their nature cannot
      // say which format ran at which division. Turning that into brackets
      // would be inventing the combinations — the very guess this builder
      // exists to stop.
      //
      // The one safe case is a single format: there is then only one way to
      // read it. Anything more and the builder stays empty for Tom to fill
      // in from what the organizer actually published.
      const parsedFormats = fields.formats ?? [];
      const parsedSurfaces = fields.surfaces ?? [];
      next.brackets =
        parsedFormats.length === 1
          ? [
              {
                // Same rule as format: one is unambiguous, more than one
                // would mean guessing which bracket ran where.
                surface: parsedSurfaces.length === 1 ? parsedSurfaces[0] : null,
                format: parsedFormats[0],
                divisions: fields.divisions ?? [],
              },
            ]
          : [];

      return next;
    });
    setAutoFilled(new Set(filled));
  };

  const err = (field: string) => state?.fieldErrors?.[field];
  const isAuto = (field: string) => autoFilled.has(field);

  const isLeague = v.event_type === 'league';
  const isOpenPlay = v.event_type === 'open_play';

  /**
   * Moving the first night has to move the whole schedule with it.
   * Done here, in the change handler, rather than in an effect watching
   * starts_on -- an effect that writes the state it depends on is what
   * made the search box lag, and the same trap is open here.
   */
  const setFirstNight = (value: string) => {
    setV((prev) => ({
      ...prev,
      starts_on: value,
      league_dates: generateLeagueDates(
        value,
        prev.league_days,
        Number(prev.league_weeks),
        prev.league_dates,
      ),
    }));
  };

  // ends_on for a league is the last night actually played, so every
  // existing query -- the live/past filter, the date sort -- keeps working
  // without knowing what a league is. The server derives this too; this
  // copy only keeps the hidden field honest while the form is open.
  const seasonEnd = playingRange(v.league_dates)?.last ?? '';

  const text = (key: TextKey) => ({
    value: v[key] ?? '',
    onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
      set(key, e.target.value),
  });

  return (
    <div className="mt-6 space-y-6">
      {/* Paste-and-parse is for entering something new; editing an existing
          record starts from what is already saved. */}
      {!values.id && <PasteBox onParsed={applyParsed} sport={v.sport} />}

      <form action={action} className="space-y-6">
        {values.id && <input type="hidden" name="id" value={values.id} />}
        <input type="hidden" name="sport" value={v.sport} />

        {/* "Some fields need fixing" on its own sends you hunting, because
            the field that failed may not even be on screen - a bracket
            rule, or a league field on a tournament. Every error is listed
            here by name, so nothing can hide. Tom, 3 Nov. */}
        {state && !state.saved && state.fieldErrors &&
          Object.keys(state.fieldErrors).length > 0 && (
            <div role="alert" className="panel tone-bad p-4">
              <p className="t-head text-base">
                {Object.keys(state.fieldErrors).length === 1
                  ? '1 field needs fixing'
                  : `${Object.keys(state.fieldErrors).length} fields need fixing`}
              </p>
              <ul className="mt-2 space-y-1.5">
                {Object.entries(state.fieldErrors).map(([key, msg]) => (
                  <li key={key} className="text-sm leading-relaxed">
                    <button
                      type="button"
                      onClick={() => {
                        const el = document.querySelector<HTMLElement>(`[name="${key}"]`);
                        el?.scrollIntoView({ block: 'center', behavior: 'smooth' });
                        el?.focus();
                      }}
                      className="underline underline-offset-2"
                    >
                      <strong>{labelFor(key)}</strong>
                    </button>
                    {' — '}
                    {msg}
                  </li>
                ))}
              </ul>
            </div>
          )}

        {state && !state.saved &&
          !(state.fieldErrors && Object.keys(state.fieldErrors).length > 0) && (
            <p
              role="status"
              className={`panel p-3 text-sm ${state.ok ? 'tone-good' : 'tone-bad'}`}
            >
              {state.message}
            </p>
          )}

        {/* A save that worked ends with somewhere to go. A green line on
            its own leaves you wondering whether publishing to a live site
            actually did anything. Tom, 27 Oct. */}
        {state?.saved && (
          <div role="status" className="panel tone-good p-4">
            <p className="t-head text-base">{state.message}</p>
            <div className="mt-3 flex flex-wrap gap-2">
              {state.saved.status === 'approved' && state.saved.slug && (
                <a
                  href={`/events/${state.saved.slug}`}
                  target="_blank"
                  rel="noreferrer"
                  className="btn-primary !py-2 !text-xs"
                >
                  View it on the site ↗
                </a>
              )}
              <Link href="/admin/events" className="btn-ghost !py-2 !text-xs">
                All events
              </Link>
              <Link href="/admin/events/new" className="btn-ghost !py-2 !text-xs">
                Add another
              </Link>
            </div>
          </div>
        )}

        {/* First question, because it decides every question after it.
            Chips rather than a dropdown so all three are visible at once
            with what each one means - nobody entering their first event
            knows that "open play" means drop-in. The branching form comes
            later; this records the answer so the data is right meanwhile. */}
        <Section title="What kind of event">
          <fieldset className="sm:col-span-2">
            <legend className="sr-only">Event type</legend>
            <div className="flex flex-wrap gap-2">
              {EVENT_TYPES.map((t) => {
                const on = v.event_type === t.slug;
                return (
                  <button
                    key={t.slug}
                    type="button"
                    onClick={() => set('event_type', t.slug)}
                    aria-pressed={on}
                    className="rounded-xl border px-4 py-2.5 text-left transition-colors"
                    style={
                      on
                        ? { borderColor: 'var(--grass)', color: 'var(--grass)' }
                        : { borderColor: 'var(--line)', color: 'var(--muted)' }
                    }
                  >
                    <span className="t-head block text-sm">{t.name}</span>
                    <span className="block text-xs opacity-80">{t.blurb}</span>
                  </button>
                );
              })}
            </div>
            <input type="hidden" name="event_type" value={v.event_type} />
            {err('event_type') && (
              <p className="t-mono mt-2 text-[10px] uppercase tracking-wider text-[color:var(--coral-ink)]">
                {err('event_type')}
              </p>
            )}
          </fieldset>
        </Section>

        <Section title="Organizer">
          {/* Pick, don't type. saveEvent matches an organizer by a slug
              made from whatever was entered, so "Angry Dragons" where
              "Angry Dragon Volleyball" exists mints a second record and
              splits 36 events across two pages. Tom, 3 Nov. */}
          <OrganizerPicker
            organizers={options.organizers}
            current={v.organizer_name}
            onPick={(o) =>
              setV((prev) => ({
                ...prev,
                organizer_name: o.name,
                organizer_email: o.contact_email ?? prev.organizer_email,
              }))
            }
          />
          <Field label="Organizer name" error={err('organizer_name')} auto={isAuto('organizer_name')}>
            <input name="organizer_name" {...text('organizer_name')} className="field" />
          </Field>
          <Field label="Organizer email" error={err('organizer_email')} auto={isAuto('organizer_email')}>
            <input type="email" name="organizer_email" {...text('organizer_email')} className="field" />
          </Field>
          <Field
            label="Event / registration page"
            hint="Full URL including https://"
            error={err('event_page_url')}
            auto={isAuto('event_page_url')}
            className="sm:col-span-2"
          >
            <input name="event_page_url" {...text('event_page_url')} className="field" />
          </Field>
          <Field label="Flyer image URL" error={err('flyer_url')} auto={isAuto('flyer_url')} className="sm:col-span-2">
            <input name="flyer_url" {...text('flyer_url')} className="field" />
          </Field>
          <Field label="Notes shown to players" error={err('notes')} auto={isAuto('notes')} className="sm:col-span-2">
            <textarea name="notes" {...text('notes')} rows={4} className="field-area" />
          </Field>
        </Section>
        <Section title={isLeague ? 'Season' : 'Event'}>
          <Field
            label={isLeague ? 'League name' : 'Event name'}
            error={err('name')}
            auto={isAuto('name')}
            className="sm:col-span-2"
          >
            <input name="name" {...text('name')} required className="field" />
          </Field>

          {/* A league's dates are a schedule, not a span. Asking it for a
              start and an end date produced a season that looked like a
              very long tournament and told a player nothing about which
              night to turn up on. Tom, 31 Oct. */}
          {isOpenPlay ? (
            <>
              {/* Drop in & ball. Not a tournament with one date, not a
                  league with a fixed season and a champion. It runs on
                  certain nights, between certain hours, until further
                  notice. Tom, 4 Nov. */}
              <Field label="First session" error={err('starts_on')} auto={isAuto('starts_on')}>
                <input type="date" name="starts_on" {...text('starts_on')} required className="field" />
              </Field>

              <Field
                label="Last session"
                hint="Leave blank if it runs on"
                error={err('ends_on')}
                auto={isAuto('ends_on')}
              >
                <input
                  type="date"
                  name="ends_on"
                  {...text('ends_on')}
                  disabled={v.is_ongoing}
                  className="field disabled:opacity-40"
                />
              </Field>

              <div className="sm:col-span-2">
                <button
                  type="button"
                  onClick={() => set('is_ongoing', !v.is_ongoing)}
                  aria-pressed={v.is_ongoing}
                  className="t-head rounded-xl border px-4 py-2.5 text-sm transition-colors"
                  style={
                    v.is_ongoing
                      ? { borderColor: 'var(--grass)', color: 'var(--grass)' }
                      : { borderColor: 'var(--line)', color: 'var(--muted)' }
                  }
                >
                  {v.is_ongoing ? 'Runs until further notice' : 'Has a last session'}
                </button>
                <input type="hidden" name="is_ongoing" value={v.is_ongoing ? 'on' : ''} />
                <p className="mt-1.5 text-xs text-[color:var(--muted)]">
                  An ongoing session has no end date on purpose — without this
                  it would drop off the site the day after it started.
                </p>
              </div>

              <OpenPlayNights
                days={v.league_days}
                onChange={(d) => set('league_days', d)}
                error={err('league_days')}
              />

              <Field label="Starts at" error={err('start_time')}>
                <input type="time" name="start_time" step={300} {...text('start_time')} className="field" />
              </Field>
              <Field label="Ends at" error={err('end_time')}>
                <input type="time" name="end_time" step={300} {...text('end_time')} className="field" />
              </Field>
            </>
          ) : isLeague ? (
            <>
              <Field label="First night" error={err('starts_on')} auto={isAuto('starts_on')}>
                <input
                  type="date"
                  name="starts_on"
                  value={v.starts_on}
                  onChange={(e) => setFirstNight(e.target.value)}
                  required
                  className="field"
                />
              </Field>

              <LeagueSchedule
                firstNight={v.starts_on}
                days={v.league_days}
                weeks={v.league_weeks}
                dates={v.league_dates}
                playoffs={v.playoffs}
                onDaysChange={(d) => set('league_days', d)}
                onWeeksChange={(w) => set('league_weeks', w)}
                onDatesChange={(d) => set('league_dates', d)}
                onPlayoffsChange={(on) => set('playoffs', on)}
                error={err('league_dates') ?? err('league_days')}
              />

              {/* Derived, never typed: the last night actually played. */}
              <input type="hidden" name="ends_on" value={seasonEnd} />
            </>
          ) : (
            <>
              <Field label="Start date" error={err('starts_on')} auto={isAuto('starts_on')}>
                <input type="date" name="starts_on" {...text('starts_on')} required className="field" />
              </Field>

              <Field label="End date (if multi-day)" error={err('ends_on')} auto={isAuto('ends_on')}>
                <input type="date" name="ends_on" {...text('ends_on')} className="field" />
              </Field>
            </>
          )}

          {/* Every event type has a start time; only a tournament has a
              check-in. Tom, 3 Nov: "8am check-in, 9am first serve" is how
              a flyer reads, so both belong on the form. step={300} gives
              5-minute increments rather than all 1,440 minutes in a day;
              the server still accepts any HH:MM so an existing 7:03 start
              loaded for editing is not mangled. */}
          {v.event_type === 'tournament' && (
            <>
              <Field
                label="Check-in"
                hint="When the doors open"
                error={err('check_in_time')}
                auto={isAuto('check_in_time')}
              >
                <input
                  type="time"
                  name="check_in_time"
                  step={300}
                  {...text('check_in_time')}
                  className="field"
                />
              </Field>
              <Field
                label="Captain's meeting"
                hint="Optional — leave blank if there isn't one"
                error={err('meeting_time')}
                auto={isAuto('meeting_time')}
              >
                <input
                  type="time"
                  name="meeting_time"
                  step={300}
                  {...text('meeting_time')}
                  className="field"
                />
              </Field>
            </>
          )}

          {!isOpenPlay && (
          <Field
            label={v.event_type === 'tournament' ? 'First serve' : 'Start time'}
            hint={v.event_type === 'tournament' ? 'When play actually begins' : 'Same every week'}
            error={err('start_time')}
            auto={isAuto('start_time')}
          >
            <input
              type="time"
              name="start_time"
              step={300}
              {...text('start_time')}
              className="field"
            />
          </Field>
          )}

          <Field
            label={isOpenPlay ? 'Register by (if required)' : 'Register by'}
            error={err('registration_deadline')}
            auto={isAuto('registration_deadline')}
          >
            <input
              type="date"
              name="registration_deadline"
              {...text('registration_deadline')}
              className="field"
            />
          </Field>

          <Field
            label={isLeague ? 'Fee for the season' : 'Entry fee'}
            hint="e.g. 75 or 42.50"
            error={err('entry_fee')}
            auto={isAuto('entry_fee')}
          >
            <input name="entry_fee" {...text('entry_fee')} inputMode="decimal" className="field" />
          </Field>

          <Field label="Fee is" auto={isAuto('fee_basis')}>
            <select name="fee_basis" value={v.fee_basis} onChange={(e) => set('fee_basis', e.target.value)} className="field">
              <option value="per_player">Per player</option>
              <option value="per_team">Per team</option>
            </select>
          </Field>

          <Field label="Payout / prizes" error={err('payout_text')} auto={isAuto('payout_text')}>
            <input name="payout_text" {...text('payout_text')} className="field" />
          </Field>
        </Section>
        <Section title="Who can play">
          {/* Surface used to be a separate checkbox group here, which let
              one event claim all four with no warning. It is now the first
              choice inside each bracket, because a bracket is played on
              one surface. Tom, 21 Oct. Formats and divisions are no longer separate lists. They are
              chosen together, one bracket at a time, and saveEvent derives
              the flat event_formats / event_divisions rows from them — so
              single-axis filters keep working and two-axis filters start
              working. */}
          <BracketBuilder
            formats={options.formats}
            subFormats={options.subFormats}
            divisions={options.divisions}
            surfaces={options.surfaces}
            groups={v.brackets}
            onChange={(next) => set('brackets', next)}
            error={err('brackets') ?? err('formats') ?? err('divisions')}
          />
          <p className="t-mono sm:col-span-2 text-[11px] uppercase tracking-wider text-[color:var(--faint)]">
            COMPETE lists adult recreational events only.
          </p>
        </Section>
        <Section title="Venue">
          <VenuePicker
            venues={options.venues}
            current={v.venue_name}
            onPick={(venue) =>
              setV((prev) => ({
                ...prev,
                venue_name: venue.name,
                address_line: venue.address_line ?? '',
                city: venue.city,
                state: venue.state,
                postal_code: venue.postal_code ?? '',
                // An existing venue already has whatever pin it has; do not
                // let a stale Google lookup overwrite it.
                venue_latitude: '',
                venue_longitude: '',
                venue_place_id: '',
                venue_business_status: '',
              }))
            }
          />
          {/* Looking it up on Google is what finally gets an exact pin.
              Every venue in the database is currently placed from a ZIP
              code or a city name, so radius search answers "5 miles from
              me" from the middle of a postal district. Tom, 3 Nov. */}
          <PlacesAutocomplete
            onPick={(place) =>
              setV((prev) => ({
                ...prev,
                venue_name: place.name || prev.venue_name,
                address_line: place.address_line || prev.address_line,
                city: place.city || prev.city,
                state: place.state || prev.state,
                postal_code: place.postal_code || prev.postal_code,
                venue_latitude: place.latitude === null ? '' : String(place.latitude),
                venue_longitude: place.longitude === null ? '' : String(place.longitude),
                venue_place_id: place.place_id,
                venue_business_status: place.business_status,
              }))
            }
          />

          <input type="hidden" name="venue_latitude" value={v.venue_latitude} />
          <input type="hidden" name="venue_longitude" value={v.venue_longitude} />
          <input type="hidden" name="venue_place_id" value={v.venue_place_id} />
          <input type="hidden" name="venue_business_status" value={v.venue_business_status} />

          {v.venue_business_status.startsWith('CLOSED') && (
            <p
              className="sm:col-span-2 rounded-xl border px-3 py-2 text-xs"
              style={{
                borderColor: 'color-mix(in srgb, var(--beach) 60%, transparent)',
                color: 'var(--beach)',
              }}
            >
              <strong>Google reports this place as {v.venue_business_status.toLowerCase().replace(/_/g, ' ')}.</strong>{' '}
              Worth checking with the organizer before publishing an event there.
            </p>
          )}

          {v.venue_latitude && (
            <p
              className="sm:col-span-2 rounded-xl border px-3 py-2 text-xs"
              style={{
                borderColor: 'color-mix(in srgb, var(--grass) 45%, transparent)',
                color: 'var(--grass)',
              }}
            >
              Exact coordinates captured from Google — this venue will sit on the
              building, not in the middle of its ZIP code.
            </p>
          )}

          <Field label="Venue name" error={err('venue_name')} auto={isAuto('venue_name')} className="sm:col-span-2">
            <input name="venue_name" {...text('venue_name')} required className="field" />
          </Field>
          <Field label="Street address" error={err('address_line')} auto={isAuto('address_line')} className="sm:col-span-2">
            <input name="address_line" {...text('address_line')} className="field" />
          </Field>
          <Field label="City" error={err('city')} auto={isAuto('city')}>
            <input name="city" {...text('city')} required className="field" />
          </Field>
          <Field label="State" hint="Two letters" error={err('state')} auto={isAuto('state')}>
            <input name="state" {...text('state')} maxLength={2} required className="field uppercase" />
          </Field>
          <Field
            label="ZIP code"
            hint="Used for radius search"
            error={err('postal_code')}
            auto={isAuto('postal_code')}
          >
            <input name="postal_code" {...text('postal_code')} inputMode="numeric" className="field" />
          </Field>
        </Section>
        <Section title="Publishing">
          <Field label="Status" hint="Only approved events appear publicly">
            <select name="status" value={v.status} onChange={(e) => set('status', e.target.value)} className="field">
              <option value="draft">Draft — not public</option>
              <option value="approved">Approved — live on the site</option>
              <option value="cancelled">Cancelled</option>
              <option value="archived">Archived</option>
            </select>
          </Field>
        </Section>

        <div className="flex flex-wrap items-center gap-2">
          <Submit isEdit={!!values.id} />
          {/* One click parks it, whatever the status dropdown says. A
              clicked submit button is the only one whose name the browser
              sends, so saveEvent can tell this apart from a normal save. */}
          <button type="submit" name="intent" value="draft" className="btn-ghost">
            Save as draft
          </button>
          <Link href="/admin/events" className="btn-ghost">
            Back to list
          </Link>
          {values.id && values.status === 'draft' && (
            <span className="ml-auto">
              <DeleteDraft id={values.id} name={values.name || 'this draft'} />
            </span>
          )}
        </div>
      </form>
    </div>
  );
}

function Submit({ isEdit }: { isEdit: boolean }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className="btn-primary" disabled={pending}>
      {pending ? 'Saving…' : isEdit ? 'Save changes' : 'Create event'}
    </button>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <fieldset className="panel p-5">
      <legend className="t-kicker px-2 text-[color:var(--surf-ink)]">{title}</legend>
      <div className="mt-2 grid gap-4 sm:grid-cols-2">{children}</div>
    </fieldset>
  );
}

function AutoBadge() {
  return (
    <span className="t-mono ml-2 border border-[color:var(--surf-ink)] px-1 py-px text-[9px] uppercase tracking-wider text-[color:var(--surf-ink)]">
      from paste
    </span>
  );
}

function Field({
  label,
  hint,
  error,
  auto,
  className = '',
  children,
}: {
  label: string;
  hint?: string;
  error?: string;
  auto?: boolean;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <label className={`block ${className}`}>
      <span className="label flex items-center">
        {label}
        {auto && <AutoBadge />}
      </span>
      <span className={auto ? 'block border-l-2 border-[color:var(--surf-ink)] pl-2' : 'block'}>
        {children}
      </span>
      {hint && !error && <span className="t-mono mt-1 block text-[10px] text-[color:var(--faint)]">{hint}</span>}
      {error && (
        <span className="t-mono mt-1 block text-[10px] uppercase tracking-wider text-[color:var(--coral-ink)]">
          {error}
        </span>
      )}
    </label>
  );
}

function CheckGroup({
  legend,
  name,
  options,
  selected,
  onToggle,
  error,
  auto,
}: {
  legend: string;
  name: string;
  options: RefOption[];
  selected: string[];
  onToggle: (slug: string) => void;
  error?: string;
  auto?: boolean;
}) {
  return (
    <fieldset className="sm:col-span-2">
      <legend className="label flex items-center">
        {legend}
        {auto && <AutoBadge />}
      </legend>
      <div className={`flex flex-wrap gap-1.5 ${auto ? 'border-l-2 border-[color:var(--surf-ink)] pl-2' : ''}`}>
        {options.map((opt) => (
          <label key={opt.slug} className="toggle-chip">
            <input
              type="checkbox"
              name={name}
              value={opt.slug}
              checked={selected.includes(opt.slug)}
              onChange={() => onToggle(opt.slug)}
              className="sr-only"
            />
            {opt.name}
          </label>
        ))}
      </div>
      {error && (
        <p className="t-mono mt-1 text-[10px] uppercase tracking-wider text-[color:var(--coral-ink)]">
          {error}
        </p>
      )}
    </fieldset>
  );
}
