'use client';

import { useEffect, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { PlacesAutocomplete } from '@/components/admin/PlacesAutocomplete';
import {
  saveOrganizerProfile, addOrganizerContact, saveOrganizerContact,
  deleteOrganizerContact, makeContactPrimary,
} from '@/lib/organizers-admin';
import {
  ORGANIZER_STATUSES, ORGANIZER_STATUS_LABEL, ORGANIZER_STATUS_HINT,
  CONFIDENCE, type OrganizerContact, type OrganizerProfileForm,
} from '@/lib/organizer-fields';

export interface SportOpt { slug: string; name: string }
export interface SurfaceOpt { slug: string; name: string; sport_slug: string }

/**
 * One organization, everything about it, on one screen.
 *
 * Replaces two screens that used to disagree. Before 9 Nov the editable
 * fields lived on the CRM page and the events and venues lived here, so
 * updating someone while on the phone meant two tabs and a guess about
 * which was true. Tom, 4 Nov: "all of these components need to be
 * operating cohesively."
 *
 * The public/private seam is deliberately invisible. Name, city, state
 * and website go to `organizers`, which the public site reads;
 * everything else goes to `organizer_private`, which it cannot. From
 * the phone it is one organization, so it is one form.
 */
export interface VenueAddress {
  venue_id: string;
  name: string;
  address_line: string | null;
  city: string;
  state: string;
  postal_code: string | null;
  is_home: boolean;
}

type TabId = 'info' | 'contacts' | 'pipeline' | 'venues' | 'history';

/**
 * One organization, everything about it, behind five tabs.
 *
 * Replaces two screens that used to disagree. Before 9 Nov the editable
 * fields lived on the CRM page and the events and venues lived here, so
 * updating someone while on the phone meant two tabs and a guess about
 * which was true. Tom, 4 Nov: "all of these components need to be
 * operating cohesively."
 *
 * Tabs rather than one long scroll, Tom 9 Nov. Organization Information
 * and Pipeline edit one shared form, so the save bar stays put across
 * both and an edit started on one tab is not lost by moving to the
 * other -- nothing is written until Save, and any unsaved change is
 * marked on the tab itself.
 *
 * The public/private seam is deliberately invisible. Name, city, state
 * and website go to `organizers`, which the public site reads;
 * everything else goes to `organizer_private`, which it cannot. From
 * the phone it is one organization, so it is one form.
 */
export function OrganizerProfile({
  id, initial, contacts, sports, surfaces, offeringsNote,
  venueAddresses, venuesSlot, historySlot, eventCount,
}: {
  id: string;
  initial: OrganizerProfileForm;
  contacts: OrganizerContact[];
  sports: SportOpt[];
  surfaces: SurfaceOpt[];
  offeringsNote: string | null;
  venueAddresses: VenueAddress[];
  venuesSlot: React.ReactNode;
  historySlot: React.ReactNode;
  eventCount: number;
}) {
  const [tab, setTab] = useState<TabId>('info');
  const [form, setForm] = useState<OrganizerProfileForm>(initial);
  const [saved, setSaved] = useState<OrganizerProfileForm>(initial);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();
  const set = <K extends keyof OrganizerProfileForm>(k: K, v: OrganizerProfileForm[K]) =>
    setForm((p) => ({ ...p, [k]: v }));

  // Compared against the last saved state rather than the first render,
  // so the marker clears after a save instead of sticking until reload.
  const norm = (f: OrganizerProfileForm) =>
    JSON.stringify({ ...f, sport_slugs: [...f.sport_slugs].sort(), surface_slugs: [...f.surface_slugs].sort() });
  const dirty = norm(form) !== norm(saved);

  // Surfaces belong to a sport, so only the ones for the sports actually
  // selected are offered. A pickleball-only organization is never shown
  // "Grass", the same rule the event filters follow.
  const offered = surfaces.filter((s) => form.sport_slugs.includes(s.sport_slug));

  const toggle = (key: 'sport_slugs' | 'surface_slugs', slug: string) => {
    const have = form[key];
    const next = have.includes(slug) ? have.filter((x) => x !== slug) : [...have, slug];
    if (key === 'sport_slugs') {
      // Dropping a sport drops its surfaces with it, or the record would
      // claim beach volleyball from an organization that no longer runs
      // volleyball at all.
      const keep = surfaces.filter((s) => next.includes(s.sport_slug)).map((s) => s.slug);
      setForm((p) => ({
        ...p, sport_slugs: next,
        surface_slugs: p.surface_slugs.filter((x) => keep.includes(x)),
      }));
    } else {
      set(key, next);
    }
  };

  const useAddress = (v: VenueAddress) =>
    setForm((p) => ({
      ...p,
      address: v.address_line ?? p.address,
      city: v.city || p.city,
      state: v.state || p.state,
      postal_code: v.postal_code ?? p.postal_code,
    }));

  const TABS: Array<[TabId, string, number | null]> = [
    ['info', 'Organization Information', null],
    ['contacts', 'Contacts', contacts.length],
    ['pipeline', 'Pipeline', null],
    ['venues', 'Venues', venueAddresses.length],
    ['history', 'Event History', eventCount],
  ];

  return (
    <>
      <nav className="mt-6 flex gap-1 overflow-x-auto border-b"
        style={{ borderColor: 'var(--line)' }} aria-label="Organizer sections">
        {TABS.map(([key, label, count]) => {
          const on = tab === key;
          const flag = dirty && (key === 'info' || key === 'pipeline');
          return (
            <button key={key} type="button" onClick={() => setTab(key)}
              aria-current={on ? 'page' : undefined}
              className="t-head whitespace-nowrap border-b-2 px-3 py-2.5 text-[13px] transition-colors"
              style={{
                borderColor: on ? 'var(--grass)' : 'transparent',
                color: on ? 'var(--ink)' : 'var(--muted)',
              }}>
              {label}
              {count !== null && (
                <span className="t-mono ml-1.5 text-[11px]" style={{ color: 'var(--faint)' }}>
                  {count}
                </span>
              )}
              {flag && <span style={{ color: 'var(--beach)' }} title="Unsaved changes"> •</span>}
            </button>
          );
        })}
      </nav>

      {tab === 'info' && (
        <section className="panel mt-5 p-5">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Name" v={form.name} on={(x) => set('name', x)} className="sm:col-span-2" />
            <Field label="Type" v={form.category} on={(x) => set('category', x)}
              hint="Bar sand courts, parks & rec, social league…" />
            <Field label="Registration platform" v={form.booking_platform}
              on={(x) => set('booking_platform', x)} hint="LeagueApps, paper, none…" />
            <Field label="Phone" v={form.phone} on={(x) => set('phone', x)} type="tel" />
            <Field label="Email" v={form.email} on={(x) => set('email', x)} type="email" />
          </div>

          {/* Looked up rather than typed. Every venue in this database sat
              on an approximate pin because addresses were hand-entered;
              the same mistake is available here one field at a time. */}
          <h3 className="t-head mt-6 text-sm text-[color:var(--muted)]">Address</h3>
          <p className="mt-1 text-xs text-[color:var(--faint)]">
            Search Google and the four fields below fill themselves.
          </p>
          <div className="mt-2">
            <PlacesAutocomplete
              onPick={(place) =>
                setForm((p) => ({
                  ...p,
                  address: place.address_line || p.address,
                  city: place.city || p.city,
                  state: place.state || p.state,
                  postal_code: place.postal_code || p.postal_code,
                }))
              }
            />
          </div>

          {venueAddresses.length > 0 && (
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <span className="t-mono text-[10px] uppercase tracking-[0.14em] text-[color:var(--faint)]">
                or copy from a venue
              </span>
              {venueAddresses.slice(0, 4).map((v) => (
                <button key={v.venue_id} type="button" onClick={() => useAddress(v)}
                  className="t-mono border px-2.5 py-1 text-[11px]"
                  style={{ borderColor: 'var(--line-strong)', color: 'var(--muted)' }}>
                  {v.name}{v.is_home ? ' ★' : ''}
                </button>
              ))}
            </div>
          )}

          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <Field label="Address" v={form.address} on={(x) => set('address', x)}
              className="sm:col-span-2" />
            <Field label="City" v={form.city} on={(x) => set('city', x)} />
            <Field label="State" v={form.state} on={(x) => set('state', x.toUpperCase())}
              maxLength={2} hint="Two letters, like MO" />
            <Field label="ZIP" v={form.postal_code} on={(x) => set('postal_code', x)} />
            <Field label="Courts" v={form.courts} on={(x) => set('courts', x)}
              hint="Free text — “8 sand, 2 indoor”" />
          </div>

          {/* An organization can run more than one sport. 'both' used to be
              a single-select pretending to be a multi-select. */}
          <h3 className="t-head mt-6 text-sm text-[color:var(--muted)]">Sports</h3>
          <div className="mt-2 flex flex-wrap gap-2">
            {sports.map((s) => (
              <Check key={s.slug} label={s.name}
                on={form.sport_slugs.includes(s.slug)}
                toggle={() => toggle('sport_slugs', s.slug)} />
            ))}
          </div>

          <h3 className="t-head mt-5 text-sm text-[color:var(--muted)]">Surfaces they run on</h3>
          {form.sport_slugs.length === 0 ? (
            <p className="mt-2 text-xs text-[color:var(--faint)]">
              Pick a sport first — surfaces belong to one.
            </p>
          ) : (
            <div className="mt-2 flex flex-wrap gap-2">
              {offered.map((s) => (
                <Check key={`${s.sport_slug}-${s.slug}`}
                  label={form.sport_slugs.length > 1 ? `${s.name} (${s.sport_slug})` : s.name}
                  on={form.surface_slugs.includes(s.slug)}
                  toggle={() => toggle('surface_slugs', s.slug)} />
              ))}
            </div>
          )}

          {offeringsNote && (
            <div className="mt-4 border-l-2 pl-3" style={{ borderColor: 'var(--line-strong)' }}>
              <p className="t-mono text-[10px] uppercase tracking-[0.14em] text-[color:var(--faint)]">
                From research
              </p>
              <p className="mt-0.5 text-[13px] text-[color:var(--muted)]">{offeringsNote}</p>
            </div>
          )}

          <h3 className="t-head mt-6 text-sm text-[color:var(--muted)]">Digital presence</h3>
          <div className="mt-3 grid gap-4 sm:grid-cols-2">
            <LinkField label="Website" kind="web" v={form.website_url}
              on={(x) => set('website_url', x)} placeholder="joincompete.com" />
            <LinkField label="Instagram" kind="instagram" v={form.instagram}
              on={(x) => set('instagram', x)} placeholder="@handle" />
            <LinkField label="Facebook" kind="facebook" v={form.facebook}
              on={(x) => set('facebook', x)} />
            <LinkField label="TikTok" kind="tiktok" v={form.tiktok}
              on={(x) => set('tiktok', x)} placeholder="@handle" />
          </div>
        </section>
      )}

      {tab === 'contacts' && (
        <section className="panel mt-5 p-5">
          <p className="text-xs text-[color:var(--muted)]">
            Open a person with the arrow and type straight into it — the
            committee that runs a tournament is rarely one person.
          </p>
          <ContactList id={id} contacts={contacts} />
        </section>
      )}

      {tab === 'pipeline' && (
        <section className="panel mt-5 p-5">
          <div className="grid gap-4 sm:grid-cols-2">
            <Pick label="Status" v={form.status} on={(x) => set('status', x)}
              options={ORGANIZER_STATUSES.map((s) => [s, ORGANIZER_STATUS_LABEL[s]])}
              hint={ORGANIZER_STATUS_HINT[form.status]} />
            <Pick label="Confidence" v={form.confidence_score}
              on={(x) => set('confidence_score', x)}
              options={[['', 'Not judged yet'], ...CONFIDENCE]}
              hint="Separate from status — the stage says where the conversation is, this says whether it is going anywhere" />
            <Field label="Why" v={form.status_note} on={(x) => set('status_note', x)}
              hint="Especially for “not a fit”, so the same dead end is not walked twice" />
            <Field label="Next action" v={form.next_action} on={(x) => set('next_action', x)} />
            <Field label="By when" v={form.next_action_on} on={(x) => set('next_action_on', x)}
              type="date" hint="Anything dated sorts to the top of the list" />
          </div>

          <label className="mt-4 grid gap-1">
            <span className="t-mono text-[10px] font-bold uppercase tracking-[0.14em] text-[color:var(--faint)]">
              Notes
            </span>
            <textarea rows={8} value={form.notes}
              onChange={(e) => set('notes', e.target.value)} className="field-area" />
          </label>
        </section>
      )}

      {tab === 'venues' && <div>{venuesSlot}</div>}
      {tab === 'history' && <div>{historySlot}</div>}

      {(tab === 'info' || tab === 'pipeline') && (
        <div className="mt-5 flex flex-wrap items-center gap-3">
          <button type="button" disabled={pending || !dirty}
            onClick={() => start(async () => {
              const res = await saveOrganizerProfile(id, form);
              setMsg({ ok: res.ok, text: res.message });
              if (res.ok) setSaved(form);
            })}
            className="btn-primary disabled:opacity-40">
            {pending ? 'Saving…' : dirty ? 'Save organization' : 'Saved'}
          </button>
          {dirty && (
            <Tiny disabled={pending} onClick={() => { setForm(saved); setMsg(null); }}>
              Undo changes
            </Tiny>
          )}
          {msg && (
            <span role="status" className="text-sm"
              style={{ color: msg.ok ? 'var(--grass)' : 'var(--coral-ink)' }}>
              {msg.text}
            </span>
          )}
        </div>
      )}
    </>
  );
}

/* ==================================================================== */

interface Draft { name: string; title: string; email: string; phone: string; notes: string }
const BLANK: Draft & { is_primary: boolean } = {
  name: '', title: '', email: '', phone: '', notes: '', is_primary: false,
};

const draftOf = (c: OrganizerContact): Draft => ({
  name: c.name, title: c.title ?? '', email: c.email ?? '',
  phone: c.phone ?? '', notes: c.notes ?? '',
});

/**
 * The people at an organization.
 *
 * Each collapses to one line and opens with the arrow. Open means
 * editable — Tom, 9 Nov: "I don't want to have to click edit to
 * actually modify the information." Typing marks the row changed and
 * Save appears; nothing is written until it is pressed.
 *
 * The primary contact starts open, because on a call that is the one
 * you want showing.
 */
function ContactList({ id, contacts }: { id: string; contacts: OrganizerContact[] }) {
  const router = useRouter();
  const [open, setOpen] = useState<Record<string, boolean>>(
    () => Object.fromEntries(contacts.map((c) => [c.id, c.is_primary])),
  );
  const [drafts, setDrafts] = useState<Record<string, Draft>>(
    () => Object.fromEntries(contacts.map((c) => [c.id, draftOf(c)])),
  );
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState({ ...BLANK });
  const [err, setErr] = useState<string | null>(null);
  const [pending, start] = useTransition();

  // After a save the server sends fresh rows; the drafts have to follow
  // or the form would keep showing what was typed before the round trip.
  useEffect(() => {
    setDrafts((prev) => {
      const next: Record<string, Draft> = {};
      for (const c of contacts) next[c.id] = prev[c.id] ?? draftOf(c);
      return next;
    });
    setOpen((prev) => {
      const next: Record<string, boolean> = {};
      for (const c of contacts) next[c.id] = prev[c.id] ?? c.is_primary;
      return next;
    });
  }, [contacts]);

  const dirty = (c: OrganizerContact) => {
    const d = drafts[c.id];
    if (!d) return false;
    const o = draftOf(c);
    return (Object.keys(o) as Array<keyof Draft>).some((k) => o[k] !== d[k]);
  };

  const setField = (cid: string, k: keyof Draft, v: string) =>
    setDrafts((p) => ({ ...p, [cid]: { ...p[cid], [k]: v } }));

  const run = (fn: () => Promise<{ ok: boolean; message: string }>, after?: () => void) =>
    start(async () => {
      const r = await fn();
      if (!r.ok) { setErr(r.message); return; }
      setErr(null);
      after?.();
      router.refresh();
    });

  return (
    <div className="mt-4">
      {contacts.length === 0 && !adding && (
        <p className="text-xs text-[color:var(--muted)]">Nobody recorded yet.</p>
      )}

      <ul className="grid gap-2">
        {contacts.map((c) => {
          const isOpen = open[c.id] ?? false;
          const d = drafts[c.id] ?? draftOf(c);
          const changed = dirty(c);
          return (
            <li key={c.id} className="border" style={{ borderColor: 'var(--line)' }}>
              <button type="button" onClick={() => setOpen((p) => ({ ...p, [c.id]: !p[c.id] }))}
                aria-expanded={isOpen}
                className="flex w-full items-center gap-2 px-3 py-2.5 text-left hover:bg-[color:var(--raised)]">
                <Chevron open={isOpen} />
                <span className="t-head text-sm">{c.name}</span>
                {c.is_primary && (
                  <span className="t-mono text-[10px] uppercase tracking-wider text-[color:var(--grass)]">
                    primary
                  </span>
                )}
                {c.title && <span className="text-xs text-[color:var(--muted)]">{c.title}</span>}
                {changed && (
                  <span className="t-mono text-[10px] uppercase tracking-wider text-[color:var(--beach)]">
                    unsaved
                  </span>
                )}
                {!isOpen && c.phone && (
                  <span className="t-mono ml-auto text-[11px] text-[color:var(--muted)]">
                    {c.phone}
                  </span>
                )}
              </button>

              {isOpen && (
                <div className="border-t px-3 py-3" style={{ borderColor: 'var(--line)' }}>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <Field label="Name" v={d.name} on={(x) => setField(c.id, 'name', x)} />
                    <Field label="Role" v={d.title} on={(x) => setField(c.id, 'title', x)} />
                    <Field label="Phone" v={d.phone} on={(x) => setField(c.id, 'phone', x)} type="tel" />
                    <Field label="Email" v={d.email} on={(x) => setField(c.id, 'email', x)} type="email" />
                    <Field label="Note" v={d.notes} on={(x) => setField(c.id, 'notes', x)} className="sm:col-span-2" />
                  </div>
                  <div className="mt-3 flex flex-wrap items-center gap-3">
                    <button type="button" disabled={pending || !changed}
                      onClick={() => run(() => saveOrganizerContact(c.id, d))}
                      className="btn-primary !py-1.5 !text-xs disabled:opacity-40">
                      {pending ? 'Saving…' : changed ? 'Save contact' : 'Saved'}
                    </button>
                    {changed && (
                      <Tiny disabled={pending}
                        onClick={() => setDrafts((p) => ({ ...p, [c.id]: draftOf(c) }))}>
                        Undo
                      </Tiny>
                    )}
                    {!c.is_primary && (
                      <Tiny disabled={pending} onClick={() => run(() => makeContactPrimary(id, c.id))}>
                        Make primary
                      </Tiny>
                    )}
                    <Tiny disabled={pending} danger onClick={() => run(() => deleteOrganizerContact(c.id))}>
                      Remove
                    </Tiny>
                  </div>
                </div>
              )}
            </li>
          );
        })}
      </ul>

      {adding ? (
        <div className="mt-3 border p-3" style={{ borderColor: 'var(--line)' }}>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Name" v={draft.name} on={(x) => setDraft((p) => ({ ...p, name: x }))} />
            <Field label="Role" v={draft.title} on={(x) => setDraft((p) => ({ ...p, title: x }))} />
            <Field label="Phone" v={draft.phone} on={(x) => setDraft((p) => ({ ...p, phone: x }))} type="tel" />
            <Field label="Email" v={draft.email} on={(x) => setDraft((p) => ({ ...p, email: x }))} type="email" />
            <Field label="Note" v={draft.notes} on={(x) => setDraft((p) => ({ ...p, notes: x }))} className="sm:col-span-2" />
          </div>
          <label className="mt-3 flex items-center gap-2 text-sm">
            <input type="checkbox" checked={draft.is_primary}
              onChange={(e) => setDraft((p) => ({ ...p, is_primary: e.target.checked }))}
              className="h-4 w-4" />
            <span>
              Primary contact
              {contacts.length > 0 && (
                <span className="ml-1 text-[11px] text-[color:var(--faint)]">
                  — stands down whoever holds it now
                </span>
              )}
            </span>
          </label>
          <div className="mt-3 flex gap-2">
            <button type="button" disabled={pending}
              onClick={() => run(() => addOrganizerContact(id, draft),
                () => { setDraft({ ...BLANK }); setAdding(false); })}
              className="btn-primary !py-1.5 !text-xs disabled:opacity-50">
              {pending ? 'Adding…' : 'Add contact'}
            </button>
            <button type="button" onClick={() => { setAdding(false); setErr(null); }}
              className="btn-ghost !py-1.5 !text-xs">Cancel</button>
          </div>
        </div>
      ) : (
        <button type="button" onClick={() => setAdding(true)}
          className="btn-ghost mt-3 !py-1.5 !text-xs">
          + Add another contact
        </button>
      )}

      {err && <p className="mt-2 text-xs text-[color:var(--coral-ink)]">{err}</p>}
    </div>
  );
}

/* ==================================================================== */

/**
 * Turn what was typed into something openable.
 *
 * These fields hold whatever the researcher wrote — a bare domain, an
 * @handle, sometimes a full URL. Null when there is nothing worth a
 * link, so the icon simply does not appear.
 */
function hrefFor(kind: string, raw: string): string | null {
  const t = raw.trim();
  if (!t) return null;
  if (/^https?:\/\//i.test(t)) return t;
  const handle = t.replace(/^@/, '').replace(/^\/+/, '');
  if (!handle) return null;
  if (kind === 'instagram') return `https://instagram.com/${handle}`;
  if (kind === 'tiktok') return `https://tiktok.com/@${handle}`;
  if (kind === 'facebook') return `https://facebook.com/${handle}`;
  if (!t.includes('.')) return null;   // not a domain, so not a link
  return `https://${t}`;
}

function LinkField({
  label, kind, v, on, placeholder,
}: {
  label: string; kind: string; v: string; on: (v: string) => void; placeholder?: string;
}) {
  const href = hrefFor(kind, v);
  return (
    <label className="grid gap-1">
      <span className="flex items-center gap-2">
        <span className="t-mono text-[10px] font-bold uppercase tracking-[0.14em] text-[color:var(--faint)]">
          {label}
        </span>
        {href && (
          <a href={href} target="_blank" rel="noopener noreferrer"
            onClick={(e) => e.stopPropagation()}
            className="t-mono text-[10px] uppercase tracking-wider underline underline-offset-2"
            style={{ color: 'var(--indoor)' }}>
            open ↗
          </a>
        )}
      </span>
      <input value={v} onChange={(e) => on(e.target.value)}
        placeholder={placeholder} className="field" />
    </label>
  );
}

function Check({ label, on, toggle }: { label: string; on: boolean; toggle: () => void }) {
  return (
    <label
      className="flex cursor-pointer items-center gap-2 border px-3 py-1.5 text-[13px]"
      style={{
        borderColor: on ? 'var(--grass)' : 'var(--line-strong)',
        color: on ? 'var(--ink)' : 'var(--muted)',
        background: on ? 'color-mix(in srgb, var(--grass) 12%, transparent)' : 'transparent',
      }}>
      <input type="checkbox" checked={on} onChange={toggle} className="h-3.5 w-3.5" />
      {label}
    </label>
  );
}

function Chevron({ open }: { open: boolean }) {
  return (
    <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true"
      className="shrink-0 transition-transform duration-150"
      style={{ transform: open ? 'rotate(90deg)' : 'none', color: 'var(--faint)' }}>
      <path d="M4 2 L8 6 L4 10" fill="none" stroke="currentColor" strokeWidth="2"
        strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function Field({
  label, v, on, hint, type = 'text', maxLength, placeholder, className = '',
}: {
  label: string; v: string; on: (v: string) => void; hint?: string;
  type?: string; maxLength?: number; placeholder?: string; className?: string;
}) {
  return (
    <label className={`grid gap-1 ${className}`}>
      <span className="t-mono text-[10px] font-bold uppercase tracking-[0.14em] text-[color:var(--faint)]">
        {label}
      </span>
      <input type={type} value={v} onChange={(e) => on(e.target.value)}
        maxLength={maxLength} placeholder={placeholder} className="field" />
      {hint && <span className="text-[11px] text-[color:var(--faint)]">{hint}</span>}
    </label>
  );
}

function Pick({
  label, v, on, options, hint,
}: {
  label: string; v: string; on: (v: string) => void;
  options: Array<readonly [string, string]>; hint?: string;
}) {
  return (
    <label className="grid gap-1">
      <span className="t-mono text-[10px] font-bold uppercase tracking-[0.14em] text-[color:var(--faint)]">
        {label}
      </span>
      <select value={v} onChange={(e) => on(e.target.value)} className="field">
        {options.map(([val, l]) => <option key={val} value={val}>{l}</option>)}
      </select>
      {hint && <span className="text-[11px] text-[color:var(--faint)]">{hint}</span>}
    </label>
  );
}

function Tiny({
  children, onClick, disabled, danger,
}: {
  children: React.ReactNode; onClick: () => void; disabled?: boolean; danger?: boolean;
}) {
  return (
    <button type="button" onClick={onClick} disabled={disabled}
      className="t-mono text-[10px] uppercase tracking-wider underline underline-offset-2 disabled:opacity-40"
      style={{ color: danger ? 'var(--coral-ink)' : 'var(--faint)' }}>
      {children}
    </button>
  );
}
