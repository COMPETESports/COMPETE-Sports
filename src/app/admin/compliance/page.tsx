import Link from 'next/link';
import { redirect } from 'next/navigation';
import { isSignedIn } from '@/lib/auth';
import { listAgeChanges, minorsWithContactData, type ChangeDirection } from '@/lib/compliance';
import { AGE_BRACKETS } from '@/lib/account-fields';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Compliance', robots: { index: false, follow: false } };

const BRACKET_LABEL = new Map(AGE_BRACKETS.map((b) => [b.value, b.label]));
const label = (value: string | null) =>
  value ? (BRACKET_LABEL.get(value as never) ?? value) : 'not set';

/**
 * The age-gate review queue.
 *
 * Ordered by what actually needs a human: an account leaving under-18 is
 * the entry that matters, because that is the transition which removes the
 * no-phone and no-texting restrictions. An account entering under-18 is
 * informational — the protections engaged automatically and the database
 * will not let them be undone while the profile says under 18.
 */
export default async function CompliancePage() {
  if (!(await isSignedIn())) redirect('/admin');

  const [changes, leaks] = await Promise.all([listAgeChanges(), minorsWithContactData()]);

  const toAdult = changes.filter((c) => c.direction === 'to_adult');
  const toMinor = changes.filter((c) => c.direction === 'to_minor');
  const undelivered = changes.filter(
    (c) => (c.direction === 'to_adult' || c.direction === 'to_minor') && !c.notified_at,
  );

  return (
    <div className="wrap py-8">
      <p className="t-kicker text-[color:var(--surf-ink)]">Admin</p>
      <h1 className="t-display mt-2 text-2xl sm:text-3xl">Age gate</h1>
      <p className="mt-3 max-w-2xl text-sm leading-relaxed text-[color:var(--muted)]">
        Every movement through the age bracket, on an append-only record. The
        database refuses edits and deletes on this log, so what is here is what
        happened.
      </p>

      {/* The one check that must always come back empty. */}
      {leaks.length > 0 ? (
        <div className="panel tone-warn mt-6 p-4">
          <p className="t-head text-base text-[color:var(--coral-ink)]">
            Urgent — {leaks.length} under-18{' '}
            {leaks.length === 1 ? 'profile holds' : 'profiles hold'} contact data
          </p>
          <p className="mt-2 text-sm leading-relaxed">
            This should be impossible: two database constraints exist to prevent
            it. A row here means one of them is missing from this database. Stop
            and check that migration 003 ran in full.
          </p>
          <ul className="mt-3 grid gap-1 text-sm">
            {leaks.map((row) => (
              <li key={row.account_id} className="t-mono">
                {row.email ?? row.account_id} —{' '}
                {row.has_phone ? 'phone on file' : ''}
                {row.has_phone && row.alerts ? ', ' : ''}
                {row.alerts ? 'alerts enabled' : ''}
              </li>
            ))}
          </ul>
        </div>
      ) : (
        <p className="panel mt-6 p-4 text-sm leading-relaxed">
          <strong>No under-18 profile holds a phone number or has alerts
          enabled.</strong>{' '}
          Checked against the live table just now rather than assumed from the
          constraints.
        </p>
      )}

      {undelivered.length > 0 && (
        <div className="panel tone-warn mt-4 p-4">
          <p className="t-head text-base">
            {undelivered.length} alert{undelivered.length === 1 ? '' : 's'} were
            logged but not emailed
          </p>
          <p className="mt-2 text-sm leading-relaxed">
            The change is recorded, but nobody was told. Usually this means
            RESEND_API_KEY is not set. The entries are listed below with
            &ldquo;not sent&rdquo;.
          </p>
        </div>
      )}

      <div className="mt-8 grid gap-4 sm:grid-cols-3">
        <Stat label="Left under-18" value={toAdult.length} emphasis />
        <Stat label="Became under-18" value={toMinor.length} />
        <Stat label="Logged in total" value={changes.length} />
      </div>

      <Queue
        title="Left under-18 — needs review"
        blurb="An account that was under 18 now says it is an adult, which is what removes the no-phone and no-texting restrictions. Often a birthday or a mis-tap at signup; sometimes a minor trying to unlock text alerts. No number or consent carries over — both were cleared while the account was under 18 — so nothing is being sent without a fresh number and a fresh consent."
        rows={toAdult}
      />

      <Queue
        title="Became under-18 — informational"
        blurb="Protections engaged automatically: the phone number was deleted and every live SMS consent withdrawn. Nothing further is required for the no-texting rule, because the database will not accept a phone number on this profile while it says under 18."
        rows={toMinor}
      />

      <p className="mt-10 text-sm">
        <Link href="/admin/events" className="underline">
          ← Back to events
        </Link>
      </p>
    </div>
  );
}

function Stat({
  label: text,
  value,
  emphasis,
}: {
  label: string;
  value: number;
  emphasis?: boolean;
}) {
  return (
    <div className="panel p-4">
      <p className="t-mono text-[11px] uppercase tracking-[0.15em] text-[color:var(--faint)]">
        {text}
      </p>
      <p
        className={`t-display mt-1 text-3xl ${
          emphasis && value > 0 ? 'text-[color:var(--coral-ink)]' : ''
        }`}
      >
        {value}
      </p>
    </div>
  );
}

function Queue({
  title,
  blurb,
  rows,
}: {
  title: string;
  blurb: string;
  rows: Awaited<ReturnType<typeof listAgeChanges>>;
}) {
  return (
    <section className="mt-10">
      <h2 className="list-head">
        {title} <span>{rows.length}</span>
      </h2>
      <p className="mt-3 max-w-3xl text-sm leading-relaxed text-[color:var(--muted)]">
        {blurb}
      </p>

      {rows.length === 0 ? (
        <p className="mt-4 text-sm text-[color:var(--muted)]">Nothing recorded.</p>
      ) : (
        <ul className="mt-4 grid gap-2">
          {rows.map((row) => (
            <li key={row.id} className="panel p-4">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <p className="t-mono text-sm">{row.email ?? row.account_id}</p>
                <p className="t-mono text-[11px] uppercase tracking-[0.12em] text-[color:var(--faint)]">
                  {new Date(row.occurred_at).toLocaleString('en-US')}
                </p>
              </div>

              <p className="mt-2 text-sm">
                {label(row.from_bracket)} <span aria-hidden>→</span>{' '}
                <strong>{label(row.to_bracket)}</strong>
              </p>

              <ul className="t-mono mt-2 grid gap-0.5 text-[11px] text-[color:var(--muted)]">
                <li>
                  phone removed: {row.phone_removed ? 'yes' : 'no number was on file'}
                </li>
                <li>consents revoked: {row.consents_revoked}</li>
                <li>ip: {row.ip_address ?? 'not recorded'}</li>
                {/* Repeated changes are the real signal of someone probing
                    the gate, rather than any single change. */}
                {row.changes_for_account > 2 && (
                  <li className="text-[color:var(--coral-ink)]">
                    {row.changes_for_account} bracket changes on this account
                  </li>
                )}
                <li className={row.notified_at ? '' : 'text-[color:var(--coral-ink)]'}>
                  {row.notified_at
                    ? `notified ${new Date(row.notified_at).toLocaleString('en-US')}`
                    : `not sent — ${row.notify_detail ?? 'no detail'}`}
                </li>
              </ul>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
