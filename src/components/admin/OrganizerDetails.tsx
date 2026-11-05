'use client';

import Link from 'next/link';
import { useState, useTransition } from 'react';
import {
  linkProspect,
  unlinkProspect,
  unlinkedProspects,
  updateOrganizer,
} from '@/lib/organizers-admin';

/**
 * The organizer's own details, editable, plus the CRM record behind them.
 *
 * Tom, 4 Nov: opening an organizer showed their events and venues and
 * no way to change an email address, because the editable fields live
 * on a different table reached from a different menu item. Two pages
 * for one organization.
 *
 * This closes it from the organizer side: the fields `organizers`
 * actually owns are edited here, and the CRM record — contacts, phone,
 * pipeline, call log — is linked and summarised rather than duplicated.
 * The two tables stay separate on purpose: organizer pages are public,
 * and the CRM holds phone numbers and private notes about people.
 */

interface Prospect {
  id: string;
  name: string;
  category: string | null;
  city: string | null;
  state: string | null;
  address: string | null;
  phone: string | null;
  email: string | null;
  website: string | null;
  status: string;
}

export function OrganizerDetails({
  id,
  name,
  contactEmail,
  websiteUrl,
  prospect,
}: {
  id: string;
  name: string;
  contactEmail: string | null;
  websiteUrl: string | null;
  prospect: Prospect | null;
}) {
  const [form, setForm] = useState({
    name,
    contact_email: contactEmail ?? '',
    website_url: websiteUrl ?? '',
  });
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();

  const [query, setQuery] = useState('');
  const [hits, setHits] = useState<{ id: string; name: string; city: string | null; state: string | null; status: string }[]>([]);
  const [searching, startSearch] = useTransition();

  const set = (k: keyof typeof form, v: string) => setForm((p) => ({ ...p, [k]: v }));

  function search(value: string) {
    setQuery(value);
    startSearch(async () => setHits(await unlinkedProspects(value)));
  }

  return (
    <section className="panel mt-6 p-5">
      <h2 className="t-head text-base">Details</h2>

      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <label className="grid gap-1.5 sm:col-span-2">
          <span className="t-head text-sm text-[color:var(--muted)]">Organizer name</span>
          <input value={form.name} onChange={(e) => set('name', e.target.value)} className="field" />
        </label>
        <label className="grid gap-1.5">
          <span className="t-head text-sm text-[color:var(--muted)]">Contact email</span>
          <input
            value={form.contact_email}
            onChange={(e) => set('contact_email', e.target.value)}
            className="field"
            inputMode="email"
          />
        </label>
        <label className="grid gap-1.5">
          <span className="t-head text-sm text-[color:var(--muted)]">Website</span>
          <input
            value={form.website_url}
            onChange={(e) => set('website_url', e.target.value)}
            placeholder="joincompete.com"
            className="field"
          />
        </label>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-3">
        <button
          type="button"
          disabled={pending}
          onClick={() =>
            start(async () => {
              const res = await updateOrganizer(id, form);
              setMsg({ ok: res.ok, text: res.message });
            })
          }
          className="btn-primary !py-2 !text-xs disabled:opacity-50"
        >
          {pending ? 'Saving…' : 'Save details'}
        </button>
        {msg && (
          <span className="text-xs" style={{ color: msg.ok ? 'var(--grass)' : 'var(--coral-ink)' }}>
            {msg.text}
          </span>
        )}
      </div>

      <p className="t-mono mt-2 text-[10px] leading-relaxed text-[color:var(--faint)]">
        These three are what the public organizer page shows. Phone numbers,
        contacts and call notes live in the CRM record below — kept separate
        because this page is public and that one is not.
      </p>

      {/* ---- the CRM side ---- */}
      <div className="mt-6 border-t pt-5" style={{ borderColor: 'var(--line)' }}>
        <h3 className="t-head text-sm">Outreach record</h3>

        {prospect ? (
          <div className="mt-2">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <Link href={`/admin/crm/${prospect.id}`} className="t-head text-sm underline-offset-2 hover:underline">
                {prospect.name} ↗
              </Link>
              <span className="t-mono text-[11px] text-[color:var(--muted)]">
                {prospect.status.replace(/_/g, ' ')}
                {prospect.category && ` · ${prospect.category}`}
              </span>
            </div>
            <p className="mt-1 text-xs text-[color:var(--muted)]">
              {[prospect.address, [prospect.city, prospect.state].filter(Boolean).join(', ')]
                .filter(Boolean)
                .join(' · ') || 'No address recorded'}
            </p>
            <p className="mt-0.5 text-xs text-[color:var(--muted)]">
              {[prospect.phone, prospect.email].filter(Boolean).join(' · ') ||
                'No phone or email recorded'}
            </p>
            <button
              type="button"
              disabled={pending}
              onClick={() => start(async () => { const r = await unlinkProspect(id); setMsg({ ok: r.ok, text: r.message }); })}
              className="t-mono mt-2 text-[10px] uppercase tracking-wider text-[color:var(--faint)] underline underline-offset-2"
            >
              Unlink
            </button>
          </div>
        ) : (
          <>
            <p className="mt-1 text-xs text-[color:var(--muted)]">
              Not linked to a CRM record yet, so this page cannot show contacts or
              a call history. <strong>0 of 1,310</strong> are linked — this is how
              that number starts moving.
            </p>
            <label className="mt-3 grid gap-1.5">
              <span className="t-head text-sm text-[color:var(--muted)]">
                Find their record in the CRM
              </span>
              <input
                value={query}
                onChange={(e) => search(e.target.value)}
                placeholder="Search by name"
                className="field"
                autoComplete="off"
              />
            </label>
            {searching && <p className="mt-1 text-xs text-[color:var(--faint)]">Searching…</p>}
            {query.trim().length >= 2 && !searching && hits.length === 0 && (
              <p className="mt-2 text-xs text-[color:var(--muted)]">
                No unlinked record matches that.
              </p>
            )}
            {hits.length > 0 && (
              <ul className="mt-2 overflow-hidden rounded-xl border" style={{ borderColor: 'var(--line)' }}>
                {hits.map((h) => (
                  <li key={h.id}>
                    <button
                      type="button"
                      disabled={pending}
                      onClick={() => start(async () => { const r = await linkProspect(id, h.id); setMsg({ ok: r.ok, text: r.message }); })}
                      className="block w-full border-b px-4 py-2.5 text-left last:border-b-0 hover:bg-[color:var(--raised)]"
                      style={{ borderColor: 'var(--line)' }}
                    >
                      <span className="t-head block text-sm">{h.name}</span>
                      <span className="block text-xs text-[color:var(--muted)]">
                        {[h.city, h.state].filter(Boolean).join(', ') || 'No location'} ·{' '}
                        {h.status.replace(/_/g, ' ')}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </>
        )}
      </div>
    </section>
  );
}
