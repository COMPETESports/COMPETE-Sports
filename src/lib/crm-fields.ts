/**
 * Types and constants for the partner CRM.
 *
 * Separate from crm.ts because that file is `'use server'`, and a
 * `'use server'` module may only export async functions — exporting a
 * constant from one breaks the build. Mirrors account-fields.ts next door.
 */

export interface ProspectRow {
  id: string;
  name: string;
  category: string | null;
  city: string | null;
  state: string | null;
  sports: string;
  phone: string | null;
  email: string | null;
  website: string | null;
  status: string;
  confidence: string;
  verified_at: string | null;
  last_contacted_at: string | null;
  next_action: string | null;
  next_action_on: string | null;
  /** Null when never contacted, which is different from contacted today. */
  days_quiet: number | null;
  touches: number;
}

export interface Interaction {
  id: string;
  kind: string;
  occurred_on: string;
  body: string;
  outcome: string | null;
}

export interface Filters {
  q?: string;
  state?: string;
  status?: string;
  sports?: string;
  /** 'yes' = has a phone or email, 'no' = has neither. */
  contactable?: string;
  verified?: string;
  page?: number;
}

export const PAGE_SIZE = 50;

/** The pipeline from the CRM concept doc, in order. */
export const STATUSES = [
  'prospect', 'contacted', 'in_conversation',
  'committed', 'active', 'dormant', 'not_a_fit',
] as const;

export const KINDS = ['call', 'email', 'text', 'meeting', 'note'] as const;

export const STATUS_LABEL: Record<string, string> = {
  prospect: 'Prospect',
  contacted: 'Contacted',
  in_conversation: 'In conversation',
  committed: 'Committed',
  active: 'Active partner',
  dormant: 'Dormant',
  not_a_fit: 'Not a fit',
};
