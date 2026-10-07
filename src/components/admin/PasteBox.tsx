'use client';

import { useState } from 'react';
import { parseListing, type ParsedListing } from '@/lib/parse-listing';

/**
 * Paste-and-parse.
 *
 * Drop the raw text of a Facebook post, flyer or organizer email in here,
 * and the recognisable fields are filled in below for review. Parsing runs
 * in the browser — no upload, no API key, no waiting.
 */
export function PasteBox({
  onParsed,
}: {
  onParsed: (fields: ParsedListing, filled: string[]) => void;
}) {
  const [text, setText] = useState('');
  const [result, setResult] = useState<{ found: string[]; missing: string[] } | null>(null);
  const [open, setOpen] = useState(true);

  const run = () => {
    if (!text.trim()) return;
    const parsed = parseListing(text);
    onParsed(parsed.fields, parsed.filled);
    setResult({ found: parsed.found, missing: parsed.missing });
  };

  const clear = () => {
    setText('');
    setResult(null);
  };

  return (
    <section className="panel border-[color:var(--surf-ink)] p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="t-kicker text-[color:var(--surf-ink)]">Paste a post</h2>
          <p className="mt-1.5 text-sm leading-relaxed text-[color:var(--muted)]">
            Copy a Facebook post, flyer or email and paste the whole thing
            here. The fields below get filled in for you to check.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="t-mono shrink-0 text-[11px] uppercase tracking-wider text-[color:var(--faint)] hover:text-[color:var(--surf-ink)]"
          aria-expanded={open}
        >
          {open ? 'Hide' : 'Show'}
        </button>
      </div>

      {open && (
        <>
          <label htmlFor="paste" className="sr-only">
            Event announcement text
          </label>
          <textarea
            id="paste"
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={8}
            placeholder={
              'SAND SLAM SUMMER SERIES #4\n' +
              'Saturday, June 14th\n' +
              'North Avenue Beach, Chicago, IL 60611\n' +
              "Men's Doubles, Women's Doubles & Coed Quads\n" +
              'Divisions: AA / A / BB\n' +
              'Entry: $45 per player'
            }
            className="field mt-4 font-mono text-[13px] leading-relaxed"
            spellCheck={false}
          />

          <div className="mt-3 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={run}
              disabled={!text.trim()}
              className="btn-primary disabled:cursor-not-allowed disabled:opacity-40"
            >
              Read it and fill the form
            </button>
            {(text || result) && (
              <button type="button" onClick={clear} className="btn-ghost">
                Clear
              </button>
            )}
          </div>

          {result && (
            <div
              role="status"
              className="mt-4 grid gap-3 border-t-2 border-[color:var(--line)] pt-4 sm:grid-cols-2"
            >
              <div>
                <p className="t-kicker text-[color:var(--surf-ink)]">
                  Filled in ({result.found.length})
                </p>
                <ul className="mt-2 space-y-1">
                  {result.found.map((f) => (
                    <li key={f} className="t-mono text-[11px] leading-relaxed text-[color:var(--muted)]">
                      {f}
                    </li>
                  ))}
                  {!result.found.length && (
                    <li className="t-mono text-[11px] text-[color:var(--faint)]">
                      Nothing recognised — type it in below.
                    </li>
                  )}
                </ul>
              </div>
              <div>
                <p className="t-kicker text-[color:var(--coral-ink)]">
                  Still needs you ({result.missing.length})
                </p>
                <ul className="mt-2 space-y-1">
                  {result.missing.map((f) => (
                    <li key={f} className="t-mono text-[11px] leading-relaxed text-[color:var(--muted)]">
                      {f}
                    </li>
                  ))}
                  {!result.missing.length && (
                    <li className="t-mono text-[11px] text-[color:var(--faint)]">
                      Everything found. Check it over and save.
                    </li>
                  )}
                </ul>
              </div>
              <p className="t-mono sm:col-span-2 text-[10px] leading-relaxed text-[color:var(--faint)]">
                Highlighted fields below came from the paste. Nothing is saved
                until you press the save button.
              </p>
            </div>
          )}
        </>
      )}
    </section>
  );
}
