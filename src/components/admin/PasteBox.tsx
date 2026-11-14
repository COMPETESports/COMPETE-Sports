'use client';

import { useRef, useState, useTransition } from 'react';
import { parseListing, type ParsedListing } from '@/lib/parse-listing';
import { readFlyer } from '@/lib/read-flyer';
import { FIELD_LABELS as LABELS } from '@/lib/field-labels';

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

/** Most images per read. Matches MAX_IMAGES in read-flyer.ts. */
const MAX_IMAGES = 5;

/**
 * Everything sent in one read must fit under Vercel's 4.5MB request limit,
 * so the images SHARE a budget: one image gets all of it, five get a fifth
 * each. A screenshot of a post is mostly text and stays sharp well below
 * full quality, so this costs nothing a person would notice.
 */
const TOTAL_BUDGET = 3_200_000; // base64 characters, with room to spare

async function downscale(
  file: File,
  budget: number,
): Promise<{ base64: string; mediaType: string }> {
  const bitmap = await createImageBitmap(file);
  let edge = MAX_EDGE;
  let quality = 0.85;
  // Step quality down first, then size, until it fits its share.
  for (let attempt = 0; attempt < 8; attempt++) {
    const out = draw(bitmap, edge, quality);
    if (out.length <= budget || attempt === 7) {
      bitmap.close?.();
      return { base64: out, mediaType: 'image/jpeg' };
    }
    if (quality > 0.6) quality -= 0.1;
    else edge = Math.round(edge * 0.8);
  }
  throw new Error('Could not shrink that image.');
}

function draw(bitmap: ImageBitmap, maxEdge: number, quality: number): string {
  const scale = Math.min(1, maxEdge / Math.max(bitmap.width, bitmap.height));
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
  return canvas.toDataURL('image/jpeg', quality).split(',')[1] ?? '';
}

interface Outcome {
  found: string[];
  missing: string[];
  quotes?: Record<string, string>;
  verified?: boolean;
  error?: string;
}


export function PasteBox({
  onParsed,
  sport = 'volleyball',
}: {
  onParsed: (fields: ParsedListing, filled: string[]) => void;
  sport?: string;
}) {
  const [text, setText] = useState('');
  // Several images of one event, read together (14 Nov 2026): a flyer
  // front and back, or three screenshots of a long Facebook post.
  const [images, setImages] = useState<{ file: File; preview: string }[]>([]);
  const [url, setUrl] = useState('');
  const [result, setResult] = useState<Outcome | null>(null);
  const [open, setOpen] = useState(true);
  const [dragging, setDragging] = useState(false);
  const [pending, start] = useTransition();
  const fileInput = useRef<HTMLInputElement>(null);

  const image = images.length > 0;

  /** Adds images up to the limit; anything past it is left out, and the
   *  counter beside the thumbnails says how many fit. */
  function takeFiles(list: FileList | File[] | null | undefined) {
    const files = Array.from(list ?? []).filter((f) => f.type.startsWith('image/'));
    if (!files.length) return;
    setImages((prev) => [
      ...prev,
      ...files
        .slice(0, Math.max(0, MAX_IMAGES - prev.length))
        .map((file) => ({ file, preview: URL.createObjectURL(file) })),
    ]);
    setResult(null);
  }

  function removeImage(index: number) {
    setImages((prev) => {
      URL.revokeObjectURL(prev[index]?.preview ?? '');
      return prev.filter((_, i) => i !== index);
    });
    if (fileInput.current) fileInput.current.value = '';
  }

  /** A pasted image beats pasted text: if the clipboard holds both, the
   *  image is what the person meant. Each paste ADDS to the set. */
  function onPaste(e: React.ClipboardEvent) {
    const files = Array.from(e.clipboardData.items)
      .filter((i) => i.type.startsWith('image/'))
      .map((i) => i.getAsFile())
      .filter((f): f is File => Boolean(f));
    if (!files.length) return;
    e.preventDefault();
    takeFiles(files);
  }

  function readText() {
    if (!text.trim()) return;
    const parsed = parseListing(text);
    onParsed(parsed.fields, parsed.filled);
    setResult({ found: parsed.found, missing: parsed.missing, verified: true });
  }

  function readImage() {
    if (!image && !url.trim()) return;
    start(async () => {
      try {
        const share = Math.floor(TOTAL_BUDGET / Math.max(1, images.length));
        const prepared = await Promise.all(images.map((img) => downscale(img.file, share)));
        const res = await readFlyer({
          images: prepared,
          url: url.trim() || undefined,
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
    images.forEach((img) => URL.revokeObjectURL(img.preview));
    setText('');
    setUrl('');
    setImages([]);
    setResult(null);
    if (fileInput.current) fileInput.current.value = '';
  }

  return (
    <section className="panel border-[color:var(--surf-ink)] p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="t-kicker text-[color:var(--surf-ink)]">Paste a post or a flyer</h2>
          <p className="mt-1.5 text-sm leading-relaxed text-[color:var(--muted)]">
            Drop in up to {MAX_IMAGES} images of one event, paste a link to its
            page, or paste the text of a post. The fields below are filled in
            for you to check.
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
              takeFiles(e.dataTransfer.files);
            }}
            className="mt-4 rounded-2xl border-2 border-dashed p-4 transition-colors"
            style={{
              borderColor: dragging ? 'var(--grass)' : 'var(--line)',
              background: dragging ? 'color-mix(in srgb, var(--grass) 8%, transparent)' : 'transparent',
            }}
          >
            {image ? (
              <div>
                <ul className="flex flex-wrap gap-3">
                  {images.map((img, i) => (
                    <li key={img.preview} className="relative">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={img.preview}
                        alt={`Image ${i + 1} you added`}
                        className="h-32 w-auto rounded-lg border border-[color:var(--line)] object-cover"
                      />
                      <span className="t-mono absolute left-1.5 top-1.5 rounded bg-[color:var(--void)] px-1.5 text-[10px] text-[color:var(--ink)]">
                        {i + 1}
                      </span>
                      <button
                        type="button"
                        onClick={() => removeImage(i)}
                        aria-label={`Remove image ${i + 1}`}
                        className="absolute right-1.5 top-1.5 rounded bg-[color:var(--void)] px-1.5 text-xs text-[color:var(--ink)] hover:text-[color:var(--beach)]"
                      >
                        ✕
                      </button>
                    </li>
                  ))}
                </ul>
                <div className="mt-3 flex flex-wrap items-center gap-3">
                  {images.length < MAX_IMAGES && (
                    <button
                      type="button"
                      onClick={() => fileInput.current?.click()}
                      className="btn-ghost !py-1.5 !text-xs"
                    >
                      + Add another image
                    </button>
                  )}
                  <span className="t-mono text-[10px] uppercase tracking-wider text-[color:var(--faint)]">
                    {images.length} of {MAX_IMAGES} · read together as one event · resized before sending
                  </span>
                </div>
              </div>
            ) : (
              <div className="text-center">
                <p className="text-sm text-[color:var(--muted)]">
                  Drop up to {MAX_IMAGES} images here, or paste them into the box below
                </p>
                <button
                  type="button"
                  onClick={() => fileInput.current?.click()}
                  className="btn-ghost mt-2 !py-1.5 !text-xs"
                >
                  Choose images
                </button>
              </div>
            )}
            <input
              ref={fileInput}
              type="file"
              accept="image/png,image/jpeg,image/gif,image/webp"
              multiple
              className="sr-only"
              onChange={(e) => {
                takeFiles(e.target.files);
                e.target.value = '';
              }}
            />
          </div>

          {/* ---- link ---- */}
          <label htmlFor="paste-url" className="label mt-4">
            Or a link to the event page
          </label>
          <input
            id="paste-url"
            type="url"
            inputMode="url"
            value={url}
            onChange={(e) => {
              setUrl(e.target.value);
              setResult(null);
            }}
            placeholder="https://… (not Facebook or Instagram — screenshot those)"
            className="field"
          />

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
            {image || url.trim() ? (
              <button
                type="button"
                onClick={readImage}
                disabled={pending}
                className="btn-primary disabled:cursor-not-allowed disabled:opacity-40"
              >
                {pending
                  ? image
                    ? `Reading ${images.length === 1 ? 'the image' : `${images.length} images`}…`
                    : 'Reading the page…'
                  : 'Read it and fill the form'}
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
            {(text || image || url || result) && (
              <button type="button" onClick={clear} className="btn-ghost">
                Clear
              </button>
            )}
            {(image || url.trim()) && (
              <span className="t-mono text-[10px] uppercase tracking-wider text-[color:var(--faint)]">
                about a cent per image · a few seconds
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
                      ? 'Each quote was checked against what you pasted or the page you linked. Anything that did not match was thrown away.'
                      : 'These quotes come from the flyer and are shown so you can check them — they cannot be verified automatically against an image. Anything the reader could not quote was left blank rather than guessed.'}
                  </p>
                </details>
              )}

              <p className="t-mono sm:col-span-2 text-[10px] leading-relaxed text-[color:var(--faint)]">
                Highlighted fields below came from what you added. Nothing is saved
                until you press the save button.
              </p>
            </div>
          )}
        </>
      )}
    </section>
  );
}
