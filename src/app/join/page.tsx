import { redirect } from 'next/navigation';
import { currentAccount } from '@/lib/accounts';
import { isGoogleConfigured } from '@/lib/google-oauth';
import { JoinForm } from '@/components/account/JoinForm';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'Create an account',
  description:
    'Save the events you are eyeing, keep a history of what you have played, and get your local events on the homepage.',
};

export default async function JoinPage() {
  if (await currentAccount()) redirect('/account');

  return (
    <div className="wrap flex justify-center py-12 sm:py-16">
      <div className="w-full max-w-md">
        <p className="t-kicker text-[color:var(--surf-ink)]">Free, always</p>
        <h1 className="t-display mt-3 text-3xl leading-tight">
          Keep track of your season.
        </h1>
        <p className="mt-3 text-base leading-relaxed text-[color:var(--muted)]">
          Save events you are weighing up, mark the ones you are in, and keep a
          record of what you played. Your ZIP puts local events on the
          homepage.
        </p>

        <div className="panel mt-8 p-6">
          {isGoogleConfigured() && (
            <>
              <a href="/api/auth/google/start" className="btn-ghost w-full justify-center">
                Continue with Google
              </a>
              <div className="my-5 flex items-center gap-3">
                <span className="h-[2px] flex-1 bg-[color:var(--line)]" />
                <span className="t-mono text-[10px] uppercase tracking-[0.18em] text-[color:var(--faint)]">
                  or
                </span>
                <span className="h-[2px] flex-1 bg-[color:var(--line)]" />
              </div>
            </>
          )}
          <JoinForm />
        </div>

        <p className="t-mono mt-6 text-[10px] uppercase leading-relaxed tracking-[0.12em] text-[color:var(--faint)]">
          Accounts are for ages 13 and up. We never ask for your date of birth.
        </p>
      </div>
    </div>
  );
}
