'use client';

import Link from 'next/link';
import { useActionState, useState } from 'react';
import { useFormStatus } from 'react-dom';
import { saveEvent, type ActionState } from '@/lib/admin';
import { PasteBox } from './PasteBox';
import type { ParsedListing } from '@/lib/parse-listing';

export interface RefOption {
  slug: string;
  name: string;
}

export interface EventFormValues {
  id?: string;
  name: string;
  sport: string;
  starts_on: string;
  ends_on: string;
  registration_deadline: string;
  entry_fee: string;
  fee_basis: string;
  payout_text: string;
  event_page_url: string;
  flyer_url: string;
  notes: string;
  venue_name: string;
  address_line: string;
  city: string;
  state: string;
  postal_code: string;
  organizer_name: string;
  organizer_email: string;
  surfaces: string[];
  formats: string[];
  divisions: string[];
  status: string;
}

type TextKey = Exclude<keyof EventFormValues, 'surfaces' | 'formats' | 'divisions' | 'id'>;

export function EventForm({
  values,
  options,
}: {
  values: EventFormValues;
  options: { surfaces: RefOption[]; formats: RefOption[]; divisions: RefOption[] };
}) {
  const [state, action] = useActionState<ActionState | null, FormData>(saveEvent, null);

  // Inputs are controlled so the paste box can fill them. `autoFilled`
  // tracks which fields came from a paste, and a field drops out of it the
  // moment the person edits it by hand.
  const [v, setV] = useState<EventFormValues>(values);
  const [autoFilled, setAutoFilled] = useState<Set<string>>(new Set());

  const set = (key: keyof EventFormValues, value: string | string[]) => {
    setV((prev) => ({ ...prev, [key]: value }));
    setAutoFilled((prev) => {
      if (!prev.has(key)) return prev;
      const next = new Set(prev);
      next.delete(key);
      return next;
    });
  };

  const toggle = (key: 'surfaces' | 'formats' | 'divisions', slug: string) => {
    setV((prev) => {
      const current = prev[key];
      return {
        ...prev,
        [key]: current.includes(slug)
          ? current.filter((s) => s !== slug)
          : [...current, slug],
      };
    });
    setAutoFilled((prev) => {
      if (!prev.has(key)) return prev;
      const next = new Set(prev);
      next.delete(key);
      return next;
    });
  };

  const applyParsed = (fields: ParsedListing, filled: string[]) => {
    setV((prev) => {
      const next = { ...prev };
      for (const [key, value] of Object.entries(fields)) {
        if (value === undefined) continue;
        if (Array.isArray(value)) {
          if (value.length) (next as Record<string, unknown>)[key] = value;
        } else {
          (next as Record<string, unknown>)[key] = String(value);
        }
      }
      return next;
    });
    setAutoFilled(new Set(filled));
  };

  const err = (field: string) => state?.fieldErrors?.[field];
  const isAuto = (field: string) => autoFilled.has(field);

  const text = (key: TextKey) => ({
    value: v[key] ?? '',
    onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
      set(key, e.target.value),
  });

  return (
    <div className="mt-6 space-y-6">
      {/* Paste-and-parse is for entering something new; editing an existing
          record starts from what is already saved. */}
      {!values.id && <PasteBox onParsed={applyParsed} />}

      <form action={action} className="space-y-6">
        {values.id && <input type="hidden" name="id" value={values.id} />}
        <input type="hidden" name="sport" value={v.sport} />

        {state && (
          <p
            role="status"
            className={`panel p-3 text-sm ${state.ok ? 'tone-good' : 'tone-bad'}`}
          >
            {state.message}
          </p>
        )}

        <Section title="The event">
          <Field label="Event name" error={err('name')} auto={isAuto('name')} className="sm:col-span-2">
            <input name="name" {...text('name')} required className="field" />
          </Field>

          <Field label="Start date" error={err('starts_on')} auto={isAuto('starts_on')}>
            <input type="date" name="starts_on" {...text('starts_on')} required className="field" />
          </Field>

          <Field label="End date (if multi-day)" error={err('ends_on')} auto={isAuto('ends_on')}>
            <input type="date" name="ends_on" {...text('ends_on')} className="field" />
          </Field>

          <Field
            label="Register by"
            error={err('registration_deadline')}
            auto={isAuto('registration_deadline')}
          >
            <input
              type="date"
              name="registration_deadline"
              {...text('registration_deadline')}
              className="field"
            />
          </Field>

          <Field label="Entry fee" hint="e.g. 75 or 42.50" error={err('entry_fee')} auto={isAuto('entry_fee')}>
            <input name="entry_fee" {...text('entry_fee')} inputMode="decimal" className="field" />
          </Field>

          <Field label="Fee is" auto={isAuto('fee_basis')}>
            <select name="fee_basis" value={v.fee_basis} onChange={(e) => set('fee_basis', e.target.value)} className="field">
              <option value="per_player">Per player</option>
              <option value="per_team">Per team</option>
            </select>
          </Field>

          <Field label="Payout / prizes" error={err('payout_text')} auto={isAuto('payout_text')}>
            <input name="payout_text" {...text('payout_text')} className="field" />
          </Field>
        </Section>

        <Section title="Who can play">
          <CheckGroup
            legend="Surface"
            name="surfaces"
            options={options.surfaces}
            selected={v.surfaces}
            onToggle={(slug) => toggle('surfaces', slug)}
            error={err('surfaces')}
            auto={isAuto('surfaces')}
          />
          <CheckGroup
            legend="Formats"
            name="formats"
            options={options.formats}
            selected={v.formats}
            onToggle={(slug) => toggle('formats', slug)}
            error={err('formats')}
            auto={isAuto('formats')}
          />
          <CheckGroup
            legend="Divisions"
            name="divisions"
            options={options.divisions}
            selected={v.divisions}
            onToggle={(slug) => toggle('divisions', slug)}
            error={err('divisions')}
            auto={isAuto('divisions')}
          />
          <p className="t-mono sm:col-span-2 text-[11px] uppercase tracking-wider text-[color:var(--faint)]">
            COMPETE lists adult recreational events only.
          </p>
        </Section>

        <Section title="Where">
          <Field label="Venue name" error={err('venue_name')} auto={isAuto('venue_name')} className="sm:col-span-2">
            <input name="venue_name" {...text('venue_name')} required className="field" />
          </Field>
          <Field label="Street address" error={err('address_line')} auto={isAuto('address_line')} className="sm:col-span-2">
            <input name="address_line" {...text('address_line')} className="field" />
          </Field>
          <Field label="City" error={err('city')} auto={isAuto('city')}>
            <input name="city" {...text('city')} required className="field" />
          </Field>
          <Field label="State" hint="Two letters" error={err('state')} auto={isAuto('state')}>
            <input name="state" {...text('state')} maxLength={2} required className="field uppercase" />
          </Field>
          <Field
            label="ZIP code"
            hint="Used for radius search"
            error={err('postal_code')}
            auto={isAuto('postal_code')}
          >
            <input name="postal_code" {...text('postal_code')} inputMode="numeric" className="field" />
          </Field>
        </Section>

        <Section title="Organizer and links">
          <Field label="Organizer name" error={err('organizer_name')} auto={isAuto('organizer_name')}>
            <input name="organizer_name" {...text('organizer_name')} className="field" />
          </Field>
          <Field label="Organizer email" error={err('organizer_email')} auto={isAuto('organizer_email')}>
            <input type="email" name="organizer_email" {...text('organizer_email')} className="field" />
          </Field>
          <Field
            label="Event / registration page"
            hint="Full URL including https://"
            error={err('event_page_url')}
            auto={isAuto('event_page_url')}
            className="sm:col-span-2"
          >
            <input name="event_page_url" {...text('event_page_url')} className="field" />
          </Field>
          <Field label="Flyer image URL" error={err('flyer_url')} auto={isAuto('flyer_url')} className="sm:col-span-2">
            <input name="flyer_url" {...text('flyer_url')} className="field" />
          </Field>
          <Field label="Notes shown to players" error={err('notes')} auto={isAuto('notes')} className="sm:col-span-2">
            <textarea name="notes" {...text('notes')} rows={4} className="field" />
          </Field>
        </Section>

        <Section title="Publishing">
          <Field label="Status" hint="Only approved events appear publicly">
            <select name="status" value={v.status} onChange={(e) => set('status', e.target.value)} className="field">
              <option value="draft">Draft — not public</option>
              <option value="approved">Approved — live on the site</option>
              <option value="cancelled">Cancelled</option>
              <option value="archived">Archived</option>
            </select>
          </Field>
        </Section>

        <div className="flex flex-wrap gap-2">
          <Submit isEdit={!!values.id} />
          <Link href="/admin/events" className="btn-ghost">
            Back to list
          </Link>
        </div>
      </form>
    </div>
  );
}

function Submit({ isEdit }: { isEdit: boolean }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className="btn-primary" disabled={pending}>
      {pending ? 'Saving…' : isEdit ? 'Save changes' : 'Create event'}
    </button>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <fieldset className="panel p-5">
      <legend className="t-kicker px-2 text-[color:var(--surf-ink)]">{title}</legend>
      <div className="mt-2 grid gap-4 sm:grid-cols-2">{children}</div>
    </fieldset>
  );
}

function AutoBadge() {
  return (
    <span className="t-mono ml-2 border border-[color:var(--surf-ink)] px-1 py-px text-[9px] uppercase tracking-wider text-[color:var(--surf-ink)]">
      from paste
    </span>
  );
}

function Field({
  label,
  hint,
  error,
  auto,
  className = '',
  children,
}: {
  label: string;
  hint?: string;
  error?: string;
  auto?: boolean;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <label className={`block ${className}`}>
      <span className="label flex items-center">
        {label}
        {auto && <AutoBadge />}
      </span>
      <span className={auto ? 'block border-l-2 border-[color:var(--surf-ink)] pl-2' : 'block'}>
        {children}
      </span>
      {hint && !error && <span className="t-mono mt-1 block text-[10px] text-[color:var(--faint)]">{hint}</span>}
      {error && (
        <span className="t-mono mt-1 block text-[10px] uppercase tracking-wider text-[color:var(--coral-ink)]">
          {error}
        </span>
      )}
    </label>
  );
}

function CheckGroup({
  legend,
  name,
  options,
  selected,
  onToggle,
  error,
  auto,
}: {
  legend: string;
  name: string;
  options: RefOption[];
  selected: string[];
  onToggle: (slug: string) => void;
  error?: string;
  auto?: boolean;
}) {
  return (
    <fieldset className="sm:col-span-2">
      <legend className="label flex items-center">
        {legend}
        {auto && <AutoBadge />}
      </legend>
      <div className={`flex flex-wrap gap-1.5 ${auto ? 'border-l-2 border-[color:var(--surf-ink)] pl-2' : ''}`}>
        {options.map((opt) => (
          <label key={opt.slug} className="toggle-chip">
            <input
              type="checkbox"
              name={name}
              value={opt.slug}
              checked={selected.includes(opt.slug)}
              onChange={() => onToggle(opt.slug)}
              className="sr-only"
            />
            {opt.name}
          </label>
        ))}
      </div>
      {error && (
        <p className="t-mono mt-1 text-[10px] uppercase tracking-wider text-[color:var(--coral-ink)]">
          {error}
        </p>
      )}
    </fieldset>
  );
}
