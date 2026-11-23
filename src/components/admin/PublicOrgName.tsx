'use client';

import { useEffect, useRef, useState } from 'react';
import { matchPublicOrganizers } from '@/lib/admin';

type Org = { id: string; name: string; city: string | null; state: string | null };

/**
 * Organization name on the public form, with matches as you type (Tom,
 * 23 Nov): after 3 letters, up to 5 organizations already on COMPETE.
 * Picking one sends its id, so "XOXO VB" and "XOXO Volleyball" stay one
 * record. Typing something new is fine -- Tom matches it on review.
 */
export function PublicOrgName({
  value,
  onChange,
}: {
  value: string;
  onChange: (name: string) => void;
}) {
  const [matches, setMatches] = useState<Org[]>([]);
  const [picked, setPicked] = useState<Org | null>(null);
  const [open, setOpen] = useState(false);
  const skip = useRef(false);

  useEffect(() => {
    if (skip.current) {
      skip.current = false;
      return;
    }
    if (value.trim().length < 3) {
      setMatches([]);
      return;
    }
    const t = setTimeout(() => {
      matchPublicOrganizers(value).then((m) => {
        setMatches(m);
        setOpen(true);
      }).catch(() => setMatches([]));
    }, 250);
    return () => clearTimeout(t);
  }, [value]);

  return (
    <div className="relative">
      <input
        name="organizer_name"
        value={value}
        required
        autoComplete="off"
        onChange={(e) => {
          setPicked(null);
          onChange(e.target.value);
        }}
        onFocus={() => matches.length && setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        className="field"
        aria-autocomplete="list"
      />
      <input type="hidden" name="organizer_id" value={picked?.id ?? ''} />
      {picked && (
        <p className="mt-1 text-xs text-[color:var(--grass)]">✓ Already on COMPETE — this event will be added to their page.</p>
      )}
      {open && !picked && matches.length > 0 && (
        <ul
          role="listbox"
          className="panel absolute left-0 right-0 top-full z-20 mt-1 overflow-hidden p-1"
        >
          <li className="t-mono px-3 py-1.5 text-[10px] uppercase tracking-wider text-[color:var(--faint)]">
            Already on COMPETE
          </li>
          {matches.map((o) => (
            <li key={o.id}>
              <button
                type="button"
                role="option"
                aria-selected={false}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => {
                  skip.current = true;
                  setPicked(o);
                  setOpen(false);
                  onChange(o.name);
                }}
                className="block w-full rounded-lg px-3 py-2 text-left hover:bg-[color:var(--raised)]"
              >
                <span className="t-head block text-sm">{o.name}</span>
                <span className="block text-xs text-[color:var(--muted)]">
                  {[o.city, o.state].filter(Boolean).join(', ')}
                </span>
              </button>
            </li>
          ))}
          <li className="px-3 py-1.5 text-xs text-[color:var(--faint)]">Not listed? Keep typing the full name.</li>
        </ul>
      )}
    </div>
  );
}
