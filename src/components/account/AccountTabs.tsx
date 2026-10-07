'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

/**
 * The one-account, two-hats switch.
 *
 * A client component purely so the current tab can be marked — which is
 * worth the kilobyte, because three unmarked pills leave you guessing which
 * page you are on.
 */
export function AccountTabs({ isHost }: { isHost: boolean }) {
  const pathname = usePathname();

  const tabs = [
    { href: '/account', label: 'Player profile' },
    { href: '/account/events', label: 'My events' },
    { href: '/account/host', label: isHost ? 'Organizer profile' : 'Run events?' },
  ];

  return (
    <>
      {tabs.map((tab) => {
        const active = tab.href === '/account' ? pathname === '/account' : pathname.startsWith(tab.href);
        return (
          <Link
            key={tab.href}
            href={tab.href}
            className="tab"
            aria-current={active ? 'page' : undefined}
          >
            {tab.label}
          </Link>
        );
      })}
    </>
  );
}
