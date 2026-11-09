/**
 * Types and constants for the organizer list.
 *
 * Separate from organizers-admin.ts because that file is `'use server'`,
 * and a `'use server'` module may only export async functions -- an
 * exported constant from one breaks the build. Same split as
 * crm-fields.ts next door, for the same reason.
 */

export interface OrganizerListRow {
  id: string;
  slug: string;
  name: string;
  city: string | null;
  state: string | null;
  website_url: string | null;

  /** From organizer_private. Never reaches a public page. */
  status: string;
  category: string | null;
  /** Null where nobody has checked which sports they run. */
  sport_slugs: string[] | null;
  phone: string | null;
  email: string | null;
  verified_at: string | null;
  last_contacted_at: string | null;
  next_action: string | null;
  next_action_on: string | null;
  needs_review: boolean;
  /** 0 Disqualified to 5 Victorious. Null means not yet judged. */
  confidence_score: number | null;
  origin: string;

  /** Null when never contacted, which is different from contacted today. */
  days_quiet: number | null;
  touches: number;
  events: number;
  venues: number;
  contacts: number;
}

export interface OrganizerFilters {
  q?: string;
  state?: string;
  status?: string;
  sports?: string;
  /** 'yes' = has a phone or email, 'no' = has neither. */
  contactable?: string;
  /** 'yes' = has run at least one event, 'no' = researched but never seen. */
  events?: string;
  /** An exact confidence step, '0' to '5'. */
  confidence?: string;
  /** 'confidence' puts the most promising first. */
  sort?: string;
  /** 'yes' = shares a normalised name with another record. */
  review?: string;
  page?: number;
}

export const PAGE_SIZE = 50;

/**
 * The pipeline, cut from seven stages to five on 9 Nov.
 *
 * 'active' was derivable from the event count and 'dormant' is really a
 * date, not a status. Stages nobody maintains lie, and a pipeline that
 * lies is worse than a short one. What each row said before the cut is
 * kept in organizer_private.legacy_status.
 */
export const ORGANIZER_STATUSES = [
  'prospect', 'contacted', 'in_conversation', 'partner', 'not_a_fit',
] as const;

export const ORGANIZER_STATUS_LABEL: Record<string, string> = {
  prospect: 'Prospect',
  contacted: 'Contacted',
  in_conversation: 'In conversation',
  partner: 'Partner',
  not_a_fit: 'Not a fit',
};

/** What "Partner" means here: they have agreed to keep sending dates. */
export const ORGANIZER_STATUS_HINT: Record<string, string> = {
  prospect: 'Researched, never contacted',
  contacted: 'Reached out, no reply yet',
  in_conversation: 'Talking',
  partner: 'Agreed to keep sending dates',
  not_a_fit: 'Ruled out — see the note',
};

/** One named person at an organization. Private, always. */
export interface OrganizerContact {
  id: string;
  name: string;
  title: string | null;
  email: string | null;
  phone: string | null;
  notes: string | null;
  is_primary: boolean;
}

/**
 * Everything editable about an organization, in one shape.
 *
 * Split across two tables on save: the first five go to `organizers`,
 * which the public site can read, and the rest to `organizer_private`,
 * which it cannot. The form does not show that seam, because from the
 * phone it is one organization.
 */
export interface OrganizerProfileForm {
  // public
  name: string;
  city: string;
  state: string;
  website_url: string;
  contact_email: string;
  // private
  category: string;
  sport_slugs: string[];
  surface_slugs: string[];
  address: string;
  postal_code: string;
  courts: string;
  booking_platform: string;
  phone: string;
  email: string;
  instagram: string;
  facebook: string;
  tiktok: string;
  status: string;
  status_note: string;
  next_action: string;
  next_action_on: string;
  notes: string;
  /** '' when not yet judged, otherwise '0'-'5'. */
  confidence_score: string;
}


/**
 * How likely an organization is to convert. Tom's scale, 9 Nov, in his
 * own words -- every step named, because an unlabelled number drifts.
 *
 * Deliberately separate from the pipeline status: the status says where
 * a conversation has got to, this says whether it is going anywhere.
 * Null is not 0 -- null is unjudged, 0 is a decision.
 */
export const CONFIDENCE: Array<[string, string]> = [
  ['0', 'Disqualified'],
  ['1', 'Slim Chance'],
  ['2', 'Flimsy'],
  ['3', 'Coin Toss'],
  ['4', 'Promising'],
  ['5', 'Victorious'],
];

export const CONFIDENCE_LABEL: Record<number, string> = {
  0: 'Disqualified', 1: 'Slim Chance', 2: 'Flimsy',
  3: 'Coin Toss', 4: 'Promising', 5: 'Victorious',
};

/** Red at the bottom, green at the top, with the coin toss neutral. */
export const CONFIDENCE_TONE: Record<number, string> = {
  0: 'var(--faint)', 1: 'var(--coral-ink)', 2: 'var(--coral-ink)',
  3: 'var(--beach)', 4: 'var(--indoor)', 5: 'var(--grass)',
};
