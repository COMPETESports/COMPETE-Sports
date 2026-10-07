'use client';

import { useState } from 'react';
import { MAP_VIEWBOX, US_STATES } from '@/lib/us-states';
import { LEGEND, stepFor } from '@/lib/map-scale';
import type { StateCount } from '@/lib/queries';

/**
 * The Communities map.
 *
 * Each state with anything to show is a real link, so the map works
 * without JavaScript, is crawlable, and is reachable by keyboard in one
 * tab sequence. JavaScript only adds the hover card and the two-way
 * highlight with the list beside it.
 *
 * A choropleth encodes by area, which flatters big empty states and
 * undersells small busy ones — Rhode Island can out-play Montana and still
 * look like nothing. The ranked list is not a fallback for that reason; it
 * is the honest half of the pair, and it is always on screen.
 */
export function StateMap({
  sport,
  counts,
}: {
  sport: string;
  counts: StateCount[];
}) {
  const [active, setActive] = useState<string | null>(null);

  const byState = new Map(counts.map((c) => [c.state, c]));
  const href = (code: string) => `/communities/${sport}/${code.toLowerCase()}`;

  const ranked = [...counts]
    .filter((c) => c.total > 0)
    .sort((a, b) => b.upcoming - a.upcoming || b.total - a.total || a.state.localeCompare(b.state));

  const activeCount = active ? byState.get(active) : undefined;
  const activeName = active ? US_STATES.find((s) => s.code === active)?.name : undefined;

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_260px]">
      <div>
        <div className="panel relative p-3 sm:p-5">
          <svg
            viewBox={MAP_VIEWBOX}
            className="h-auto w-full"
            role="group"
            aria-label={`Map of the United States. Select a state to zoom in on ${sport} events there.`}
          >
            {US_STATES.map((shape) => {
              const count = byState.get(shape.code);
              const upcoming = count?.upcoming ?? 0;
              const total = count?.total ?? 0;
              const step = stepFor(upcoming, total);
              const isActive = active === shape.code;
              const linked = total > 0;

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
                // Nothing to open, so it is decoration, not a control.
                return <g key={shape.code} aria-hidden>{shapeEl}</g>;
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

            {/* Labels only where a state is both busy and big enough to hold
                one; anything else would collide or sit outside its border. */}
            {US_STATES.map((shape) => {
              const count = byState.get(shape.code);
              if (!count || count.upcoming === 0 || shape.small) return null;
              return (
                <text
                  key={`label-${shape.code}`}
                  x={shape.cx}
                  y={shape.cy}
                  textAnchor="middle"
                  dominantBaseline="middle"
                  className="pointer-events-none t-mono"
                  fontSize={13}
                  fontWeight={700}
                  fill={count.upcoming >= 6 ? '#0b0711' : '#f7f2ea'}
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
                  {activeCount.organizers}{' '}
                  {activeCount.organizers === 1 ? 'organizer' : 'organizers'}
                </p>
              )}
            </div>
          )}
        </div>

        <Legend />
      </div>

      <div>
        <h3 className="t-kicker mb-3 text-[color:var(--muted)]">Where the events are</h3>
        {ranked.length === 0 ? (
          <p className="text-sm leading-relaxed text-[color:var(--muted)]">
            No states have listings yet.
          </p>
        ) : (
          <ol className="space-y-1">
            {ranked.map((c) => {
              const name = US_STATES.find((s) => s.code === c.state)?.name ?? c.state;
              const step = stepFor(c.upcoming, c.total);
              return (
                <li key={c.state}>
                  <a
                    href={href(c.state)}
                    onMouseEnter={() => setActive(c.state)}
                    onMouseLeave={() => setActive(null)}
                    onFocus={() => setActive(c.state)}
                    onBlur={() => setActive(null)}
                    className={`flex items-center justify-between gap-2 border-2 px-2.5 py-1.5 text-sm transition-colors ${
                      active === c.state
                        ? 'border-[color:var(--surf-ink)] bg-[color:var(--aqua)]'
                        : 'border-transparent hover:border-[color:var(--line)]'
                    }`}
                  >
                    <span className="flex min-w-0 items-center gap-2">
                      <span
                        aria-hidden
                        className="h-3 w-3 shrink-0 border"
                        style={{ background: step.fill, borderColor: step.stroke }}
                      />
                      <span className="truncate">{name}</span>
                    </span>
                    <span
                      className={`t-mono shrink-0 text-[11px] ${
                        c.upcoming > 0 ? 'text-[color:var(--surf-ink)]' : 'text-[color:var(--faint)]'
                      }`}
                    >
                      {c.upcoming > 0 ? c.upcoming : '—'}
                    </span>
                  </a>
                </li>
              );
            })}
          </ol>
        )}
        <p className="t-mono mt-3 text-[10px] leading-relaxed text-[color:var(--faint)]">
          Numbers are events still to come. A dash means the state has hosted
          events but has nothing on the calendar right now.
        </p>
      </div>
    </div>
  );
}

function Legend() {
  return (
    <ul className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2">
      {LEGEND.map((step) => (
        <li key={step.label} className="flex items-center gap-1.5">
          <span
            aria-hidden
            className="h-3 w-3 border"
            style={{ background: step.fill, borderColor: step.stroke }}
          />
          <span className="t-mono text-[10px] uppercase tracking-wider text-[color:var(--faint)]">
            {step.label}
          </span>
        </li>
      ))}
    </ul>
  );
}

function describe(upcoming: number, total: number): string {
  if (upcoming > 0) return `${upcoming} upcoming ${upcoming === 1 ? 'event' : 'events'}`;
  if (total > 0) return 'no events scheduled right now';
  return 'no events listed';
}
