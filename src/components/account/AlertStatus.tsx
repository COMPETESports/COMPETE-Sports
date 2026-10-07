'use client';

import { useTransition } from 'react';
import { snoozeAlerts } from '@/app/account/actions';
import { SNOOZE_CHOICES } from '@/lib/sms-consent';

/**
 * Snooze, rather than only unsubscribe.
 *
 * Recreational sport is seasonal. A beach player in January does not want
 * event alerts and is not an unsubscribe — they are back in April. STOP
 * still works and always will, because carriers require it; this is the
 * option that keeps somebody on the list who would otherwise leave it.
 */
export function AlertStatus({ snoozedUntil }: { snoozedUntil: string | null }) {
  const [pending, start] = useTransition();

  const snoozed =
    snoozedUntil !== null && new Date(`${snoozedUntil}T23:59:59Z`).getTime() > Date.now();

  const until = snoozed
    ? new Date(`${snoozedUntil}T12:00:00Z`).toLocaleDateString('en-US', {
        month: 'long',
        day: 'numeric',
        year: 'numeric',
        timeZone: 'UTC',
      })
    : null;

  return (
    <div className={`panel p-5 ${snoozed ? 'tone-mute' : 'tone-good'}`}>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="t-head text-base">
          {snoozed ? `Alerts paused until ${until}` : 'New-event alerts are on'}
        </p>
        {snoozed && (
          <button
            type="button"
            className="btn-ghost !px-3 !py-1 text-[10px]"
            disabled={pending}
            onClick={() => start(() => void snoozeAlerts(0))}
          >
            {pending ? '…' : 'Resume now'}
          </button>
        )}
      </div>

      <p className="mt-2 text-sm leading-relaxed">
        {snoozed
          ? 'We will not text you until then. Your saved filters are untouched.'
          : 'We text you when an event is added that matches your sports, filters and travel radius.'}
      </p>

      {!snoozed && (
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <span className="t-mono text-[10px] uppercase tracking-[0.15em] text-[color:var(--faint)]">
            Pause for
          </span>
          {SNOOZE_CHOICES.map((choice) => (
            <button
              key={choice.days}
              type="button"
              className="btn-ghost !px-3 !py-1 text-[10px]"
              disabled={pending}
              onClick={() => start(() => void snoozeAlerts(choice.days))}
            >
              {choice.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
