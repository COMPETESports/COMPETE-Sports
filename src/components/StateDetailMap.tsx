'use client';

import { useState } from 'react';
import { US_STATES } from '@/lib/us-states';
import { formatDate } from '@/lib/format';
import type { MapCluster } from '@/lib/cluster';

/**
 * One state, magnified, with a pin per place events are being held.
 *
 * The frame comes from the state's own bounding box, so every state fills
 * the panel at its natural shape — no manual per-state tuning, and it keeps
 * working the day a state gains its first event.
 *
 * Neighbouring states are drawn behind, dimmed. A state floating alone on a
 * dark field is hard to place; the borders around it are what let someone
 * recognise where they are looking.
 */
export function StateDetailMap({
  stateCode,
  clusters,
}: {
  stateCode: string;
  clusters: MapCluster[];
}) {
  const [active, setActive] = useState<string | null>(null);

  const state = US_STATES.find((s) => s.code === stateCode);
  if (!state) return null;

  // Pad the frame so pins near a border are not clipped by the panel edge.
  const [[x0, y0], [x1, y1]] = state.bounds;
  const pad = Math.max((x1 - x0) * 0.08, (y1 - y0) * 0.08, 6);
  const vb = { x: x0 - pad, y: y0 - pad, w: x1 - x0 + pad * 2, h: y1 - y0 + pad * 2 };

  // Pin sizes are in viewBox units, so they scale with the frame; otherwise
  // a small state gets boulders and a big one gets specks.
  const unit = Math.max(vb.w, vb.h) / 100;
  const activeCluster = clusters.find((c) => c.id === active) ?? null;

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
      <div className="panel relative p-2 sm:p-4">
        <svg
          viewBox={`${vb.x} ${vb.y} ${vb.w} ${vb.h}`}
          // A tall state such as Illinois would otherwise run past the fold.
          className="mx-auto block h-auto max-h-[62vh] w-full"
          preserveAspectRatio="xMidYMid meet"
          role="group"
          aria-label={`Map of ${state.name} showing where events are being held.`}
        >
          {/* Context: the neighbours, dimmed and inert. */}
          {US_STATES.filter((s) => s.code !== stateCode).map((s) => (
            <path
              key={s.code}
              d={s.d}
              fill="#F2EDE1"
              stroke="#DED3BF"
              strokeWidth={unit * 0.25}
              aria-hidden
            />
          ))}

          <path
            d={state.d}
            fill="#E4F2EF"
            stroke="#027E79"
            strokeWidth={unit * 0.5}
            strokeLinejoin="round"
          />

          {/* Haloes are drawn in their own pass, underneath every pin, so a
              highlight can never sit on top of a neighbouring pin and
              swallow its clicks. */}
          {clusters.map((c) =>
            active === c.id ? (
              <circle
                key={`halo-${c.id}`}
                cx={c.x}
                cy={c.y}
                r={radius(c.event_count, unit) * 2}
                fill="#00A6A0"
                opacity={0.22}
                aria-hidden
                pointerEvents="none"
              />
            ) : null,
          )}

          {clusters.map((c) => {
            const r = radius(c.event_count, unit);
            return (
              <a
                key={c.id}
                href={c.venues.length === 1 ? `/events/${c.venues[0].events[0].slug}` : undefined}
                role={c.venues.length === 1 ? undefined : 'button'}
                tabIndex={0}
                aria-label={`${c.label} — ${c.event_count} ${
                  c.event_count === 1 ? 'event' : 'events'
                } at ${c.venues.length} ${c.venues.length === 1 ? 'venue' : 'venues'}`}
                onMouseEnter={() => setActive(c.id)}
                onMouseLeave={() => setActive(null)}
                onFocus={() => setActive(c.id)}
                onBlur={() => setActive(null)}
                className="cursor-pointer outline-none"
              >
                <circle
                  cx={c.x}
                  cy={c.y}
                  r={r}
                  fill={c.approximate ? '#E0A33A' : '#D63420'}
                  stroke={active === c.id ? '#16333B' : '#FFFFFF'}
                  strokeWidth={unit * 0.35}
                  strokeDasharray={c.approximate ? `${unit * 0.6} ${unit * 0.4}` : undefined}
                />
                {c.event_count > 1 && (
                  <text
                    x={c.x}
                    y={c.y}
                    textAnchor="middle"
                    dominantBaseline="central"
                    fontSize={r * 1.05}
                    fontWeight={700}
                    fill="#FFFFFF"
                    className="pointer-events-none t-mono"
                  >
                    {c.event_count}
                  </text>
                )}
                <title>{`${c.label} — ${c.event_count} ${
                  c.event_count === 1 ? 'event' : 'events'
                }`}</title>
              </a>
            );
          })}
        </svg>

        {activeCluster && (
          <div
            role="status"
            className="pointer-events-none absolute left-3 top-3 max-w-[75%] border-2 border-[color:var(--surf-ink)] bg-[color:var(--surface)] px-3 py-2"
          >
            <p className="t-head text-sm">{activeCluster.label}</p>
            <p className="t-mono mt-0.5 text-[11px] text-[color:var(--surf-ink)]">
              {activeCluster.event_count}{' '}
              {activeCluster.event_count === 1 ? 'event' : 'events'} · next{' '}
              {formatDate(activeCluster.next_on, 'short')}
            </p>
            <p className="t-mono text-[10px] text-[color:var(--faint)]">
              {activeCluster.venues.map((v) => v.name).join(' · ')}
            </p>
            {activeCluster.approximate && (
              <p className="t-mono mt-1 text-[10px] text-[color:var(--coral-ink)]">
                Position approximate
              </p>
            )}
          </div>
        )}

        <ul className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 px-1">
          <li className="flex items-center gap-1.5">
            <span aria-hidden className="h-3 w-3 rounded-full bg-[color:var(--coral-ink)]" />
            <span className="t-mono text-[10px] uppercase tracking-wider text-[color:var(--faint)]">
              Bigger pin means more events
            </span>
          </li>
          <li className="flex items-center gap-1.5">
            <span
              aria-hidden
              className="h-3 w-3 rounded-full border border-dashed border-white/40 bg-[#E0A33A]"
            />
            <span className="t-mono text-[10px] uppercase tracking-wider text-[color:var(--faint)]">
              Approximate position
            </span>
          </li>
        </ul>
      </div>

      <div>
        <h3 className="t-kicker mb-3 text-[color:var(--muted)]">
          {clusters.length} {clusters.length === 1 ? 'location' : 'locations'}
        </h3>
        <ol className="space-y-2">
          {clusters.map((c) => (
            <li key={c.id}>
              <div
                onMouseEnter={() => setActive(c.id)}
                onMouseLeave={() => setActive(null)}
                className={`border-2 p-3 transition-colors ${
                  active === c.id
                    ? 'border-[color:var(--surf-ink)] bg-[color:var(--aqua)]'
                    : 'border-[color:var(--line)]'
                }`}
              >
                <p className="t-head text-sm leading-snug">{c.label}</p>
                {c.venues.map((v) => (
                  <div key={v.id} className="mt-2">
                    <p className="t-mono text-[10px] uppercase tracking-wider text-[color:var(--faint)]">
                      {v.name}
                    </p>
                    <ul className="mt-1 space-y-1">
                      {v.events.slice(0, 3).map((e) => (
                        <li key={e.slug}>
                          <a
                            href={`/events/${e.slug}`}
                            onFocus={() => setActive(c.id)}
                            onBlur={() => setActive(null)}
                            className="flex items-baseline gap-2 text-[13px] text-[color:var(--muted)] hover:text-[color:var(--surf-ink)]"
                          >
                            <span className="t-mono shrink-0 text-[10px] text-[color:var(--coral-ink)]">
                              {formatDate(e.starts_on, 'short')}
                            </span>
                            <span className="truncate">{e.name}</span>
                          </a>
                        </li>
                      ))}
                      {v.events.length > 3 && (
                        <li className="t-mono text-[10px] text-[color:var(--faint)]">
                          +{v.events.length - 3} more here
                        </li>
                      )}
                    </ul>
                  </div>
                ))}
              </div>
            </li>
          ))}
        </ol>
      </div>
    </div>
  );
}

/** Area, not radius, tracks the count — otherwise the ink overstates it. */
function radius(eventCount: number, unit: number): number {
  return unit * (1.7 + Math.sqrt(eventCount) * 0.85);
}
