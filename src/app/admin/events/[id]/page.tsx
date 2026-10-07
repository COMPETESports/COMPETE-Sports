import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { isSignedIn } from '@/lib/auth';
import { sql } from '@/lib/db';
import { loadRefOptions } from '@/lib/ref-data';
import { EventForm } from '@/components/admin/EventForm';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Edit event', robots: { index: false, follow: false } };

interface Row {
  id: string;
  slug: string;
  name: string;
  sport_slug: string;
  starts_on: Date | string;
  ends_on: Date | string | null;
  registration_deadline: Date | string | null;
  entry_fee_cents: number | null;
  fee_basis: string;
  payout_text: string | null;
  event_page_url: string | null;
  flyer_url: string | null;
  notes: string | null;
  status: string;
  venue_name: string | null;
  address_line: string | null;
  city: string | null;
  state: string | null;
  postal_code: string | null;
  latitude: number | null;
  organizer_name: string | null;
  organizer_email: string | null;
  surfaces: string[] | null;
  formats: string[] | null;
  divisions: string[] | null;
}

const iso = (v: Date | string | null): string =>
  v === null ? '' : v instanceof Date ? v.toISOString().slice(0, 10) : String(v).slice(0, 10);

export default async function EditEventPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  if (!(await isSignedIn())) redirect('/admin');
  const { id } = await params;

  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();

  const [row] = await sql<Row[]>`
    select
      e.id, e.slug, e.name, sp.slug as sport_slug, e.starts_on, e.ends_on,
      e.registration_deadline, e.entry_fee_cents, e.fee_basis, e.payout_text,
      e.event_page_url, e.flyer_url, e.notes, e.status,
      v.name as venue_name, v.address_line, v.city, v.state, v.postal_code, v.latitude,
      o.name as organizer_name, o.contact_email as organizer_email,
      (select array_agg(s.slug) from event_surfaces es join surfaces s on s.id = es.surface_id where es.event_id = e.id) as surfaces,
      (select array_agg(f.slug) from event_formats ef join formats f on f.id = ef.format_id where ef.event_id = e.id) as formats,
      (select array_agg(d.slug) from event_divisions ed join divisions d on d.id = ed.division_id where ed.event_id = e.id) as divisions
    from events e
    join sports sp on sp.id = e.sport_id
    left join venues v on v.id = e.venue_id
    left join organizers o on o.id = e.organizer_id
    where e.id = ${id}`;

  if (!row) notFound();

  const options = await loadRefOptions(row.sport_slug);

  return (
    <div className="wrap max-w-3xl py-10">
      <Link
        href="/admin/events"
        className="t-mono text-[11px] uppercase tracking-[0.15em] text-[color:var(--faint)] hover:text-[color:var(--surf-ink)]"
      >
        ← Events
      </Link>

      <div className="mt-3 flex flex-wrap items-start justify-between gap-3">
        <h1 className="t-head text-2xl">{row.name}</h1>
        {row.status === 'approved' && (
          <Link href={`/events/${row.slug}`} className="btn-ghost">
            View public page ↗
          </Link>
        )}
      </div>

      {row.latitude === null && (
        <p className="panel tone-warn mt-4 p-3 text-sm">
          This venue has no map coordinates, so the event will not show up in
          radius search. Add a ZIP code and save to fix it.
        </p>
      )}

      <EventForm
        options={options}
        values={{
          id: row.id,
          name: row.name,
          sport: row.sport_slug,
          starts_on: iso(row.starts_on),
          ends_on: iso(row.ends_on),
          registration_deadline: iso(row.registration_deadline),
          entry_fee: row.entry_fee_cents === null ? '' : (row.entry_fee_cents / 100).toFixed(2),
          fee_basis: row.fee_basis,
          payout_text: row.payout_text ?? '',
          event_page_url: row.event_page_url ?? '',
          flyer_url: row.flyer_url ?? '',
          notes: row.notes ?? '',
          venue_name: row.venue_name ?? '',
          address_line: row.address_line ?? '',
          city: row.city ?? '',
          state: row.state ?? '',
          postal_code: row.postal_code ?? '',
          organizer_name: row.organizer_name ?? '',
          organizer_email: row.organizer_email ?? '',
          surfaces: row.surfaces ?? [],
          formats: row.formats ?? [],
          divisions: row.divisions ?? [],
          status: row.status,
        }}
      />
    </div>
  );
}
