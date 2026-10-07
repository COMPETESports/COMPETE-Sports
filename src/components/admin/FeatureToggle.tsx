'use client';

import { useState, useTransition } from 'react';
import { toggleFeatured } from '@/lib/admin';

/** Puts an event on the homepage's Featured rail, or takes it off. */
export function FeatureToggle({ id, featured }: { id: string; featured: boolean }) {
  const [on, setOn] = useState(featured);
  const [pending, startTransition] = useTransition();

  return (
    <button
      type="button"
      aria-pressed={on}
      disabled={pending}
      title={on ? 'Remove from the homepage' : 'Feature on the homepage'}
      onClick={() => {
        const next = !on;
        setOn(next);
        startTransition(() => {
          void toggleFeatured(id, next);
        });
      }}
      className={on ? 'chip-featured' : 'chip-muted'}
      style={{ opacity: pending ? 0.5 : 1 }}
    >
      {on ? '★ Featured' : '☆ Feature'}
    </button>
  );
}
