import Link from 'next/link';
import type { MyEvent } from '@/lib/my-events';
import { formatDateRange, venueLine } from '@/lib/format';

/**
 * A past event, one line.
 *
 * Deliberately not an EventCard: a card sells a decision, and there is no
 * decision left to make about last summer. What history is for is
 * recognising a name — "did I play that one?" — so the name, the date and
 * the place are the whole row.
 */
export function HistoryRow({ event }: { event: MyEvent }) {
  return (
    <Link
      href={`/events/${event.slug}`}
      className="flex items-baseline justify-between gap-4 rounded-[10px] border-2 border-[color:var(--line)] bg-[color:var(--surface)] px-4 py-3 hover:border-[color:var(--line-strong)]"
    >
      <span className="min-w-0">
        <span className="block truncate text-sm font-semibold text-[color:var(--ink)]">
          {event.name}
        </span>
        <span className="t-mono mt-0.5 block truncate text-[11px] uppercase tracking-[0.08em] text-[color:var(--faint)]">
          {venueLine(event)}
        </span>
      </span>
      <span className="t-mono shrink-0 text-[11px] uppercase tracking-[0.08em] text-[color:var(--muted)]">
        {formatDateRange(event.starts_on, event.ends_on)}
      </span>
    </Link>
  );
}
