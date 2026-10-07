import { redirect } from 'next/navigation';
import { isSignedIn } from '@/lib/auth';
import { SignInForm } from '@/components/admin/SignInForm';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Staff sign in', robots: { index: false, follow: false } };

export default async function AdminSignInPage() {
  if (await isSignedIn()) redirect('/admin/events');

  return (
    <div className="wrap flex min-h-[70vh] items-center justify-center py-16">
      <div className="panel w-full max-w-sm p-6">
        <p className="t-kicker text-[color:var(--surf-ink)]">COMPETE staff</p>
        <h1 className="t-head mt-2 text-2xl">Sign in</h1>
        <p className="mt-2 text-sm leading-relaxed text-[color:var(--muted)]">
          Event entry for COMPETE staff. Host accounts arrive in a later
          phase.
        </p>
        <SignInForm />
      </div>
    </div>
  );
}
