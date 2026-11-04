import Link from 'next/link';
import { isSignedIn } from '@/lib/auth';

/**
 * One navigation bar for the whole staff portal.
 *
 * Until now each admin page carried its own links, so Venues and
 * Organizers were only reachable by typing the URL. Tom, 4 Nov.
 *
 * Hidden when signed out, so the sign-in page is not framed by a menu
 * nothing behind it can open.
 */

const SECTIONS = [
  { href: '/admin/events', label: 'Events', note: 'Enter and publish' },
  { href: '/admin/organizers', label: 'Organizers', note: 'Who runs them' },
  { href: '/admin/venues', label: 'Venues', note: 'Where they happen' },
  { href: '/admin/crm', label: 'Outreach', note: 'Pipeline and calls' },
  { href: '/admin/compliance', label: 'Compliance', note: 'Age and consent' },
  // Temporary. Delete this line and the page once the sections are empty.
  { href: '/admin/cleanup', label: 'Cleanup', note: 'Events with gaps' },
];

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const signedIn = await isSignedIn();

  return (
    <>
      {signedIn && (
        <nav
          className="border-b"
          style={{ borderColor: 'var(--line)', background: 'var(--surface)' }}
          aria-label="Staff sections"
        >
          <div className="wrap flex flex-wrap items-center gap-x-1 gap-y-1 py-2">
            <Link
              href="/admin/events"
              className="t-display mr-3 text-sm"
              style={{ color: 'var(--surf-ink)' }}
            >
              COMPETE staff
            </Link>
            {SECTIONS.map((s) => (
              <Link
                key={s.href}
                href={s.href}
                title={s.note}
                className="t-head rounded-lg px-3 py-1.5 text-sm text-[color:var(--muted)] transition-colors hover:bg-[color:var(--raised)] hover:text-[color:var(--ink)]"
              >
                {s.label}
              </Link>
            ))}
            <Link
              href="/admin/events/new"
              className="btn-primary ml-auto !py-1.5 !text-xs"
            >
              + New event
            </Link>
          </div>
        </nav>
      )}
      {children}
    </>
  );
}
