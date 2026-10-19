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
}

export interface DivisionOption {
  slug: string;
  name: string;
}

/** One gender + one format + the divisions that bracket runs. */
export interface BracketGroup {
  format: string;
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
  divisions,
  groups,
  onChange,
  error,
}: {
  formats: FormatOption[];
  divisions: DivisionOption[];
  groups: BracketGroup[];
  onChange: (next: BracketGroup[]) => void;
  error?: string;
}) {
  // Genders come from the formats actually present, never a hardcoded list,
  // so a sport without Reverse Co-ed is never offered it.
  const genders = [...new Set(formats.map((f) => f.gender))];

  const [gender, setGender] = useState<string>(genders[0] ?? '');
  const [format, setFormat] = useState<string>('');
  const [picked, setPicked] = useState<string[]>([]);
  const [editing, setEditing] = useState<number | null>(null);

  const forGender = formats.filter((f) => f.gender === gender);
  const bySlug = (slug: string) => formats.find((f) => f.slug === slug);
  const divName = (slug: string) => divisions.find((d) => d.slug === slug)?.name ?? slug;

  const chooseGender = (g: string) => {
    setGender(g);
    setFormat('');
  };

  const toggleDivision = (slug: string) =>
    setPicked((prev) =>
      prev.includes(slug) ? prev.filter((s) => s !== slug) : [...prev, slug],
    );

  const reset = () => {
    setFormat('');
    setPicked([]);
    setEditing(null);
  };

  const addGroup = () => {
    if (!format) return;
    const group: BracketGroup = { format, divisions: picked };
    if (editing !== null) {
      onChange(groups.map((g, i) => (i === editing ? group : g)));
    } else {
      // Same format twice means the organizer is adding divisions to a
      // bracket already listed, not creating a duplicate. Merge them.
      const existing = groups.findIndex((g) => g.format === format);
      if (existing >= 0) {
        onChange(
          groups.map((g, i) =>
            i === existing
              ? { format, divisions: [...new Set([...g.divisions, ...picked])] }
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
    if (f) setGender(f.gender);
    setFormat(g.format);
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
        <Row label="Gender">
          {genders.map((g) => (
            <Chip
              key={g}
              on={gender === g}
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
                    {f ? `${GENDER_NAMES[f.gender] ?? f.gender} · ${sizeLabel(f)}` : g.format}
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
  tone: 'grass' | 'beach';
  onClick: () => void;
  children: React.ReactNode;
}) {
  const colour = tone === 'grass' ? 'var(--grass)' : 'var(--beach)';
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
