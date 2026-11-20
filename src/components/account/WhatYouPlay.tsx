'use client';

import { useState } from 'react';
import type {
  PreferenceDivision,
  PreferenceFormat,
  PreferenceSport,
  RefRow,
} from '@/lib/ref-data';

/**
 * "What you play", sport by sport. Tom, 15 Nov 2026.
 *
 * Sports come in three groups: Live (volleyball), Next (pickleball) and
 * Coming soon (A–Z). Ticking a live or next sport opens its own section with
 * that sport's surfaces, formats and divisions; a coming-soon sport opens
 * nothing — the tick itself is the data, and it is how COMPETE learns which
 * sport to add next.
 *
 * Everything is held in state, and a choice is only SENT when it is on the
 * screen. So unticking a sport by accident and ticking it again loses
 * nothing, while saving with it unticked drops its answers. The same rule
 * makes gender work: Male hides women's formats and Female hides men's, and
 * a hidden format is simply not sent.
 */

const GENDER_ORDER: PreferenceFormat['gender'][] = ['mens', 'womens', 'coed', 'reverse_coed', 'open'];
const GENDER_LABEL: Record<PreferenceFormat['gender'], string> = {
  mens: "Men's",
  womens: "Women's",
  coed: 'Co-ed',
  reverse_coed: 'Reverse co-ed',
  open: 'Open to all',
};

export interface WhatYouPlayProps {
  sports: PreferenceSport[];
  surfaces: RefRow[];
  formats: PreferenceFormat[];
  divisions: PreferenceDivision[];
  selected: { sports: string[]; surfaces: string[]; formats: string[]; divisions: string[] };
  /** 'male' | 'female' | '' — from the gender buttons above. */
  gender: string;
}

export function WhatYouPlay({ sports, surfaces, formats, divisions, selected, gender }: WhatYouPlayProps) {
  const [picked, setPicked] = useState(() => ({
    sports: new Set(selected.sports),
    surfaces: new Set(selected.surfaces),
    formats: new Set(selected.formats),
    divisions: new Set(selected.divisions),
  }));

  function toggle(kind: keyof typeof picked, id: string) {
    setPicked((prev) => {
      const next = new Set(prev[kind]);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return { ...prev, [kind]: next };
    });
  }

  const hiddenGender = gender === 'male' ? 'womens' : gender === 'female' ? 'mens' : null;
  const live = sports.filter((s) => s.launch_status === 'live');
  const next = sports.filter((s) => s.launch_status === 'next');
  const soon = sports
    .filter((s) => s.launch_status === 'coming_soon')
    .sort((a, b) => a.name.localeCompare(b.name));
  const opened = [...live, ...next].filter((s) => picked.sports.has(s.id));

  // Saved formats the current gender hides — they go on save, so say so.
  const willDrop = formats.filter(
    (f) => hiddenGender && f.gender === hiddenGender && picked.formats.has(f.id) &&
      opened.some((s) => s.slug === f.sport_slug),
  );

  const sportChip = (sport: PreferenceSport) => (
    <label key={sport.id} className="toggle-chip">
      <input
        type="checkbox"
        name="pref_sports"
        value={sport.id}
        checked={picked.sports.has(sport.id)}
        onChange={() => toggle('sports', sport.id)}
        className="sr-only"
      />
      <span>{sport.name}</span>
    </label>
  );

  return (
    <section className="panel p-5">
      <h2 className="t-head text-lg">What you play</h2>
      <p className="mt-2 text-sm leading-relaxed text-[color:var(--muted)]">
        Volleyball is live. Pickleball is next. Other sports are coming
        soon — tick the ones you play and we add them by demand. Everything
        here is optional, and it only ever narrows what we show you.
      </p>

      <div className="mt-5 grid gap-4">
        {live.length > 0 && (
          <SportGroup label="Live now">{live.map(sportChip)}</SportGroup>
        )}
        {next.length > 0 && (
          <SportGroup label="Next up">{next.map(sportChip)}</SportGroup>
        )}
        {soon.length > 0 && (
          <SportGroup label="Coming soon — tick to tell us you play">
            {soon.map(sportChip)}
          </SportGroup>
        )}
      </div>

      {opened.map((sport) => {
        const sportSurfaces = surfaces.filter((r) => r.sport_slug === sport.slug);
        const sportFormats = formats.filter(
          (r) => r.sport_slug === sport.slug && r.gender !== hiddenGender,
        );
        const sportDivisions = divisions.filter((r) => r.sport_slug === sport.slug);
        const empty = !sportSurfaces.length && !sportFormats.length && !sportDivisions.length;

        return (
          <div
            key={sport.id}
            className="mt-6 rounded-2xl border p-4"
            style={{ borderColor: 'var(--line-strong)' }}
          >
            <h3 className="t-head text-base">{sport.name}</h3>
            {empty ? (
              <p className="mt-2 text-sm text-[color:var(--muted)]">
                {sport.name} questions are on their way. Ticking it already
                tells us you play.
              </p>
            ) : (
              <>
                <ChipGroup
                  label="Where you play"
                  name="pref_surfaces"
                  rows={sportSurfaces}
                  picked={picked.surfaces}
                  onToggle={(id) => toggle('surfaces', id)}
                />

                {sportFormats.length > 0 && (
                  <fieldset className="mt-5">
                    <legend className="label">Formats you play</legend>
                    <div className="grid gap-3">
                      {GENDER_ORDER.filter((g) => sportFormats.some((f) => f.gender === g)).map((g) => (
                        <div key={g}>
                          <p className="t-mono mb-1.5 text-[10px] uppercase tracking-[0.15em] text-[color:var(--faint)]">
                            {GENDER_LABEL[g]}
                          </p>
                          <div className="flex flex-wrap gap-2">
                            {sportFormats
                              .filter((f) => f.gender === g)
                              .map((f) => (
                                <Chip
                                  key={f.id}
                                  name="pref_formats"
                                  row={f}
                                  on={picked.formats.has(f.id)}
                                  onToggle={() => toggle('formats', f.id)}
                                />
                              ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  </fieldset>
                )}

                <ChipGroup
                  label="Your level"
                  name="pref_divisions"
                  rows={sportDivisions}
                  picked={picked.divisions}
                  onToggle={(id) => toggle('divisions', id)}
                  describe={(r) => (r as PreferenceDivision).descriptor}
                />
              </>
            )}
          </div>
        );
      })}

      {willDrop.length > 0 && (
        <p className="panel tone-warn mt-4 p-3 text-xs leading-relaxed">
          {willDrop.length === 1 ? 'One format you picked before is' : `${willDrop.length} formats you picked before are`}{' '}
          hidden because of the gender above, and will be removed when you
          save: {willDrop.map((f) => f.name).join(', ')}.
        </p>
      )}
    </section>
  );
}

function SportGroup({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <fieldset>
      <legend className="t-mono mb-1.5 text-[10px] uppercase tracking-[0.15em] text-[color:var(--faint)]">
        {label}
      </legend>
      <div className="flex flex-wrap gap-2">{children}</div>
    </fieldset>
  );
}

function ChipGroup({
  label,
  name,
  rows,
  picked,
  onToggle,
  describe,
}: {
  label: string;
  name: string;
  rows: RefRow[];
  picked: Set<string>;
  onToggle: (id: string) => void;
  describe?: (row: RefRow) => string | null;
}) {
  if (!rows.length) return null;
  return (
    <fieldset className="mt-5">
      <legend className="label">{label}</legend>
      <div className="flex flex-wrap gap-2">
        {rows.map((row) => (
          <Chip
            key={row.id}
            name={name}
            row={row}
            on={picked.has(row.id)}
            onToggle={() => onToggle(row.id)}
            note={describe?.(row) ?? null}
          />
        ))}
      </div>
    </fieldset>
  );
}

function Chip({
  name,
  row,
  on,
  onToggle,
  note,
}: {
  name: string;
  row: RefRow;
  on: boolean;
  onToggle: () => void;
  note?: string | null;
}) {
  return (
    <label className="toggle-chip">
      <input
        type="checkbox"
        name={name}
        value={row.id}
        checked={on}
        onChange={onToggle}
        className="sr-only"
      />
      <span>
        {row.name}
        {note ? <span className="ml-1.5 normal-case tracking-normal opacity-75">· {note}</span> : null}
      </span>
    </label>
  );
}
