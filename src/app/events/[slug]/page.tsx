import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getEventBySlug, getNearbyEvents } from '@/lib/queries';
import {
  audienceLine,
  countdownLabel,
  formatDate,
  formatDateRange,
  formatMoney,
  mapsUrl,
  venueLine,
} from '@/lib/format';
import { EventCard } from '@/components/EventCard';
import { SaveButton } from '@/components/account/SaveButton';
import { currentAccount } from '@/lib/accounts';
import { getRelation } from '@/lib/my-events';
import { GENDER_LABELS } from '@/lib/types';

export const dynamic = 'force-dynamic';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const event = await getEventBySlug(slug);
  if (!event) return { title: 'Event not found' };

  const where = [event.city, event.state].filter(Boolean).join(', ');
  const description = `${formatDate(event.starts_on)} in ${where}. ${audienceLine(event)}. ${
    event.division_names.length ? `Divisions: ${event.division_names.join(', ')}.` : ''
  }`.trim();

  return {
    title: `${event.name} — ${where}`,
    description,
    openGraph: { title: event.name, description, type: 'website' },
    alternates: { canonical: `/events/${event.slug}` },
  };
}

export default async function EventDetailPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const event = await getEventBySlug(slug);
  if (!event) notFound();

  const nearby = await getNearbyEvents(event);
  const genders = [...new Set(event.genders)].map((g) => GENDER_LABELS[g] ?? g);

  const account = await currentAccount();
  const relation = account ? await getRelation(account.id, event.id) : null;

  // Search engines show tournaments as events when the page says so plainly.
  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'SportsEvent',
    name: event.name,
    startDate: event.starts_on,
    endDate: event.ends_on ?? event.starts_on,
    eventStatus: 'https://schema.org/EventScheduled',
    eventAttendanceMode: 'https://schema.org/OfflineEventAttendanceMode',
    sport: event.sport_name,
    location: {
      '@type': 'Place',
      name: event.venue_name ?? `${event.city}, ${event.state}`,
      address: {
        '@type': 'PostalAddress',
        streetAddress: event.address_line ?? undefined,
        addressLocality: event.city ?? undefined,
        addressRegion: event.state ?? undefined,
        postalCode: event.postal_code ?? undefined,
        addressCountry: 'US',
      },
      ...(event.latitude && event.longitude
        ? { geo: { '@type': 'GeoCoordinates', latitude: event.latitude, longitude: event.longitude } }
        : {}),
    },
    ...(event.organizer_name
      ? { organizer: { '@type': 'Organization', name: event.organizer_name } }
      : {}),
    ...(event.entry_fee_cents !== null
      ? {
          offers: {
            '@type': 'Offer',
            price: (event.entry_fee_cents / 100).toFixed(2),
            priceCurrency: 'USD',
            url: event.event_page_url ?? undefined,
            availability: 'https://schema.org/InStock',
          },
        }
      : {}),
  };

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />

      <div className="band-sun border-b-2 border-[color:var(--line)]">
        <div className="wrap py-8 sm:py-12">
          <Link
            href="/"
            className="t-mono text-[11px] uppercase tracking-[0.15em] text-[color:var(--faint)] hover:text-[color:var(--surf-ink)]"
          >
            ← All events
          </Link>

          <div className="mt-4 flex flex-wrap items-center gap-2">
            {event.surface_names.map((name) => (
              <span key={name} className="chip-muted">
                {name}
              </span>
            ))}
            <span className="chip-muted">{event.sport_name}</span>
            <span className="chip-accent">
              {countdownLabel(event.starts_on)}
            </span>
          </div>

          <h1 className="t-head mt-3 max-w-3xl text-2xl leading-tight sm:text-4xl">
            {event.name}
          </h1>
          <p className="mt-3 text-base text-[color:var(--muted)]">
            {formatDateRange(event.starts_on, event.ends_on)} · {venueLine(event)}
          </p>

          <div className="mt-6 flex flex-wrap gap-2">
            {event.event_page_url && (
              <a
                href={event.event_page_url}
                target="_blank"
                rel="noopener noreferrer nofollow"
                className="btn-primary"
              >
                Register on organizer site ↗
              </a>
            )}
            <a href={`/events/${event.slug}/calendar.ics`} className="btn-ghost">
              Add to calendar
            </a>
            <SaveButton
              eventId={event.id}
              relation={relation}
              returnTo={`/events/${event.slug}`}
            />
            <a
              href={mapsUrl(event)}
              target="_blank"
              rel="noopener noreferrer"
              className="btn-ghost"
            >
              Open in maps ↗
            </a>
          </div>
        </div>
      </div>

      <div className="wrap mt-10 grid gap-8 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="space-y-8">
          <section className="panel p-5">
            <h2 className="t-kicker mb-4 text-[color:var(--muted)]">Who can play</h2>
            <dl className="grid gap-4 sm:grid-cols-2">
              <Detail label="Formats" value={event.format_names.join(', ') || '—'} />
              <Detail label="Divisions" value={event.division_names.join(', ') || '—'} />
              <Detail label="Playing as" value={genders.join(', ') || '—'} />
              <Detail label="Surface" value={event.surface_names.join(', ') || '—'} />
            </dl>
            <p className="t-mono mt-5 border-t-2 border-[color:var(--line)] pt-3 text-[11px] uppercase tracking-[0.12em] text-[color:var(--faint)]">
              Adult recreational event
            </p>
          </section>

          {event.notes && (
            <section className="panel p-5">
              <h2 className="t-kicker mb-3 text-[color:var(--muted)]">From the organizer</h2>
              <p className="whitespace-pre-line text-sm leading-relaxed text-[color:var(--muted)]">
                {event.notes}
              </p>
            </section>
          )}

          <section className="panel p-5">
            <h2 className="t-kicker mb-4 text-[color:var(--muted)]">Where</h2>
            <p className="t-head text-lg">{event.venue_name ?? 'Venue to be announced'}</p>
            {event.address_line && (
              <p className="mt-1 text-sm leading-relaxed text-[color:var(--muted)]">{event.address_line}</p>
            )}
            {/* Source addresses usually already carry the city and state, so
                the second line is only shown when it adds something. */}
            {!(
              event.address_line &&
              event.city &&
              event.address_line.toLowerCase().includes(event.city.toLowerCase())
            ) && (
              <p className="mt-1 text-sm text-[color:var(--muted)]">
                {[event.city, event.state, event.postal_code].filter(Boolean).join(', ')}
              </p>
            )}
            <a
              href={mapsUrl(event)}
              target="_blank"
              rel="noopener noreferrer"
              className="btn-ghost mt-4"
            >
              Get directions ↗
            </a>
            {event.geo_precision === 'city' && (
              <p className="t-mono mt-3 text-[11px] text-[color:var(--faint)]">
                Location approximate to the city centre.
              </p>
            )}
          </section>
        </div>

        <aside className="space-y-4 lg:sticky lg:top-24 lg:self-start">
          <div className="panel p-5">
            <p className="t-kicker text-[color:var(--muted)]">Entry fee</p>
            <p className="t-head mt-1 text-2xl text-[color:var(--coral-ink)]">
              {formatMoney(event.entry_fee_cents, event.fee_basis)}
            </p>

            <dl className="mt-5 space-y-3 border-t-2 border-[color:var(--line)] pt-4">
              <Detail label="Date" value={formatDateRange(event.starts_on, event.ends_on)} small />
              {event.registration_deadline && (
                <Detail
                  label="Register by"
                  value={formatDate(event.registration_deadline)}
                  small
                />
              )}
              {event.payout_text && (
                <Detail label="Payout / prizes" value={event.payout_text} small />
              )}
              {event.organizer_name && (
                <Detail label="Organizer" value={event.organizer_name} small />
              )}
            </dl>

            {event.event_page_url && (
              <a
                href={event.event_page_url}
                target="_blank"
                rel="noopener noreferrer nofollow"
                className="btn-primary mt-5 w-full"
              >
                Register ↗
              </a>
            )}
            <p className="t-mono mt-3 text-[10px] leading-relaxed text-[color:var(--faint)]">
              Registration is handled by the organizer. COMPETE lists the event
              and sends you to their page.
            </p>
          </div>

          {event.organizer_email && (
            <div className="panel p-5">
              <p className="t-kicker mb-2 text-[color:var(--muted)]">Questions</p>
              <a
                href={`mailto:${event.organizer_email}?subject=${encodeURIComponent(event.name)}`}
                className="break-all text-sm text-[color:var(--surf-ink)] hover:underline"
              >
                {event.organizer_email}
              </a>
            </div>
          )}
        </aside>
      </div>

      {nearby.length > 0 && (
        <section className="wrap mt-16">
          <h2 className="t-head mb-4 border-b-2 border-[color:var(--line)] pb-3 text-xl">
            Also near {event.city}
          </h2>
          <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {nearby.map((e) => (
              <li key={e.id} className="flex">
                <div className="flex w-full">
                  <EventCard event={e} />
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}
    </>
  );
}

function Detail({
  label,
  value,
  small,
}: {
  label: string;
  value: string;
  small?: boolean;
}) {
  return (
    <div>
      <dt className="t-mono text-[10px] uppercase tracking-[0.15em] text-[color:var(--faint)]">{label}</dt>
      <dd className={`mt-1 ${small ? 'text-sm' : 'text-base'} text-[color:var(--muted)]`}>{value}</dd>
    </div>
  );
}
