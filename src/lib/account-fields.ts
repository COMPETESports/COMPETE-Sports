/**
 * Account field vocabulary and shapes — no database, no request context.
 *
 * Kept separate from `accounts.ts` deliberately. The sign-up and profile
 * forms are client components, and anything they import is bundled and sent
 * to the browser; `accounts.ts` reaches for `next/headers` and the Postgres
 * client, neither of which can go there. So the constants both sides need
 * live here, where importing them costs nothing.
 */

export type AgeBracket =
  | 'under_18'
  | '18_24'
  | '25_34'
  | '35_44'
  | '45_54'
  | '55_plus';

export const AGE_BRACKETS: { value: AgeBracket; label: string }[] = [
  { value: 'under_18', label: 'Under 18' },
  { value: '18_24', label: '18–24' },
  { value: '25_34', label: '25–34' },
  { value: '35_44', label: '35–44' },
  { value: '45_54', label: '45–54' },
  { value: '55_plus', label: '55+' },
];

export type Gender = 'male' | 'female' | 'undisclosed';

export const GENDER_OPTIONS: { value: Gender; label: string }[] = [
  { value: 'male', label: 'Male' },
  { value: 'female', label: 'Female' },
  { value: 'undisclosed', label: 'Prefer not to say' },
];

export interface Account {
  id: string;
  email: string;
  email_verified_at: string | null;
  display_name: string;
  is_athlete: boolean;
  is_host: boolean;
  is_staff: boolean;
  plan: 'free' | 'local' | 'regional' | 'national';
  status: 'active' | 'suspended' | 'closed';
}

export interface AthleteProfile {
  account_id: string;
  home_postal_code: string | null;
  home_city: string | null;
  home_state: string | null;
  latitude: number | null;
  longitude: number | null;
  travel_radius_miles: number;
  age_bracket: AgeBracket | null;
  gender: Gender | null;
  phone_e164: string | null;
  sms_alerts_enabled: boolean;
  sms_snoozed_until: string | null;
}

export interface HostProfile {
  account_id: string;
  organizer_id: string | null;
  organization_name: string;
  contact_email: string;
  contact_phone: string | null;
  website_url: string | null;
  city: string | null;
  state: string | null;
  about: string | null;
}
