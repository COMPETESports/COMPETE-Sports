import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { isSignedIn } from '@/lib/auth';
import { loadRefOptions, loadVenueOptions } from '@/lib/ref-data';
import {
  hhmm,
  iso,
  isUuid,
  loadBrackets,
  loadEvent,
  loadLeagueDates,
} from '@/lib/event-form-data';
import { EventForm } from '@/components/admin/EventForm';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Edit event', robots: { index: false, follow: false } };

export default async function EditEventPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  if (!(await isSignedIn())) redirect('/admin');
  const { id } = await params;

  if (!isUuid(id)) notFound();

  // One loader, shared with duplicate. Written 28 Oct for exactly this
  // reason: this page used to carry its own copy of the query, and adding
  // the league columns on 31 Oct meant adding them twice - which is the
  // silent-blank-field bug the shared module exists to prevent.
  const row = await loadEvent(id);
  if (!row) notFound();

  const leagueDates = row.event_type === 'league' ? await loadLeagueDates(id) : [];

  // Existing brackets, grouped back into the shape the builder edits.
  //
  // `confirmed` matters here. Migration 006 backfilled a bracket for every
  // cross-product combination of the old flat lists, all of them
  // confirmed = false, because the 2022-24 sheets never recorded which
  // combinations actually ran. Loading those into the builder and saving
  // would silently promote a guess to a stated fact, so the page warns
  // first and makes editing an old event a verification step.
  // Grouped by format AND sub-format: Men's Doubles and Men's Doubles
  // Blind Draw are two brackets, not one with a stray flag.
  const bracketRows = await loadBrackets(id);

  const brackets = bracketRows.map((b) => ({
    surface: b.surface,
    format: b.format,
    subFormat: b.sub_format,
    divisions: b.divisions ?? [],
  }));
  const guessedBrackets = bracketRows.some((b) => !b.confirmed);

  const [options, venues] = await Promise.all([
    loadRefOptions(row.sport_slug),
    loadVenueOptions(),
  ]);

  return (
    <div className="wrap max-w-3xl py-10">
      <Link
        href="/admin/events"
        className="t-mono text-[11px] uppercase tracking-[0.15em] text-[color:var(--faint)] hover:text-[color:var(--surf-ink)]"
      >
        ← Events
      </Link>

      <div className="mt-3 flex flex-wrap items-start justify-between gap-3">
        <h1 className="t-head text-2xl">{row.name}</h1>
        <div className="flex flex-wrap gap-2">
          {/* The fastest way to enter the Sunday of a Saturday-and-Sunday
              pair, which Tom notes is most of what gets called a two-day
              tournament. */}
          <Link href={`/admin/events/new?from=${row.id}`} className="btn-ghost">
            Duplicate
          </Link>
          {row.status === 'approved' && (
            <Link href={`/events/${row.slug}`} className="btn-ghost">
              View public page ↗
            </Link>
          )}
        </div>
      </div>

      {guessedBrackets && (
        <p className="panel tone-warn mt-4 p-3 text-sm">
          The brackets below were <strong>guessed</strong> when this event was
          imported — every combination of its formats and divisions, because
          the source never recorded which ones actually ran. Check them against
          what the organizer published and remove any that did not happen.
          Saving marks them as confirmed.
        </p>
      )}

      {row.latitude === null && (
        <p className="panel tone-warn mt-4 p-3 text-sm">
          This venue has no map coordinates, so the event will not show up in
          radius search. Add a ZIP code and save to fix it.
        </p>
      )}

      <EventForm
        options={{ ...options, venues }}
        values={{
          id: row.id,
          name: row.name,
          event_type: row.event_type ?? 'tournament',
          sport: row.sport_slug,
          starts_on: iso(row.starts_on),
          ends_on: iso(row.ends_on),
          start_time: hhmm(row.start_time),
          registration_deadline: iso(row.registration_deadline),
          league_days: row.league_days ?? [],
          league_weeks: row.league_weeks === null ? '' : String(row.league_weeks),
          league_dates: leagueDates,
          playoffs: row.playoffs ?? false,
          entry_fee: row.entry_fee_cents === null ? '' : (row.entry_fee_cents / 100).toFixed(2),
          fee_basis: row.fee_basis,
          payout_text: row.payout_text ?? '',
          event_page_url: row.event_page_url ?? '',
          flyer_url: row.flyer_url ?? '',
          notes: row.notes ?? '',
          venue_name: row.venue_name ?? '',
          address_line: row.address_line ?? '',
          city: row.city ?? '',
          state: row.state ?? '',
          postal_code: row.postal_code ?? '',
          organizer_name: row.organizer_name ?? '',
          organizer_email: row.organizer_email ?? '',
          surfaces: row.surfaces ?? [],
          formats: row.formats ?? [],
          divisions: row.divisions ?? [],
          brackets,
          status: row.status,
        }}
      />
    </div>
  );
}
