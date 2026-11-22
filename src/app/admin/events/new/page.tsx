import Link from 'next/link';
import { redirect } from 'next/navigation';
import { isSignedIn } from '@/lib/auth';
import { loadOrganizerOptions, loadRefOptions, loadVenueOptions } from '@/lib/ref-data';
import { hhmm, isUuid, loadBrackets, loadEvent, loadLeagueDates } from '@/lib/event-form-data';
import { generateLeagueDates, renewalStart } from '@/lib/series-dates';
import { EventForm, type EventFormValues } from '@/components/admin/EventForm';
import { EMPTY_EVENT as EMPTY } from '@/lib/event-form-empty';
import { organizerFull, organizerVenues } from '@/lib/organizers-admin';
import { sql } from '@/lib/db';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'New event', robots: { index: false, follow: false } };


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
  searchParams: Promise<{ from?: string; renew?: string; organizer?: string }>;
}) {
  if (!(await isSignedIn())) redirect('/admin');

  const { from, renew, organizer } = await searchParams;

  // New event for one organizer (Tom, 21 Nov), opened from the organizer's
  // own page. Their most recent event is the best template there is --
  // venue, money, brackets, policies -- so it is copied exactly like
  // Duplicate. With no past event, the organizer record itself fills
  // what it can: name, email, website, sport, home venue, surfaces.
  const org = !from && organizer && isUuid(organizer) ? await organizerFull(organizer) : null;
  let templateId: string | null = from && isUuid(from) ? from : null;
  if (org) {
    const [latest] = await sql<{ id: string }[]>`
      select id from events where organizer_id = ${organizer!}
       order by starts_on desc nulls last, created_at desc limit 1`;
    templateId = latest?.id ?? null;
  }
  const source = templateId ? await loadEvent(templateId) : null;

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
      // A league's night, length, tip-off time and playoff plan describe
      // how this organizer runs the season, so they copy. The dates do
      // not - same reasoning as a tournament's dates below. Setting the
      // new first night regenerates the whole schedule from these.
      start_time: hhmm(source.start_time),
      check_in_time: hhmm(source.check_in_time),
      meeting_time: hhmm(source.meeting_time),
      league_days: source.league_days ?? [],
      league_weeks: source.league_weeks === null ? '' : String(source.league_weeks),
      playoffs: source.playoffs ?? false,
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
      league_dates: [],
      status: 'draft',
    };
  }

  if (org) {
    const r = org.row as Record<string, unknown>;
    const str = (v: unknown) => (typeof v === 'string' ? v : '');
    const sports = Array.isArray(r.sport_slugs) ? (r.sport_slugs as string[]) : [];
    const surfaceKeys = Array.isArray(r.surface_slugs) ? (r.surface_slugs as string[]) : [];
    const name = str(r.name);
    const email = str(r.contact_email) || str(r.email);
    if (source) {
      // A copied event is renamed in practice; keep the old name as a
      // starting point but make sure the organizer is this one.
      values = { ...values, organizer_name: name, organizer_email: email || values.organizer_email };
    } else {
      const sport = sports[0] ?? 'volleyball';
      const venues = await organizerVenues(organizer!);
      const home = venues.find((v) => v.is_home) ?? (venues.length === 1 ? venues[0] : null);
      values = {
        ...EMPTY,
        organizer_name: name,
        organizer_email: email,
        sport,
        event_page_url: str(r.website_url),
        // Stored as "sport:surface" since 21 Nov; older rows hold bare slugs.
        surfaces: surfaceKeys
          .map((k) => (k.includes(':') ? k.split(':') : [sport, k]))
          .filter(([sp]) => sp === sport)
          .map(([, slug]) => slug),
        venue_name: home?.name ?? '',
        address_line: home?.address_line ?? '',
        city: home?.city ?? str(r.city),
        state: home?.state ?? str(r.state),
        postal_code: home?.postal_code ?? '',
      };
    }
  }

  // Renew (15 Nov 2026): the same open play, continuing after its last
  // date. Everything above is already copied; this adds the next run's
  // dates, so the form opens ready to check and save rather than blank.
  let renewing = false;
  if (source && renew === '1' && values.league_days.length) {
    const prior = await loadLeagueDates(source.id);
    const last = prior.map((d) => d.plays_on).sort().pop() ?? null;
    const start = last ? renewalStart(last, values.league_days) : null;
    if (start) {
      renewing = true;
      const weeks = Math.min(Number(values.league_weeks) || 12, 12);
      values = {
        ...values,
        league_weeks: String(weeks),
        starts_on: start,
        league_dates: generateLeagueDates(start, values.league_days, weeks),
      };
    }
  }

  const [options, venues, organizers] = await Promise.all([
    loadRefOptions(values.sport),
    loadVenueOptions(),
    loadOrganizerOptions(),
  ]);

  return (
    <div className="wrap max-w-3xl py-10">
      <Link
        href="/admin/events"
        className="t-mono text-[11px] uppercase tracking-[0.15em] text-[color:var(--faint)] hover:text-[color:var(--surf-ink)]"
      >
        ← Events
      </Link>
      <h1 className="t-head mt-3 text-2xl">
        {renewing ? 'Renew open play' : org ? `New event · ${values.organizer_name}` : source ? 'Duplicate event' : 'New event'}
      </h1>

      {renewing ? (
        <div className="panel tone-warn mt-4 p-4 text-sm">
          <p>
            Renewing <strong>{source?.name}</strong> — everything is copied, and
            the dates carry on from its last session.
          </p>
          <p className="mt-2">
            <strong>Check the dates and change anything that has changed</strong>,
            then save. It starts as a draft; set it to Approved to put it live.
          </p>
        </div>
      ) : org ? (
        <div className="panel tone-warn mt-4 p-4 text-sm">
          {source ? (
            <p>
              Pre-filled from <strong>{source.name}</strong>, their most recent
              event — venue, money, policies and {values.brackets.length}{' '}
              {values.brackets.length === 1 ? 'bracket' : 'brackets'}.
            </p>
          ) : (
            <p>
              No past events for this organizer, so it&apos;s filled from their
              record — contact, website, sport, surfaces and home venue where known.
            </p>
          )}
          <p className="mt-2">
            <strong>Name, dates and deadline need you.</strong> It starts as a
            draft; set it to Approved to put it live.
          </p>
        </div>
      ) : source ? (
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

      <EventForm options={{ ...options, venues, organizers }} values={values} />
    </div>
  );
}
