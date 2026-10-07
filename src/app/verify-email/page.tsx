import Link from 'next/link';
import { VerifyForm } from '@/components/account/VerifyForm';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Confirm your email', robots: { index: false } };

export default async function VerifyEmailPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const { token } = await searchParams;

  return (
    <div className="wrap flex justify-center py-16">
      <div className="panel w-full max-w-sm p-6 text-center">
        {token ? (
          <VerifyForm token={token} />
        ) : (
          <>
            <p className="t-display text-2xl text-[color:var(--coral-ink)]">
              That link is incomplete
            </p>
            <p className="mt-3 text-sm leading-relaxed text-[color:var(--muted)]">
              Confirmation links only work in full. Open the one in your email
              rather than retyping it.
            </p>
            <Link href="/account" className="btn-primary mt-6">
              Go to your account
            </Link>
          </>
        )}
      </div>
    </div>
  );
}
