'use client';

import { useTransition } from 'react';
import { updateEventRelation } from '@/app/account/actions';
import type { EventRelation } from '@/lib/my-events';

/**
 * Save / Registered on an event.
 *
 * Three states, cycled by two controls: nothing → Saved → Registered.
 * "Registered" is the player telling us they are in, which is what makes
 * the Upcoming list on their dashboard worth opening on a Friday night —
 * COMPETE does not take entries, so it has no other way to know.
 *
 * Signed out, the button is still shown and still clickable; it sends the
 * person to sign-in and brings them back. A control that appears only once
 * you have an account cannot advertise the reason to make one.
 */
export function SaveButton({
  eventId,
  relation,
  returnTo,
  size = 'md',
}: {
  eventId: string;
  relation: EventRelation | null;
  returnTo: string;
  size?: 'sm' | 'md';
}) {
  const [pending, start] = useTransition();

  const set = (next: EventRelation | null) =>
    start(() => {
      void updateEventRelation(eventId, next, returnTo);
    });

  const small = size === 'sm';
  const base = small ? 'btn-ghost !px-2.5 !py-1 text-[10px]' : 'btn-ghost';

  if (relation === 'registered') {
    return (
      <div className="flex flex-wrap items-center gap-2">
        <span className={small ? 'chip-accent' : 'chip-accent'}>You are in</span>
        <button
          type="button"
          onClick={() => set('saved')}
          disabled={pending}
          className={base}
          title="Move back to saved"
        >
          {pending ? '…' : 'Not going'}
        </button>
      </div>
    );
  }

  if (relation === 'saved') {
    return (
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => set('registered')}
          disabled={pending}
          className={small ? 'btn-primary !px-2.5 !py-1 text-[10px]' : 'btn-primary'}
        >
          {pending ? '…' : "I'm registered"}
        </button>
        <button
          type="button"
          onClick={() => set(null)}
          disabled={pending}
          className={base}
          title="Remove from saved"
        >
          Unsave
        </button>
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={() => set('saved')}
      disabled={pending}
      className={base}
    >
      {pending ? 'Saving…' : 'Save'}
    </button>
  );
}
