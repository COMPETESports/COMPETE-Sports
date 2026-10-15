'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { sql } from './db';
import { isSignedIn } from './auth';
import {
  PAGE_SIZE, STATUSES, KINDS,
  type ProspectRow, type Interaction, type Filters,
} from './crm-fields';

/**
 * The partner CRM: reading, editing and working the prospect list.
 *
 * The directory arrived from research, and research is wrong often enough
 * that Tom's own corrections have to outrank it permanently. Two columns
 * carry that distinction and nothing here may blur them:
 *
 *   `confidence`  — how sure the *researcher* was. Set at import, never
 *                   touched afterwards, so the provenance of the original
 *                   claim survives even after it has been corrected.
 *   `verified_at` — when Tom confirmed the record himself. Set by saving a
 *                   profile here. This is the strong one.
 *
 * Keeping both means a record can say "research guessed, and then a human
 * checked", which is more useful than either fact alone.
 */

async function requireStaff() {
  if (!(await isSignedIn())) throw new Error('Not signed in.');
}


// ---------------------------------------------------------------- read

export async function listProspects(f: Filters) {
  await requireStaff();
  const page = Math.max(1, f.page ?? 1);
  const offset = (page - 1) * PAGE_SIZE;

  const where = [sql`true`];
  if (f.q?.trim()) {
    const like = `%${f.q.trim()}%`;
    where.push(sql`(p.name ilike ${like} or p.city ilike ${like} or p.notes ilike ${like})`);
  }
  if (f.state) where.push(sql`p.state = ${f.state}`);
  if (f.status) where.push(sql`p.status = ${f.status}`);
  if (f.sports === 'volleyball') {
    // "Volleyball" means anything that touches it, including the rows where
    // pickleball was simply never asked about. Excluding `volleyball?` here
    // would hide 354 real volleyball venues behind a research artefact.
    where.push(sql`p.sports in ('volleyball','both','volleyball?')`);
  } else if (f.sports) {
    where.push(sql`p.sports = ${f.sports}`);
  }
  if (f.contactable === 'yes') {
    where.push(sql`(coalesce(p.phone,'') <> '' or coalesce(p.email,'') <> '')`);
  } else if (f.contactable === 'no') {
    where.push(sql`coalesce(p.phone,'') = '' and coalesce(p.email,'') = ''`);
  }
  if (f.verified === 'yes') where.push(sql`p.verified_at is not null`);
  else if (f.verified === 'no') where.push(sql`p.verified_at is null`);

  const clause = where.reduce((a, b) => sql`${a} and ${b}`);

  const rows = await sql<ProspectRow[]>`
    select p.id, p.name, p.category, p.city, p.state, p.sports,
           p.phone, p.email, p.website, p.status, p.confidence,
           p.verified_at::text, p.last_contacted_at::text,
           p.next_action, p.next_action_on::text,
           case when p.last_contacted_at is null then null
                else extract(day from now() - p.last_contacted_at)::int end as days_quiet,
           (select count(*)::int from prospect_interactions i where i.prospect_id = p.id) as touches
      from partner_prospects p
     where ${clause}
     -- Anything with a date on it comes first, because a commitment made
     -- is the only thing here that can be missed. Then the ones already in
     -- play, then everything untouched.
     order by
       (p.next_action_on is not null and p.next_action_on <= current_date + 7) desc,
       p.next_action_on asc nulls last,
       case p.status
         when 'in_conversation' then 1 when 'committed' then 2
         when 'contacted' then 3 when 'active' then 4
         when 'prospect' then 5 else 6 end,
       p.last_contacted_at asc nulls first,
       p.name
     limit ${PAGE_SIZE} offset ${offset}
  `;

  const [{ total }] = await sql<{ total: number }[]>`
    select count(*)::int as total from partner_prospects p where ${clause}
  `;

  return { rows, total, page, lastPage: Math.max(1, Math.ceil(total / PAGE_SIZE)) };
}

export async function getProspect(id: string) {
  await requireStaff();
  const [row] = await sql<Record<string, string | null>[]>`
    select p.*, p.verified_at::text as verified_at,
           p.last_contacted_at::text as last_contacted_at,
           p.next_action_on::text as next_action_on
      from partner_prospects p where p.id = ${id}
  `;
  if (!row) return null;

  const interactions = await sql<Interaction[]>`
    select id, kind, occurred_on::text, body, outcome
      from prospect_interactions
     where prospect_id = ${id}
     order by occurred_on desc, created_at desc
  `;
  return { prospect: row, interactions };
}

/** Distinct states present, for the filter bar. */
export async function prospectStates() {
  await requireStaff();
  return sql<{ state: string; n: number }[]>`
    select state, count(*)::int as n from partner_prospects
     where state is not null group by state order by state
  `;
}

export async function prospectCounts() {
  await requireStaff();
  const [row] = await sql<{ total: number; verified: number; contactable: number; working: number }[]>`
    select count(*)::int as total,
           count(*) filter (where verified_at is not null)::int as verified,
           count(*) filter (where coalesce(phone,'') <> '' or coalesce(email,'') <> '')::int as contactable,
           count(*) filter (where status not in ('prospect','not_a_fit'))::int as working
      from partner_prospects
  `;
  return row;
}

// ---------------------------------------------------------------- write

const ProfileInput = z.object({
  id: z.string().uuid(),
  name: z.string().trim().min(2, 'A name is required.').max(200),
  category: z.string().trim().max(80).optional(),
  city: z.string().trim().max(120).optional(),
  state: z.string().trim().toUpperCase().regex(/^[A-Z]{2}$/, 'Two-letter state code.').or(z.literal('')).optional(),
  address: z.string().trim().max(300).optional(),
  sports: z.enum(['volleyball', 'pickleball', 'both', 'volleyball?', 'unknown']),
  courts: z.string().trim().max(200).optional(),
  offerings: z.string().trim().max(600).optional(),
  contact_name: z.string().trim().max(120).optional(),
  contact_title: z.string().trim().max(120).optional(),
  phone: z.string().trim().max(40).optional(),
  email: z.string().trim().max(254).optional(),
  website: z.string().trim().max(500).optional(),
  social: z.string().trim().max(400).optional(),
  booking_platform: z.string().trim().max(80).optional(),
  notes: z.string().trim().max(4000).optional(),
  status: z.enum(STATUSES),
  status_note: z.string().trim().max(300).optional(),
  next_action: z.string().trim().max(200).optional(),
  next_action_on: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).or(z.literal('')).optional(),
});

/**
 * Saving a profile marks it verified, because the only way a human opens
 * this form and presses save is after looking at the thing.
 *
 * Empty strings are written as NULL rather than ''. Tom's rule, and the
 * right one: a blank field prompts someone to find the answer, while an
 * empty string reads as "checked, nothing there".
 */
export async function saveProspect(
  _prev: { error?: string; saved?: boolean } | null,
  formData: FormData,
): Promise<{ error?: string; saved?: boolean }> {
  await requireStaff();

  const parsed = ProfileInput.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'Something in there is not valid.' };
  }
  const v = parsed.data;
  const nz = (s?: string) => (s && s.trim() ? s.trim() : null);

  await sql`
    update partner_prospects set
      name             = ${v.name},
      category         = ${nz(v.category)},
      city             = ${nz(v.city)},
      state            = ${nz(v.state)},
      address          = ${nz(v.address)},
      sports           = ${v.sports},
      courts           = ${nz(v.courts)},
      offerings        = ${nz(v.offerings)},
      contact_name     = ${nz(v.contact_name)},
      contact_title    = ${nz(v.contact_title)},
      phone            = ${nz(v.phone)},
      email            = ${nz(v.email)},
      website          = ${nz(v.website)},
      social           = ${nz(v.social)},
      booking_platform = ${nz(v.booking_platform)},
      notes            = ${nz(v.notes)},
      status           = ${v.status},
      status_note      = ${nz(v.status_note)},
      next_action      = ${nz(v.next_action)},
      next_action_on   = ${nz(v.next_action_on)},
      verified_at      = now()
    where id = ${v.id}
  `;

  revalidatePath('/admin/crm');
  revalidatePath(`/admin/crm/${v.id}`);
  return { saved: true };
}

const InteractionInput = z.object({
  prospect_id: z.string().uuid(),
  kind: z.enum(KINDS),
  occurred_on: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Pick a date.'),
  body: z.string().trim().min(1, 'Say what happened.').max(4000),
  outcome: z.string().trim().max(120).optional(),
  // Optional, because the next step is often obvious at the moment of
  // logging and forgotten an hour later.
  next_action: z.string().trim().max(200).optional(),
  next_action_on: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).or(z.literal('')).optional(),
});

export async function logInteraction(
  _prev: { error?: string; saved?: boolean } | null,
  formData: FormData,
): Promise<{ error?: string; saved?: boolean }> {
  await requireStaff();

  const parsed = InteractionInput.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'That did not save.' };
  }
  const v = parsed.data;
  const nz = (s?: string) => (s && s.trim() ? s.trim() : null);

  await sql`
    insert into prospect_interactions (prospect_id, kind, occurred_on, body, outcome)
    values (${v.prospect_id}, ${v.kind}, ${v.occurred_on}, ${v.body}, ${nz(v.outcome)})
  `;

  // The trigger in 008 moves last_contacted_at and nudges the status.
  // The next action is a separate intention and is only written when given.
  if (v.next_action || v.next_action_on) {
    await sql`
      update partner_prospects
         set next_action    = ${nz(v.next_action)},
             next_action_on = ${nz(v.next_action_on)}
       where id = ${v.prospect_id}
    `;
  }

  revalidatePath(`/admin/crm/${v.prospect_id}`);
  revalidatePath('/admin/crm');
  return { saved: true };
}

/** Quick status change from the list, without opening the profile. */
export async function setProspectStatus(id: string, status: string): Promise<void> {
  await requireStaff();
  if (!(STATUSES as readonly string[]).includes(status)) return;
  await sql`update partner_prospects set status = ${status} where id = ${id}`;
  revalidatePath('/admin/crm');
}

/**
 * A prospect that exists nowhere on a map or in the research — someone Tom
 * met at a tournament. Required by the CRM concept: it must be possible to
 * create a record from a name alone.
 */
export async function createProspect(
  _prev: { error?: string; id?: string } | null,
  formData: FormData,
): Promise<{ error?: string; id?: string }> {
  await requireStaff();
  const name = String(formData.get('name') ?? '').trim();
  const state = String(formData.get('state') ?? '').trim().toUpperCase();
  const city = String(formData.get('city') ?? '').trim();

  if (name.length < 2) return { error: 'Give it a name.' };
  if (state && !/^[A-Z]{2}$/.test(state)) return { error: 'Two-letter state code.' };

  const [row] = await sql<{ id: string }[]>`
    insert into partner_prospects (name, city, state, confidence, source_file, verified_at)
    values (${name}, ${city || null}, ${state || null}, 'verified', 'added by hand', now())
    on conflict (lower(name), coalesce(state, '')) do nothing
    returning id
  `;
  if (!row) return { error: 'There is already a prospect with that name in that state.' };

  revalidatePath('/admin/crm');
  return { id: row.id };
}

/**
 * Generate (or reuse) the invitation link for a prospect.
 *
 * The token is created on first request rather than at import, so 1,310
 * unused tokens are not sitting in the table being a liability. It is
 * reused afterwards: a second person at the same organization following an
 * older email should still land in the right place.
 *
 * `invite_sent_at` records when the link was produced. That is the honest
 * reading — COMPETE cannot know when Tom actually pressed send, and
 * pretending otherwise would put a fake precision on the one number that
 * measures whether outreach works.
 */
export async function inviteLink(prospectId: string): Promise<string> {
  await requireStaff();

  const [row] = await sql<{ invite_token: string }[]>`
    update partner_prospects
       set invite_token  = coalesce(invite_token, encode(gen_random_bytes(16), 'hex')),
           invite_sent_at = coalesce(invite_sent_at, now())
     where id = ${prospectId}
     returning invite_token
  `;
  if (!row) throw new Error('No such prospect.');

  const base = process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000';
  revalidatePath(`/admin/crm/${prospectId}`);
  return `${base}/organizers/claim/${row.invite_token}`;
}
