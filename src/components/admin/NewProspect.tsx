'use client';

import { useActionState, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useFormStatus } from 'react-dom';
import { createProspect } from '@/lib/crm';

/**
 * Add someone who exists nowhere in the research — a director met at a
 * tournament, a name from a conversation.
 *
 * Three fields, one of them required. The CRM concept calls for near-zero
 * friction on capture, and asking for a phone number before the record can
 * exist is how a lead gets lost between the court and the car park.
 */
export function NewProspect() {
  const [open, setOpen] = useState(false);
  const [state, action] = useActionState<{ error?: string; id?: string } | null, FormData>(
    createProspect, null,
  );
  const router = useRouter();

  // Straight into the new profile, where the details go.
  useEffect(() => {
    if (state?.id) router.push(`/admin/crm/${state.id}`);
  }, [state?.id, router]);

  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} className="btn-primary">
        + Add a partner
      </button>
    );
  }

  return (
    <form action={action} className="panel grid w-full gap-2 p-4 sm:w-auto sm:grid-cols-[1fr_90px_70px_auto]">
      <input
        name="name" required autoFocus placeholder="Organization or person"
        className="field" aria-label="Name"
      />
      <input name="city" placeholder="City" className="field" aria-label="City" />
      <input
        name="state" placeholder="ST" maxLength={2} className="field uppercase"
        aria-label="State"
      />
      <div className="flex gap-2">
        <Submit />
        <button type="button" onClick={() => setOpen(false)} className="btn-ghost">
          Cancel
        </button>
      </div>
      {state?.error && (
        <p role="alert" className="t-mono text-[11px] text-[color:var(--coral-ink)] sm:col-span-4">
          {state.error}
        </p>
      )}
    </form>
  );
}

function Submit() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} className="btn-primary whitespace-nowrap">
      {pending ? 'Adding…' : 'Add'}
    </button>
  );
}
