'use client';

import { useRef, useState, useTransition } from 'react';
import { parseListing, type ParsedListing } from '@/lib/parse-listing';
import { readFlyer } from '@/lib/read-flyer';

/**
 * Paste-and-parse, two ways.
 *
 * **Text** is parsed in the browser by regex: free, instant, no key, no
 * network. Good enough for a well-formed Facebook post.
 *
 * **An image** goes to a vision model, because most events are announced
 * as a flyer and no regex reads text set over a photograph. Costs about a
 * cent and takes a few seconds.
 *
 * Either way the rule is the same: **a field is dropped unless its source
 * can be quoted.** Every filled field shows what it was read from, so
 * checking the work is scanning a list rather than re-reading the flyer.
 * A blank box costs thirty seconds; a confidently wrong date gets
 * published and sends someone to an event that is not happening.
 */

/** The model's own resolution ceiling. Sending more pixels than this buys
 *  nothing -- they are discarded server-side -- and a full-size phone photo
 *  would blow past the server action's body limit. */
const MAX_EDGE = 1568;

async function downscale(file: File): Promise<{ base64: string; mediaType: string }> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height));
  const w = Math.max(1, Math.round(bitmap.width * scale));
  const h = Math.max(1, Math.round(bitmap.height * scale));

  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Could not read that image.');
  // White behind it, so a transparent PNG does not become black-on-black.
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, w, h);
  ctx.drawImage(bitmap, 0, 0, w, h);
  bitmap.close?.();

  const dataUrl = canvas.toDataURL('image/jpeg', 0.85);
  return { base64: dataUrl.split(',')[1] ?? '', mediaType: 'image/jpeg' };
}

interface Outcome {
  found: string[];
  missing: string[];
  quotes?: Record<string, string>;
  verified?: boolean;
  error?: string;
}

const LABELS: Record<string, string> = {
  name: 'Event name',
  starts_on: 'Start date',
  ends_on: 'End date',
  registration_deadline: 'Registration deadline',
  entry_fee: 'Entry fee',
  fee_basis: 'Fee basis',
  payout_text: 'Payout',
  event_page_url: 'Registration link',
  venue_name: 'Venue',
  address_line: 'Street address',
  city: 'City',
  state: 'State',
  postal_code: 'ZIP code',
  organizer_name: 'Organizer',
  organizer_email: 'Organizer email',
  surfaces: 'Surface',
  formats: 'Format',
  divisions: 'Divisions',
  notes: 'Notes',
};

export function PasteBox({
  onParsed,
  sport = 'volleyball',
}: {
  onParsed: (fields: ParsedListing, filled: string[]) => void;
  sport?: string;
}) {
  const [text, setText] = useState('');
  const [image, setImage] = useState<{ file: File; preview: string } | null>(null);
  const [result, setResult] = useState<Outcome | null>(null);
  const [open, setOpen] = useState(true);
  const [dragging, setDragging] = useState(false);
  const [pending, start] = useTransition();
  const fileInput = useRef<HTMLInputElement>(null);

  function takeFile(file: File | null | undefined) {
    if (!file || !file.type.startsWith('image/')) return;
    setImage({ file, preview: URL.createObjectURL(file) });
    setResult(null);
  }

  /** A pasted image beats pasted text: if the clipboard holds both, the
   *  image is what the person meant. */
  function onPaste(e: React.ClipboardEvent) {
    const item = Array.from(e.clipboardData.items).find((i) => i.type.startsWith('image/'));
    if (!item) return;
    const file = item.getAsFile();
    if (!file) return;
    e.preventDefault();
    takeFile(file);
  }

  function readText() {
    if (!text.trim()) return;
    const parsed = parseListing(text);
    onParsed(parsed.fields, parsed.filled);
    setResult({ found: parsed.found, missing: parsed.missing, verified: true });
  }

  function readImage() {
    if (!image) return;
    start(async () => {
      try {
        const { base64, mediaType } = await downscale(image.file);
        const res = await readFlyer({
          imageBase64: base64,
          imageMediaType: mediaType,
          text: text.trim() || undefined,
          sport,
        });
        if (!res.ok) {
          setResult({ found: [], missing: [], error: res.message });
          return;
        }
        onParsed(res.fields ?? { surfaces: [], formats: [], divisions: [] }, res.filled ?? []);
        setResult({
          found: res.found ?? [],
          missing: res.missing ?? [],
          quotes: res.quotes,
          verified: res.verified,
        });
      } catch (err) {
        setResult({
          found: [],
          missing: [],
          error: err instanceof Error ? err.message : 'Could not read that image.',
        });
      }
    });
  }

  function clear() {
    if (image) URL.revokeObjectURL(image.preview);
    setText('');
    setImage(null);
    setResult(null);
    if (fileInput.current) fileInput.current.value = '';
  }

  return (
    <section className="panel border-[color:var(--surf-ink)] p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="t-kicker text-[color:var(--surf-ink)]">Paste a post or a flyer</h2>
          <p className="mt-1.5 text-sm leading-relaxed text-[color:var(--muted)]">
            Paste the text of a post, or drop in a flyer image and it gets read
            for you. Either way the fields below are filled in for you to check.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setOpen((s) => !s)}
          className="t-mono shrink-0 text-[11px] uppercase tracking-wider text-[color:var(--faint)] hover:text-[color:var(--surf-ink)]"
          aria-expanded={open}
        >
          {open ? 'Hide' : 'Show'}
        </button>
      </div>

      {open && (
        <>
          {/* ---- image ---- */}
          <div
            onDragOver={(e) => {
              e.preventDefault();
              setDragging(true);
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragging(false);
              takeFile(e.dataTransfer.files?.[0]);
            }}
            className="mt-4 rounded-2xl border-2 border-dashed p-4 transition-colors"
            style={{
              borderColor: dragging ? 'var(--grass)' : 'var(--line)',
              background: dragging ? 'color-mix(in srgb, var(--grass) 8%, transparent)' : 'transparent',
            }}
          >
            {image ? (
              <div className="flex flex-wrap items-start gap-4">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={image.preview}
                  alt="The flyer you added"
                  className="max-h-48 rounded-lg border border-[color:var(--line)]"
                />
                <div className="min-w-0">
                  <p className="t-head text-sm">{image.file.name}</p>
                  <p className="mt-1 text-xs text-[color:var(--muted)]">
                    {(image.file.size / 1024).toFixed(0)} KB · resized before sending
                  </p>
                  <button
                    type="button"
                    onClick={() => {
                      URL.revokeObjectURL(image.preview);
                      setImage(null);
                      if (fileInput.current) fileInput.current.value = '';
                    }}
                    className="btn-ghost mt-2 !py-1.5 !text-xs"
                  >
                    Remove image
                  </button>
                </div>
              </div>
            ) : (
              <div className="text-center">
                <p className="text-sm text-[color:var(--muted)]">
                  Drop a flyer here, or paste one into the box below
                </p>
                <button
                  type="button"
                  onClick={() => fileInput.current?.click()}
                  className="btn-ghost mt-2 !py-1.5 !text-xs"
                >
                  Choose a file
                </button>
              </div>
            )}
            <input
              ref={fileInput}
              type="file"
              accept="image/png,image/jpeg,image/gif,image/webp"
              className="sr-only"
              onChange={(e) => takeFile(e.target.files?.[0])}
            />
          </div>

          {/* ---- text ---- */}
          <label htmlFor="paste" className="sr-only">
            Event announcement text
          </label>
          <textarea
            id="paste"
            value={text}
            onChange={(e) => setText(e.target.value)}
            onPaste={onPaste}
            rows={image ? 5 : 12}
            placeholder={
              'SAND SLAM SUMMER SERIES #4\n' +
              'Saturday, June 14th\n' +
              'North Avenue Beach, Chicago, IL 60611\n' +
              "Men's Doubles, Women's Doubles & Coed Quads\n" +
              'Divisions: AA / A / BB\n' +
              'Entry: $45 per player'
            }
            className="field-area mt-4 font-mono text-[13px] leading-relaxed"
            spellCheck={false}
          />

          <div className="mt-3 flex flex-wrap items-center gap-2">
            {image ? (
              <button
                type="button"
                onClick={readImage}
                disabled={pending}
                className="btn-primary disabled:cursor-not-allowed disabled:opacity-40"
              >
                {pending ? 'Reading the flyer…' : 'Read the flyer and fill the form'}
              </button>
            ) : (
              <button
                type="button"
                onClick={readText}
                disabled={!text.trim()}
                className="btn-primary disabled:cursor-not-allowed disabled:opacity-40"
              >
                Read it and fill the form
              </button>
            )}
            {(text || image || result) && (
              <button type="button" onClick={clear} className="btn-ghost">
                Clear
              </button>
            )}
            {image && (
              <span className="t-mono text-[10px] uppercase tracking-wider text-[color:var(--faint)]">
                about a cent · a few seconds
              </span>
            )}
          </div>

          {result?.error && (
            <p role="alert" className="panel tone-bad mt-4 p-3 text-sm">
              {result.error}
            </p>
          )}

          {result && !result.error && (
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

              {/* The whole point: what each field was read FROM. */}
              {result.quotes && Object.keys(result.quotes).length > 0 && (
                <details className="sm:col-span-2 rounded-xl border border-[color:var(--line)] p-3">
                  <summary className="t-head cursor-pointer text-xs text-[color:var(--muted)]">
                    Show what each field was read from ({Object.keys(result.quotes).length})
                  </summary>
                  <dl className="mt-3 grid gap-2">
                    {Object.entries(result.quotes).map(([k, q]) => (
                      <div key={k} className="grid gap-0.5">
                        <dt className="t-mono text-[10px] uppercase tracking-wider text-[color:var(--faint)]">
                          {LABELS[k] ?? k}
                        </dt>
                        <dd className="text-[12px] italic leading-relaxed text-[color:var(--muted)]">
                          “{q}”
                        </dd>
                      </div>
                    ))}
                  </dl>
                  <p className="t-mono mt-3 text-[10px] leading-relaxed text-[color:var(--faint)]">
                    {result.verified
                      ? 'Each quote was checked against what you pasted. Anything that did not match was thrown away.'
                      : 'These quotes come from the flyer and are shown so you can check them — they cannot be verified automatically against an image. Anything the reader could not quote was left blank rather than guessed.'}
                  </p>
                </details>
              )}

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
