/**
 * Shared shell for the privacy policy and terms.
 *
 * Long-form legal text is the one place on this site where readability beats
 * personality: a single measured column, generous line height, real headings
 * you can link to. The bright palette stays out of it entirely.
 */
export function LegalPage({
  kicker,
  title,
  effective,
  intro,
  children,
}: {
  kicker: string;
  title: string;
  effective: string;
  intro: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <>
      <div className="band-aqua border-b-2 border-[color:var(--line)]">
        <div className="wrap py-10">
          <p className="t-kicker text-[color:var(--surf-ink)]">{kicker}</p>
          <h1 className="t-display mt-3 text-3xl sm:text-4xl">{title}</h1>
          <p className="t-mono mt-3 text-[11px] uppercase tracking-[0.12em] text-[color:var(--faint)]">
            Effective {effective}
          </p>
        </div>
      </div>

      <div className="wrap max-w-2xl py-10">
        <div className="text-base leading-relaxed text-[color:var(--muted)]">{intro}</div>
        <div className="mt-8 grid gap-8">{children}</div>
      </div>
    </>
  );
}

export function Clause({
  id,
  heading,
  children,
}: {
  id: string;
  heading: string;
  children: React.ReactNode;
}) {
  return (
    <section id={id} className="scroll-mt-24">
      <h2 className="t-head border-b-2 border-[color:var(--line)] pb-2 text-lg">{heading}</h2>
      <div className="mt-3 grid gap-3 text-[15px] leading-relaxed text-[color:var(--muted)]">
        {children}
      </div>
    </section>
  );
}
