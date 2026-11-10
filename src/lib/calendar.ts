/**
 * Add to calendar -- the file, and the links into each calendar app.
 *
 * Pure: no database, no request. The route and the event page hand it what
 * they loaded, so tests/calendar.test.ts can check every line it writes.
 *
 * A tournament is one entry. A league is its WHOLE SEASON -- one entry per
 * night it plays (Tom, 10 Nov). Skipped nights get no entry, and are listed
 * in the description instead, so "no play 26 Nov -- Thanksgiving" still
 * reaches the player.
 *
 * For a league, the Google, Apple and Outlook links SUBSCRIBE rather than
 * import. A subscribed calendar re-reads this file on its own, so when an
 * organizer cancels a night, the player's calendar follows. An imported
 * copy would go stale silently. Subscribing needs a public address, so it
 * works on joincompete.com, not on localhost.
 */

export interface CalendarEvent {
  id: string;
  slug: string;
  name: string;
  event_type: string;
  starts_on: string;
  ends_on: string | null;
  start_time: string | null;
  entry_fee_cents: number | null;
  fee_basis: string;
  organizer_name: string | null;
  event_page_url: string | null;
  venue_name: string | null;
  address_line: string | null;
  city: string | null;
  state: string | null;
  postal_code: string | null;
  format_names: string[];
  division_names: string[];
}

export interface ScheduleNight {
  plays_on: string;
  skipped: boolean;
  note: string | null;
}

export interface CalendarInput {
  event: CalendarEvent;
  siteUrl: string;
  /** League only. Every scheduled night, skipped ones included. */
  schedule?: ScheduleNight[];
  /** The stated finish time, "21:00:00". Only open play records one today. */
  endTime?: string | null;
  /** Injected so the output is testable; defaults to now. */
  now?: Date;
}

const compact = (iso: string) => iso.replace(/-/g, '');

function dayAfter(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number);
  const next = new Date(Date.UTC(y, m - 1, d + 1));
  return `${next.getUTCFullYear()}${String(next.getUTCMonth() + 1).padStart(2, '0')}${String(
    next.getUTCDate(),
  ).padStart(2, '0')}`;
}

/** "19:00:00" -> "190000". Null when the time is missing or malformed. */
function clock(value: string | null | undefined): string | null {
  const m = /^(\d{1,2}):(\d{2})(?::(\d{2}))?/.exec(value ?? '');
  if (!m) return null;
  return `${m[1].padStart(2, '0')}${m[2]}${m[3] ?? '00'}`;
}

function shortDate(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString('en-US', {
    timeZone: 'UTC',
    month: 'short',
    day: 'numeric',
  });
}

export function locationLine(event: CalendarEvent): string {
  // Source addresses often already carry the city, state and ZIP, so the
  // tail is only added when it is not there already.
  const cityLine = [event.city, event.state, event.postal_code].filter(Boolean).join(', ');
  const addressHasCity =
    !!event.address_line &&
    !!event.city &&
    event.address_line.toLowerCase().includes(event.city.toLowerCase());
  return [event.venue_name, event.address_line, addressHasCity ? null : cityLine]
    .filter(Boolean)
    .join(', ');
}

function description(input: CalendarInput, extra: string[] = []): string {
  const { event, siteUrl } = input;
  const basis = event.fee_basis === 'per_team' ? 'per team' : 'per player';
  const isLeague = event.event_type === 'league';
  return [
    event.format_names.length ? `Formats: ${event.format_names.join(', ')}` : null,
    event.division_names.length ? `Divisions: ${event.division_names.join(', ')}` : null,
    event.entry_fee_cents !== null
      ? `${isLeague ? 'Season fee' : 'Entry'}: $${(event.entry_fee_cents / 100).toFixed(2)} ${basis}`
      : null,
    event.organizer_name ? `Organizer: ${event.organizer_name}` : null,
    ...extra,
    event.event_page_url ? `Register: ${event.event_page_url}` : null,
    `Details: ${siteUrl}/events/${event.slug}`,
  ]
    .filter(Boolean)
    .join('\n');
}

/** The nights it plays, in order. A league with none stored falls back to one entry. */
function playingNights(input: CalendarInput): string[] {
  return (input.schedule ?? [])
    .filter((n) => !n.skipped)
    .map((n) => n.plays_on)
    .sort();
}

/** "No play: Nov 26 (Thanksgiving), Dec 24". Empty when every night plays. */
function skippedLine(input: CalendarInput): string | null {
  const off = (input.schedule ?? []).filter((n) => n.skipped);
  if (!off.length) return null;
  return `No play: ${off
    .map((n) => (n.note ? `${shortDate(n.plays_on)} (${n.note})` : shortDate(n.plays_on)))
    .join(', ')}`;
}

/** The iCalendar file. Every calendar app opens it. */
export function buildIcs(input: CalendarInput): string {
  const { event, siteUrl } = input;
  const now = input.now ?? new Date();
  const stamp = now.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
  const url = `${siteUrl}/events/${event.slug}`;
  const location = escapeIcs(locationLine(event));
  const isLeague = event.event_type === 'league';
  const nights = isLeague ? playingNights(input) : [];

  const head = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//COMPETE Sports//Event Discovery//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
  ];
  if (isLeague) {
    // Read by apps that SUBSCRIBE: the calendar's name in their sidebar,
    // and how often to re-read this file for changes.
    head.push(`X-WR-CALNAME:${escapeIcs(event.name)}`);
    head.push('REFRESH-INTERVAL;VALUE=DURATION:PT12H');
    head.push('X-PUBLISHED-TTL:PT12H');
  }

  const events: string[][] = [];

  if (isLeague && nights.length) {
    // Times are FLOATING -- no timezone -- so 7:00 PM shows as 7:00 PM
    // wherever the player's calendar is set. COMPETE does not store a
    // venue's timezone, and a local league is played in local time.
    //
    // No end time is invented. Leagues do not record one, and a guessed
    // "9pm" would sit in a player's calendar looking like a fact. Without
    // one, a timed entry has no length and an untimed one is all-day.
    const start = clock(event.start_time);
    const end = clock(input.endTime);
    const desc = description(input, [skippedLine(input)].filter((x): x is string => !!x));

    nights.forEach((night, i) => {
      const lines = [
        'BEGIN:VEVENT',
        // Stable per night, so a subscribed calendar UPDATES an entry
        // rather than duplicating it when the file is re-read.
        `UID:${event.id}-${compact(night)}@joincompete.com`,
        `DTSTAMP:${stamp}`,
      ];
      if (start) {
        lines.push(`DTSTART:${compact(night)}T${start}`);
        if (end && end > start) lines.push(`DTEND:${compact(night)}T${end}`);
      } else {
        lines.push(`DTSTART;VALUE=DATE:${compact(night)}`, `DTEND;VALUE=DATE:${dayAfter(night)}`);
      }
      lines.push(
        `SUMMARY:${escapeIcs(`${event.name} · Night ${i + 1} of ${nights.length}`)}`,
        `LOCATION:${location}`,
        `DESCRIPTION:${escapeIcs(desc)}`,
        `URL:${url}`,
        'END:VEVENT',
      );
      events.push(lines);
    });
  } else {
    // A tournament: one all-day entry. The source data records a date but
    // rarely a reliable start time; all-day is honest where a guessed 9am
    // would not be. DTEND is exclusive, so it lands on the day after.
    events.push([
      'BEGIN:VEVENT',
      `UID:${event.id}@joincompete.com`,
      `DTSTAMP:${stamp}`,
      `DTSTART;VALUE=DATE:${compact(event.starts_on)}`,
      `DTEND;VALUE=DATE:${dayAfter(event.ends_on ?? event.starts_on)}`,
      `SUMMARY:${escapeIcs(event.name)}`,
      `LOCATION:${location}`,
      `DESCRIPTION:${escapeIcs(description(input))}`,
      `URL:${url}`,
      'END:VEVENT',
    ]);
  }

  const lines = [...head, ...events.flat(), 'END:VCALENDAR'];
  return lines.map(fold).join('\r\n') + '\r\n';
}

export interface CalendarLink {
  key: 'google' | 'apple' | 'outlook' | 'download';
  label: string;
  href: string;
  /** One short line under the label, so the player knows what will happen. */
  hint: string;
}

/**
 * One link per calendar app, for the "Add to calendar" menu.
 *
 * League: Google, Apple and Outlook all subscribe to the season's feed, so
 * every night lands at once and changes follow. Tournament: Google and
 * Outlook open a pre-filled new entry; Apple opens the file.
 */
export function calendarLinks(event: CalendarEvent, siteUrl: string): CalendarLink[] {
  const feed = `${siteUrl}/events/${event.slug}/calendar.ics`;
  const webcal = feed.replace(/^https?:\/\//, 'webcal://');
  const download = `${feed}?download=1`;

  if (event.event_type === 'league') {
    return [
      {
        key: 'google',
        label: 'Google Calendar',
        href: `https://calendar.google.com/calendar/r?cid=${encodeURIComponent(webcal)}`,
        hint: 'Adds every night of the season',
      },
      {
        key: 'apple',
        label: 'Apple Calendar',
        href: webcal,
        hint: 'Adds every night of the season',
      },
      {
        key: 'outlook',
        label: 'Outlook',
        href: `https://outlook.live.com/calendar/0/addfromweb?url=${encodeURIComponent(
          webcal,
        )}&name=${encodeURIComponent(event.name)}`,
        hint: 'Adds every night of the season',
      },
      {
        key: 'download',
        label: 'Download .ics file',
        href: download,
        hint: 'A one-time copy. Will not update if nights change',
      },
    ];
  }

  const start = compact(event.starts_on);
  const endExclusive = dayAfter(event.ends_on ?? event.starts_on);
  const details = `Details: ${siteUrl}/events/${event.slug}`;
  const where = locationLine(event);

  const google = new URLSearchParams({
    action: 'TEMPLATE',
    text: event.name,
    dates: `${start}/${endExclusive}`,
    location: where,
    details,
  });
  const lastDay = event.ends_on ?? event.starts_on;
  const outlook = new URLSearchParams({
    subject: event.name,
    startdt: event.starts_on,
    enddt: lastDay,
    allday: 'true',
    location: where,
    body: details,
  });

  return [
    {
      key: 'google',
      label: 'Google Calendar',
      href: `https://calendar.google.com/calendar/render?${google.toString()}`,
      hint: 'Opens a new entry, ready to save',
    },
    {
      key: 'apple',
      label: 'Apple Calendar',
      href: download,
      hint: 'Opens the event in Calendar',
    },
    {
      key: 'outlook',
      label: 'Outlook',
      href: `https://outlook.live.com/calendar/0/action/compose?${outlook.toString()}`,
      hint: 'Opens a new entry, ready to save',
    },
    {
      key: 'download',
      label: 'Download .ics file',
      href: download,
      hint: 'For any other calendar app',
    },
  ];
}

/** RFC 5545 escaping for text values. */
export function escapeIcs(value: string): string {
  return value
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\r?\n/g, '\\n');
}

/**
 * RFC 5545 caps lines at 75 octets; continuations start with a space.
 * Counted in characters, as before -- the "·" in a league night's title is
 * two bytes, but calendar apps are lenient and a split mid-character would
 * be worse than a slightly long line.
 */
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
