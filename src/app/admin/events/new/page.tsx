import Link from 'next/link';
import { redirect } from 'next/navigation';
import { isSignedIn } from '@/lib/auth';
import { loadRefOptions } from '@/lib/ref-data';
import { isUuid, loadBrackets, loadEvent } from '@/lib/event-form-data';
import { EventForm, type EventFormValues } from '@/components/admin/EventForm';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'New event', robots: { index: false, follow: false } };

const EMPTY: EventFormValues = {
  name: '',
  event_type: 'tournament',
  sport: 'volleyball',
  starts_on: '',
  ends_on: '',
  registration_deadline: '',
  entry_fee: '',
  fee_basis: 'per_player',
  payout_text: '',
  event_page_url: '',
  flyer_url: '',
  notes: '',
  venue_name: '',
  address_line: '',
  city: '',
  state: '',
  postal_code: '',
  organizer_name: '',
  organizer_email: '',
  surfaces: [],
  formats: [],
  divisions: [],
  brackets: [],
  status: 'draft',
};

/**
 * New event, optionally pre-filled from an existing one via ?from=<id>.
 *
 * Duplicate matters more than it looks. Tom, 28 Oct: most of what gets
 * called a two-day tournament is really two tournaments on consecutive
 * days - each crowning its own champion, with different brackets, run by
 * the same organizer at the same venue. For those, copying the first and
 * changing the dates beats any day-by-day wizard.
 *
 * What carries over is everything that describes the operation: the
 * organizer, the venue, the contact, the money, the policies, the
 * brackets. What does not is anything specific to one running of it.
 */
export default async function NewEventPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string }>;
}) {
  if (!(await isSignedIn())) redirect('/admin');

  const { from } = await searchParams;
  const source = from && isUuid(from) ? await loadEvent(from) : null;

  let values: EventFormValues = EMPTY;
  if (source) {
    const brackets = await loadBrackets(source.id);
    values = {
      ...EMPTY,
      // Everything that describes how this organizer runs events.
      name: source.name,
      event_type: source.event_type ?? 'tournament',
      sport: source.sport_slug,
      entry_fee: source.entry_fee_cents === null ? '' : (source.entry_fee_cents / 100).toFixed(2),
      fee_basis: source.fee_basis,
      payout_text: source.payout_text ?? '',
      event_page_url: source.event_page_url ?? '',
      flyer_url: source.flyer_url ?? '',
      notes: source.notes ?? '',
      venue_name: source.venue_name ?? '',
      address_line: source.address_line ?? '',
      city: source.city ?? '',
      state: source.state ?? '',
      postal_code: source.postal_code ?? '',
      organizer_name: source.organizer_name ?? '',
      organizer_email: source.organizer_email ?? '',
      brackets: brackets.map((b) => ({
        surface: b.surface,
        format: b.format,
        subFormat: b.sub_format,
        divisions: b.divisions ?? [],
      })),
      // Deliberately NOT carried over, because each belongs to one
      // running of the event: the dates, the registration deadline, and
      // the status. A copy starts as a draft so it cannot go live by
      // accident with last weekend's dates on it.
      starts_on: '',
      ends_on: '',
      registration_deadline: '',
      status: 'draft',
    };
  }

  const options = await loadRefOptions(values.sport);

  return (
    <div className="wrap max-w-3xl py-10">
      <Link
        href="/admin/events"
        className="t-mono text-[11px] uppercase tracking-[0.15em] text-[color:var(--faint)] hover:text-[color:var(--surf-ink)]"
      >
        ← Events
      </Link>
      <h1 className="t-head mt-3 text-2xl">{source ? 'Duplicate event' : 'New event'}</h1>

      {source ? (
        <div className="panel tone-warn mt-4 p-4 text-sm">
          <p>
            Copied from <strong>{source.name}</strong> — organizer, venue, money,
            policies and {values.brackets.length}{' '}
            {values.brackets.length === 1 ? 'bracket' : 'brackets'}.
          </p>
          <p className="mt-2">
            <strong>Dates are blank and this starts as a draft</strong>, so it
            cannot go live carrying the old weekend&apos;s dates. Check the
            brackets against what actually runs on the new date — a Sunday
            rarely offers exactly what the Saturday did.
          </p>
        </div>
      ) : (
        <p className="mt-2 text-sm text-[color:var(--muted)]">
          Saving with status “Approved” puts it on the public site straight away.
        </p>
      )}

      <EventForm options={options} values={values} />
    </div>
  );
}
