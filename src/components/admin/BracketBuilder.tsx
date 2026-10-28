'use client';

import { useState } from 'react';

/**
 * Building an event's brackets one at a time.
 *
 * The form this replaces took Surface, Format and Division as three
 * independent checkbox groups and left the combinations implied. That is
 * the same shape as the 2022-24 import sheets, and it has the same flaw:
 * "Men's, Women's / Doubles / Open, A, BB" could be six brackets or three,
 * and nothing in the data says which. The backfill in 004 had to guess by
 * cross product, which is why all 2,574 rows there carry confirmed = false.
 *
 * Tom hit this entering a real event on 17 Oct: "The current system doesn't
 * allow for enough customization."
 *
 * So brackets are built one group at a time. One gender, one format, and
 * however many divisions that bracket actually runs — then "add another".
 * Gender and format are single-choice and divisions are multi-choice, and
 * that asymmetry is the whole design: it is how organizers announce events
 * ("women's doubles, Open A and BB"), and never as a matrix.
 *
 * Every bracket built here is confirmed = true, because somebody stated it.
 */

export interface FormatOption {
  slug: string;
  name: string;
  gender: string;
  team_size: number | null;
  is_active: boolean;
}

export interface SubFormatOption {
  slug: string;
  name: string;
  registers_as: 'individual' | 'partner';
  requires_surface: string | null;
  requires_gender: string | null;
}

export interface DivisionOption {
  slug: string;
  name: string;
}

/**
 * One gender + one format + an optional sub-format + the divisions that
 * bracket runs. Gender rides on the format row; sub-format is Blind Draw,
 * KOB or QOB and is null for most brackets.
 */
export interface BracketGroup {
  /** Exactly one surface. Null only on legacy rows whose source never said. */
  surface?: string | null;
  format: string;
  subFormat?: string | null;
  divisions: string[];
}

const GENDER_NAMES: Record<string, string> = {
  mens: "Men's",
  womens: "Women's",
  coed: 'Co-ed',
  reverse_coed: 'Reverse Co-ed',
  open: 'Open',
};

// Tom's vocabulary, with the v-notation he confirmed on 17 Oct. Falls back
// to the format's own name for anything without a team size — Blind Draw is
// a registration style, not a headcount.
const SIZE_NAMES: Record<number, string> = {
  2: 'Doubles (2v2)',
  3: 'Triples (3v3)',
  4: 'Quads (4v4)',
  6: 'Sixes (6v6)',
};

const sizeLabel = (f: FormatOption): string =>
  (f.team_size !== null && SIZE_NAMES[f.team_size]) || f.name;

export function BracketBuilder({
  formats,
  subFormats,
  divisions,
  surfaces,
  groups,
  onChange,
  error,
}: {
  formats: FormatOption[];
  subFormats: SubFormatOption[];
  divisions: DivisionOption[];
  /** Every surface this sport has. One is chosen per bracket. */
  surfaces: DivisionOption[];
  groups: BracketGroup[];
  onChange: (next: BracketGroup[]) => void;
  error?: string;
}) {
  const [surface, setSurface] = useState<string>('');
  const [gender, setGender] = useState<string>('');
  const [format, setFormat] = useState<string>('');
  const [subFormat, setSubFormat] = useState<string | null>(null);
  const [picked, setPicked] = useState<string[]>([]);
  const [editing, setEditing] = useState<number | null>(null);

  const bySlug = (slug: string) => formats.find((f) => f.slug === slug);
  const divName = (slug: string) => divisions.find((d) => d.slug === slug)?.name ?? slug;

  // A retired format (012 retired blind-draw and king-queen-of-the-beach)
  // stays visible when a bracket already uses it, so an old event remains
  // editable, but is never offered for something new.
  const usedSlugs = new Set(groups.map((g) => g.format));
  const offerable = formats.filter((f) => f.is_active || usedSlugs.has(f.slug));

  // Genders come from the formats actually present, never a hardcoded
  // list, so a sport without Reverse Co-ed is never offered it.
  const genders = [...new Set(offerable.map((f) => f.gender))];
  const activeGender = gender || genders[0] || '';

  const forGender = offerable.filter((f) => f.gender === activeGender);

  // Visibility as data, read from sub_formats.requires_* rather than
  // hardcoded here: KOB needs sand and Men's, QOB needs sand and Women's,
  // both blind draws are always available. A new sub-format is a row.
  const forContext = subFormats.filter(
    (sf) =>
      (sf.requires_surface === null || sf.requires_surface === surface) &&
      (sf.requires_gender === null || sf.requires_gender === activeGender),
  );

  const chooseGender = (g: string) => {
    setGender(g);
    setFormat('');
    setSubFormat(null);
  };

  const toggleDivision = (slug: string) =>
    setPicked((prev) =>
      prev.includes(slug) ? prev.filter((s) => s !== slug) : [...prev, slug],
    );

  // Surface is deliberately NOT cleared between brackets. Most events run
  // every bracket on one surface, so keeping the last choice makes the
  // common case one click and the mixed case two.
  const reset = () => {
    setFormat('');
    setSubFormat(null);
    setPicked([]);
    setEditing(null);
  };

  const addGroup = () => {
    if (!format) return;
    // A sub-format no longer offered in this context (gender changed after
    // it was picked) must not be saved: it would record a Queen of the
    // Beach men's bracket.
    const keptSub = forContext.some((sf) => sf.slug === subFormat) ? subFormat : null;
    const group: BracketGroup = {
      surface: surface || null,
      format,
      subFormat: keptSub,
      divisions: picked,
    };

    if (editing !== null) {
      onChange(groups.map((g, i) => (i === editing ? group : g)));
    } else {
      // The same format AND the same sub-format means the organizer is
      // adding divisions to a bracket already listed, not creating a
      // duplicate — so merge. Men's Doubles and Men's Doubles Blind Draw
      // are different brackets and stay separate.
      const existing = groups.findIndex(
        (g) =>
          (g.surface ?? null) === (surface || null) &&
          g.format === format &&
          (g.subFormat ?? null) === keptSub,
      );
      if (existing >= 0) {
        onChange(
          groups.map((g, i) =>
            i === existing
              ? {
                  surface: surface || null,
                  format,
                  subFormat: keptSub,
                  divisions: [...new Set([...g.divisions, ...picked])],
                }
              : g,
          ),
        );
      } else {
        onChange([...groups, group]);
      }
    }
    reset();
  };

  const editGroup = (i: number) => {
    const g = groups[i];
    const f = bySlug(g.format);
    setSurface(g.surface ?? '');
    if (f) setGender(f.gender);
    setFormat(g.format);
    setSubFormat(g.subFormat ?? null);
    setPicked(g.divisions);
    setEditing(i);
  };

  const removeGroup = (i: number) => {
    onChange(groups.filter((_, j) => j !== i));
    if (editing === i) reset();
  };

  // A bracket with no division stated is one bracket, not zero. Null
  // division means "the organizer did not say", which is a legitimate and
  // honest answer — the same rule the 2022 import follows.
  const countFor = (g: BracketGroup) => Math.max(g.divisions.length, 1);
  const total = groups.reduce((n, g) => n + countFor(g), 0);

  return (
    <fieldset className="sm:col-span-2">
      <legend className="label">Brackets</legend>
      <p className="t-mono mb-3 text-[10px] uppercase tracking-wider text-[color:var(--faint)]">
        One gender, one format, the divisions it runs — then add another
      </p>

      <div className="panel p-4">
        <Row label="Surface">
          {surfaces.map((s) => (
            <Chip
              key={s.slug}
              on={surface === s.slug}
              tone="beach"
              // Single-select on purpose. One bracket is played on one
              // surface, and the old four-ticks-no-warning case is what
              // Tom hit on 21 October.
              onClick={() => setSurface(surface === s.slug ? '' : s.slug)}
            >
              {s.name}
            </Chip>
          ))}
        </Row>

        <Row label="Gender">
          {genders.map((g) => (
            <Chip
              key={g}
              on={activeGender === g}
              tone="grass"
              onClick={() => chooseGender(g)}
            >
              {GENDER_NAMES[g] ?? g}
            </Chip>
          ))}
        </Row>

        <Row label="Format">
          {forGender.length === 0 && (
            <span className="text-xs text-[color:var(--faint)]">
              No formats for this gender.
            </span>
          )}
          {forGender.map((f) => (
            <Chip
              key={f.slug}
              on={format === f.slug}
              tone="grass"
              onClick={() => setFormat(f.slug)}
            >
              {sizeLabel(f)}
            </Chip>
          ))}
        </Row>

        {forContext.length > 0 && (
          <Row label="Sub-format">
            {forContext.map((sf) => (
              <Chip
                key={sf.slug}
                on={subFormat === sf.slug}
                tone="indoor"
                // Clicking the chosen one clears it. Sub-format is
                // optional and most brackets have none, so getting back to
                // none must be as easy as getting to one.
                onClick={() => setSubFormat(subFormat === sf.slug ? null : sf.slug)}
              >
                {sf.name}
              </Chip>
            ))}
            <span className="t-mono self-center pl-1 text-[10px] uppercase tracking-wider text-[color:var(--faint)]">
              optional
            </span>
          </Row>
        )}

        <Row label="Divisions">
          {divisions.map((d) => (
            <Chip
              key={d.slug}
              on={picked.includes(d.slug)}
              tone="beach"
              onClick={() => toggleDivision(d.slug)}
            >
              {d.name}
            </Chip>
          ))}
        </Row>

        <div className="mt-4 flex flex-wrap items-center justify-between gap-2">
          <span className="t-mono text-[10px] uppercase tracking-wider text-[color:var(--faint)]">
            {picked.length === 0
              ? 'No division chosen — records the bracket without one'
              : `${picked.length} division${picked.length === 1 ? '' : 's'}`}
          </span>
          <div className="flex gap-2">
            {editing !== null && (
              <button type="button" onClick={reset} className="btn-ghost !py-1.5 !text-xs">
                Cancel
              </button>
            )}
            <button
              type="button"
              onClick={addGroup}
              disabled={!format}
              className="btn-primary !py-1.5 !text-xs disabled:opacity-40"
            >
              {editing !== null ? 'Update this bracket' : 'Add this bracket'}
            </button>
          </div>
        </div>
      </div>

      {groups.length > 0 && (
        <div className="panel mt-3 p-4">
          <div className="flex items-baseline justify-between">
            <span className="t-mono text-[10px] uppercase tracking-wider text-[color:var(--faint)]">
              Added so far
            </span>
            <span className="t-head text-sm text-[color:var(--indoor)]">
              {total} bracket{total === 1 ? '' : 's'}
            </span>
          </div>

          <ul className="mt-3 grid gap-2">
            {groups.map((g, i) => {
              const f = bySlug(g.format);
              return (
                <li
                  key={`${g.format}-${i}`}
                  className={`flex flex-wrap items-center justify-between gap-2 border-l-2 pl-3 ${
                    editing === i
                      ? 'border-[color:var(--surf-ink)]'
                      : 'border-[color:var(--line)]'
                  }`}
                >
                  <span className="text-sm">
                    {g.surface && (
                      <span className="text-[color:var(--beach)]">
                        {surfaces.find((s) => s.slug === g.surface)?.name ?? g.surface}
                        {' · '}
                      </span>
                    )}
                    {f ? `${GENDER_NAMES[f.gender] ?? f.gender} · ${sizeLabel(f)}` : g.format}
                    {g.subFormat && (
                      <span className="text-[color:var(--indoor)]">
                        {' · '}
                        {subFormats.find((sf) => sf.slug === g.subFormat)?.name ?? g.subFormat}
                      </span>
                    )}
                    {g.divisions.length > 0 && (
                      <span className="text-[color:var(--muted)]">
                        {' · '}
                        {g.divisions.map(divName).join(', ')}
                      </span>
                    )}
                    {g.divisions.length === 0 && (
                      <span className="text-[color:var(--faint)]"> · no division stated</span>
                    )}
                  </span>
                  <span className="flex shrink-0 items-center gap-3">
                    <span className="t-mono text-[10px] text-[color:var(--faint)]">
                      {countFor(g)}
                    </span>
                    <button
                      type="button"
                      onClick={() => editGroup(i)}
                      className="t-mono text-[10px] uppercase tracking-wider text-[color:var(--faint)] hover:text-[color:var(--surf-ink)]"
                    >
                      Edit
                    </button>
                    <button
                      type="button"
                      onClick={() => removeGroup(i)}
                      aria-label="Remove this bracket"
                      className="t-mono text-[10px] text-[color:var(--faint)] hover:text-[color:var(--coral-ink)]"
                    >
                      ✕
                    </button>
                  </span>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      <input type="hidden" name="brackets" value={JSON.stringify(groups)} />

      {error && (
        <p className="t-mono mt-2 text-[10px] uppercase tracking-wider text-[color:var(--coral-ink)]">
          {error}
        </p>
      )}
    </fieldset>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="mb-3 grid gap-1.5 sm:grid-cols-[84px_1fr] sm:items-start sm:gap-3">
      <span className="t-mono pt-1 text-[10px] uppercase tracking-wider text-[color:var(--faint)]">
        {label}
      </span>
      <div className="flex flex-wrap gap-1.5">{children}</div>
    </div>
  );
}

function Chip({
  on,
  tone,
  onClick,
  children,
}: {
  on: boolean;
  tone: 'grass' | 'beach' | 'indoor';
  onClick: () => void;
  children: React.ReactNode;
}) {
  const colour =
    tone === 'grass' ? 'var(--grass)' : tone === 'beach' ? 'var(--beach)' : 'var(--indoor)';
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={on}
      className="rounded-md border px-2.5 py-1 text-xs transition-colors"
      style={
        on
          ? { borderColor: colour, color: colour }
          : { borderColor: 'var(--line)', color: 'var(--muted)' }
      }
    >
      {children}
    </button>
  );
}
