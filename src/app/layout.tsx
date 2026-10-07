import type { Metadata, Viewport } from 'next';
import Link from 'next/link';
import { currentAccount } from '@/lib/accounts';
// Self-hosted type — see the note at the top of globals.css. Titan One is
// the bubble display face; Fredoka carries headings and kickers; Nunito is
// the body face, rounded but legible at 14px.
import '@fontsource/titan-one/400.css';
import '@fontsource-variable/fredoka';
import '@fontsource-variable/nunito';
import './globals.css';

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000';

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: {
    default: 'COMPETE — Find your next adult sports event',
    template: '%s · COMPETE',
  },
  description:
    'COMPETE is where adult recreational athletes find events across the United States — tournaments, leagues, open play and more. Search by location, date, surface, format and division.',
  openGraph: {
    title: 'COMPETE — Find your next adult sports event',
    description:
      'Every adult event worth playing, in one place. Search by location, date, surface, format and division.',
    url: siteUrl,
    siteName: 'COMPETE',
    type: 'website',
  },
  robots: { index: true, follow: true },
};

export const viewport: Viewport = {
  themeColor: '#17101f',
  width: 'device-width',
  initialScale: 1,
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const account = await currentAccount();

  return (
    <html lang="en">
      <body className="min-h-screen bg-[color:var(--sand)] antialiased">
        <a
          href="#main"
          className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:bg-[color:var(--surf-ink)] focus:px-4 focus:py-2 focus:text-white"
        >
          Skip to results
        </a>

        <SiteHeader signedIn={Boolean(account)} />
        <main id="main">{children}</main>
        <SiteFooter />
      </body>
    </html>
  );
}

function SiteHeader({ signedIn }: { signedIn: boolean }) {
  return (
    <header className="sticky top-0 z-40 border-b border-[color:var(--line)] bg-[color:var(--void)]/85 backdrop-blur-md">
      <div className="wrap flex h-16 items-center justify-between gap-4">
        {/* The wordmark IS the logo. The circle-with-a-letter badge that
            used to sit beside it is the most generic mark on the internet,
            and next to lettering this distinctive it only diluted it.
            Extrusion is deliberately tighter than the headline's — at
            18px the headline offsets would close the counters up. */}
        <Link href="/" aria-label="COMPETE home">
          <span className="t-display t-logo text-[19px] tracking-[0.02em] sm:text-[22px]">
            COMPETE
          </span>
        </Link>

        {/* On a phone the logo already gets you home, so only the two links
            that go somewhere new are kept. */}
        <nav className="flex items-center gap-1 sm:gap-3">
          <Link
            href="/"
            className="t-kicker hidden px-2 py-2 text-[color:var(--muted)] hover:text-[color:var(--indoor)] sm:block"
          >
            Find events
          </Link>
          <Link
            href="/communities"
            className="t-kicker px-2 py-2 text-[color:var(--muted)] hover:text-[color:var(--indoor)]"
          >
            Communities
          </Link>
          <Link
            href="/about"
            className="t-kicker hidden px-2 py-2 text-[color:var(--muted)] hover:text-[color:var(--indoor)] sm:block"
          >
            About
          </Link>
          {signedIn ? (
            <Link
              href="/account"
              className="btn-primary whitespace-nowrap !px-3 text-[10px] sm:!px-4 sm:text-xs"
            >
              My COMPETE
            </Link>
          ) : (
            <>
              <Link
                href="/signin"
                className="t-kicker hidden px-2 py-2 text-[color:var(--muted)] hover:text-[color:var(--indoor)] sm:block"
              >
                Sign in
              </Link>
              <Link
                href="/join"
                className="btn-primary whitespace-nowrap !px-3 text-[10px] sm:!px-4 sm:text-xs"
              >
                Join free
              </Link>
            </>
          )}
        </nav>
      </div>
    </header>
  );
}

function SiteFooter() {
  return (
    <footer className="pat-chevron mt-20">
      <div className="wrap py-10">
        <div className="flex flex-col gap-6 sm:flex-row sm:items-start sm:justify-between">
          <div className="max-w-sm">
            <p className="t-display t-logo text-2xl">COMPETE</p>
            <p className="mt-2 text-sm leading-relaxed text-white/75">
              Adult recreational sports, one place to find them. Built for the
              players who still set an alarm on a Saturday.
            </p>
          </div>
          <div className="flex flex-col gap-2 text-sm text-white/75">
            <Link href="/communities" className="hover:text-[color:var(--beach)]">
              Communities
            </Link>
            <Link href="/about" className="hover:text-[color:var(--beach)]">
              About COMPETE
            </Link>
            <a
              href="mailto:hello@joincompete.com?subject=List%20my%20event%20on%20COMPETE"
              className="hover:text-[color:var(--beach)]"
            >
              Organizers: list an event
            </a>
            <Link href="/privacy" className="hover:text-[color:var(--beach)]">
              Privacy policy
            </Link>
            <Link href="/terms" className="hover:text-[color:var(--beach)]">
              Terms of use
            </Link>
            <Link href="/admin" className="hover:text-[color:var(--beach)]">
              Staff sign in
            </Link>
          </div>
        </div>
        <p className="t-mono mt-8 text-[11px] uppercase tracking-[0.18em] text-white/45">
          © {new Date().getFullYear()} COMPETE Sports · Adult recreational events
          only
        </p>
      </div>
    </footer>
  );
}
