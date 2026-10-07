import { redirect } from 'next/navigation';
import { currentAccount } from '@/lib/accounts';
import { isGoogleConfigured, isSamePath } from '@/lib/google-oauth';
import { SignInForm } from '@/components/account/SignInForm';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'Sign in',
  robots: { index: false, follow: true },
};

export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; error?: string }>;
}) {
  const { next: rawNext, error } = await searchParams;
  // Only a path on this site is ever used as a redirect target.
  const next = isSamePath(rawNext) ? rawNext : undefined;
  if (await currentAccount()) redirect(next ?? '/account');

  return (
    <div className="wrap flex justify-center py-12 sm:py-16">
      <div className="w-full max-w-sm">
        <h1 className="t-display text-3xl">Welcome back.</h1>
        <p className="mt-2 text-base leading-relaxed text-[color:var(--muted)]">
          Your saved events are where you left them.
        </p>

        {error && (
          <p role="alert" className="panel tone-bad mt-6 p-4 text-sm leading-relaxed">
            {error === 'google'
              ? 'Google sign-in did not complete. Try again, or use your password.'
              : // The Google callback passes back its own reason when there is
                // an actionable one. Capped in length so a crafted link cannot
                // turn this into a billboard.
                error.slice(0, 200)}
          </p>
        )}

        <div className="panel mt-8 p-6">
          <SignInForm next={next} googleEnabled={isGoogleConfigured()} />
        </div>
      </div>
    </div>
  );
}
