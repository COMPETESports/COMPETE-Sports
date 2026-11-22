'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { createOrganizer } from '@/lib/organizers-admin';

type Match = { id: string; name: string; city: string | null; state: string | null; events: number };

/**
 * "+ New organization" (22 Nov 2026). The basics only -- name, where, website,
 * type -- then straight to the organization's own page for contacts, sports,
 * venues and pipeline. A likely duplicate is shown first.
 */
export function NewOrganizerForm({ categories }: { categories: { category: string; n: number }[] }) {
  const [f, setF] = useState({ name: '', city: '', state: '', website: '', category: '' });
  const [matches, setMatches] = useState<Match[] | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const router = useRouter();
  const set = (k: keyof typeof f, v: string) => {
    setF((p) => ({ ...p, [k]: v }));
    if (k === 'name') setMatches(null);
  };

  const create = (force: boolean) =>
    start(async () => {
      const res = await createOrganizer({ ...f, force });
      if (res.ok) {
        router.push(`/admin/organizers/${res.id}`);
        return;
      }
      setMsg(res.message);
      setMatches(res.matches ?? null);
    });

  return (
    <form
      className="panel mt-6 grid gap-4 p-5 sm:grid-cols-2"
      onSubmit={(e) => {
        e.preventDefault();
        create(false);
      }}
    >
      <label className="grid gap-1 sm:col-span-2">
        <span className="label">Name</span>
        <input required value={f.name} onChange={(e) => set('name', e.target.value)} className="field" autoFocus />
      </label>
      <label className="grid gap-1">
        <span className="label">City</span>
        <input value={f.city} onChange={(e) => set('city', e.target.value)} className="field" />
      </label>
      <label className="grid gap-1">
        <span className="label">State</span>
        <input value={f.state} onChange={(e) => set('state', e.target.value)} maxLength={2} className="field uppercase" placeholder="MO" />
      </label>
      <label className="grid gap-1 sm:col-span-2">
        <span className="label">Website</span>
        <input value={f.website} onChange={(e) => set('website', e.target.value)} className="field" placeholder="https://" />
      </label>
      <label className="grid gap-1 sm:col-span-2">
        <span className="label">Type</span>
        <input value={f.category} onChange={(e) => set('category', e.target.value)} list="new-org-types" className="field" placeholder="Start typing to search…" />
        <datalist id="new-org-types">
          {categories.map((c) => (
            <option key={c.category} value={c.category}>{`${c.n} ${c.n === 1 ? 'organizer' : 'organizers'}`}</option>
          ))}
        </datalist>
      </label>

      {msg && <p className="panel tone-warn p-3 text-sm sm:col-span-2">{msg}</p>}

      {matches && matches.length > 0 && (
        <ul className="grid gap-2 sm:col-span-2">
          {matches.map((m) => (
            <li key={m.id}>
              <Link href={`/admin/organizers/${m.id}`} className="flex items-center justify-between gap-3 rounded-xl border p-3 hover:border-[color:var(--surf-ink)]" style={{ borderColor: 'var(--line)' }}>
                <span>
                  <span className="t-head block text-sm">{m.name}</span>
                  <span className="block text-xs text-[color:var(--muted)]">
                    {[m.city, m.state].filter(Boolean).join(', ') || 'No city'} · {m.events} {m.events === 1 ? 'event' : 'events'}
                  </span>
                </span>
                <span className="t-mono text-[11px] uppercase tracking-wider text-[color:var(--faint)]">Open →</span>
              </Link>
            </li>
          ))}
        </ul>
      )}

      <div className="flex flex-wrap gap-2 sm:col-span-2">
        {matches && matches.length > 0 ? (
          <button type="button" disabled={pending} onClick={() => create(true)} className="btn-primary disabled:opacity-50">
            {pending ? 'Creating…' : 'None of these — create it'}
          </button>
        ) : (
          <button type="submit" disabled={pending} className="btn-primary disabled:opacity-50">
            {pending ? 'Checking…' : 'Create organization'}
          </button>
        )}
        <Link href="/admin/organizers" className="btn-ghost">Cancel</Link>
      </div>
    </form>
  );
}
