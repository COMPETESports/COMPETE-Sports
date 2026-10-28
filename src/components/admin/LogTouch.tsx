'use client';

import { useActionState, useRef } from 'react';
import { useFormStatus } from 'react-dom';
import { logInteraction } from '@/lib/crm';

const KINDS: Array<[string, string]> = [
  ['call', 'Call'],
  ['email', 'Email'],
  ['text', 'Text'],
  ['meeting', 'Meeting'],
  ['note', 'Note'],
];

/**
 * Log what happened, in the moment it happened.
 *
 * The date defaults to today but is editable, because a call made on
 * Tuesday and typed up on Thursday is a Tuesday call — and if the dates
 * drift, the history stops being a reliable account of the relationship.
 *
 * "Note" is in the list but is deliberately not treated as contact: the
 * database trigger leaves `last_contacted_at` alone for notes. Research
 * about someone is not the same as talking to them, and letting a note
 * reset the clock would hide a prospect that has actually gone quiet.
 */
export function LogTouch({ prospectId }: { prospectId: string }) {
  const [state, action] = useActionState<{ error?: string; saved?: boolean } | null, FormData>(
    logInteraction, null,
  );
  const form = useRef<HTMLFormElement>(null);

  // Cleared on success so the next one can be typed straight away.
  if (state?.saved) form.current?.reset();

  return (
    <form ref={form} action={action} className="panel grid gap-3 p-5">
      <input type="hidden" name="prospect_id" value={prospectId} />

      <h2 className="t-head text-lg">Log a touchpoint</h2>

      <div className="grid gap-3 sm:grid-cols-[120px_150px_1fr]">
        <label className="grid gap-1">
          <span className="t-mono text-[10px] font-bold uppercase tracking-[0.14em] text-[color:var(--faint)]">
            What
          </span>
          <select name="kind" defaultValue="call" className="field">
            {KINDS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
        </label>

        <label className="grid gap-1">
          <span className="t-mono text-[10px] font-bold uppercase tracking-[0.14em] text-[color:var(--faint)]">
            When
          </span>
          <input
            name="occurred_on" type="date" required
            defaultValue={new Date().toISOString().slice(0, 10)}
            className="field"
          />
        </label>

        <label className="grid gap-1">
          <span className="t-mono text-[10px] font-bold uppercase tracking-[0.14em] text-[color:var(--faint)]">
            Outcome
          </span>
          <input
            name="outcome" maxLength={120} className="field"
            placeholder="Left voicemail · Wants pricing · Not until spring"
          />
        </label>
      </div>

      <label className="grid gap-1">
        <span className="t-mono text-[10px] font-bold uppercase tracking-[0.14em] text-[color:var(--faint)]">
          What was said
        </span>
        <textarea name="body" rows={3} required className="field-area font-[inherit]" />
      </label>

      <div className="grid gap-3 sm:grid-cols-[1fr_150px]">
        <label className="grid gap-1">
          <span className="t-mono text-[10px] font-bold uppercase tracking-[0.14em] text-[color:var(--faint)]">
            Next action
          </span>
          <input name="next_action" maxLength={200} className="field"
            placeholder="Send the organizer link" />
        </label>
        <label className="grid gap-1">
          <span className="t-mono text-[10px] font-bold uppercase tracking-[0.14em] text-[color:var(--faint)]">
            By when
          </span>
          <input name="next_action_on" type="date" className="field" />
        </label>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <Submit />
        {state?.saved && (
          <span role="status" className="t-mono text-[11px] uppercase tracking-wider text-[color:var(--grass)]">
            Logged
          </span>
        )}
        {state?.error && (
          <span role="alert" className="t-mono text-[11px] text-[color:var(--coral-ink)]">
            {state.error}
          </span>
        )}
      </div>
    </form>
  );
}

function Submit() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} className="btn-primary">
      {pending ? 'Logging…' : 'Log it'}
    </button>
  );
}
