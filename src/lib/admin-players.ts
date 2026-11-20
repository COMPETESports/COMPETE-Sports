import zipcodes from 'zipcodes';
import { sql } from './db';
import { emailProblem, issueToken, normaliseEmail } from './accounts';
import { sendMail } from './mailer';
import { recordAgeBracketChange } from './compliance';
import { AGE_BRACKETS, type AgeBracket } from './account-fields';

/**
 * Staff changes to player accounts. Tom, 19 Nov 2026.
 *
 * Every change is written to account_admin_log (026) with what changed and
 * the player's permission. Two things staff deliberately cannot do here:
 *   - move a player into or out of 13–17. That switch removes a phone
 *     number and text consents, and the player makes it themselves, so the
 *     age-gate protections and their record run exactly as designed;
 *   - erase legal records. An account with text-consent or age-change
 *     records is CLOSED, not deleted: those records are kept by policy
 *     (four years for consent) and the database refuses to delete them.
 */

export interface PlayerDetail {
  id: string;
  display_name: string;
  email: string;
  email_verified_at: string | null;
  status: string;
  created_at: string;
  home_postal_code: string | null;
  home_city: string | null;
  home_state: string | null;
  age_bracket: string | null;
  gender: string | null;
  phone_e164: string | null;
  has_password: boolean;
  legal_records: number;
}

export async function getPlayer(id: string): Promise<PlayerDetail | null> {
  const [row] = await sql<PlayerDetail[]>`
    select a.id, a.display_name, a.email, a.email_verified_at::text, a.status,
           to_char(a.created_at at time zone 'America/Chicago', 'Mon DD, YYYY HH12:MI AM') as created_at,
           p.home_postal_code, p.home_city, p.home_state, p.age_bracket, p.gender, p.phone_e164,
           exists (select 1 from account_credentials c
                    where c.account_id = a.id and c.provider = 'password') as has_password,
           ((select count(*) from sms_consents s where s.account_id = a.id) +
            (select count(*) from age_bracket_changes g where g.account_id = a.id))::int as legal_records
      from accounts a
      left join athlete_profiles p on p.account_id = a.id
     where a.id = ${id}`;
  return row ?? null;
}

export async function getPlayerLog(id: string) {
  return sql<{ action: string; changes: Record<string, [unknown, unknown]>; permission: string | null; at: string }[]>`
    select action, changes, permission,
           to_char(occurred_at at time zone 'America/Chicago', 'Mon DD, YYYY HH12:MI AM') as at
      from account_admin_log where account_id = ${id}
     order by occurred_at desc limit 50`;
}

async function log(id: string | null, emailThen: string, action: string,
                   changes: Record<string, [unknown, unknown]> = {}, permission: string | null = null) {
  await sql`
    insert into account_admin_log (account_id, email_then, action, changes, permission)
    values (${id}, ${emailThen}, ${action}, ${sql.json(changes as never)}, ${permission})`;
}

export type Outcome = { ok: true; message: string } | { ok: false; message: string };

const ADULT = new Set<string>(AGE_BRACKETS.map((b) => b.value).filter((v) => v !== 'under_18'));

export async function updatePlayer(
  id: string,
  input: { displayName: string; email: string; zip: string; ageBracket: string; gender: string; permission: string },
): Promise<Outcome> {
  const p = await getPlayer(id);
  if (!p) return { ok: false, message: 'That account no longer exists.' };
  if (input.permission.trim().length < 5)
    return { ok: false, message: 'Say how the player gave permission, e.g. "Asked by text, 19 Nov".' };

  const name = input.displayName.trim();
  if (!name || name.length > 60) return { ok: false, message: 'A name is 1 to 60 characters.' };

  const email = normaliseEmail(input.email);
  const emailIssue = emailProblem(email);
  if (emailIssue) return { ok: false, message: emailIssue };
  if (email !== p.email) {
    const [taken] = await sql`select 1 from accounts where lower(email) = ${email} and id <> ${id}`;
    if (taken) return { ok: false, message: 'Another account already uses that email.' };
  }

  if (!/^\d{5}$/.test(input.zip)) return { ok: false, message: 'A ZIP is five digits.' };

  const age = input.ageBracket;
  if (age !== (p.age_bracket ?? '')) {
    if (!ADULT.has(age) || !ADULT.has(p.age_bracket ?? ''))
      return {
        ok: false,
        message: 'A change into or out of 13–17 has to be made by the player on their own profile, so the age protections run.',
      };
  }

  const gender = input.gender === 'male' || input.gender === 'female' ? input.gender : null;

  const changes: Record<string, [unknown, unknown]> = {};
  if (name !== p.display_name) changes.name = [p.display_name, name];
  if (email !== p.email) changes.email = [p.email, email];
  if (input.zip !== (p.home_postal_code ?? '')) changes.zip = [p.home_postal_code, input.zip];
  if (age !== (p.age_bracket ?? '')) changes.age = [p.age_bracket, age];
  if ((gender ?? '') !== (p.gender === 'undisclosed' ? '' : p.gender ?? '')) changes.gender = [p.gender, gender];
  if (!Object.keys(changes).length) return { ok: true, message: 'Nothing changed.' };

  const hit = zipcodes.lookup(input.zip);
  await sql.begin(async (tx) => {
    await tx`update accounts set display_name = ${name} where id = ${id}`;
    if (changes.email) {
      await tx`update accounts set email = ${email}, email_verified_at = null where id = ${id}`;
      // The password sign-in is keyed by the address too.
      await tx`update account_credentials set provider_uid = ${email}
                where account_id = ${id} and provider = 'password'`;
    }
    await tx`insert into athlete_profiles (account_id) values (${id}) on conflict do nothing`;
    await tx`
      update athlete_profiles set
        home_postal_code = ${input.zip},
        home_city = ${hit?.city ?? null}, home_state = ${hit?.state ?? null},
        latitude = ${hit?.latitude ?? null}, longitude = ${hit?.longitude ?? null},
        age_bracket = ${age || null}, gender = ${gender}
      where account_id = ${id}`;
  });

  if (changes.age) {
    await recordAgeBracketChange({
      accountId: id, from: p.age_bracket, to: age as AgeBracket,
      phoneRemoved: false, consentsRevoked: 0, ipAddress: null, userAgent: 'staff',
    });
  }
  await log(id, p.email, changes.email ? 'email_change' : 'edit', changes, input.permission.trim());

  if (changes.email) {
    const sent = await sendConfirmation(id, email);
    return sent.ok
      ? { ok: true, message: `Saved. A confirmation email went to ${email}.` }
      : { ok: true, message: `Saved, but the confirmation email failed (${sent.detail ?? 'unknown'}). Try Resend.` };
  }
  return { ok: true, message: 'Saved.' };
}

async function sendConfirmation(id: string, email: string) {
  const token = await issueToken(id, 'email_verify', 60 * 48);
  const site = process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000';
  return sendMail({
    to: email,
    subject: 'Confirm your COMPETE email',
    text:
      `Confirm this address so we can send you event details and password ` +
      `resets:\n\n${site}/verify-email?token=${token}\n\n` +
      `The link is good for 48 hours. If you did not ask for this, ignore it.\n`,
  });
}

export async function resendPlayerConfirmation(id: string): Promise<Outcome> {
  const p = await getPlayer(id);
  if (!p) return { ok: false, message: 'That account no longer exists.' };
  if (p.email_verified_at) return { ok: true, message: 'That address is already confirmed.' };
  const sent = await sendConfirmation(id, p.email);
  await log(id, p.email, 'resend_confirmation');
  return sent.ok
    ? { ok: true, message: `Sent to ${p.email}.` }
    : { ok: false, message: `The email could not be sent (${sent.detail ?? 'unknown'}).` };
}

export async function markPlayerConfirmed(id: string, permission: string): Promise<Outcome> {
  const p = await getPlayer(id);
  if (!p) return { ok: false, message: 'That account no longer exists.' };
  if (permission.trim().length < 5)
    return { ok: false, message: 'Say how you know the address is theirs.' };
  await sql`update accounts set email_verified_at = now() where id = ${id}`;
  await log(id, p.email, 'mark_confirmed', {}, permission.trim());
  return { ok: true, message: 'Marked as confirmed.' };
}

/** Delete, or close when legal records must be kept. */
export async function removePlayer(id: string, reason: string): Promise<Outcome> {
  const p = await getPlayer(id);
  if (!p) return { ok: false, message: 'That account no longer exists.' };
  if (p.legal_records > 0) {
    await sql.begin(async (tx) => {
      await tx`update accounts set status = 'closed' where id = ${id}`;
      await tx`delete from account_sessions where account_id = ${id}`;
    });
    await log(id, p.email, 'close', {}, reason || null);
    return { ok: true, message: `${p.email} was closed, not deleted: it has text-consent or age records that are kept by policy.` };
  }
  await log(id, p.email, 'delete', { name: [p.display_name, null] }, reason || null);
  await sql`delete from accounts where id = ${id}`;
  return { ok: true, message: `${p.email} deleted.` };
}
