/**
 * Today's date as YYYY-MM-DD, in US Central time.
 *
 * It used to be UTC, which is already tomorrow from 6 PM Central (5 PM in
 * summer): every evening an event two days out read "Tomorrow", and an
 * event happening tonight could drop out of search before it started.
 * Tom, 19 Nov. Central is the middle of the US, so the date is right for
 * every mainland time zone except in the hour or two around midnight.
 */
export const SITE_TIME_ZONE = 'America/Chicago';

export function today(): string {
  // en-CA formats as YYYY-MM-DD.
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: SITE_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
}
