#!/usr/bin/env python3
"""
Normalize the three historical event sheets (2022, 2023, 2024) and the
organization tracker into import-ready CSVs.

These are PAST events. They go in as archived records, not as discoverable
listings: they exist to prove an organizer is real and recurring, which is
what matters when calling them. Nothing here should ever appear in search.

Each year's sheet has a different shape, so the column mapping is written
out per year rather than guessed. Where a year genuinely lacks a field
(2022 has no venue, no fee, no skill levels) the field is left null rather
than invented.

Outputs, to data/import/:
  organizers.csv  venues.csv  events_history.csv  event_links.csv
  unresolved.csv  — rows that could not be normalized, with the reason
"""

import csv
import os
import re
import sys
import unicodedata
from collections import OrderedDict

UPLOADS = "/root/.claude/uploads/17570de9-9c48-5529-b66f-5ede9df4f76d"
OUT = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "data", "import")

SRC = {
    2022: os.path.join(UPLOADS, "665f3825-COMPETE_DATABASE_-_2022_Database.csv"),
    2023: os.path.join(UPLOADS, "78ca5475-COMPETE_DATABASE_-_2023_Database.csv"),
    2024: os.path.join(UPLOADS, "ee7dc17d-COMPETE_DATABASE_-_2024_Database.csv"),
}
ORGS_SRC = os.path.join(UPLOADS, "a45aacb0-FOR_CLAUDE_-_COMPETE_DATABASE_-_Organizations.csv")

MONTHS = {
    "january": 1, "jan": 1, "february": 2, "feb": 2, "march": 3, "mar": 3,
    "april": 4, "apr": 4, "may": 5, "june": 6, "jun": 6, "july": 7, "jul": 7,
    "august": 8, "aug": 8, "september": 9, "sep": 9, "sept": 9,
    "october": 10, "oct": 10, "november": 11, "nov": 11, "december": 12, "dec": 12,
}

# Team size from whatever word the sheet used for it.
SIZES = {
    "singles": 1, "1s": 1,
    "doubles": 2, "2s": 2, "2's": 2, "twos": 2,
    # "trips" is what these sheets actually call a 3s bracket; "qauds" is a
    # typo that appears in the 2023 sheet and is not worth hand-editing out
    # of the source.
    "triples": 3, "trips": 3, "trip": 3, "3s": 3, "3's": 3, "threes": 3,
    "quads": 4, "qauds": 4, "4s": 4, "4's": 4, "fours": 4,
    "fives": 5, "5s": 5, "5's": 5,
    "sixes": 6, "6s": 6, "6's": 6,
}

# Surface words as they appear in the 2024 "Category" column.
SURFACES = {
    "indoor": "indoor", "grass": "grass", "beach": "beach", "sand": "beach",
    "outdoor": "outdoor", "court": "indoor",
}

SKILL_TIERS = ["open", "aaa", "aa", "a", "bbb", "bb", "b", "c", "rec", "recreational", "novice"]

# The organization tracker's State column mixes USPS codes with full state
# names, so truncating to two characters turned "Georgia" into "GE" and
# left a third of the venues unplaceable.
STATE_CODES = {
    "alabama": "AL", "alaska": "AK", "arizona": "AZ", "arkansas": "AR",
    "california": "CA", "colorado": "CO", "connecticut": "CT", "delaware": "DE",
    "district of columbia": "DC", "florida": "FL", "georgia": "GA", "hawaii": "HI",
    "idaho": "ID", "illinois": "IL", "indiana": "IN", "iowa": "IA",
    "kansas": "KS", "kentucky": "KY", "louisiana": "LA", "maine": "ME",
    "maryland": "MD", "massachusetts": "MA", "michigan": "MI", "minnesota": "MN",
    "mississippi": "MS", "missouri": "MO", "montana": "MT", "nebraska": "NE",
    "nevada": "NV", "new hampshire": "NH", "new jersey": "NJ", "new mexico": "NM",
    "new york": "NY", "north carolina": "NC", "north dakota": "ND", "ohio": "OH",
    "oklahoma": "OK", "oregon": "OR", "pennsylvania": "PA", "rhode island": "RI",
    "south carolina": "SC", "south dakota": "SD", "tennessee": "TN", "texas": "TX",
    "utah": "UT", "vermont": "VT", "virginia": "VA", "washington": "WA",
    "west virginia": "WV", "wisconsin": "WI", "wyoming": "WY",
}

# City spellings the sheets use that no postal table will match. Only
# unambiguous corrections — a misspelling, a local nickname, or a suffix
# the writer dropped. Where the source put a park name in the city column
# the row is left unplaced rather than guessed at.
CITY_ALIASES = {
    "ashville": "Asheville",
    "charlestown": "Charleston",
    "charlstown": "Charleston",
    "st petesburg": "St. Petersburg",
    "cola": "Columbia",
    "fort walton": "Fort Walton Beach",
}


def clean_state(raw):
    """Accepts 'MO', 'Missouri' or 'missouri ' and returns 'MO'."""
    s = norm_space(raw)
    if not s:
        return ""
    if len(s) == 2 and s.isalpha():
        return s.upper()
    return STATE_CODES.get(s.lower(), "")


def clean_city(raw):
    """
    Drops a parenthetical clarifier ('St. Louis (Belleville)') and applies
    the alias table. Periods are kept — 'St. Louis' is how the postal
    table spells it.
    """
    s = norm_space(re.sub(r"\s*\([^)]*\)", "", norm_space(raw)))
    probe = re.sub(r"[^a-z ]", "", s.lower()).strip()
    return CITY_ALIASES.get(probe, s)


def clean_postal(raw):
    """Only a real 5-digit ZIP. The tracker's Zip column holds region
    words like 'Southeast' for 17 rows."""
    s = norm_space(raw)
    m = re.match(r"^(\d{5})(?:-\d{4})?$", s)
    return m.group(1) if m else ""


def norm_space(s):
    if s is None:
        return ""
    s = unicodedata.normalize("NFKC", str(s))
    return re.sub(r"\s+", " ", s).strip()


# Organizations the sheets spell more than one way, where the two spellings
# are the same outfit. Judgment calls, kept visible so they can be vetoed
# one line at a time rather than buried in a regex. Left side is folded
# into the right.
ALIASES = {
    "chucktown": "chucktown volleyball",
    "players sport & social group": "players sport & social club",
}


def key(s):
    """
    Dedup key: case, punctuation and spacing collapsed away.

    'Club' and 'Adult' are dropped because an organization and the same
    organization with one of those words appended are the same
    organization ('Pelican City Volleyball' / 'Pelican City Volleyball
    Club'). A trailing '#3' is dropped because it names an instalment of a
    series, not a separate organization ('Players Beach Series #3').

    Deliberately NOT dropped: 'Beach' and 'Volleyball'. Dozens of
    unrelated outfits are named '<Something> Beach Volleyball' and folding
    those words would merge real competitors into one record.
    """
    s = norm_space(s).lower()
    s = ALIASES.get(s, s)
    s = re.sub(r"\s*#\s*\d+\s*$", "", s)
    s = re.sub(r"\b(llc|inc|co|the|club|adult)\b", "", s)
    s = re.sub(r"[^a-z0-9]+", "", s)
    return s


def slugify(s, used=None):
    s = norm_space(s).lower()
    s = re.sub(r"[^a-z0-9]+", "-", s).strip("-")[:60] or "event"
    if used is None:
        return s
    base, n = s, 2
    while s in used:
        s = f"{base}-{n}"
        n += 1
    used.add(s)
    return s


def parse_date(raw, default_year):
    """
    'March 12th' -> (2022, 3, 12) using default_year
    'February 25, 2023' -> (2023, 2, 25)
    Returns ISO string or None.
    """
    s = norm_space(raw).replace(".", "")
    if not s:
        return None
    # Strip an explicit weekday prefix.
    s = re.sub(r"^(mon|tues?|wed(nes)?|thur?s?|fri|sat(ur)?|sun)(day)?,?\s+", "", s, flags=re.I)
    m = re.match(r"([A-Za-z]+)\s+(\d{1,2})(?:st|nd|rd|th)?\s*(?:,\s*(\d{4}))?", s)
    if m:
        mon = MONTHS.get(m.group(1).lower())
        if not mon:
            return None
        day = int(m.group(2))
        year = int(m.group(3)) if m.group(3) else default_year
    else:
        m = re.match(r"(\d{1,2})[/-](\d{1,2})(?:[/-](\d{2,4}))?", s)
        if not m:
            return None
        mon, day = int(m.group(1)), int(m.group(2))
        year = m.group(3)
        year = default_year if not year else (int(year) if len(year) == 4 else 2000 + int(year))
    if not (1 <= mon <= 12 and 1 <= day <= 31):
        return None
    return f"{year:04d}-{mon:02d}-{day:02d}"


def parse_money_cents(raw):
    s = norm_space(raw)
    if not s or re.search(r"tbd|free|n/?a|varies", s, re.I):
        return None
    m = re.search(r"([\d,]+(?:\.\d{1,2})?)", s.replace("$", ""))
    if not m:
        return None
    try:
        return int(round(float(m.group(1).replace(",", "")) * 100))
    except ValueError:
        return None


def parse_genders(raw):
    """
    Pulls gender brackets out of a format/sex string. One string can name
    several — 'M/W 2s' is a men's bracket AND a women's bracket.
    """
    s = norm_space(raw).lower()
    out = []
    if re.search(r"reverse\s*co-?ed|rev\s*co-?ed|\brevco\b", s):
        out.append("reverse_coed")
    elif re.search(r"co-?ed|mixed", s):
        out.append("coed")
    # "Same Sex" is the sheets' shorthand for running a men's bracket and a
    # women's bracket side by side, not a third bracket of its own.
    if re.search(r"same\s*sex", s):
        return ["mens", "womens"]
    if re.search(r"\bm/w\b|\bmen'?s?\b.*\bwomen'?s?\b|\bmens?\b.*\bwomens?\b", s):
        out += ["mens", "womens"]
    else:
        if re.search(r"\bmen'?s?\b|\bmens\b|^m\b|\bmale\b", s):
            out.append("mens")
        if re.search(r"\bwomen'?s?\b|\bwomens\b|^w\b|\bfemale\b", s):
            out.append("womens")
    if re.search(r"\bopen\b", s) and not out:
        out.append("open")
    return list(OrderedDict.fromkeys(out))


def parse_sizes(raw):
    s = norm_space(raw).lower()
    out = []
    for word, n in SIZES.items():
        if re.search(r"(?<![a-z0-9])" + re.escape(word) + r"(?![a-z0-9])", s):
            out.append(n)
    return sorted(set(out))


def parse_surface(raw):
    s = norm_space(raw).lower()
    for word, canon in SURFACES.items():
        if word in s:
            return canon
    return None


def parse_divisions(raw):
    """'Open | AA | A | BB' or 'Open, A, BB' -> ['open','aa','a','bb']"""
    s = norm_space(raw).lower()
    if not s:
        return []
    parts = [p.strip() for p in re.split(r"[|,/;]+", s) if p.strip()]
    out = []
    for p in parts:
        p = re.sub(r"[^a-z]+", "", p)
        if p in ("recreational", "rec"):
            out.append("recreational")
        elif p in SKILL_TIERS:
            out.append(p)
    return list(OrderedDict.fromkeys(out))


def split_city_state(raw):
    """'Knoxville, TN' or 'Knoxville, Tennessee' -> ('Knoxville', 'TN')"""
    s = norm_space(raw)
    m = re.match(r"^(.*?),\s*([A-Za-z][A-Za-z .]*)$", s)
    if m:
        state = clean_state(m.group(2).replace(".", ""))
        if state:
            return clean_city(m.group(1)), state
    return (clean_city(s), "") if s else ("", "")


# ---------------------------------------------------------------------
# Accumulators
# ---------------------------------------------------------------------
organizers = OrderedDict()   # key -> {name, contact_email, website_url, sources}
venues = OrderedDict()       # key -> {name, address_line, city, state, postal_code}
events = []
unresolved = []
slugs = set()


TRACKER_FIELDS = ("contact_person", "phone", "facebook",
                  "schedule_2026", "survey_sent", "survey_responded")


def add_organizer(name, email="", website="", source="", **tracker):
    name = norm_space(name)
    if not name or key(name) in ("", "na", "tbd", "unknown"):
        return None
    k = key(name)
    rec = organizers.setdefault(k, {
        "name": name, "contact_email": "", "website_url": "", "sources": set(),
        **{f: "" for f in TRACKER_FIELDS},
    })
    # Tracker detail is carried on the organizer record rather than joined
    # again downstream: the dedup key lives here, and re-deriving it in a
    # second script is how the join silently returned nothing.
    for f in TRACKER_FIELDS:
        v = norm_space(tracker.get(f, ""))
        if v and not rec[f]:
            rec[f] = v
    # Keep the longest spelling — it is usually the complete one.
    if len(name) > len(rec["name"]):
        rec["name"] = name
    if email and not rec["contact_email"]:
        rec["contact_email"] = norm_space(email)
    if website and not rec["website_url"]:
        rec["website_url"] = norm_space(website)
    if source:
        rec["sources"].add(source)
    return k


def add_venue(name, address, city, state, postal=""):
    name, address = norm_space(name), norm_space(address)
    city, state, postal = clean_city(city), clean_state(state), clean_postal(postal)
    if not city or not state:
        return None
    # Address is the stronger identity; fall back to facility name.
    ident = key(address) or key(name)
    if not ident:
        ident = "cityonly"
    k = f"{ident}|{key(city)}|{state}"
    rec = venues.setdefault(k, {
        "name": name or city, "address_line": address,
        "city": city, "state": state, "postal_code": norm_space(postal),
    })
    if address and not rec["address_line"]:
        rec["address_line"] = address
    if name and (not rec["name"] or rec["name"] == city):
        rec["name"] = name
    if postal and not rec["postal_code"]:
        rec["postal_code"] = norm_space(postal)
    return k


def emit(year, row_no, name, org_key, venue_key, starts_on, **extra):
    if not starts_on:
        unresolved.append({"year": year, "row": row_no, "name": name, "reason": "unparseable date"})
        return
    if not name:
        unresolved.append({"year": year, "row": row_no, "name": "", "reason": "no event name"})
        return
    events.append({
        "source_year": year,
        "source_row": row_no,
        "slug": slugify(f"{name}-{starts_on}", slugs),
        "name": name,
        "organizer_key": org_key or "",
        "venue_key": venue_key or "",
        "starts_on": starts_on,
        **extra,
    })


# Rows to leave out, as (year, row number in the source sheet). Checked
# before the organizer and venue are recorded, so a dropped row cannot
# leave a junk organization or venue behind. Kept as an explicit list
# rather than a cleverness heuristic, because guessing which rows are real
# is exactly the kind of decision that should be reviewable.
SKIP_ROWS = {
    # Form test submitted 2 Jun 2025: name and organization both "Boo",
    # venue "Tom's House" at "1001 STL ST", director contact Tom@Tom.com.
    (2024, 178): "test submission",
}

skipped = []


def read(path):
    with open(path, newline="", encoding="utf-8-sig") as fh:
        return list(csv.DictReader(fh))


# ---------------------------------------------------------------------
# 2022 — Date, Name/Organization, Format, Location
# No venue, no fee, no skill tiers. Organizer and event name are the
# same column, so the organizer carries both.
# ---------------------------------------------------------------------
for i, row in enumerate(read(SRC[2022]), start=2):
    if (2022, i) in SKIP_ROWS:
        skipped.append({"year": 2022, "row": i, "reason": SKIP_ROWS[(2022, i)]})
        continue
    org = norm_space(row.get("Name/Organization"))
    if not org:
        continue
    fmt = row.get("Format", "")
    city, state = split_city_state(row.get("Location"))
    ok = add_organizer(org, source="2022")
    vk = add_venue("", "", city, state)
    emit(
        2022, i, org, ok, vk, parse_date(row.get("Date"), 2022),
        surface="", genders="|".join(parse_genders(fmt)),
        team_sizes="|".join(str(n) for n in parse_sizes(fmt)),
        divisions="", entry_fee_cents="", fee_basis="",
        event_page_url="", payout_text="", registration_deadline="",
        check_in_time="", start_time="", director="", director_contact="",
        raw_format=norm_space(fmt),
    )

# ---------------------------------------------------------------------
# 2023 — Organization and Tournament Name are separate; Division/Level is
# the skill tier; Format is a multiline gender+size list.
# ---------------------------------------------------------------------
for i, row in enumerate(read(SRC[2023]), start=2):
    if (2023, i) in SKIP_ROWS:
        skipped.append({"year": 2023, "row": i, "reason": SKIP_ROWS[(2023, i)]})
        continue
    org = norm_space(row.get("Tournament Organzation"))  # sheet's own spelling
    name = norm_space(row.get("Tournament Name")) or org
    fmt = row.get("Format", "")
    ok = add_organizer(org, source="2023")
    vk = add_venue(row.get("Facility Name"), row.get("Address"),
                   row.get("City"), row.get("State"))
    emit(
        2023, i, name, ok, vk, parse_date(row.get("Date"), 2023),
        surface="", genders="|".join(parse_genders(fmt)),
        team_sizes="|".join(str(n) for n in parse_sizes(fmt)),
        divisions="|".join(parse_divisions(row.get("Division / Level"))),
        entry_fee_cents=parse_money_cents(row.get("Entry Fee")) or "",
        fee_basis="",  # the sheet does not say per player or per team
        event_page_url="",
        payout_text=norm_space(row.get("Payout / Prizes")),
        registration_deadline=parse_date(row.get("Registration Closes"), 2023) or "",
        check_in_time="", start_time="", director="", director_contact="",
        raw_format=norm_space(fmt),
    )

# ---------------------------------------------------------------------
# 2024 — the richest sheet. Category=surface, Sex=gender, Format=size,
# Division(s)=skill, plus zip, director, check-in and first serve.
# ---------------------------------------------------------------------
for i, row in enumerate(read(SRC[2024]), start=2):
    if (2024, i) in SKIP_ROWS:
        skipped.append({"year": 2024, "row": i, "reason": SKIP_ROWS[(2024, i)]})
        continue
    org = norm_space(row.get("Organization"))
    name = norm_space(row.get("Tournament Name")) or org
    ok = add_organizer(
        org,
        email=norm_space(row.get("Email Address")),
        source="2024",
    )
    vk = add_venue(
        row.get("Facility Name"), row.get("Tournament Address"),
        row.get("City"), row.get("State (Abbreviation Required)"),
        row.get("Zip Code"),
    )
    emit(
        2024, i, name, ok, vk, parse_date(row.get("Date"), 2024),
        surface=parse_surface(row.get("Category")) or "",
        genders="|".join(parse_genders(row.get("Sex"))),
        team_sizes="|".join(str(n) for n in parse_sizes(row.get("Format"))),
        divisions="|".join(parse_divisions(row.get("Division(s)"))),
        entry_fee_cents=parse_money_cents(row.get("Team Entry Fee")) or "",
        fee_basis="per_team" if parse_money_cents(row.get("Team Entry Fee")) else "",
        event_page_url=norm_space(row.get("Hyperlink to tournament site")),
        payout_text=norm_space(row.get("Payout & Prizes Information")),
        registration_deadline="",
        check_in_time=norm_space(row.get("Team Check In (Time)")),
        start_time=norm_space(row.get("Tournament Start Time (First Serve)")),
        director=norm_space(row.get("Director")),
        director_contact=norm_space(row.get("Director Contact Info: Email & Phone Number")),
        raw_format=norm_space(row.get("Format")),
    )

# ---------------------------------------------------------------------
# Organization tracker — merges contact detail onto organizers already
# seen in the event sheets, and adds the prospects never seen in one.
# ---------------------------------------------------------------------
tracker_only = 0
for row in read(ORGS_SRC):
    name = norm_space(row.get("Organizer Name"))
    if not name:
        continue
    k = key(name)
    new = k not in organizers
    add_organizer(
        name,
        email=norm_space(row.get("Organizer Contact Email")),
        website=norm_space(row.get("Event Page URL")),
        source="tracker",
        contact_person=row.get("Organization Contact"),
        phone=row.get("Organizer Phone Number"),
        facebook=row.get("Facebook"),
        schedule_2026="yes" if norm_space(row.get("2026 Schedule Acquired")).upper() == "TRUE" else "",
        survey_sent=row.get("Survey Sent Date"),
        survey_responded=row.get("Completed?"),
    )
    if new:
        tracker_only += 1
    add_venue(row.get("Venue Name"), row.get("Venue Address (Full Address)"),
              row.get("City"), row.get("State"), row.get("Zip Code"))

# ---------------------------------------------------------------------
# Write
# ---------------------------------------------------------------------
os.makedirs(OUT, exist_ok=True)


def write(fname, rows, cols):
    with open(os.path.join(OUT, fname), "w", newline="", encoding="utf-8") as fh:
        w = csv.DictWriter(fh, fieldnames=cols, extrasaction="ignore")
        w.writeheader()
        w.writerows(rows)


org_slugs = set()
org_rows = []
for k, r in organizers.items():
    org_rows.append({
        "key": k, "slug": slugify(r["name"], org_slugs), "name": r["name"],
        "contact_email": r["contact_email"], "website_url": r["website_url"],
        "sources": "|".join(sorted(r["sources"])),
        **{f: r[f] for f in TRACKER_FIELDS},
    })
write("organizers.csv", org_rows,
      ["key", "slug", "name", "contact_email", "website_url", "sources", *TRACKER_FIELDS])

write("venues.csv",
      [dict(key=k, **v) for k, v in venues.items()],
      ["key", "name", "address_line", "city", "state", "postal_code"])

event_cols = ["source_year", "source_row", "slug", "name", "organizer_key", "venue_key",
              "starts_on", "surface", "genders", "team_sizes", "divisions",
              "entry_fee_cents", "fee_basis", "event_page_url", "payout_text",
              "registration_deadline", "check_in_time", "start_time",
              "director", "director_contact", "raw_format"]
write("events_history.csv", events, event_cols)
write("unresolved.csv", unresolved, ["year", "row", "name", "reason"])

# ---------------------------------------------------------------------
# Report
# ---------------------------------------------------------------------
print(f"organizers        {len(organizers):>5}   ({tracker_only} from the tracker only, never seen in an event sheet)")
print(f"venues            {len(venues):>5}")
print(f"events            {len(events):>5}")
print(f"unresolved        {len(unresolved):>5}")
print(f"skipped           {len(skipped):>5}" + ("   (" + ", ".join(f'{k["year"]} row {k["row"]}: {k["reason"]}' for k in skipped) + ")" if skipped else ""))
print()
for y in (2022, 2023, 2024):
    rows = [e for e in events if e["source_year"] == y]
    print(f"  {y}: {len(rows):>3} events   "
          f"surface {sum(1 for e in rows if e['surface']):>3}   "
          f"gender {sum(1 for e in rows if e['genders']):>3}   "
          f"size {sum(1 for e in rows if e['team_sizes']):>3}   "
          f"skill {sum(1 for e in rows if e['divisions']):>3}   "
          f"fee {sum(1 for e in rows if e['entry_fee_cents'] != ''):>3}   "
          f"venue addr {sum(1 for e in rows if e['venue_key'] and venues[e['venue_key']]['address_line']):>3}")
print()
with_email = sum(1 for r in organizers.values() if r["contact_email"])
with_site = sum(1 for r in organizers.values() if r["website_url"])
print(f"organizers with an email      {with_email}")
print(f"organizers with a website     {with_site}")
print(f"organizers seen in 2+ years   "
      f"{sum(1 for r in organizers.values() if len({s for s in r['sources'] if s != 'tracker'}) >= 2)}")
if unresolved:
    print("\nunresolved reasons:")
    counts = {}
    for u in unresolved:
        counts[u["reason"]] = counts.get(u["reason"], 0) + 1
    for reason, n in sorted(counts.items(), key=lambda kv: -kv[1]):
        print(f"  {n:>4}  {reason}")
