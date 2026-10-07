#!/usr/bin/env python3
"""
Builds the partner prospect list: one row per organization, ranked by the
evidence that they are real and recurring.

Run after merge-history.py and prepare-history.ts:

    python3 scripts/merge-history.py
    npx tsx scripts/prepare-history.ts
    python3 scripts/build-prospects.py

Output: data/crm-seed/prospects.csv — the seed for the CRM map, and a
call list that is useful on its own before the CRM UI exists.

Ranking is deliberately not a score. It sorts by seasons run, then by how
recently they last ran something, then by volume. An outfit that ran
events in three different years is a different prospect from one that ran
nine in a single summer and vanished, and no single number says that.

Everything here joins on `organizer_slug`, which merge-history.py already
resolved. Nothing re-derives a dedup key — doing that in a second script
is how the tracker join silently matched nothing.
"""

import csv
import json
import os
from collections import defaultdict

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
HIST = os.path.join(ROOT, "data", "history.seed.json")
ORGS = os.path.join(ROOT, "data", "import", "organizers.csv")
OUT = os.path.join(ROOT, "data", "crm-seed", "prospects.csv")

hist = json.load(open(HIST, encoding="utf-8"))
venues = {v["key"]: v for v in hist["venues"]}
org_meta = {r["slug"]: r for r in csv.DictReader(open(ORGS, newline="", encoding="utf-8"))}

events_by_org = defaultdict(list)
for e in hist["events"]:
    if e["organizer_slug"]:
        events_by_org[e["organizer_slug"]].append(e)

rows = []
for org in hist["organizers"]:
    slug = org["slug"]
    evs = events_by_org.get(slug, [])
    meta = org_meta.get(slug, {})

    places = [venues[e["venue_key"]] for e in evs if e["venue_key"] in venues]
    # Home base is wherever they run the most events, not the first one seen.
    home = ("", "")
    if places:
        counts = defaultdict(int)
        for p in places:
            counts[(p["city"], p["state"])] += 1
        home = max(counts, key=counts.get)
    coord = next(((p["latitude"], p["longitude"]) for p in places
                  if p["latitude"] is not None), (None, None))

    fees = sorted(e["entry_fee_cents"] for e in evs if e["entry_fee_cents"])
    years = sorted({e["starts_on"][:4] for e in evs})

    rows.append({
        "slug": slug,
        "organization": org["name"],
        "seasons": len(years),
        "events_total": len(evs),
        "years": "|".join(years),
        "first_event": min((e["starts_on"] for e in evs), default=""),
        "last_event": max((e["starts_on"] for e in evs), default=""),
        "city": home[0],
        "state": home[1],
        "latitude": coord[0] if coord[0] is not None else "",
        "longitude": coord[1] if coord[1] is not None else "",
        "venues": len({p["key"] for p in places}),
        "median_team_fee_usd": fees[len(fees) // 2] // 100 if fees else "",
        "email": org["contact_email"] or "",
        "phone": meta.get("phone", ""),
        "contact_person": meta.get("contact_person", ""),
        "website": org["website_url"] or "",
        "facebook": meta.get("facebook", ""),
        "schedule_2026_acquired": meta.get("schedule_2026", ""),
        "survey_sent": meta.get("survey_sent", ""),
        "survey_responded": meta.get("survey_responded", ""),
        "in_tracker": "yes" if "tracker" in (meta.get("sources", "") or "") else "",
    })

rows.sort(key=lambda r: (
    -r["seasons"],
    -int(r["last_event"].replace("-", "") or 0),
    -r["events_total"],
    r["organization"].lower(),
))

os.makedirs(os.path.dirname(OUT), exist_ok=True)
with open(OUT, "w", newline="", encoding="utf-8") as fh:
    w = csv.DictWriter(fh, fieldnames=list(rows[0].keys()))
    w.writeheader()
    w.writerows(rows)

# ------------------------------------------------------------------ report
reach = lambda r: bool(r["email"] or r["phone"] or r["facebook"] or r["website"])
print(f"\nwrote {os.path.relpath(OUT, ROOT)} — {len(rows)} organizations\n")
hdr = f"{'':>3} {'organization':<34}{'ssns':>5}{'evts':>5}  {'last event':<12}{'base':<20}{'reachable by':<16}"
print(hdr)
print(" " + "-" * (len(hdr) - 1))
for i, r in enumerate(rows[:15], 1):
    how = ", ".join(x for x, ok in (("email", r["email"]), ("phone", r["phone"]),
                                    ("web", r["website"]), ("fb", r["facebook"])) if ok) or "—"
    base = f"{r['city']}, {r['state']}" if r["city"] else "—"
    print(f"{i:>3} {r['organization'][:33]:<34}{r['seasons']:>5}{r['events_total']:>5}  "
          f"{r['last_event'] or '—':<12}{base[:19]:<20}{how[:15]:<16}")

print("\ncoverage")
for label, n in (
    ("2+ seasons of events", sum(1 for r in rows if r["seasons"] >= 2)),
    ("any event history", sum(1 for r in rows if r["events_total"])),
    ("tracker only, no events yet", sum(1 for r in rows if not r["events_total"])),
    ("an email", sum(1 for r in rows if r["email"])),
    ("a phone", sum(1 for r in rows if r["phone"])),
    ("any way to reach them", sum(1 for r in rows if reach(r))),
    ("2026 schedule acquired", sum(1 for r in rows if r["schedule_2026_acquired"])),
    ("survey sent", sum(1 for r in rows if r["survey_sent"])),
    ("placeable on a map", sum(1 for r in rows if r["latitude"] != "")),
):
    print(f"  {label:<30}{n:>5}")
print()
