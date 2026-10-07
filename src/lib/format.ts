import type { DiscoveryEvent } from './types';

/** Formats an ISO date without letting the browser's timezone shift it. */
export function formatDate(iso: string, style: 'long' | 'short' = 'long'): string {
  const [y, m, d] = iso.split('-').map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  return date.toLocaleDateString('en-US', {
    timeZone: 'UTC',
    weekday: style === 'long' ? 'long' : 'short',
    month: style === 'long' ? 'long' : 'short',
    day: 'numeric',
    year: style === 'long' ? 'numeric' : undefined,
  });
}

export function formatDateRange(startIso: string, endIso: string | null): string {
  if (!endIso || endIso === startIso) return formatDate(startIso);
  const [sy, sm] = startIso.split('-');
  const [ey, em] = endIso.split('-');
  if (sy === ey && sm === em) {
    const end = new Date(Date.UTC(...(endIso.split('-').map(Number) as [number, number, number])));
    return `${formatDate(startIso, 'long').replace(/, \d{4}$/, '')} – ${end.getUTCDate()}, ${ey}`;
  }
  return `${formatDate(startIso, 'short')} – ${formatDate(endIso, 'short')}, ${ey}`;
}

export function formatMoney(cents: number | null, basis: string = 'per_player'): string {
  if (cents === null || cents === undefined) return 'See event page';
  const dollars = cents / 100;
  const amount = dollars % 1 === 0 ? `$${dollars.toFixed(0)}` : `$${dollars.toFixed(2)}`;
  return `${amount} ${basis === 'per_team' ? '/ team' : '/ player'}`;
}

export function formatDistance(miles: number | null): string | null {
  if (miles === null) return null;
  if (miles < 1) return 'Less than a mile away';
  return `${Math.round(miles)} mi away`;
}

export function daysUntil(iso: string): number {
  const [y, m, d] = iso.split('-').map(Number);
  const target = Date.UTC(y, m - 1, d);
  const now = new Date();
  const start = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  return Math.round((target - start) / 86_400_000);
}

export function countdownLabel(iso: string): string {
  const n = daysUntil(iso);
  if (n < 0) return 'Past';
  if (n === 0) return 'Today';
  if (n === 1) return 'Tomorrow';
  if (n < 7) return `In ${n} days`;
  if (n < 14) return 'Next week';
  if (n < 60) return `In ${Math.round(n / 7)} weeks`;
  return `In ${Math.round(n / 30)} months`;
}

export function venueLine(event: DiscoveryEvent): string {
  return [event.venue_name, [event.city, event.state].filter(Boolean).join(', ')]
    .filter(Boolean)
    .join(' · ');
}

export function mapsUrl(event: DiscoveryEvent): string {
  const query = event.address_line
    ? `${event.venue_name ?? ''} ${event.address_line}`
    : [event.venue_name, event.city, event.state].filter(Boolean).join(', ');
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query.trim())}`;
}

/** A short, human summary of who an event is for. */
export function audienceLine(event: DiscoveryEvent): string {
  const formats = event.format_names.slice(0, 3).join(' · ');
  const extra = event.format_names.length > 3 ? ` +${event.format_names.length - 3}` : '';
  return formats ? `${formats}${extra}` : 'Formats to be announced';
}
