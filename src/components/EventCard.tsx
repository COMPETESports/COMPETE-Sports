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

export function EventCard({ event }: { event: DiscoveryEvent }) {
  const distance = formatDistance(event.distance_miles);
  const [y, m, d] = event.starts_on.split('-').map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));

  return (
    <Link href={`/events/${event.slug}`} className="card group flex flex-col p-0">
      <div className="flex flex-1 items-stretch">
        {/* Date block — the thing a player scans for first. */}
        <div className="flex w-20 shrink-0 flex-col items-center justify-center border-r-2 border-[color:var(--line)] bg-[color:var(--surface)] py-4">
          <span className="t-mono text-[10px] font-bold uppercase tracking-[0.18em] text-[color:var(--coral-ink)]">
            {date.toLocaleDateString('en-US', { month: 'short', timeZone: 'UTC' })}
          </span>
          <span className="t-head text-3xl leading-none">{date.getUTCDate()}</span>
          <span className="t-mono mt-1 text-[10px] text-[color:var(--faint)]">
            {date.toLocaleDateString('en-US', { weekday: 'short', timeZone: 'UTC' })}
          </span>
        </div>

        <div className="min-w-0 flex-1 p-4">
          <div className="mb-2 flex flex-wrap items-center gap-1.5">
            {event.surface_names.map((name, i) => (
              <span key={name} className={surfaceChip[event.surface_slugs[i]] ?? 'chip-muted'}>
                {name}
              </span>
            ))}
            <span className="chip-muted">{countdownLabel(event.starts_on)}</span>
          </div>

          <h3 className="t-head line-clamp-2 text-base leading-snug text-[color:var(--ink)] group-hover:text-[color:var(--surf-ink)]">
            {event.name}
          </h3>

          <p className="mt-1.5 truncate text-sm text-[color:var(--muted)]">{venueLine(event)}</p>
          <p className="t-mono mt-0.5 truncate text-[11px] uppercase tracking-wider text-[color:var(--faint)]">
            {audienceLine(event)}
          </p>
        </div>
      </div>

      <div className="mt-auto flex items-center justify-between gap-3 border-t-2 border-[color:var(--line)] px-4 py-2.5">
        <span className="t-mono text-xs font-bold text-[color:var(--coral-ink)]">
          {formatMoney(event.entry_fee_cents, event.fee_basis)}
        </span>
        <span className="t-mono truncate text-[11px] text-[color:var(--faint)]">
          {distance ?? event.organizer_name ?? ''}
        </span>
      </div>
    </Link>
  );
}
