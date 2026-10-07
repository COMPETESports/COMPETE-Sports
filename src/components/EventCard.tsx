import Link from 'next/link';
import type { DiscoveryEvent } from '@/lib/types';
import {
  audienceLine,
  countdownLabel,
  formatDateRange,
  formatDistance,
  formatMoney,
  venueLine,
} from '@/lib/format';

const surfaceChip: Record<string, string> = {
  beach: 'chip-beach',
  grass: 'chip-grass',
  turf: 'chip-turf',
  indoor: 'chip-indoor',
  outdoor: 'chip-turf',
};

/**
 * `wide` is set by callers that give the card a whole row to itself — the
 * search results page. It is a prop rather than an `lg:` breakpoint because
 * breakpoints read the viewport, not the card: on a wide screen the
 * homepage still shows two cards a row, and a side panel sized for a
 * full-width card would eat half of one of those.
 */
export function EventCard({ event, wide = false }: { event: DiscoveryEvent; wide?: boolean }) {
  const distance = formatDistance(event.distance_miles);
  const [y, m, d] = event.starts_on.split('-').map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));

  return (
    /* w-full matters: the card is a Link, which sizes to its content unless
       told otherwise. At three-to-a-row that was invisible; at one-to-a-row
       the cards stopped short of the column and left a ragged right edge.

       When `wide`, the fee and distance move from a footer strip to a
       right-hand column, so a full-width card reads left to right — when,
       what, how much — instead of putting all its text in the left third. */
    <Link
      href={`/events/${event.slug}`}
      className={`card group flex w-full flex-col p-0 ${
        wide ? 'sm:flex-row sm:items-stretch' : ''
      }`}
    >
      <div className="flex flex-1 items-stretch">
        {/* Date block — the thing a player scans for first. */}
        <div className="flex w-24 shrink-0 flex-col items-center justify-center border-r-2 border-[color:var(--line)] bg-[color:var(--surface)] py-5">
          <span className="t-mono text-[10px] font-bold uppercase tracking-[0.18em] text-[color:var(--coral-ink)]">
            {date.toLocaleDateString('en-US', { month: 'short', timeZone: 'UTC' })}
          </span>
          <span className="t-head text-4xl leading-none">{date.getUTCDate()}</span>
          <span className="t-mono mt-1 text-[10px] text-[color:var(--faint)]">
            {date.toLocaleDateString('en-US', { weekday: 'short', timeZone: 'UTC' })}
          </span>
        </div>

        <div className="min-w-0 flex-1 p-5">
          <div className="mb-2 flex flex-wrap items-center gap-1.5">
            {event.surface_names.map((name, i) => (
              <span key={name} className={surfaceChip[event.surface_slugs[i]] ?? 'chip-muted'}>
                {name}
              </span>
            ))}
            <span className="chip-muted">{countdownLabel(event.starts_on)}</span>
          </div>

          <h3 className="t-head line-clamp-2 text-lg leading-snug text-[color:var(--ink)] group-hover:text-[color:var(--surf-ink)]">
            {event.name}
          </h3>

          <p className="mt-2 text-[15px] leading-snug text-[color:var(--muted)]">{venueLine(event)}</p>
          <p className="t-mono mt-1 line-clamp-2 text-xs uppercase tracking-wider text-[color:var(--faint)]">
            {audienceLine(event)}
          </p>
        </div>
      </div>

      <div
        className={
          'mt-auto flex shrink-0 items-center justify-between gap-3 border-t-2 border-[color:var(--line)] px-5 py-3 ' +
          (wide
            ? 'sm:mt-0 sm:w-56 sm:flex-col sm:items-end sm:justify-center sm:gap-1.5 sm:border-l-2 sm:border-t-0 sm:text-right'
            : '')
        }
      >
        <span className={`t-mono font-bold text-[color:var(--coral-ink)] ${wide ? 'text-base' : 'text-sm'}`}>
          {formatMoney(event.entry_fee_cents, event.fee_basis)}
        </span>
        <span className="t-mono min-w-0 truncate text-xs text-[color:var(--faint)]">
          {distance ?? event.organizer_name ?? ''}
        </span>
      </div>
    </Link>
  );
}
