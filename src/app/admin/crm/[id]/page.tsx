import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { isSignedIn } from '@/lib/auth';
import { getProspect } from '@/lib/crm';
import { ProspectForm } from '@/components/admin/ProspectForm';
import { LogTouch } from '@/components/admin/LogTouch';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Partner', robots: { index: false, follow: false } };

const KIND_LABEL: Record<string, string> = {
  call: 'Call', email: 'Email', text: 'Text', meeting: 'Meeting', note: 'Note',
};

export default async function ProspectPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  if (!(await isSignedIn())) redirect('/admin');

  const { id } = await params;
  const found = await getProspect(id);
  if (!found) notFound();

  const { prospect: p, interactions } = found;

  return (
    <div className="wrap py-8">
      <Link href="/admin/crm" className="t-kicker text-[color:var(--muted)] hover:text-[color:var(--surf-ink)]">
        ← All partners
      </Link>

      <div className="mt-3 flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0">
          <h1 className="t-display text-2xl sm:text-3xl">{p.name}</h1>
          <p className="t-mono mt-1 text-[11px] uppercase tracking-[0.15em] text-[color:var(--faint)]">
            {[p.city, p.state].filter(Boolean).join(', ') || 'No location recorded'}
            {p.source_file && <> · from {p.source_file}</>}
          </p>
        </div>
        <Provenance verifiedAt={p.verified_at} confidence={p.confidence} sourceUrl={p.source_url} />
      </div>

      <div className="mt-8 grid gap-8 lg:grid-cols-[minmax(0,1fr)_400px]">
        <ProspectForm row={p} />

        <aside className="grid gap-5">
          <LogTouch prospectId={id} />

          <section className="panel p-5">
            <h2 className="t-head text-lg">
              History{interactions.length > 0 && (
                <span className="t-mono ml-2 text-[11px] font-normal text-[color:var(--faint)]">
                  {interactions.length}
                </span>
              )}
            </h2>

            {interactions.length === 0 ? (
              <p className="mt-3 text-sm text-[color:var(--muted)]">
                Nothing logged yet. The first call goes here.
              </p>
            ) : (
              <ol className="mt-4 grid gap-4">
                {interactions.map((i) => (
                  <li key={i.id} className="border-l-2 border-[color:var(--line)] pl-3">
                    <div className="flex flex-wrap items-baseline gap-2">
                      <span className="t-mono text-[10px] font-bold uppercase tracking-[0.14em] text-[color:var(--surf-ink)]">
                        {KIND_LABEL[i.kind] ?? i.kind}
                      </span>
                      <span className="t-mono text-[11px] text-[color:var(--faint)]">
                        {i.occurred_on}
                      </span>
                    </div>
                    {i.outcome && (
                      <p className="mt-1 text-[13px] font-semibold text-[color:var(--ink)]">
                        {i.outcome}
                      </p>
                    )}
                    <p className="mt-1 whitespace-pre-wrap text-[13px] leading-relaxed text-[color:var(--muted)]">
                      {i.body}
                    </p>
                  </li>
                ))}
              </ol>
            )}
          </section>
        </aside>
      </div>
    </div>
  );
}

/**
 * Where this record's claims came from, shown before the form rather than
 * buried in it. Research and personal verification are different kinds of
 * fact and the difference decides whether the number is worth dialling.
 */
function Provenance({
  verifiedAt, confidence, sourceUrl,
}: {
  verifiedAt: string | null; confidence: string | null; sourceUrl: string | null;
}) {
  return (
    <div className="shrink-0 text-right">
      {verifiedAt ? (
        <p className="t-mono text-[11px] uppercase tracking-wider text-[color:var(--grass)]">
          ✓ You verified this
          <span className="block text-[color:var(--faint)]">{verifiedAt.slice(0, 10)}</span>
        </p>
      ) : (
        <p className="t-mono text-[11px] uppercase tracking-wider text-[color:var(--faint)]">
          Researched, not checked by hand
          <span className="block">confidence: {confidence ?? 'unknown'}</span>
        </p>
      )}
      {sourceUrl && (
        <a
          href={sourceUrl} target="_blank" rel="noopener noreferrer"
          className="t-mono mt-1 inline-block max-w-[260px] truncate text-[11px] text-[color:var(--indoor)] underline"
        >
          source ↗
        </a>
      )}
    </div>
  );
}
