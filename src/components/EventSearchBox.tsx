'use client';

import { useEffect, useRef, useState, useTransition } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';

/**
 * The single discovery search box.
 *
 * It replaced two boxes on 27 October — a place box in the header and a
 * name box below it. Tom hit the failure that predicts: he typed "Adult"
 * into the place box and got "we couldn't find Adult". A person with one
 * thing in mind should not have to work out which field it belongs in.
 *
 * Results narrow as you type. The URL stays the state, so a search is
 * shareable and the back button works, and `replace` is used rather than
 * `push` so a nine-letter word leaves one history entry, not nine.
 *
 * Without JavaScript it is an ordinary GET form with a Search button, and
 * the button stays for anyone who would rather press it.
 *
 * ---
 *
 * WHY THE DEPENDENCIES ARE SO NARROW. The first version had `params` and
 * `initial` in the debounce effect's dependency array. Both of those
 * CHANGE AS A RESULT of the navigation that effect fires, so every
 * keystroke started a small feedback loop — search, URL changes, effect
 * re-runs, schedules another — and typing felt sticky, which is exactly
 * what Tom reported.
 *
 * So the effect now depends only on `value`. Anything it needs that moves
 * on its own is read from a ref at fire time instead.
 */
export function EventSearchBox({ initial }: { initial: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();

  const [value, setValue] = useState(initial);
  const [, startTransition] = useTransition();

  // Read at fire time rather than depended on, per the note above.
  const paramsRef = useRef(params.toString());
  paramsRef.current = params.toString();

  // What the URL currently reflects. Comparing against this is what tells
  // our own navigation apart from someone pressing the back button.
  const applied = useRef(initial.trim());

  // Nothing should fire until a key is actually pressed — the server has
  // already rendered this search.
  const touched = useRef(false);

  // Follow the URL when it changes from outside: back button, a filter
  // chip removed, a shared link opened. Our own writes set `applied`
  // first, so this cannot fight them.
  useEffect(() => {
    const incoming = initial.trim();
    if (incoming !== applied.current) {
      applied.current = incoming;
      setValue(initial);
    }
  }, [initial]);

  useEffect(() => {
    if (!touched.current) return;

    const trimmed = value.trim();

    // Under subsequence matching a single letter matches almost
    // everything, so fewer than two characters means no search at all —
    // and that is also how clearing the box resets to every event.
    const target = trimmed.length < 2 ? '' : trimmed;
    if (target === applied.current) return;

    // 250ms: a typed word becomes one search rather than nine, and it
    // still reads as immediate.
    const timer = setTimeout(() => {
      applied.current = target;

      const next = new URLSearchParams(paramsRef.current);
      if (target) next.set('q', target);
      else next.delete('q');
      // A new search starts at page one; staying on page 4 of the old
      // results would show an empty page.
      next.delete('page');

      const qs = next.toString();
      // A transition keeps the keyboard responsive while the server
      // renders the new results underneath.
      startTransition(() => {
        router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
      });
    }, 250);

    return () => clearTimeout(timer);
  }, [value, pathname, router]);

  return (
    <form
      method="get"
      action="/events"
      role="search"
      className="mt-7 flex max-w-2xl flex-col gap-2 sm:flex-row"
    >
      <label htmlFor="hero-q" className="sr-only">
        Search by event name, organizer, venue, city or ZIP code
      </label>
      <input
        id="hero-q"
        name="q"
        type="search"
        value={value}
        onChange={(e) => {
          touched.current = true;
          setValue(e.target.value);
        }}
        placeholder="Event, organizer, venue, city or ZIP"
        className="field flex-1 !py-3"
        enterKeyHint="search"
        autoComplete="off"
      />
      <button type="submit" className="btn-primary !py-3">
        Search
      </button>
    </form>
  );
}
