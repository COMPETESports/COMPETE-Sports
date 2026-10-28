'use client';

import { useActionState } from 'react';
import { useFormStatus } from 'react-dom';
import { saveProspect } from '@/lib/crm';

const STATUSES: Array<[string, string]> = [
  ['prospect', 'Prospect — not contacted'],
  ['contacted', 'Contacted — no reply yet'],
  ['in_conversation', 'In conversation'],
  ['committed', 'Committed — agreed to list'],
  ['active', 'Active partner'],
  ['dormant', 'Dormant — not now'],
  ['not_a_fit', 'Not a fit'],
];

const SPORTS: Array<[string, string]> = [
  ['volleyball', 'Volleyball'],
  ['pickleball', 'Pickleball'],
  ['both', 'Both'],
  ['volleyball?', 'Volleyball — pickleball unchecked'],
  ['unknown', 'Unknown'],
];

type Row = Record<string, string | null>;

/**
 * Everything about one prospect, editable.
 *
 * Saving marks the record verified, because the only way this form gets
 * submitted is with a human looking at it. That is the point of the whole
 * screen: research produced a thousand guesses, and this is where a guess
 * becomes a fact.
 *
 * Blank means blank. An emptied field is stored as NULL, not as an empty
 * string, so the list can honestly distinguish "nobody has found this yet"
 * from "checked, and there is nothing".
 */
export function ProspectForm({ row }: { row: Row }) {
  const [state, action] = useActionState<{ error?: string; saved?: boolean } | null, FormData>(
    saveProspect, null,
  );

  return (
    <form action={action} className="grid gap-5">
      <input type="hidden" name="id" value={row.id ?? ''} />

      <section className="panel p-5">
        <h2 className="t-head text-lg">Who they are</h2>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <Field name="name" label="Name" value={row.name} required className="sm:col-span-2" />
          <Field name="category" label="Type" value={row.category}
            hint="Bar sand courts, Municipal Parks & Rec, Social Sports League…" />
          <Pick name="sports" label="Sports" value={row.sports} options={SPORTS} />
          <Field name="city" label="City" value={row.city} />
          <Field name="state" label="State" value={row.state} maxLength={2} className="uppercase" />
          <Field name="address" label="Address" value={row.address} className="sm:col-span-2" />
          <Field name="courts" label="Courts" value={row.courts} hint="Free text — “8 sand, 2 indoor”" />
          <Field name="booking_platform" label="Registration platform" value={row.booking_platform}
            hint="LeagueLab, LeagueApps, phone, Facebook…" />
          <Field name="offerings" label="What they run" value={row.offerings} className="sm:col-span-2" />
        </div>
      </section>

      <section className="panel p-5">
        <h2 className="t-head text-lg">How to reach them</h2>
        <p className="mt-1 text-sm text-[color:var(--muted)]">
          Leave anything blank that you have not confirmed. A blank field is a
          prompt to go and find out; a wrong one costs a phone call.
        </p>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <Field name="contact_name" label="Person" value={row.contact_name} />
          <Field name="contact_title" label="Their role" value={row.contact_title} />
          <Field name="phone" label="Phone" value={row.phone} type="tel" />
          <Field name="email" label="Email" value={row.email} type="email" />
          <Field name="website" label="Website" value={row.website} className="sm:col-span-2" />
          <Field name="social" label="Social" value={row.social} className="sm:col-span-2"
            hint="IG @handle / FB /page" />
        </div>
      </section>

      <section className="panel p-5">
        <h2 className="t-head text-lg">Where it stands</h2>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <Pick name="status" label="Status" value={row.status} options={STATUSES} />
          <Field name="status_note" label="Why" value={row.status_note}
            hint="Especially for “not a fit” — so the same dead end is not walked twice" />
          <Field name="next_action" label="Next action" value={row.next_action} />
          <Field name="next_action_on" label="By when" value={row.next_action_on} type="date" />
        </div>
      </section>

      <section className="panel p-5">
        <h2 className="t-head text-lg">Notes</h2>
        <textarea
          name="notes" rows={6} defaultValue={row.notes ?? ''}
          className="field-area mt-3 font-[inherit]"
          aria-label="Notes"
        />
      </section>

      <div className="flex flex-wrap items-center gap-3">
        <Save />
        {state?.saved && (
          <span role="status" className="t-mono text-[11px] uppercase tracking-wider text-[color:var(--grass)]">
            Saved and marked verified
          </span>
        )}
        {state?.error && (
          <span role="alert" className="t-mono text-[11px] text-[color:var(--coral-ink)]">
            {state.error}
          </span>
        )}
      </div>
    </form>
  );
}

function Save() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} className="btn-primary">
      {pending ? 'Saving…' : 'Save and mark verified'}
    </button>
  );
}

function Field({
  name, label, value, hint, type = 'text', required, maxLength, className = '',
}: {
  name: string; label: string; value: string | null; hint?: string;
  type?: string; required?: boolean; maxLength?: number; className?: string;
}) {
  return (
    <label className={`grid gap-1 ${className}`}>
      <span className="t-mono text-[10px] font-bold uppercase tracking-[0.14em] text-[color:var(--faint)]">
        {label}{required && ' *'}
      </span>
      <input
        name={name} type={type} defaultValue={value ?? ''}
        required={required} maxLength={maxLength}
        className={`field ${className.includes('uppercase') ? 'uppercase' : ''}`}
      />
      {hint && <span className="text-[11px] text-[color:var(--faint)]">{hint}</span>}
    </label>
  );
}

function Pick({
  name, label, value, options,
}: {
  name: string; label: string; value: string | null; options: Array<[string, string]>;
}) {
  return (
    <label className="grid gap-1">
      <span className="t-mono text-[10px] font-bold uppercase tracking-[0.14em] text-[color:var(--faint)]">
        {label}
      </span>
      <select name={name} defaultValue={value ?? ''} className="field">
        {options.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
      </select>
    </label>
  );
}
