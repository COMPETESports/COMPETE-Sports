/**
 * One name per form field, in plain English.
 *
 * Three places needed this list — the error summary, the paste box and the
 * flyer reader — and three copies would drift, which is the same mistake
 * the shared event loader was written to stop. One file.
 */
export const FIELD_LABELS: Record<string, string> = {
  form: 'The form',
  name: 'Event name',
  event_type: 'Event type',
  sport: 'Sport',
  starts_on: 'Start date',
  ends_on: 'End date',
  start_time: 'Start time',
  registration_deadline: 'Register by',
  league_days: 'League night',
  league_weeks: 'Number of weeks',
  league_dates: 'League schedule',
  playoffs: 'Playoffs',
  entry_fee: 'Entry fee',
  fee_basis: 'Fee basis',
  payout_text: 'Payout / prizes',
  event_page_url: 'Event / registration page',
  flyer_url: 'Flyer image URL',
  notes: 'Notes shown to players',
  venue_name: 'Venue name',
  address_line: 'Street address',
  city: 'City',
  state: 'State',
  postal_code: 'ZIP code',
  organizer_name: 'Organizer name',
  organizer_email: 'Organizer email',
  surfaces: 'Surface',
  formats: 'Format',
  divisions: 'Divisions',
  brackets: 'Brackets',
  status: 'Status',
};

export const labelFor = (key: string) => FIELD_LABELS[key] ?? key;
