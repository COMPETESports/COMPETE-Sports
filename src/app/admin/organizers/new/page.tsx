import Link from 'next/link';
import { redirect } from 'next/navigation';
import { isSignedIn } from '@/lib/auth';
import { organizerCategories } from '@/lib/organizers-admin';
import { NewOrganizerForm } from '@/components/admin/NewOrganizerForm';
import { loadVenueOptions } from '@/lib/ref-data';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'New organization', robots: { index: false, follow: false } };

export default async function NewOrganizerPage() {
  if (!(await isSignedIn())) redirect('/admin');
  const [categories, venues] = await Promise.all([organizerCategories(), loadVenueOptions()]);
  return (
    <div className="wrap max-w-3xl py-10">
      <Link
        href="/admin/organizers"
        className="t-mono text-[11px] uppercase tracking-[0.15em] text-[color:var(--faint)] hover:text-[color:var(--surf-ink)]"
      >
        ← Organizers
      </Link>
      <h1 className="t-head mt-3 text-2xl">New organization</h1>
      <p className="mt-2 text-sm text-[color:var(--muted)]">
        Everything at once. Sports, more contacts and pipeline are on its page after it&apos;s created.
      </p>
      <NewOrganizerForm categories={categories} venues={venues} />
    </div>
  );
}
