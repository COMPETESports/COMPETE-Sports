'use client';

import { useEffect, useRef, useState } from 'react';
import type { Facets, SearchFilters } from '@/lib/types';
import { GENDER_LABELS } from '@/lib/types';
import { RADIUS_MAX, RADIUS_MIN, RADIUS_STEP } from '@/lib/search-params';
import { today } from '@/lib/dates';

/**
 * The discovery filter panel.
 *
 * It is a plain GET form, so results are a shareable URL and the page works
 * with JavaScript disabled. When JS is available, ticking a box submits the
 * form immediately and the Apply button hides itself.
 */
export function FilterForm({
  filters,
  facets,
  resultCount,
  variant = 'rail',
}: {
  filters: SearchFilters;
  facets: Facets;
  /** Omitted on the landing page, where nothing has been searched yet. */
  resultCount?: number;
  /**
   * 'rail' is the search page: a tall column beside the results, where
   * ticking a box re-runs the search immediately because the results are
   * right there to watch change.
   *
   * 'landing' is the homepage: a wide grid under the map, where ticking a
   * box must NOT navigate. Someone setting four filters would be thrown to
   * the results page after the first one, having chosen a quarter of what
   * they meant. They press the button when they are ready.
   */
  variant?: 'rail' | 'landing';
}) {
  const landing = variant === 'landing';
  const formRef = useRef<HTMLFormElement>(null);
  const [enhanced, setEnhanced] = useState(false);
  const [openOnMobile, setOpenOnMobile] = useState(false);

  // Runs only in the browser, so no-JS visitors keep the Apply button.
  useEffect(() => setEnhanced(true), []);

  const submit = () => {
    if (enhanced && !landing) formRef.current?.requestSubmit();
  };

  // `from` falls back to today when nobody picked one, so only a date the
  // visitor actually chose counts as a filter or shows in the summary.
  const chosenFrom = filters.from && filters.from !== today() ? filters.from : null;

  const activeCount =
    filters.surfaces.length +
    filters.formats.length +
    filters.genders.length +
    filters.divisions.length +
    (chosenFrom ? 1 : 0) +
    (filters.to ? 1 : 0);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpenOnMobile((v) => !v)}
        className="btn-ghost mb-4 w-full lg:hidden"
        aria-expanded={openOnMobile}
        aria-controls="filter-form"
      >
        {openOnMobile ? 'Hide filters' : 'Filters'}
        {activeCount > 0 && (
          <span className="ml-1 bg-[color:var(--coral-ink)] px-1.5 py-0.5 text-[10px] text-[color:var(--ink)]">
            {activeCount}
          </span>
        )}
      </button>

      <form
        id="filter-form"
        ref={formRef}
        method="get"
        action="/events"
        className={`${openOnMobile ? 'block' : 'hidden'} panel p-4 lg:block ${
          landing ? 'sm:p-6' : ''
        }`}
      >
        <input type="hidden" name="sort" value={filters.sort} />
        {filters.sport !== 'volleyball' && (
          <input type="hidden" name="sport" value={filters.sport} />
        )}
        {/* Kept so ticking a filter does not silently drop the state that
            was chosen on the Communities map. */}
        {filters.state && <input type="hidden" name="state" value={filters.state} />}

        {/* On the landing page these spread across the width instead of
            stacking; as one column under a map they would be two screens
            tall and nobody would reach the button.

            Two bands rather than one six-cell grid — where and when, then
            what. A single grid gave every row the height of its tallest
            cell, and the location block (an input plus a slider) is twice
            the height of a facet list, so it punched a hole next to
            Surface wherever it landed. */}
        <div className={landing ? 'grid gap-x-6 gap-y-5 sm:grid-cols-2 lg:max-w-3xl' : ''}>
        <div className={landing ? '' : 'mb-5'}>
          <label className="label" htmlFor="near">
            Near
          </label>
          <input
            id="near"
            name="near"
            type="text"
            defaultValue={filters.near ?? ''}
            placeholder="ZIP code or city, ST"
            className="field"
            autoComplete="postal-code"
            enterKeyHint="search"
          />
          <RadiusSlider value={filters.radius} onCommit={submit} />
        </div>

        <DateRange from={chosenFrom} to={filters.to} onChange={submit} />
        </div>

        <div
          className={
            landing
              ? 'mt-7 grid items-start gap-x-6 gap-y-6 sm:grid-cols-2 lg:grid-cols-4'
              : ''
          }
        >
        <FacetGroup
          legend="Surface"
          name="surface"
          options={facets.surfaces}
          selected={filters.surfaces}
          onToggle={submit}
        />

        <FacetGroup
          legend="Playing as"
          name="gender"
          options={facets.genders.map((g) => ({
            ...g,
            name: GENDER_LABELS[g.slug] ?? g.slug,
          }))}
          selected={filters.genders}
          onToggle={submit}
        />

        {/* "Division" is the competitive skill tier — Open, AAA, AA, A,
            BBB, BB, B — which is Tom's vocabulary and what organizers
            print on a flyer. Gender is the separate facet above.

            An earlier pass renamed this to "Skill level", reasoning that
            volleyball players say "division" for the gender bracket.
            They don't; reverted.

            The descriptor is appended so a tier means something to
            someone who hasn't played this scene before — "BB" alone tells
            a newcomer nothing, and a player who can't place themselves
            doesn't enter. */}
        <FacetGroup
          legend="Division"
          name="division"
          options={facets.divisions.map((d) => ({
            ...d,
            name: d.descriptor ? `${d.name} · ${d.descriptor}` : d.name,
          }))}
          selected={filters.divisions}
          onToggle={submit}
        />

        {/* Formats are team sizes now — Doubles, Triples, Quads — because
            "Men's Doubles" said the same thing as the Gender facet beside
            it, and saying it twice made the list four times longer. */}
        <FacetGroup
          legend="Format"
          name="format"
          options={facets.formats}
          selected={filters.formats}
          onToggle={submit}
        />

        </div>

        {landing ? (
          /* One button, always visible, always the way out of this panel.
             It is the only thing on the homepage that runs a search. */
          <div className="mt-6 flex flex-wrap items-center gap-3">
            <button type="submit" className="btn-primary">
              Search events
            </button>
            {activeCount > 0 && (
              <>
                <a href="/" className="btn-ghost">
                  Clear
                </a>
                <span className="t-mono text-[11px] text-[color:var(--faint)]">
                  {activeCount} {activeCount === 1 ? 'filter' : 'filters'} set
                </span>
              </>
            )}
          </div>
        ) : (
          <div className="mt-5 flex flex-col gap-2">
            {!enhanced && (
              <button type="submit" className="btn-primary w-full">
                Apply filters
              </button>
            )}
            <button
              type="submit"
              className="btn-primary w-full lg:hidden"
              onClick={() => setOpenOnMobile(false)}
            >
              Show {resultCount ?? 0} {resultCount === 1 ? 'event' : 'events'}
            </button>
            {activeCount > 0 && (
              <a href="/events" className="btn-ghost w-full">
                Clear filters
              </a>
            )}
          </div>
        )}
      </form>
    </>
  );
}

/* ------------------------------------------------------------------ dates */

/** YYYY-MM-DD for a date that many days from today, in local time. */
function offsetDay(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(
    d.getDate(),
  ).padStart(2, '0')}`;
}

/** The coming Saturday and Sunday, or this one if it is already the weekend. */
function thisWeekend(): [string, string] {
  const today = new Date();
  const toSaturday = (6 - today.getDay() + 7) % 7;
  return [offsetDay(toSaturday), offsetDay(toSaturday + 1)];
}

function prettyDay(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString('en-US', {
    timeZone: 'UTC',
    month: 'short',
    day: 'numeric',
  });
}

/**
 * One control for the whole date range.
 *
 * Two date inputs side by side did not fit the rail — the second one ran
 * past its edge — and two bare fields are a poor way to ask "when are you
 * free" anyway. This is a single button showing the current range, which
 * opens a panel holding the presets most people actually want plus the two
 * fields stacked.
 *
 * The inputs stay mounted while the panel is closed so the form still
 * submits them, and so this keeps working without JavaScript.
 */
/**
 * How far the visitor will travel, as a dial.
 *
 * Two deliberate choices. The label tracks the thumb as it moves, because a
 * slider whose number only appears after you let go is a slider you cannot
 * aim. But the search only re-runs on release — dragging from 20 to 400
 * would otherwise fire thirty-eight queries, and the results flickering
 * underneath makes the page feel broken rather than responsive.
 *
 * With JavaScript off it is still a named input in a GET form, so the
 * Apply button submits whatever it is set to.
 */
function RadiusSlider({ value, onCommit }: { value: number; onCommit: () => void }) {
  const [shown, setShown] = useState(value);

  // A new value arriving from the URL (back button, a cleared filter) has to
  // win over what the thumb was last dragged to.
  useEffect(() => setShown(value), [value]);

  return (
    <div className="mt-3">
      <div className="flex items-baseline justify-between gap-2">
        <label className="label" htmlFor="radius">
          Within
        </label>
        <output
          htmlFor="radius"
          className="t-head text-sm text-[color:var(--indoor)]"
          style={{ fontVariantNumeric: 'tabular-nums' }}
        >
          {shown === 0 ? 'This ZIP only' : `${shown} miles`}
        </output>
      </div>
      <input
        id="radius"
        name="radius"
        type="range"
        min={RADIUS_MIN}
        max={RADIUS_MAX}
        step={RADIUS_STEP}
        value={shown}
        onChange={(e) => setShown(Number(e.target.value))}
        onPointerUp={onCommit}
        onKeyUp={onCommit}
        onBlur={onCommit}
        className="radius-range mt-1.5 w-full"
        aria-describedby="radius-ends"
      />
      <div
        id="radius-ends"
        className="t-mono mt-0.5 flex justify-between text-[10px] text-[color:var(--faint)]"
      >
        <span>{RADIUS_MIN}</span>
        <span>{RADIUS_MAX} mi</span>
      </div>
    </div>
  );
}

function DateRange({
  from,
  to,
  onChange,
}: {
  from: string | null;
  to: string | null;
  onChange: () => void;
}) {
  const [open, setOpen] = useState(false);
  const wrap = useRef<HTMLDivElement>(null);
  const fromRef = useRef<HTMLInputElement>(null);
  const toRef = useRef<HTMLInputElement>(null);

  // Closing on an outside click or Escape is what makes it feel like a menu
  // rather than a section that got stuck open.
  useEffect(() => {
    if (!open) return;
    const onPointer = (event: MouseEvent) => {
      if (wrap.current && !wrap.current.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onPointer);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onPointer);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const summary =
    from && to
      ? `${prettyDay(from)} – ${prettyDay(to)}`
      : from
        ? `From ${prettyDay(from)}`
        : to
          ? `Until ${prettyDay(to)}`
          : 'Any date';

  const apply = (start: string, end: string) => {
    if (fromRef.current) fromRef.current.value = start;
    if (toRef.current) toRef.current.value = end;
    setOpen(false);
    onChange();
  };

  const presets: Array<[string, () => void]> = [
    ['Any date', () => apply('', '')],
    ['This weekend', () => apply(...thisWeekend())],
    ['Next 30 days', () => apply(offsetDay(0), offsetDay(30))],
    ['Next 3 months', () => apply(offsetDay(0), offsetDay(90))],
  ];

  return (
    <div className="relative mb-5" ref={wrap}>
      <span className="label">Dates</span>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="field flex items-center justify-between gap-2 text-left"
        aria-expanded={open}
        aria-haspopup="dialog"
      >
        <span className={from || to ? '' : 'text-[color:var(--faint)]'}>{summary}</span>
        <span aria-hidden className="text-[color:var(--faint)]">
          {open ? '▴' : '▾'}
        </span>
      </button>

      <div className={open ? 'date-pop' : 'hidden'} role="dialog" aria-label="Choose dates">
        <div className="flex flex-wrap gap-1.5">
          {presets.map(([label, run]) => (
            <button
              key={label}
              type="button"
              onClick={run}
              className="t-mono rounded-full border-2 border-[color:var(--line)] px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wider text-[color:var(--muted)] hover:border-[color:var(--surf-ink)] hover:text-[color:var(--surf-ink)]"
            >
              {label}
            </button>
          ))}
        </div>

        <div className="mt-3 grid gap-3">
          <div>
            <label className="label" htmlFor="from">
              From
            </label>
            <input
              id="from"
              name="from"
              type="date"
              ref={fromRef}
              defaultValue={from ?? ''}
              onChange={onChange}
              className="field"
            />
          </div>
          <div>
            <label className="label" htmlFor="to">
              Until
            </label>
            <input
              id="to"
              name="to"
              type="date"
              ref={toRef}
              defaultValue={to ?? ''}
              onChange={onChange}
              className="field"
            />
          </div>
        </div>
      </div>
    </div>
  );
}

/* ----------------------------------------------------------------- facets */

function FacetGroup({
  legend,
  name,
  options,
  selected,
  onToggle,
  collapsibleAfter,
}: {
  legend: string;
  name: string;
  options: Array<{ slug: string; name: string; count: number }>;
  selected: string[];
  onToggle: () => void;
  collapsibleAfter?: number;
}) {
  const [expanded, setExpanded] = useState(false);
  if (!options.length) return null;

  const limit = collapsibleAfter && !expanded ? collapsibleAfter : options.length;
  const visible = options.slice(0, limit);
  const hidden = options.length - visible.length;

  return (
    <fieldset className="mb-5 border-t-2 border-[color:var(--line)] pt-4">
      <legend className="t-kicker px-0 text-[color:var(--muted)]">{legend}</legend>
      <div className="mt-1 space-y-0.5">
        {visible.map((opt) => (
          <label key={opt.slug} className="facet">
            <input
              type="checkbox"
              name={name}
              value={opt.slug}
              defaultChecked={selected.includes(opt.slug)}
              onChange={onToggle}
            />
            <span className="facet-label">
              <span className="facet-box" aria-hidden>
                ✓
              </span>
              <span className="truncate">{opt.name}</span>
            </span>
            <span className="facet-count">{opt.count}</span>
          </label>
        ))}
      </div>
      {hidden > 0 && (
        <button
          type="button"
          onClick={() => setExpanded(true)}
          className="t-mono mt-2 text-[11px] uppercase tracking-wider text-[color:var(--surf-ink)] hover:underline"
        >
          + {hidden} more
        </button>
      )}
    </fieldset>
  );
}
