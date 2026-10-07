import Link from 'next/link';
import { currentAccount, getHostProfile } from '@/lib/accounts';
import { sql } from '@/lib/db';
import { HostForm } from '@/components/account/HostForm';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Organizer profile', robots: { index: false } };

export default async function HostPage() {
  const account = (await currentAccount())!;
  const profile = await getHostProfile(account.id);

  // Events already in the database under this organizer, so a host who
  // claims their page sees their own history rather than a blank slate.
  const events = profile?.organizer_id
    ? await sql<{ slug: string; name: string; starts_on: string; status: string }[]>`
        select slug, name, starts_on::text, status from events
         where organizer_id = ${profile.organizer_id}
         order by starts_on desc limit 20
      `
    : [];

  return (
    <div className="grid max-w-3xl gap-8">
      {!profile && (
        <div className="panel p-5">
          <h2 className="t-head text-lg">Run events?</h2>
          <p className="mt-2 text-sm leading-relaxed text-[color:var(--muted)]">
            Same login, second hat. Fill this in and your events carry your name
            and contact details, so players know who they are entering with.
            Listing on COMPETE is free, and registration stays wherever you
            already run it.
          </p>
          <p className="mt-3 text-sm leading-relaxed text-[color:var(--muted)]">
            Submitting your own events comes in the next phase. For now this
            profile is how we match you to the events already listed under your
            email.
          </p>
        </div>
      )}

      <HostForm profile={profile} accountEmail={account.email} />

      {events.length > 0 && (
        <section>
          <h2 className="list-head">
            Listed under you <span>{events.length}</span>
          </h2>
          <ul className="mt-4 grid gap-2">
            {events.map((event) => (
              <li key={event.slug}>
                <Link
                  href={`/events/${event.slug}`}
                  className="flex items-baseline justify-between gap-4 rounded-[10px] border-2 border-[color:var(--line)] bg-[color:var(--surface)] px-4 py-3 hover:border-[color:var(--line-strong)]"
                >
                  <span className="min-w-0 truncate text-sm font-semibold">{event.name}</span>
                  <span className="t-mono shrink-0 text-[11px] uppercase tracking-[0.08em] text-[color:var(--faint)]">
                    {event.starts_on}
                    {event.status !== 'approved' && ` · ${event.status}`}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
