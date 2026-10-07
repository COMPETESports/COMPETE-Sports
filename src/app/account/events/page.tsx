import Link from 'next/link';
import { currentAccount } from '@/lib/accounts';
import { getMyEvents, type MyEvent } from '@/lib/my-events';
import { EventCard } from '@/components/EventCard';
import { SaveButton } from '@/components/account/SaveButton';
import { HistoryRow } from '@/components/account/HistoryRow';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'My events', robots: { index: false } };

/**
 * Three lists, in the order a player cares about them: what is coming up,
 * what they are still deciding on, and what they have played.
 *
 * History is collapsed, because it grows without limit and nobody opens this
 * page to read last April. Upcoming and Saved are open, because those are
 * the reason to come here at all.
 */
export default async function MyEventsPage() {
  const account = (await currentAccount())!;
  const { saved, upcoming, history } = await getMyEvents(account.id);

  const empty = !saved.length && !upcoming.length && !history.length;

  if (empty) {
    return (
      <div className="panel px-6 py-14 text-center">
        <p className="t-display text-2xl text-[color:var(--coral-ink)]">Nothing here yet</p>
        <p className="mx-auto mt-3 max-w-sm text-sm leading-relaxed text-[color:var(--muted)]">
          Save an event and it lands here. Mark yourself registered and it moves
          to Upcoming, then into your history the day after it finishes.
        </p>
        <Link href="/events" className="btn-primary mt-6">
          Find something to play
        </Link>
      </div>
    );
  }

  return (
    <div className="grid max-w-3xl gap-10">
      <Section
        title="Coming up"
        count={upcoming.length}
        events={upcoming}
        blank="Nothing you have marked yourself registered for."
      />

      <Section
        title="Saved"
        count={saved.length}
        events={saved}
        blank="Nothing saved. The Save button is on every event."
      />

      <section>
        <h2 className="list-head">
          History <span>{history.length}</span>
        </h2>
        {history.length ? (
          <details className="mt-4">
            <summary className="t-mono cursor-pointer text-[11px] uppercase tracking-[0.12em] text-[color:var(--surf-ink)]">
              Show what you have played
            </summary>
            <ul className="mt-4 grid gap-2">
              {history.map((event) => (
                <li key={event.id}>
                  <HistoryRow event={event} />
                </li>
              ))}
            </ul>
          </details>
        ) : (
          <p className="mt-4 text-sm leading-relaxed text-[color:var(--muted)]">
            Once an event you were registered for has finished, it shows up here
            on its own.
          </p>
        )}
      </section>
    </div>
  );
}

function Section({
  title,
  count,
  events,
  blank,
}: {
  title: string;
  count: number;
  events: MyEvent[];
  blank: string;
}) {
  return (
    <section>
      <h2 className="list-head">
        {title} <span>{count}</span>
      </h2>
      {events.length ? (
        <ul className="mt-4 grid gap-3">
          {events.map((event) => (
            <li key={event.id} className="grid min-w-0 gap-2">
              <EventCard event={event} />
              <div className="flex justify-end">
                <SaveButton
                  eventId={event.id}
                  relation={event.relation}
                  returnTo="/account/events"
                  size="sm"
                />
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-4 text-sm leading-relaxed text-[color:var(--muted)]">{blank}</p>
      )}
    </section>
  );
}
