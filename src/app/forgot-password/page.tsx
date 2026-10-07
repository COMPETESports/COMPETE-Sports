import Link from 'next/link';
import { ForgotForm } from '@/components/account/PasswordForms';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Forgot your password', robots: { index: false } };

export default function ForgotPasswordPage() {
  return (
    <div className="wrap flex justify-center py-12 sm:py-16">
      <div className="w-full max-w-sm">
        <h1 className="t-display text-2xl">Reset your password</h1>
        <p className="mt-2 text-sm leading-relaxed text-[color:var(--muted)]">
          Give us the address on your account and we will send a link that works
          once.
        </p>

        <div className="panel mt-8 p-6">
          <ForgotForm />
        </div>

        <p className="mt-6 text-center text-sm text-[color:var(--muted)]">
          <Link href="/signin" className="underline decoration-[color:var(--surf)]">
            Back to sign in
          </Link>
        </p>
      </div>
    </div>
  );
}
