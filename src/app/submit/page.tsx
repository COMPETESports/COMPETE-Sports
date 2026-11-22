import Link from 'next/link';
import { currentAccount } from '@/lib/accounts';
import { loadRefOptions, loadVenueOptions } from '@/lib/ref-data';
import { EMPTY_EVENT } from '@/lib/event-form-empty';
import { EventForm } from '@/components/admin/EventForm';

export const dynamic = 'force-dynamic';
export const metadata = {
  title: 'List an event',
  description: 'Add an adult volleyball tournament, league or open play to COMPETE. Free. Every event is checked before it goes live.',
};

/**
 * The public submission form (Tom, 22 Nov 2026).
 *
 * Signed-in accounts with a confirmed email only. The form is the same one
 * staff use, in 'submit' mode: it creates a pending event, reads pasted
 * text and links but not images, and shows no status or delete controls.
 * Nothing is public until Tom approves it.
 */
export default async function SubmitPage() {
  const account = await currentAccount();

  return (
    <div className="wrap max-w-3xl py-10">
      <p className="t-kicker text-[color:var(--surf-ink)]">Free to list</p>
      <h1 className="t-display mt-2 text-3xl leading-tight">List an event</h1>
      <p className="mt-3 text-base leading-relaxed text-[color:var(--muted)]">
        Know a tournament, league or open play that should be on COMPETE? Add
        it here. We check every event before it goes live, and email you when
        it does. Registration stays wherever the organizer runs it.
      </p>

      {!account ? (
        <div className="panel mt-8 p-6">
          <p className="t-head text-lg">Sign in to add an event</p>
          <p className="mt-2 text-sm leading-relaxed text-[color:var(--muted)]">
            A free account lets us tell you when your event is approved, and
            keeps the form clear of spam.
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            <Link href="/signin?next=/submit" className="btn-primary">Sign in</Link>
            <Link href="/join" className="btn-ghost">Create a free account</Link>
          </div>
        </div>
      ) : !account.email_verified_at ? (
        <div className="panel tone-warn mt-8 p-6">
          <p className="t-head text-lg">Confirm your email first</p>
          <p className="mt-2 text-sm leading-relaxed">
            We sent a link to <strong>{account.email}</strong> when you signed
            up. Click it, then come back here. Can&apos;t find it? Ask for a new
            one on <Link href="/account" className="underline">your account page</Link>.
          </p>
        </div>
      ) : (
        <SubmitForm />
      )}
    </div>
  );
}

async function SubmitForm() {
  // No organizer list: a browsable index of organizations is the CRM's
  // prospecting list (see /organizers). The submitter types the name; Tom
  // matches it to an existing organizer, or merges, on review.
  const [options, venues] = await Promise.all([
    loadRefOptions('volleyball'),
    loadVenueOptions(),
  ]);
  const organizers: never[] = [];
  return (
    <>
      <ul className="mt-6 space-y-1.5 text-sm text-[color:var(--muted)]">
        <li>• <strong className="text-[color:var(--ink)]">Paste the event&apos;s post or flyer text</strong> below and we fill in what we can. Check every field.</li>
        <li>• Only add what the organizer has published. Leave a field blank rather than guess.</li>
        <li>• Volleyball only for now.</li>
      </ul>
      <EventForm mode="submit" values={EMPTY_EVENT} options={{ ...options, venues, organizers }} />
    </>
  );
}
