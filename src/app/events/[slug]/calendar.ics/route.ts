import { getEventBySlug } from '@/lib/queries';
import { venueLine } from '@/lib/format';

/**
 * Add to Calendar.
 *
 * Serves a single-event iCalendar file, which every major calendar app
 * imports on open. Events are written as all-day entries because the source
 * data records a date but rarely a reliable start time; an all-day entry is
 * honest, where a guessed 9am would not be.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params;
  const event = await getEventBySlug(slug);
  if (!event) return new Response('Not found', { status: 404 });

  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://joincompete.com';
  const compact = (iso: string) => iso.replace(/-/g, '');

  // DTEND is exclusive for all-day events, so it lands on the day after.
  const endExclusive = (() => {
    const [y, m, d] = (event.ends_on ?? event.starts_on).split('-').map(Number);
    const next = new Date(Date.UTC(y, m - 1, d + 1));
    return `${next.getUTCFullYear()}${String(next.getUTCMonth() + 1).padStart(2, '0')}${String(
      next.getUTCDate(),
    ).padStart(2, '0')}`;
  })();

  const descriptionParts = [
    event.format_names.length ? `Formats: ${event.format_names.join(', ')}` : null,
    event.division_names.length ? `Divisions: ${event.division_names.join(', ')}` : null,
    event.entry_fee_cents !== null
      ? `Entry: $${(event.entry_fee_cents / 100).toFixed(2)} per player`
      : null,
    event.organizer_name ? `Organizer: ${event.organizer_name}` : null,
    event.event_page_url ? `Register: ${event.event_page_url}` : null,
    `Details: ${siteUrl}/events/${event.slug}`,
  ].filter(Boolean);

  // Source addresses often already contain the city, state and ZIP, so the
  // tail is appended only when it is not there already.
  const cityLine = [event.city, event.state, event.postal_code]
    .filter(Boolean)
    .join(', ');
  const addressHasCity =
    !!event.address_line &&
    !!event.city &&
    event.address_line.toLowerCase().includes(event.city.toLowerCase());

  const location = [
    event.venue_name,
    event.address_line,
    addressHasCity ? null : cityLine,
  ]
    .filter(Boolean)
    .join(', ');

  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//COMPETE Sports//Event Discovery//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'BEGIN:VEVENT',
    `UID:${event.id}@joincompete.com`,
    `DTSTAMP:${new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '')}`,
    `DTSTART;VALUE=DATE:${compact(event.starts_on)}`,
    `DTEND;VALUE=DATE:${endExclusive}`,
    `SUMMARY:${escapeIcs(event.name)}`,
    `LOCATION:${escapeIcs(location || venueLine(event))}`,
    `DESCRIPTION:${escapeIcs(descriptionParts.join('\n'))}`,
    `URL:${siteUrl}/events/${event.slug}`,
    'END:VEVENT',
    'END:VCALENDAR',
  ];

  const body = lines.map(fold).join('\r\n') + '\r\n';

  return new Response(body, {
    headers: {
      'Content-Type': 'text/calendar; charset=utf-8',
      'Content-Disposition': `attachment; filename="${event.slug}.ics"`,
      'Cache-Control': 'public, max-age=3600',
    },
  });
}

/** RFC 5545 escaping for text values. */
function escapeIcs(value: string): string {
  return value
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\r?\n/g, '\\n');
}

/** RFC 5545 caps lines at 75 octets; continuations start with a space. */
function fold(line: string): string {
  if (line.length <= 74) return line;
  const chunks: string[] = [line.slice(0, 74)];
  let rest = line.slice(74);
  while (rest.length > 73) {
    chunks.push(' ' + rest.slice(0, 73));
    rest = rest.slice(73);
  }
  if (rest) chunks.push(' ' + rest);
  return chunks.join('\r\n');
}
