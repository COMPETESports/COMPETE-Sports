import Link from 'next/link';

export default function NotFound() {
  return (
    <div className="wrap flex min-h-[60vh] flex-col items-center justify-center py-20 text-center">
      <p className="t-display text-5xl text-[color:var(--coral-ink)]">404</p>
      <h1 className="t-head mt-4 text-2xl">That event isn&apos;t here</h1>
      <p className="mt-3 max-w-sm text-sm leading-relaxed text-[color:var(--muted)]">
        It may have been cancelled, or the link may be wrong. Plenty of other
        weekends to fill.
      </p>
      <Link href="/" className="btn-primary mt-6">
        Browse events
      </Link>
    </div>
  );
}
