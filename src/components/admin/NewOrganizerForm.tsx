'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { createOrganizer, type NewOrganizerInput } from '@/lib/organizers-admin';
import { VenueSearch } from './VenueSearch';
import type { VenueOption } from './VenuePicker';
import type { PlaceResult } from './PlacesAutocomplete';

type Match = { id: string; name: string; city: string | null; state: string | null; events: number };

/**
 * "+ New organization" (22 Nov; full fields 23 Nov, Tom). Everything an
 * organization record normally holds, in one go: name and type, primary
 * venue, primary contact, website and social. A likely duplicate is shown
 * before anything is created.
 */
export function NewOrganizerForm({
  categories,
  venues,
}: {
  categories: { category: string; n: number }[];
  venues: VenueOption[];
}) {
  const [f, setF] = useState({
    name: '', category: '', city: '', state: '',
    website: '', instagram: '', facebook: '', tiktok: '', social: '',
    first: '', last: '', title: '', email: '', phone: '',
  });
  const [venue, setVenue] = useState<NewOrganizerInput['venue']>(null);
  const [venueLabel, setVenueLabel] = useState('');
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
      const res = await createOrganizer({
        name: f.name, category: f.category, city: f.city, state: f.state,
        website: f.website, instagram: f.instagram, facebook: f.facebook, tiktok: f.tiktok, social: f.social,
        contact: { first: f.first, last: f.last, title: f.title, email: f.email, phone: f.phone },
        venue,
        force,
      });
      if (res.ok) {
        router.push(`/admin/organizers/${res.id}`);
        return;
      }
      setMsg(res.message);
      setMatches(res.matches ?? null);
    });

  const input = (k: keyof typeof f, props: React.InputHTMLAttributes<HTMLInputElement> = {}) => (
    <input value={f[k]} onChange={(e) => set(k, e.target.value)} className="field" {...props} />
  );

  return (
    <form
      className="mt-6 grid gap-5"
      onSubmit={(e) => {
        e.preventDefault();
        create(false);
      }}
    >
      <Group title="Organization">
        <Row label="Organization name" wide>{input('name', { required: true, autoFocus: true })}</Row>
        <Row label="Type" wide>
          {input('category', { list: 'new-org-types', placeholder: 'Start typing to search…' })}
          <datalist id="new-org-types">
            {categories.map((c) => (
              <option key={c.category} value={c.category}>{`${c.n} ${c.n === 1 ? 'organizer' : 'organizers'}`}</option>
            ))}
          </datalist>
        </Row>
      </Group>

      <Group title="Primary venue" hint="Optional. Where they mainly play; becomes their home venue.">
        <div className="sm:col-span-2">
          <VenueSearch
            venues={venues}
            current={venueLabel}
            onPickVenue={(v) => {
              setVenue({ kind: 'existing', id: v.id });
              setVenueLabel(v.name);
              setF((p) => ({ ...p, city: p.city || v.city, state: p.state || v.state }));
            }}
            onPickPlace={(place: PlaceResult) => {
              setVenue({ kind: 'place', place });
              setVenueLabel(place.name);
              setF((p) => ({ ...p, city: p.city || place.city, state: p.state || place.state }));
            }}
          />
          {venue && (
            <p className="mt-2 text-sm text-[color:var(--muted)]">
              Home venue: <strong className="text-[color:var(--ink)]">{venueLabel}</strong>{' '}
              <button type="button" className="underline" onClick={() => { setVenue(null); setVenueLabel(''); }}>
                remove
              </button>
            </p>
          )}
        </div>
        <Row label="City">{input('city')}</Row>
        <Row label="State">{input('state', { maxLength: 2, placeholder: 'MO', className: 'field uppercase' })}</Row>
      </Group>

      <Group title="Primary contact" hint="Private. Never shown on the site.">
        <Row label="First name">{input('first')}</Row>
        <Row label="Last name">{input('last')}</Row>
        <Row label="Title" wide>{input('title', { placeholder: 'Owner, league director…' })}</Row>
        <Row label="Email">{input('email', { type: 'email' })}</Row>
        <Row label="Phone">{input('phone', { type: 'tel', inputMode: 'tel' })}</Row>
      </Group>

      <Group title="Website and social">
        <Row label="Website" wide>{input('website', { placeholder: 'https://' })}</Row>
        <Row label="Instagram">{input('instagram', { placeholder: '@handle or link' })}</Row>
        <Row label="Facebook">{input('facebook', { placeholder: 'Page link' })}</Row>
        <Row label="TikTok">{input('tiktok', { placeholder: '@handle or link' })}</Row>
        <Row label="Other (X, YouTube, Discord…)">{input('social')}</Row>
      </Group>

      {msg && <p className="panel tone-warn p-3 text-sm">{msg}</p>}

      {matches && matches.length > 0 && (
        <ul className="grid gap-2">
          {matches.map((m) => (
            <li key={m.id}>
              <Link
                href={`/admin/organizers/${m.id}`}
                className="flex items-center justify-between gap-3 rounded-xl border p-3 hover:border-[color:var(--surf-ink)]"
                style={{ borderColor: 'var(--line)' }}
              >
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

      <div className="flex flex-wrap gap-2">
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

function Group({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <fieldset className="panel p-5">
      <legend className="t-kicker px-2 text-[color:var(--surf-ink)]">{title}</legend>
      {hint && <p className="mb-3 text-xs text-[color:var(--faint)]">{hint}</p>}
      <div className="grid gap-4 sm:grid-cols-2">{children}</div>
    </fieldset>
  );
}

function Row({ label, wide, children }: { label: string; wide?: boolean; children: React.ReactNode }) {
  return (
    <label className={`grid gap-1 ${wide ? 'sm:col-span-2' : ''}`}>
      <span className="label">{label}</span>
      {children}
    </label>
  );
}
