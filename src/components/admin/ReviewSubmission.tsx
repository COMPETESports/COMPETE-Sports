'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { reviewSubmission } from '@/lib/admin';

/**
 * Approve or decline an event submitted from the public form (22 Nov 2026).
 * Either way the submitter is emailed. Edits to the form below must be
 * saved FIRST -- approving publishes what is saved, not what is on screen.
 */
export function ReviewSubmission({
  id,
  status,
  submitter,
  submittedAt,
  reviewNote,
}: {
  id: string;
  status: string;
  submitter: string | null;
  submittedAt: string | null;
  reviewNote: string | null;
}) {
  const [reason, setReason] = useState('');
  const [declining, setDeclining] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();
  const router = useRouter();

  const run = (decision: 'approve' | 'decline') =>
    start(async () => {
      const res = await reviewSubmission(id, decision, reason);
      setMsg({ ok: res.ok, text: res.message });
      if (res.ok) router.refresh();
    });

  return (
    <section className="panel tone-warn mt-4 p-4 text-sm">
      <p className="t-head text-base">
        {status === 'pending' ? 'Submitted from the public form — waiting for review' : 'Submitted from the public form — declined'}
      </p>
      <p className="mt-1">
        By <strong>{submitter ?? 'a deleted account'}</strong>
        {submittedAt && <> on {submittedAt}</>}.
        {' '}Check it against the organizer&apos;s own page, fix anything below and <strong>save first</strong>, then approve.
      </p>
      {status === 'declined' && reviewNote && <p className="mt-1">Reason given: {reviewNote}</p>}

      {status === 'pending' && (
        <div className="mt-3 space-y-3">
          {declining && (
            <label className="block">
              <span className="label">Reason — goes in the email to the submitter</span>
              <textarea
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                rows={3}
                maxLength={1000}
                className="field"
                placeholder="e.g. We couldn't confirm the date on the organizer's page."
              />
            </label>
          )}
          <div className="flex flex-wrap gap-2">
            {!declining && (
              <button type="button" disabled={pending} onClick={() => run('approve')} className="btn-primary disabled:opacity-50">
                {pending ? 'Working…' : 'Approve and publish'}
              </button>
            )}
            {declining ? (
              <>
                <button type="button" disabled={pending || !reason.trim()} onClick={() => run('decline')} className="btn-primary disabled:opacity-50">
                  {pending ? 'Working…' : 'Decline and email'}
                </button>
                <button type="button" onClick={() => setDeclining(false)} className="btn-ghost">Cancel</button>
              </>
            ) : (
              <button type="button" onClick={() => setDeclining(true)} className="btn-ghost">Decline…</button>
            )}
          </div>
        </div>
      )}
      {msg && (
        <p role="status" className={`panel mt-3 p-3 ${msg.ok ? 'tone-good' : 'tone-bad'}`}>{msg.text}</p>
      )}
    </section>
  );
}
