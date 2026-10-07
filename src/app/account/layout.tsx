import { redirect } from 'next/navigation';
import { currentAccount } from '@/lib/accounts';
import { AccountTabs } from '@/components/account/AccountTabs';
import { signOut } from './actions';

export const dynamic = 'force-dynamic';

/**
 * Everything under /account requires an account, so the check lives here
 * once rather than at the top of five pages.
 *
 * The Athlete/Organizer switch is the "account toggle": one login, two hats,
 * and the Organizer tab only claims to exist once there is something behind
 * it — before that it reads as an invitation rather than a dead end.
 */
export default async function AccountLayout({ children }: { children: React.ReactNode }) {
  const account = await currentAccount();
  if (!account) redirect('/signin?next=/account');

  return (
    <>
      <div className="band-aqua border-b-2 border-[color:var(--line)]">
        <div className="wrap py-8">
          <p className="t-kicker text-[color:var(--surf-ink)]">Your account</p>
          <h1 className="t-display mt-2 text-2xl sm:text-3xl">{account.display_name}</h1>
          <p className="t-mono mt-2 text-[11px] uppercase tracking-[0.12em] text-[color:var(--faint)]">
            {account.email}
            {!account.email_verified_at && ' · not yet confirmed'}
          </p>

          <nav className="mt-6 flex flex-wrap items-center gap-2">
            <AccountTabs isHost={account.is_host} />
            <form action={signOut} className="ml-auto">
              <button type="submit" className="btn-ghost !px-3 !py-1.5 text-[10px]">
                Sign out
              </button>
            </form>
          </nav>
        </div>
      </div>

      <div className="wrap py-10">{children}</div>
    </>
  );
}
