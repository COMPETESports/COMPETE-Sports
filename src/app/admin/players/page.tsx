import { redirect } from 'next/navigation';
import { isSignedIn } from '@/lib/auth';
import { sql } from '@/lib/db';
import { AGE_BRACKETS } from '@/lib/account-fields';
import { displayPhone } from '@/lib/phone';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Players', robots: { index: false, follow: false } };

/**
 * Every player account, newest first, with how to reach them. Tom, 19 Nov:
 * "where will I, as the admin, see my user database?" Staff-only, like the
 * rest of /admin. A phone number shows only with the text consent beside it,
 * because a number without consent is not permission to text it.
 */
interface Player {
  id: string;
  display_name: string;
  email: string;
  verified: boolean;
  joined: string;
  home_postal_code: string | null;
  home_city: string | null;
  home_state: string | null;
  age_bracket: string | null;
  gender: string | null;
  phone_e164: string | null;
  sms_ok: boolean;
  sports: string | null;
}

const AGE = Object.fromEntries(AGE_BRACKETS.map((b) => [b.value, b.label]));

export default async function PlayersPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  if (!(await isSignedIn())) redirect('/admin');
  const { q = '' } = await searchParams;
  const search = q.trim();
  const like = `%${search}%`;

  const rows = await sql<Player[]>`
    select a.id, a.display_name, a.email,
           (a.email_verified_at is not null) as verified,
           to_char(a.created_at at time zone 'America/Chicago', 'Mon DD, YYYY') as joined,
           p.home_postal_code, p.home_city, p.home_state, p.age_bracket, p.gender, p.phone_e164,
           -- Consent is an append-only log: the latest entry per purpose counts.
           exists (select 1 from (select distinct on (c.purpose) c.action
                                    from sms_consents c
                                   where c.account_id = a.id
                                   order by c.purpose, c.occurred_at desc) last
                    where last.action = 'granted') as sms_ok,
           (select string_agg(sp.name, ', ' order by sp.name)
              from athlete_sports s join sports sp on sp.id = s.sport_id
             where s.account_id = a.id) as sports
      from accounts a
      left join athlete_profiles p on p.account_id = a.id
     where (${search} = '' or a.display_name ilike ${like} or a.email ilike ${like}
            or p.home_city ilike ${like} or p.home_postal_code ilike ${like})
     order by a.created_at desc
     limit 500`;

  const [{ total }] = await sql<{ total: number }[]>`select count(*)::int as total from accounts`;

  return (
    <div className="wrap py-10">
      <p className="t-kicker text-[color:var(--surf-ink)]">Staff</p>
      <h1 className="t-display mt-2 text-3xl">Players</h1>
      <p className="mt-3 max-w-xl text-sm leading-relaxed text-[color:var(--muted)]">
        {total} {total === 1 ? 'account' : 'accounts'}, newest first. A phone
        number is shown with whether that player agreed to texts.
      </p>

      <form className="mt-6 flex max-w-xl gap-2">
        <input name="q" defaultValue={search} placeholder="Name, email, city or ZIP" className="field" />
        <button className="btn-primary">Search</button>
      </form>

      <div className="mt-6 overflow-x-auto">
        <table className="w-full min-w-[900px] text-left text-sm">
          <thead className="t-mono text-[10px] uppercase tracking-wider text-[color:var(--faint)]">
            <tr>
              <th className="py-2 pr-4">Player</th>
              <th className="py-2 pr-4">Email</th>
              <th className="py-2 pr-4">Phone</th>
              <th className="py-2 pr-4">Home</th>
              <th className="py-2 pr-4">Age</th>
              <th className="py-2 pr-4">Plays</th>
              <th className="py-2 pr-4">Joined</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr>
                <td colSpan={7} className="py-6 text-[color:var(--muted)]">
                  {search ? `Nobody matches “${search}”.` : 'No players yet.'}
                </td>
              </tr>
            )}
            {rows.map((r) => (
              <tr key={r.id} className="border-t" style={{ borderColor: 'var(--line)' }}>
                <td className="py-2.5 pr-4 font-semibold">{r.display_name}</td>
                <td className="py-2.5 pr-4">
                  <a href={`mailto:${r.email}`} className="underline decoration-[color:var(--surf)]">{r.email}</a>
                  {!r.verified && <span className="chip-muted ml-2">unconfirmed</span>}
                </td>
                <td className="py-2.5 pr-4">
                  {r.phone_e164 ? (
                    <>
                      {displayPhone(r.phone_e164)}
                      <span className="t-mono ml-2 text-[10px] text-[color:var(--faint)]">
                        {r.sms_ok ? 'texts OK' : 'no text consent'}
                      </span>
                    </>
                  ) : (
                    <span className="text-[color:var(--faint)]">—</span>
                  )}
                </td>
                <td className="py-2.5 pr-4">
                  {r.home_city ? `${r.home_city}, ${r.home_state} ` : ''}
                  <span className="text-[color:var(--faint)]">{r.home_postal_code ?? '—'}</span>
                </td>
                <td className="py-2.5 pr-4">{r.age_bracket ? AGE[r.age_bracket] ?? r.age_bracket : '—'}</td>
                <td className="py-2.5 pr-4">{r.sports ?? <span className="text-[color:var(--faint)]">—</span>}</td>
                <td className="py-2.5 pr-4 whitespace-nowrap">{r.joined}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
