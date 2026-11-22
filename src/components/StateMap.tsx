'use client';

import { useState } from 'react';
import { MAP_VIEWBOX, US_STATES } from '@/lib/us-states';
import { BUCKETS, EMPTY_STEP, dormantStep, stepFor } from '@/lib/map-scale';
import { MAP_REGIONS } from '@/lib/map-regions';
import type { StateCount } from '@/lib/queries';

/**
 * The US map: homepage and Communities.
 *
 * Each state with anything to show is a real link, so the map works
 * without JavaScript, is crawlable, and is reachable by keyboard in one
 * tab sequence. JavaScript only adds the hover card.
 *
 * Rebuilt 10 Nov 2026 to Tom's brief:
 * - The ranked state list beside the map is GONE, so the map gets the
 *   full width. The list was the answer to a choropleth flattering big
 *   empty states -- Rhode Island can out-play Montana and still look like
 *   nothing. What covers that now: every state with events prints its
 *   count, hover and keyboard focus name it, and clicking it shows the
 *   events themselves.
 * - States are coloured by REGION, brightening with event count. See
 *   map-scale.ts for the palette and its measured contrast.
 * - On the homepage the counts follow the filters, and a state links to
 *   its events as cards (`linkQuery`). Communities keeps its venue map.
 */
export function StateMap({
  sport,
  counts,
  linkQuery,
  filtered = false,
  showLegend = true,
}: {
  sport: string;
  counts: StateCount[];
  /**
   * When set, a state links to /events?state=XX plus this query -- the
   * homepage's filters, carried through so the cards match the number
   * that was on the map. When absent, it links to the Communities page.
   */
  linkQuery?: string;
  /** Filters are applied, so "nothing here" means "nothing that matches". */
  filtered?: boolean;
  /** The homepage hides the region and shade key (Tom, 19 Nov); Communities keeps it. */
  showLegend?: boolean;
}) {
  const [active, setActive] = useState<string | null>(null);

  const byState = new Map(counts.map((c) => [c.state, c]));
  const href = (code: string) =>
    linkQuery !== undefined
      ? `/events?state=${code}${linkQuery ? `&${linkQuery}` : ''}`
      : `/communities/${sport}/${code.toLowerCase()}`;

  const describe = (upcoming: number, total: number): string => {
    if (upcoming > 0)
      return `${upcoming} ${filtered ? 'matching' : 'upcoming'} ${upcoming === 1 ? 'event' : 'events'}`;
    if (total > 0) return filtered ? 'no events match your filters' : 'no events scheduled right now';
    return 'no events listed';
  };

  const activeCount = active ? byState.get(active) : undefined;
  const activeName = active ? US_STATES.find((s) => s.code === active)?.name : undefined;

  return (
    <div>
      <div className="panel relative p-2 sm:p-4">
        <svg
          viewBox={MAP_VIEWBOX}
          className="h-auto w-full"
          role="group"
          aria-label={`Map of the United States. Select a state to see its ${sport} events.`}
        >
          {US_STATES.map((shape) => {
            const count = byState.get(shape.code);
            const upcoming = count?.upcoming ?? 0;
            const total = count?.total ?? 0;
            const step = stepFor(upcoming, total, shape.code);
            const isActive = active === shape.code;
            // A state with matches links to them. One with a scene but no
            // matches still links on Communities (its venue page has
            // history); on the homepage it would only open an empty list.
            const linked = linkQuery !== undefined ? upcoming > 0 : total > 0;

            const shapeEl = (
              <path
                d={shape.d}
                fill={step.fill}
                stroke={isActive ? '#ffffff' : step.stroke}
                strokeWidth={isActive ? 2 : step.strokeWidth}
                strokeLinejoin="round"
                className="transition-[fill,stroke] duration-100"
              />
            );

            if (!linked) {
              return (
                <g key={shape.code} aria-hidden>
                  {shapeEl}
                </g>
              );
            }

            return (
              <a
                key={shape.code}
                href={href(shape.code)}
                aria-label={`${shape.name} — ${describe(upcoming, total)}`}
                onMouseEnter={() => setActive(shape.code)}
                onMouseLeave={() => setActive(null)}
                onFocus={() => setActive(shape.code)}
                onBlur={() => setActive(null)}
                className="cursor-pointer outline-none [&:focus-visible>path]:stroke-[3] [&:focus-visible>path]:stroke-white"
              >
                {shapeEl}
                <title>{`${shape.name} — ${describe(upcoming, total)}`}</title>
              </a>
            );
          })}

          {/* Counts only where a state is big enough to hold one inside its
              border. The label colour comes from the step, measured per
              fill, rather than one light/dark cut-off for every hue. */}
          {US_STATES.map((shape) => {
            const count = byState.get(shape.code);
            if (!count || count.upcoming === 0 || shape.small) return null;
            const step = stepFor(count.upcoming, count.total, shape.code);
            return (
              <text
                key={`label-${shape.code}`}
                x={shape.cx}
                y={shape.cy}
                textAnchor="middle"
                dominantBaseline="middle"
                className="pointer-events-none t-mono"
                fontSize={14}
                fontWeight={700}
                fill={step.text}
              >
                {count.upcoming}
              </text>
            );
          })}
        </svg>

        {/* Hover card. Pinned rather than following the cursor, so it
            never covers the state being read. */}
        {activeCount && activeName && (
          <div
            role="status"
            className="pointer-events-none absolute left-4 top-4 border-2 border-[color:var(--surf-ink)] bg-[color:var(--surface)] px-3 py-2"
          >
            <p className="t-head text-sm">{activeName}</p>
            <p className="t-mono mt-0.5 text-[11px] text-[color:var(--surf-ink)]">
              {describe(activeCount.upcoming, activeCount.total)}
            </p>
            {activeCount.organizers > 0 && (
              <p className="t-mono text-[10px] text-[color:var(--faint)]">
                {activeCount.organizers} {activeCount.organizers === 1 ? 'organizer' : 'organizers'}
              </p>
            )}
          </div>
        )}
      </div>

      {showLegend && <Legend filtered={filtered} />}
    </div>
  );
}

/**
 * Two rows: which colour is which region, then what the shades mean.
 * The shade row is drawn in one region's ramp only as an example -- the
 * same four steps apply in every colour.
 */
function Legend({ filtered }: { filtered: boolean }) {
  const sample = MAP_REGIONS.find((r) => r.slug === 'midwest') ?? MAP_REGIONS[0];
  const dormant = dormantStep(sample);
  return (
    <div className="mt-3 space-y-2">
      <ul className="flex flex-wrap items-center gap-x-4 gap-y-2" aria-label="Regions">
        {MAP_REGIONS.map((r) => (
          <li key={r.slug} className="flex items-center gap-1.5">
            <span aria-hidden className="h-3 w-3" style={{ background: r.ramp[2] }} />
            <span className="t-mono text-[10px] uppercase tracking-wider text-[color:var(--muted)]">
              {r.name}
            </span>
          </li>
        ))}
      </ul>
      <ul className="flex flex-wrap items-center gap-x-4 gap-y-2" aria-label="Shades">
        <li className="flex items-center gap-1.5">
          <span
            aria-hidden
            className="h-3 w-3 border"
            style={{ background: EMPTY_STEP.fill, borderColor: EMPTY_STEP.stroke }}
          />
          <span className="t-mono text-[10px] uppercase tracking-wider text-[color:var(--faint)]">
            {EMPTY_STEP.label}
          </span>
        </li>
        <li className="flex items-center gap-1.5">
          <span
            aria-hidden
            className="h-3 w-3 border-2"
            style={{ background: dormant.fill, borderColor: dormant.stroke }}
          />
          <span className="t-mono text-[10px] uppercase tracking-wider text-[color:var(--faint)]">
            {filtered ? 'Events here, none match' : 'Community here, nothing scheduled'}
          </span>
        </li>
        {[...BUCKETS].reverse().map((b, i) => (
          <li key={b.label} className="flex items-center gap-1.5">
            <span aria-hidden className="h-3 w-3" style={{ background: sample.ramp[i] }} />
            <span className="t-mono text-[10px] uppercase tracking-wider text-[color:var(--faint)]">
              {b.label}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
