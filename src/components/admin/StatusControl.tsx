'use client';

import { useTransition } from 'react';
import { setEventStatus } from '@/lib/admin';

const TONE: Record<string, string> = {
  approved: 'tone-good',
  draft: 'tone-mute',
  cancelled: 'tone-bad',
  archived: 'tone-faint',
};

export function StatusControl({ id, status }: { id: string; status: string }) {
  const [pending, startTransition] = useTransition();

  return (
    <select
      aria-label="Event status"
      value={status}
      disabled={pending}
      onChange={(e) => {
        const next = e.target.value;
        startTransition(() => {
          void setEventStatus(id, next);
        });
      }}
      className={`t-mono border bg-transparent px-2 py-1 text-[11px] uppercase tracking-wider ${
        TONE[status] ?? TONE.draft
      } ${pending ? 'opacity-50' : ''}`}
    >
      {['draft', 'approved', 'cancelled', 'archived'].map((s) => (
        <option key={s} value={s} className="bg-[color:var(--surface)] text-[color:var(--ink)]">
          {s}
        </option>
      ))}
    </select>
  );
}
