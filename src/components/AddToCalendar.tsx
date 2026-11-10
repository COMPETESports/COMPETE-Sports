import { calendarLinks, type CalendarEvent } from '@/lib/calendar';

/**
 * "Add to calendar", as a choice of calendar.
 *
 * A single .ics link used to be the whole feature. That is fine for a
 * one-day tournament and wrong for a league: a player wants the whole
 * season in the calendar they already use, in one tap (Tom, 10 Nov).
 *
 * A native <details> menu, so it opens and closes with no JavaScript and
 * works with a keyboard and a screen reader as-is.
 */
export function AddToCalendar({ event, siteUrl }: { event: CalendarEvent; siteUrl: string }) {
  const links = calendarLinks(event, siteUrl);
  const isLeague = event.event_type === 'league';

  return (
    <details className="relative">
      <summary className="btn-ghost cursor-pointer list-none [&::-webkit-details-marker]:hidden">
        {isLeague ? 'Add season to calendar' : 'Add to calendar'} ▾
      </summary>
      <div className="panel absolute left-0 z-20 mt-2 w-72 p-2 shadow-lg">
        {isLeague && (
          <p className="t-mono px-2 pb-2 pt-1 text-[10px] uppercase tracking-[0.12em] text-[color:var(--faint)]">
            Every night it plays. Nights off are left out.
          </p>
        )}
        <ul>
          {links.map((link) => (
            <li key={link.key}>
              <a
                href={link.href}
                {...(link.href.startsWith('https://')
                  ? { target: '_blank', rel: 'noopener noreferrer' }
                  : {})}
                className="block px-2 py-2 hover:bg-[color:var(--surface)]"
              >
                <span className="block text-sm font-semibold text-[color:var(--ink)]">{link.label}</span>
                <span className="block text-xs text-[color:var(--muted)]">{link.hint}</span>
              </a>
            </li>
          ))}
        </ul>
      </div>
    </details>
  );
}
