'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import {
  saveOrganizerProfile, addOrganizerContact, saveOrganizerContact,
  deleteOrganizerContact, makeContactPrimary,
} from '@/lib/organizers-admin';
import {
  ORGANIZER_STATUSES, ORGANIZER_STATUS_LABEL, ORGANIZER_STATUS_HINT,
  SPORT_OPTIONS, CONFIDENCE, type OrganizerContact, type OrganizerProfileForm,
} from '@/lib/organizer-fields';

/**
 * One organization, everything about it, on one screen.
 *
 * Replaces two screens that used to disagree. Before 9 Nov the editable
 * fields lived on the CRM page and the events and venues lived here, so
 * updating someone while on the phone with them meant two tabs and a
 * guess about which one was true. Tom, 4 Nov: "all of these components
 * need to be operating cohesively."
 *
 * Section names are his: "Organization Information" and "Contacts".
 *
 * The public/private seam is deliberately invisible here. Name, city,
 * state, website and the general email go to `organizers`, which the
 * public site reads; everything else goes to `organizer_private`, which
 * it cannot. From the phone it is one organization, so it is one form.
 */
export function OrganizerProfile({
  id, initial, contacts,
}: {
  id: string;
  initial: OrganizerProfileForm;
  contacts: OrganizerContact[];
}) {
  const [form, setForm] = useState<OrganizerProfileForm>(initial);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();
  const set = (k: keyof OrganizerProfileForm, v: string) =>
    setForm((p) => ({ ...p, [k]: v }));

  return (
    <>
      <section className="panel mt-6 p-5">
        <h2 className="t-head text-lg">Organization Information</h2>

        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <Field label="Name" v={form.name} on={(x) => set('name', x)} className="sm:col-span-2" />
          <Field label="Type" v={form.category} on={(x) => set('category', x)}
            hint="Bar sand courts, parks & rec, social league…" />
          <Pick label="Sports" v={form.sports} on={(x) => set('sports', x)} options={SPORT_OPTIONS} />
          <Field label="City" v={form.city} on={(x) => set('city', x)} />
          <Field label="State" v={form.state} on={(x) => set('state', x.toUpperCase())}
            maxLength={2} hint="Two letters, like MO" />
          <Field label="Address" v={form.address} on={(x) => set('address', x)} />
          <Field label="ZIP" v={form.postal_code} on={(x) => set('postal_code', x)} />
          <Field label="Courts" v={form.courts} on={(x) => set('courts', x)}
            hint="Free text — “8 sand, 2 indoor”" />
          <Field label="Registration platform" v={form.booking_platform}
            on={(x) => set('booking_platform', x)} hint="LeagueApps, paper, none…" />
          <Field label="What they run" v={form.offerings} on={(x) => set('offerings', x)}
            className="sm:col-span-2" />
        </div>

        {/* Each platform its own field. A comma-separated blob is neither
            clickable nor countable, and you cannot tell from it whether
            somebody simply has no TikTok. */}
        <h3 className="t-head mt-6 text-sm text-[color:var(--muted)]">Online</h3>
        <div className="mt-3 grid gap-4 sm:grid-cols-2">
          <Field label="Website" v={form.website_url} on={(x) => set('website_url', x)}
            placeholder="joincompete.com" />
          <Field label="Instagram" v={form.instagram} on={(x) => set('instagram', x)}
            placeholder="@handle" />
          <Field label="Facebook" v={form.facebook} on={(x) => set('facebook', x)} />
          <Field label="TikTok" v={form.tiktok} on={(x) => set('tiktok', x)}
            placeholder="@handle" />
        </div>
      </section>

      <section className="panel mt-6 p-5">
        <h2 className="t-head text-lg">Contacts</h2>
        <p className="mt-1 text-xs text-[color:var(--muted)]">
          The general line first, then the people. Add as many as you need —
          the committee that runs a tournament is rarely one person.
        </p>

        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <Field label="Main phone" v={form.phone} on={(x) => set('phone', x)} type="tel" />
          <Field label="Main email" v={form.email} on={(x) => set('email', x)} type="email" />
          <Field label="Public email" v={form.contact_email} on={(x) => set('contact_email', x)}
            type="email" className="sm:col-span-2"
            hint="The only contact field the public organizer page can show. Leave empty to publish nothing." />
        </div>

        <ContactList id={id} contacts={contacts} />
      </section>

      <section className="panel mt-6 p-5">
        <h2 className="t-head text-lg">Pipeline</h2>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <Pick label="Status" v={form.status} on={(x) => set('status', x)}
            options={ORGANIZER_STATUSES.map((s) => [s, ORGANIZER_STATUS_LABEL[s]])}
            hint={ORGANIZER_STATUS_HINT[form.status]} />
          <Pick label="Confidence" v={form.confidence_score} on={(x) => set('confidence_score', x)}
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
          <textarea
            rows={6} value={form.notes} onChange={(e) => set('notes', e.target.value)}
            className="field" />
        </label>
      </section>

      <div className="mt-5 flex flex-wrap items-center gap-3">
        <button
          type="button" disabled={pending}
          onClick={() =>
            start(async () => {
              const res = await saveOrganizerProfile(id, form);
              setMsg({ ok: res.ok, text: res.message });
            })}
          className="btn-primary disabled:opacity-50"
        >
          {pending ? 'Saving…' : 'Save organization'}
        </button>
        {msg && (
          <span role="status" className="text-sm"
            style={{ color: msg.ok ? 'var(--grass)' : 'var(--coral-ink)' }}>
            {msg.text}
          </span>
        )}
      </div>
    </>
  );
}

/* -------------------------------------------------------------------- */

const BLANK = { name: '', title: '', email: '', phone: '', notes: '', is_primary: false };

/**
 * The people at an organization.
 *
 * Each person collapses to a single line and opens with the arrow --
 * Tom, 9 Nov: a button that maximises and minimises, not a trip through
 * an edit screen to read a phone number. The primary contact starts
 * open, because on a call that is the one you actually want showing.
 */
function ContactList({ id, contacts }: { id: string; contacts: OrganizerContact[] }) {
  const router = useRouter();
  const [open, setOpen] = useState<Record<string, boolean>>(
    () => Object.fromEntries(contacts.map((c) => [c.id, c.is_primary])),
  );
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState({ ...BLANK });
  const [editing, setEditing] = useState<string | null>(null);
  const [edit, setEdit] = useState({ ...BLANK });
  const [err, setErr] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const toggle = (cid: string) => setOpen((p) => ({ ...p, [cid]: !p[cid] }));

  const run = (fn: () => Promise<{ ok: boolean; message: string }>, after?: () => void) =>
    start(async () => {
      const r = await fn();
      if (!r.ok) { setErr(r.message); return; }
      setErr(null);
      after?.();
      router.refresh();
    });

  return (
    <div className="mt-6 border-t pt-5" style={{ borderColor: 'var(--line)' }}>
      <h3 className="t-head text-sm text-[color:var(--muted)]">
        People {contacts.length > 0 && `(${contacts.length})`}
      </h3>

      {contacts.length === 0 && !adding && (
        <p className="mt-2 text-xs text-[color:var(--muted)]">Nobody recorded yet.</p>
      )}

      <ul className="mt-3 grid gap-2">
        {contacts.map((c) => {
          const isOpen = open[c.id] ?? false;
          return (
            <li key={c.id} className="border" style={{ borderColor: 'var(--line)' }}>
              {/* The always-visible line. Clicking anywhere on it toggles. */}
              <button
                type="button"
                onClick={() => toggle(c.id)}
                aria-expanded={isOpen}
                className="flex w-full items-center gap-2 px-3 py-2.5 text-left hover:bg-[color:var(--raised)]"
              >
                <Chevron open={isOpen} />
                <span className="t-head text-sm">{c.name}</span>
                {c.is_primary && (
                  <span className="t-mono text-[10px] uppercase tracking-wider text-[color:var(--grass)]">
                    primary
                  </span>
                )}
                {c.title && (
                  <span className="text-xs text-[color:var(--muted)]">{c.title}</span>
                )}
                {!isOpen && c.phone && (
                  <span className="t-mono ml-auto text-[11px] text-[color:var(--muted)]">
                    {c.phone}
                  </span>
                )}
              </button>

              {isOpen && (
                <div className="border-t px-3 py-3" style={{ borderColor: 'var(--line)' }}>
                  {editing === c.id ? (
                    <>
                      <div className="grid gap-3 sm:grid-cols-2">
                        <Field label="Name" v={edit.name} on={(x) => setEdit((p) => ({ ...p, name: x }))} />
                        <Field label="Role" v={edit.title} on={(x) => setEdit((p) => ({ ...p, title: x }))} />
                        <Field label="Phone" v={edit.phone} on={(x) => setEdit((p) => ({ ...p, phone: x }))} type="tel" />
                        <Field label="Email" v={edit.email} on={(x) => setEdit((p) => ({ ...p, email: x }))} type="email" />
                        <Field label="Note" v={edit.notes} on={(x) => setEdit((p) => ({ ...p, notes: x }))} className="sm:col-span-2" />
                      </div>
                      <div className="mt-3 flex gap-2">
                        <button type="button" disabled={pending}
                          onClick={() => run(() => saveOrganizerContact(c.id, edit), () => setEditing(null))}
                          className="btn-primary !py-1.5 !text-xs disabled:opacity-50">Save</button>
                        <button type="button" onClick={() => { setEditing(null); setErr(null); }}
                          className="btn-ghost !py-1.5 !text-xs">Cancel</button>
                      </div>
                    </>
                  ) : (
                    <>
                      <dl className="grid gap-1 text-[13px]">
                        <Line label="Phone" value={c.phone} mono />
                        <Line label="Email" value={c.email} />
                        <Line label="Note" value={c.notes} />
                      </dl>
                      <div className="mt-3 flex flex-wrap gap-3">
                        {!c.is_primary && (
                          <Tiny disabled={pending} onClick={() => run(() => makeContactPrimary(id, c.id))}>
                            Make primary
                          </Tiny>
                        )}
                        <Tiny disabled={pending}
                          onClick={() => {
                            setEditing(c.id);
                            setEdit({
                              name: c.name, title: c.title ?? '', email: c.email ?? '',
                              phone: c.phone ?? '', notes: c.notes ?? '', is_primary: c.is_primary,
                            });
                          }}>
                          Edit
                        </Tiny>
                        <Tiny disabled={pending} danger
                          onClick={() => run(() => deleteOrganizerContact(c.id))}>
                          Remove
                        </Tiny>
                      </div>
                    </>
                  )}
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
            <input
              type="checkbox" checked={draft.is_primary}
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
              onClick={() => run(
                () => addOrganizerContact(id, draft),
                () => { setDraft({ ...BLANK }); setAdding(false); },
              )}
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

function Chevron({ open }: { open: boolean }) {
  return (
    <svg
      width="12" height="12" viewBox="0 0 12 12" aria-hidden="true"
      className="shrink-0 transition-transform duration-150"
      style={{ transform: open ? 'rotate(90deg)' : 'none', color: 'var(--faint)' }}
    >
      <path d="M4 2 L8 6 L4 10" fill="none" stroke="currentColor" strokeWidth="2"
        strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function Line({ label, value, mono }: { label: string; value: string | null; mono?: boolean }) {
  if (!value) return null;
  return (
    <div className="flex gap-2">
      <dt className="t-mono w-14 shrink-0 text-[10px] uppercase tracking-wider text-[color:var(--faint)]">
        {label}
      </dt>
      <dd className={mono ? 't-mono' : ''}>{value}</dd>
    </div>
  );
}

/* -------------------------------------------------------------------- */

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
      <input
        type={type} value={v} onChange={(e) => on(e.target.value)}
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
    <button
      type="button" onClick={onClick} disabled={disabled}
      className="t-mono text-[10px] uppercase tracking-wider underline underline-offset-2 disabled:opacity-40"
      style={{ color: danger ? 'var(--coral-ink)' : 'var(--faint)' }}>
      {children}
    </button>
  );
}
