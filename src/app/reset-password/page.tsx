import Link from 'next/link';
import { ResetForm } from '@/components/account/PasswordForms';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Choose a new password', robots: { index: false } };

export default async function ResetPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const { token } = await searchParams;

  return (
    <div className="wrap flex justify-center py-12 sm:py-16">
      <div className="w-full max-w-sm">
        <h1 className="t-display text-2xl">Choose a new password</h1>

        {token ? (
          <div className="panel mt-8 p-6">
            <ResetForm token={token} />
          </div>
        ) : (
          <>
            <p className="panel tone-warn mt-8 p-4 text-sm leading-relaxed">
              This link is missing its token. Reset links only work in full, so
              open the one in your email rather than retyping it.
            </p>
            <p className="mt-6 text-center text-sm text-[color:var(--muted)]">
              <Link href="/forgot-password" className="underline decoration-[color:var(--surf)]">
                Send a new link
              </Link>
            </p>
          </>
        )}
      </div>
    </div>
  );
}
