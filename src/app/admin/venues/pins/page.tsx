import Link from 'next/link';
import { redirect } from 'next/navigation';
import { isSignedIn } from '@/lib/auth';
import { pinProgress, venuesNeedingPins } from '@/lib/venue-backfill';
import { PinVenue } from '@/components/admin/PinVenue';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Venue pins', robots: { index: false, follow: false } };

const PAGE = 10;

/**
 * Walk the venues that have never had a real pin, worst first.
 *
 * "Worst" means most at stake, not most wrong: venues with upcoming
 * events come first, because those are the ones a player will try to
 * drive to this season. A gym last used in 2022 is history.
 */
export default async function VenuePinsPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>;
}) {
  if (!(await isSignedIn())) redirect('/admin');

  const { page } = await searchParams;
  const n = Math.max(0, Number(page ?? 0) || 0);

  const [all, progress] = await Promise.all([venuesNeedingPins(), pinProgress()]);
  const slice = all.slice(n * PAGE, n * PAGE + PAGE);
  const pct = progress.total ? Math.round((progress.exact / progress.total) * 100) : 0;

  return (
    <div className="wrap max-w-3xl py-8">
      <Link href="/admin/venues" className="t-kicker text-[color:var(--muted)] hover:text-[color:var(--surf-ink)]">
        ← Venues
      </Link>
      <h1 className="t-display mt-3 text-2xl sm:text-3xl">Give venues a real pin</h1>

      <p className="mt-2 max-w-2xl text-sm text-[color:var(--muted)]">
        {progress.exact} of {progress.total} venues sit on an exact pin — {pct}%.
        The rest are placed from a ZIP code or a city name, which answers
        “5 miles from me” from the middle of a postal district.
      </p>

      <div className="mt-3 h-2 overflow-hidden rounded-full border" style={{ borderColor: 'var(--line)', background: 'var(--raised)' }}>
        <div
          className="h-full rounded-full"
          style={{ width: `${pct}%`, background: 'linear-gradient(90deg, var(--indoor), var(--grass))' }}
        />
      </div>

      <p className="panel mt-5 p-4 text-sm text-[color:var(--muted)]">
        <strong>Ordered by what is at stake</strong>, not alphabetically — venues
        with upcoming events first. You do not have to finish this. The 2022
        venues are history; getting the 2026 and 2027 ones right is the job.
      </p>

      {all.length === 0 ? (
        <p className="panel tone-good mt-6 p-4 text-sm">
          Every venue has an exact pin. Nothing left to do here.
        </p>
      ) : (
        <>
          <div className="mt-6 grid gap-4">
            {slice.map((v) => (
              <PinVenue key={v.id} venue={v} />
            ))}
          </div>

          <div className="mt-6 flex items-center justify-between gap-3">
            {n > 0 ? (
              <Link href={`/admin/venues/pins?page=${n - 1}`} className="btn-ghost">← Previous</Link>
            ) : <span />}
            <span className="t-mono text-[11px] text-[color:var(--muted)]">
              {n * PAGE + 1}–{Math.min(n * PAGE + PAGE, all.length)} of {all.length}
            </span>
            {n * PAGE + PAGE < all.length ? (
              <Link href={`/admin/venues/pins?page=${n + 1}`} className="btn-primary">Next 10 →</Link>
            ) : <span />}
          </div>
        </>
      )}
    </div>
  );
}
