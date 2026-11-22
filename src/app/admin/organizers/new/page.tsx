import Link from 'next/link';
import { redirect } from 'next/navigation';
import { isSignedIn } from '@/lib/auth';
import { organizerCategories } from '@/lib/organizers-admin';
import { NewOrganizerForm } from '@/components/admin/NewOrganizerForm';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'New organization', robots: { index: false, follow: false } };

export default async function NewOrganizerPage() {
  if (!(await isSignedIn())) redirect('/admin');
  const categories = await organizerCategories();
  return (
    <div className="wrap max-w-2xl py-10">
      <Link
        href="/admin/organizers"
        className="t-mono text-[11px] uppercase tracking-[0.15em] text-[color:var(--faint)] hover:text-[color:var(--surf-ink)]"
      >
        ← Organizers
      </Link>
      <h1 className="t-head mt-3 text-2xl">New organization</h1>
      <p className="mt-2 text-sm text-[color:var(--muted)]">
        The basics first. Contacts, sports, venues and pipeline are on its page once it&apos;s created.
      </p>
      <NewOrganizerForm categories={categories} />
    </div>
  );
}
