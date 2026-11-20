import { redirect } from 'next/navigation';
import { isSignedIn } from '@/lib/auth';
import { loadSportDemand } from '@/lib/ref-data';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Sport demand', robots: { index: false, follow: false } };

/**
 * How many players ticked each sport on their profile, most first.
 *
 * The number that decides what comes after pickleball (Tom, 15 Nov). A
 * coming-soon sport has no events and no questions yet; a player ticking
 * it is the whole signal.
 */
const STATUS_LABEL = { live: 'Live', next: 'Next', coming_soon: 'Coming soon' } as const;

export default async function DemandPage() {
  if (!(await isSignedIn())) redirect('/admin');

  const rows = await loadSportDemand();
  const total = rows.reduce((sum, r) => sum + r.players, 0);
  const top = Math.max(1, ...rows.map((r) => r.players));

  return (
    <div className="wrap py-10">
      <p className="t-kicker text-[color:var(--surf-ink)]">Staff</p>
      <h1 className="t-display mt-2 text-3xl">Sport demand</h1>
      <p className="mt-3 max-w-xl text-sm leading-relaxed text-[color:var(--muted)]">
        Players who ticked each sport on their profile. {total === 0
          ? 'Nobody has ticked one yet.'
          : `${total} ticks so far.`}{' '}
        The coming-soon sport at the top is the case for what to add after pickleball.
      </p>

      <ol className="mt-8 grid max-w-2xl gap-2">
        {rows.map((r) => (
          <li key={r.name} className="panel flex items-center gap-4 px-4 py-3">
            <span className="t-head w-44 shrink-0 text-sm">{r.name}</span>
            <span className="chip-muted shrink-0">{STATUS_LABEL[r.launch_status]}</span>
            <span className="h-2 flex-1 overflow-hidden rounded-full" style={{ background: 'var(--raised)' }}>
              <span
                className="block h-full rounded-full"
                style={{ width: `${(r.players / top) * 100}%`, background: 'var(--beach)' }}
              />
            </span>
            <span className="t-mono w-10 shrink-0 text-right text-sm">{r.players}</span>
          </li>
        ))}
      </ol>
    </div>
  );
}
