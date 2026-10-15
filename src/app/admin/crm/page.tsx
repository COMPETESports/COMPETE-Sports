import Link from 'next/link';
import { redirect } from 'next/navigation';
import { isSignedIn } from '@/lib/auth';
import { listProspects, prospectStates, prospectCounts } from '@/lib/crm';
import { PAGE_SIZE, STATUSES, STATUS_LABEL, type Filters } from '@/lib/crm-fields';
import { NewProspect } from '@/components/admin/NewProspect';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Partners', robots: { index: false, follow: false } };

const STATUS_TONE: Record<string, string> = {
  prospect: 'text-[color:var(--faint)]',
  contacted: 'text-[color:var(--indoor)]',
  in_conversation: 'text-[color:var(--beach)]',
  committed: 'text-[color:var(--grass)]',
  active: 'text-[color:var(--grass)]',
  dormant: 'text-[color:var(--faint)]',
  not_a_fit: 'text-[color:var(--faint)] line-through',
};

const SPORT_CHIP: Record<string, string> = {
  volleyball: 'chip-beach',
  'volleyball?': 'chip-muted',
  pickleball: 'chip-indoor',
  both: 'chip-grass',
  unknown: 'chip-muted',
};

export default async function CrmPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  if (!(await isSignedIn())) redirect('/admin');

  const sp = await searchParams;
  const filters: Filters = {
    q: sp.q, state: sp.state, status: sp.status, sports: sp.sports,
    contactable: sp.contactable, verified: sp.verified,
    page: sp.page ? Number(sp.page) : 1,
  };

  const [{ rows, total, page, lastPage }, states, counts] = await Promise.all([
    listProspects(filters), prospectStates(), prospectCounts(),
  ]);

  const qs = (over: Record<string, string | number | undefined>) => {
    const p = new URLSearchParams();
    for (const [k, v] of Object.entries({ ...sp, ...over })) {
      if (v !== undefined && v !== '' && k !== 'page') p.set(k, String(v));
    }
    if (over.page && Number(over.page) > 1) p.set('page', String(over.page));
    const s = p.toString();
    return s ? `/admin/crm?${s}` : '/admin/crm';
  };

  return (
    <div className="wrap py-8">
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="t-kicker text-[color:var(--grass)]">Partners</p>
          <h1 className="t-display mt-1 text-2xl sm:text-3xl">Who to call</h1>
        </div>
        <NewProspect />
      </div>

      {/* Four numbers that answer "where am I" before any filtering. */}
      <div className="mb-6 grid gap-3 sm:grid-cols-4">
        <Stat n={counts.total} label="In the directory" />
        <Stat n={counts.contactable} label="Reachable" hint="has a phone or email" tone="indoor" />
        <Stat n={counts.working} label="In play" hint="past prospect" tone="beach" />
        <Stat n={counts.verified} label="You verified" tone="grass" />
      </div>

      <form method="get" action="/admin/crm" className="panel mb-5 grid gap-3 p-4 sm:grid-cols-6">
        <input
          name="q" defaultValue={sp.q ?? ''} placeholder="Name, city or notes"
          className="field sm:col-span-2" aria-label="Search"
        />
        <Select name="state" value={sp.state} label="All states"
          options={states.map((s) => [s.state, `${s.state} (${s.n})`])} />
        <Select name="status" value={sp.status} label="Any status"
          options={STATUSES.map((s) => [s, STATUS_LABEL[s]])} />
        <Select name="sports" value={sp.sports} label="Any sport"
          options={[['volleyball', 'Volleyball'], ['pickleball', 'Pickleball'], ['both', 'Both']]} />
        <Select name="contactable" value={sp.contactable} label="Reachable?"
          options={[['yes', 'Has contact'], ['no', 'No contact yet']]} />
        <div className="flex gap-2 sm:col-span-6">
          <button type="submit" className="btn-primary">Filter</button>
          <Link href="/admin/crm" className="btn-ghost">Clear</Link>
          <span className="t-mono self-center text-[11px] uppercase tracking-wider text-[color:var(--faint)]">
            {total} match{total === 1 ? '' : 'es'}
          </span>
        </div>
      </form>

      {rows.length === 0 ? (
        <p className="panel p-8 text-center text-sm text-[color:var(--muted)]">
          Nothing matches those filters.
        </p>
      ) : (
        <div className="panel overflow-x-auto">
          <table className="w-full min-w-[920px] text-sm">
            <thead>
              <tr className="border-b-2 border-[color:var(--line)] text-left">
                <Th>Organization</Th>
                <Th>Sport</Th>
                <Th>Contact</Th>
                <Th>Status</Th>
                <Th>Last touch</Th>
                <Th>Next</Th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const due = r.next_action_on && r.next_action_on <= today();
                return (
                  <tr key={r.id} className="border-b border-[color:var(--line)] align-top">
                    <td className="px-3 py-2.5">
                      <Link href={`/admin/crm/${r.id}`}
                        className="font-semibold text-[color:var(--ink)] hover:text-[color:var(--surf-ink)]">
                        {r.name}
                      </Link>
                      <div className="t-mono text-[11px] uppercase tracking-wider text-[color:var(--faint)]">
                        {[r.city, r.state].filter(Boolean).join(', ') || '—'}
                        {r.verified_at && <span className="ml-2 text-[color:var(--grass)]">✓ verified</span>}
                      </div>
                    </td>
                    <td className="px-3 py-2.5">
                      <span className={SPORT_CHIP[r.sports] ?? 'chip-muted'}>
                        {r.sports === 'volleyball?' ? 'volleyball*' : r.sports}
                      </span>
                    </td>
                    <td className="px-3 py-2.5 text-[13px] text-[color:var(--muted)]">
                      {r.phone || r.email ? (
                        <>
                          {r.phone && <div className="t-mono">{r.phone}</div>}
                          {r.email && <div className="truncate max-w-[190px]">{r.email}</div>}
                        </>
                      ) : (
                        <span className="text-[color:var(--faint)]">—</span>
                      )}
                    </td>
                    <td className={`px-3 py-2.5 t-mono text-[11px] uppercase tracking-wider ${STATUS_TONE[r.status]}`}>
                      {STATUS_LABEL[r.status] ?? r.status}
                    </td>
                    <td className="px-3 py-2.5 t-mono text-[11px] text-[color:var(--faint)]">
                      {r.days_quiet === null
                        ? 'never'
                        : r.days_quiet === 0 ? 'today' : `${r.days_quiet}d ago`}
                      {r.touches > 0 && <span className="ml-1 opacity-60">({r.touches})</span>}
                    </td>
                    <td className="px-3 py-2.5 text-[13px]">
                      {r.next_action ? (
                        <>
                          <div className={due ? 'font-semibold text-[color:var(--coral-ink)]' : 'text-[color:var(--muted)]'}>
                            {r.next_action}
                          </div>
                          {r.next_action_on && (
                            <div className="t-mono text-[11px] text-[color:var(--faint)]">
                              {r.next_action_on}{due ? ' · due' : ''}
                            </div>
                          )}
                        </>
                      ) : (
                        <span className="text-[color:var(--faint)]">—</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {lastPage > 1 && (
        <nav className="mt-6 flex items-center justify-between gap-4" aria-label="Pagination">
          {page > 1
            ? <Link href={qs({ page: page - 1 })} className="btn-ghost">← Previous</Link>
            : <span />}
          <span className="t-mono text-[11px] uppercase tracking-[0.15em] text-[color:var(--faint)]">
            Page {page} of {lastPage} · {PAGE_SIZE} a page
          </span>
          {page < lastPage
            ? <Link href={qs({ page: page + 1 })} className="btn-ghost">Next →</Link>
            : <span />}
        </nav>
      )}

      <p className="t-mono mt-8 text-[11px] uppercase tracking-[0.15em] text-[color:var(--faint)]">
        volleyball* = volleyball confirmed, pickleball never checked
      </p>
    </div>
  );
}

function today() {
  return new Date().toISOString().slice(0, 10);
}

function Th({ children }: { children: React.ReactNode }) {
  return (
    <th className="t-mono px-3 py-2 text-[10px] font-bold uppercase tracking-[0.15em] text-[color:var(--faint)]">
      {children}
    </th>
  );
}

function Stat({ n, label, hint, tone }: { n: number; label: string; hint?: string; tone?: string }) {
  const colour = tone ? `text-[color:var(--${tone})]` : 'text-[color:var(--ink)]';
  return (
    <div className="panel p-4">
      <div className={`t-head text-2xl leading-none ${colour}`}>{n.toLocaleString()}</div>
      <div className="t-mono mt-1 text-[10px] uppercase tracking-[0.12em] text-[color:var(--muted)]">{label}</div>
      {hint && <div className="mt-0.5 text-[11px] text-[color:var(--faint)]">{hint}</div>}
    </div>
  );
}

function Select({
  name, value, label, options,
}: {
  name: string; value?: string; label: string; options: Array<[string, string]>;
}) {
  return (
    <select name={name} defaultValue={value ?? ''} aria-label={label} className="field">
      <option value="">{label}</option>
      {options.map(([v, l]) => (
        <option key={v} value={v}>{l}</option>
      ))}
    </select>
  );
}
