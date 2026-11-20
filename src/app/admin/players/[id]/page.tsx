import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { isSignedIn } from '@/lib/auth';
import { getPlayer, getPlayerLog } from '@/lib/admin-players';
import { AGE_BRACKETS } from '@/lib/account-fields';
import { displayPhone } from '@/lib/phone';
import { looksLikeBotName } from '@/lib/bot-check';
import { deletePlayer, markConfirmed, resendConfirmation, savePlayer } from '../actions';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Player', robots: { index: false, follow: false } };

/**
 * One player's account, for staff: fix details with the player's
 * permission, resend or mark the confirmation, delete. Tom, 19 Nov.
 */
export default async function PlayerPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ ok?: string; err?: string }>;
}) {
  if (!(await isSignedIn())) redirect('/admin');
  const { id } = await params;
  const { ok, err } = await searchParams;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const p = await getPlayer(id);
  if (!p) notFound();
  const history = await getPlayerLog(id);
  const minor = p.age_bracket === 'under_18';

  return (
    <div className="wrap max-w-3xl py-10">
      <Link href="/admin/players" className="t-mono text-[11px] uppercase tracking-wider text-[color:var(--muted)]">
        ← Players
      </Link>
      <h1 className="t-display mt-3 text-3xl">{p.display_name}</h1>
      <p className="mt-2 text-sm text-[color:var(--muted)]">
        Joined {p.created_at} · {p.email_verified_at ? 'email confirmed' : 'email not confirmed'}
        {p.status !== 'active' && ` · ${p.status}`}
        {p.phone_e164 && ` · ${displayPhone(p.phone_e164)}`}
      </p>
      {looksLikeBotName(p.display_name) && (
        <p className="panel tone-warn mt-4 p-3 text-sm">This name looks machine-generated: probably a bot sign-up.</p>
      )}
      {ok && <p className="panel tone-good mt-4 p-3 text-sm">{ok}</p>}
      {err && <p role="alert" className="panel tone-warn mt-4 p-3 text-sm">{err}</p>}

      {/* ------------------------------------------------------------ edit */}
      <form action={savePlayer.bind(null, p.id)} className="panel mt-6 grid gap-4 p-5 sm:grid-cols-2">
        <h2 className="t-head text-lg sm:col-span-2">Account details</h2>
        <label className="grid gap-1.5">
          <span className="label">Name</span>
          <input name="display_name" defaultValue={p.display_name} required maxLength={60} className="field" />
        </label>
        <label className="grid gap-1.5">
          <span className="label">Email</span>
          <input name="email" type="email" defaultValue={p.email} required className="field" />
        </label>
        <label className="grid gap-1.5">
          <span className="label">Home ZIP</span>
          <input name="home_postal_code" defaultValue={p.home_postal_code ?? ''} required pattern="[0-9]{5}" maxLength={5} className="field" />
        </label>
        <label className="grid gap-1.5">
          <span className="label">Age range</span>
          <select name="age_bracket" defaultValue={p.age_bracket ?? ''} className="field">
            {!p.age_bracket && <option value="">—</option>}
            {AGE_BRACKETS.map((b) => (
              <option key={b.value} value={b.value} disabled={minor ? b.value !== 'under_18' : b.value === 'under_18'}>
                {b.label}
              </option>
            ))}
          </select>
        </label>
        <label className="grid gap-1.5">
          <span className="label">Gender</span>
          <select name="gender" defaultValue={p.gender === 'male' || p.gender === 'female' ? p.gender : ''} className="field">
            <option value="">Not given</option>
            <option value="male">Male</option>
            <option value="female">Female</option>
          </select>
        </label>
        <label className="grid gap-1.5 sm:col-span-2">
          <span className="label">Player&rsquo;s permission — required</span>
          <input name="permission" required minLength={5} placeholder='e.g. "Asked me by text, 19 Nov, to fix the email typo"' className="field" />
        </label>
        <p className="text-xs text-[color:var(--faint)] sm:col-span-2">
          Changing the email sends a confirmation to the new address. A move into or out of 13–17 can
          only be made by the player, so the age protections run.
        </p>
        <div className="sm:col-span-2">
          <button className="btn-primary">Save changes</button>
        </div>
      </form>

      {/* ----------------------------------------------------- confirmation */}
      {!p.email_verified_at && (
        <div className="panel mt-6 grid gap-4 p-5">
          <h2 className="t-head text-lg">Email confirmation</h2>
          <form action={resendConfirmation.bind(null, p.id)}>
            <button className="btn-ghost">Resend the confirmation email to {p.email}</button>
          </form>
          <form action={markConfirmed.bind(null, p.id)} className="flex flex-wrap gap-2">
            <input name="permission" required minLength={5} placeholder="How you know it's theirs" className="field max-w-sm" />
            <button className="btn-ghost">Mark as confirmed</button>
          </form>
        </div>
      )}

      {/* ----------------------------------------------------------- delete */}
      <form action={deletePlayer.bind(null, p.id)} className="panel mt-6 grid gap-3 p-5" style={{ borderColor: 'var(--beach)' }}>
        <h2 className="t-head text-lg">Delete this account</h2>
        <p className="text-sm text-[color:var(--muted)]">
          {p.legal_records > 0
            ? 'This account has text-consent or age records, which are kept by policy. It will be closed instead: they can no longer sign in, and the records stay.'
            : 'Removes the account, profile, saved events and preferences. This cannot be undone.'}
        </p>
        <input name="reason" placeholder="Reason (optional)" className="field" />
        <div className="flex flex-wrap items-center gap-2">
          <input name="confirm" required placeholder="Type DELETE" className="field max-w-[10rem]" />
          <button className="btn-ghost" style={{ color: 'var(--beach)', borderColor: 'var(--beach)' }}>
            {p.legal_records > 0 ? 'Close account' : 'Delete account'}
          </button>
        </div>
      </form>

      {/* ---------------------------------------------------------- history */}
      {history.length > 0 && (
        <div className="mt-8">
          <h2 className="t-head text-lg">Staff changes</h2>
          <ul className="mt-3 grid gap-2 text-sm">
            {history.map((h, i) => (
              <li key={i} className="panel p-3">
                <span className="t-mono text-[11px] text-[color:var(--faint)]">{h.at}</span>{' '}
                <strong>{h.action.replace('_', ' ')}</strong>
                {Object.entries(h.changes).map(([k, [from, to]]) => (
                  <span key={k}> · {k}: {String(from ?? '—')} → {String(to ?? '—')}</span>
                ))}
                {h.permission && <span className="block text-[color:var(--muted)]">Permission: {h.permission}</span>}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
