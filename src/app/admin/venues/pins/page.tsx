import Link from 'next/link';
import { redirect } from 'next/navigation';
import { isSignedIn } from '@/lib/auth';
import { pinProgress, venuesNeedingPins } from '@/lib/venue-backfill';
import { PinList } from '@/components/admin/PinList';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Venue pins', robots: { index: false, follow: false } };

/**
 * Walk the venues that have never had a real pin, worst first.
 *
 * "Worst" means most at stake, not most wrong: venues with upcoming
 * events come first, because those are the ones a player will try to
 * drive to this season. A gym last used in 2022 is history. Search sits
 * on top of that order for when a particular venue is the target.
 */
export default async function VenuePinsPage() {
  if (!(await isSignedIn())) redirect('/admin');

  const [all, progress] = await Promise.all([venuesNeedingPins(), pinProgress()]);
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

      <div
        className="mt-3 h-2 overflow-hidden rounded-full border"
        style={{ borderColor: 'var(--line)', background: 'var(--raised)' }}
      >
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
        <PinList venues={all} />
      )}
    </div>
  );
}
