import {
  currentAccount,
  getAthletePreferences,
  getAthleteProfile,
  smsConsentState,
} from '@/lib/accounts';
import { loadPreferenceOptions } from '@/lib/ref-data';
import { ProfileForm } from '@/components/account/ProfileForm';
import { AlertStatus } from '@/components/account/AlertStatus';
import { VerifyBanner } from '@/components/account/VerifyBanner';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Player profile', robots: { index: false } };

export default async function AccountPage({
  searchParams,
}: {
  searchParams: Promise<{ welcome?: string; reset?: string; mail?: string }>;
}) {
  const { welcome, reset, mail } = await searchParams;
  const account = (await currentAccount())!;

  const [profile, preferences, options, consent] = await Promise.all([
    getAthleteProfile(account.id),
    getAthletePreferences(account.id),
    loadPreferenceOptions(),
    smsConsentState(account.id),
  ]);

  return (
    <div className="grid max-w-3xl gap-8">
      {welcome && (
        <div className="panel tone-good p-5">
          <p className="t-head text-base">You are in.</p>
          <p className="mt-2 text-sm leading-relaxed">
            Add your home ZIP below and your local events appear on the
            homepage. Everything else on this page is optional.
          </p>
        </div>
      )}
      {mail && (
        <p role="alert" className="panel tone-warn p-4 text-sm">
          Your account is ready, but the confirmation email could not be sent
          ({mail}). That is our problem, not yours. Use <strong>Send it again</strong>{' '}
          below in a little while.
        </p>
      )}
      {reset && (
        <p className="panel tone-good p-4 text-sm">Your password has been changed.</p>
      )}

      {!account.email_verified_at && <VerifyBanner email={account.email} />}

      {profile?.sms_alerts_enabled && (
        <AlertStatus snoozedUntil={profile.sms_snoozed_until} />
      )}

      <ProfileForm
        displayName={account.display_name}
        profile={profile}
        options={options}
        selected={preferences}
        consent={consent}
      />
    </div>
  );
}
