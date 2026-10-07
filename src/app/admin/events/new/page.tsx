import Link from 'next/link';
import { redirect } from 'next/navigation';
import { isSignedIn } from '@/lib/auth';
import { loadRefOptions } from '@/lib/ref-data';
import { EventForm } from '@/components/admin/EventForm';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'New event', robots: { index: false, follow: false } };

export default async function NewEventPage() {
  if (!(await isSignedIn())) redirect('/admin');

  const options = await loadRefOptions('volleyball');

  return (
    <div className="wrap max-w-3xl py-10">
      <Link
        href="/admin/events"
        className="t-mono text-[11px] uppercase tracking-[0.15em] text-[color:var(--faint)] hover:text-[color:var(--surf-ink)]"
      >
        ← Events
      </Link>
      <h1 className="t-head mt-3 text-2xl">New event</h1>
      <p className="mt-2 text-sm text-[color:var(--muted)]">
        Saving with status “Approved” puts it on the public site straight away.
      </p>

      <EventForm
        options={options}
        values={{
          name: '',
          sport: 'volleyball',
          starts_on: '',
          ends_on: '',
          registration_deadline: '',
          entry_fee: '',
          fee_basis: 'per_player',
          payout_text: '',
          event_page_url: '',
          flyer_url: '',
          notes: '',
          venue_name: '',
          address_line: '',
          city: '',
          state: '',
          postal_code: '',
          organizer_name: '',
          organizer_email: '',
          surfaces: [],
          formats: [],
          divisions: [],
          status: 'draft',
        }}
      />
    </div>
  );
}
