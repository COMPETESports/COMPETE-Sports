"use strict";
var CompeteParser = (() => {
  var __defProp = Object.defineProperty;
  var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
  var __getOwnPropNames = Object.getOwnPropertyNames;
  var __hasOwnProp = Object.prototype.hasOwnProperty;
  var __export = (target, all) => {
    for (var name in all)
      __defProp(target, name, { get: all[name], enumerable: true });
  };
  var __copyProps = (to, from, except, desc) => {
    if (from && typeof from === "object" || typeof from === "function") {
      for (let key of __getOwnPropNames(from))
        if (!__hasOwnProp.call(to, key) && key !== except)
          __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
    }
    return to;
  };
  var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

  // src/lib/parse-listing.ts
  var parse_listing_exports = {};
  __export(parse_listing_exports, {
    parseListing: () => parseListing
  });
  var MONTHS = {
    jan: 1,
    january: 1,
    feb: 2,
    february: 2,
    mar: 3,
    march: 3,
    apr: 4,
    april: 4,
    may: 5,
    jun: 6,
    june: 6,
    jul: 7,
    july: 7,
    aug: 8,
    august: 8,
    sep: 9,
    sept: 9,
    september: 9,
    oct: 10,
    october: 10,
    nov: 11,
    november: 11,
    dec: 12,
    december: 12
  };
  var STATES = {
    alabama: "AL",
    alaska: "AK",
    arizona: "AZ",
    arkansas: "AR",
    california: "CA",
    colorado: "CO",
    connecticut: "CT",
    delaware: "DE",
    florida: "FL",
    georgia: "GA",
    hawaii: "HI",
    idaho: "ID",
    illinois: "IL",
    indiana: "IN",
    iowa: "IA",
    kansas: "KS",
    kentucky: "KY",
    louisiana: "LA",
    maine: "ME",
    maryland: "MD",
    massachusetts: "MA",
    michigan: "MI",
    minnesota: "MN",
    mississippi: "MS",
    missouri: "MO",
    montana: "MT",
    nebraska: "NE",
    nevada: "NV",
    "new hampshire": "NH",
    "new jersey": "NJ",
    "new mexico": "NM",
    "new york": "NY",
    "north carolina": "NC",
    "north dakota": "ND",
    ohio: "OH",
    oklahoma: "OK",
    oregon: "OR",
    pennsylvania: "PA",
    "rhode island": "RI",
    "south carolina": "SC",
    "south dakota": "SD",
    tennessee: "TN",
    texas: "TX",
    utah: "UT",
    vermont: "VT",
    virginia: "VA",
    washington: "WA",
    "west virginia": "WV",
    wisconsin: "WI",
    wyoming: "WY",
    "district of columbia": "DC"
  };
  var STATE_CODES = new Set(Object.values(STATES));
  var TEAM_SIZES = [
    [/\b(?:doubles|dubs|2'?s|2v2|2\s*-\s*person|twos)\b/i, 2],
    [/\b(?:triples|trips|3'?s|3v3|3\s*-\s*person|threes)\b/i, 3],
    [/\b(?:quads|quad|4'?s|4v4|4\s*-\s*person|fours)\b/i, 4],
    [/\b(?:sixes|6'?s|6v6|6\s*-\s*person)\b/i, 6]
  ];
  var SIZE_TO_SLUG = {
    2: "doubles",
    3: "triples",
    4: "quads",
    6: "sixes"
  };
  var DIVISION_TOKENS = [
    [/\bopen\b/i, "open"],
    [/\bAAA\b/, "aaa"],
    [/\bAA\b/, "aa"],
    [/\bBB\b/, "bb"],
    [/\b(?:rec|recreational)\b/i, "recreational"],
    [/\bmasters\b/i, "masters"]
  ];
  var squash = (s) => s.replace(/\s+/g, " ").trim();
  var escapeRegex = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  function deEmoji(text) {
    return text.replace(
      /[\u{1F000}-\u{1FAFF}\u{2190}-\u{21FF}\u{2600}-\u{27BF}\u{FE0F}\u{2B00}-\u{2BFF}]/gu,
      " "
    );
  }
  function iso(y, m, d) {
    return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
  }
  function isRealDate(y, m, d) {
    if (m < 1 || m > 12 || d < 1 || d > 31) return false;
    const dt = new Date(Date.UTC(y, m - 1, d));
    return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
  }
  function inferYear(month, day, today) {
    const thisYear = today.getUTCFullYear();
    const candidate = Date.UTC(thisYear, month - 1, day);
    const todayUtc = Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate());
    return candidate >= todayUtc ? thisYear : thisYear + 1;
  }
  var DEADLINE_HINT = /(?:register|registration|sign\s*-?\s*up|entries?|deadline|rsvp|due|close[sd]?|by)\b[^.\n]{0,40}$/i;
  function findDates(text, today) {
    const out = [];
    const named = /\b([A-Za-z]{3,9})\.?\s+(\d{1,2})(?:st|nd|rd|th)?(?:\s*(?:-|–|—|to|through|&|and)\s*(?:([A-Za-z]{3,9})\.?\s*)?(\d{1,2})(?:st|nd|rd|th)?)?(?:,?\s*(\d{4}))?/g;
    for (const m of text.matchAll(named)) {
      const month = MONTHS[m[1].toLowerCase()];
      if (!month) continue;
      const day = Number(m[2]);
      const endMonth = m[3] ? MONTHS[m[3].toLowerCase()] : month;
      const endDay = m[4] ? Number(m[4]) : void 0;
      const year = m[5] ? Number(m[5]) : inferYear(month, day, today);
      if (!isRealDate(year, month, day)) continue;
      let end;
      if (endDay && endMonth && isRealDate(year, endMonth, endDay)) {
        const endYear = endMonth < month ? year + 1 : year;
        const candidate = iso(endYear, endMonth, endDay);
        if (candidate > iso(year, month, day)) end = candidate;
      }
      out.push({
        start: iso(year, month, day),
        end,
        index: m.index ?? 0,
        lead: text.slice(Math.max(0, (m.index ?? 0) - 45), m.index ?? 0)
      });
    }
    const numeric = /\b(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?(?:\s*(?:-|–|to)\s*(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?)?/g;
    for (const m of text.matchAll(numeric)) {
      const month = Number(m[1]);
      const day = Number(m[2]);
      let year;
      if (m[3]) year = m[3].length === 2 ? 2e3 + Number(m[3]) : Number(m[3]);
      else year = inferYear(month, day, today);
      if (!isRealDate(year, month, day)) continue;
      let end;
      if (m[4] && m[5]) {
        const em = Number(m[4]);
        const ed = Number(m[5]);
        const ey = m[6] ? m[6].length === 2 ? 2e3 + Number(m[6]) : Number(m[6]) : year;
        if (isRealDate(ey, em, ed)) {
          const candidate = iso(ey, em, ed);
          if (candidate > iso(year, month, day)) end = candidate;
        }
      }
      out.push({
        start: iso(year, month, day),
        end,
        index: m.index ?? 0,
        lead: text.slice(Math.max(0, (m.index ?? 0) - 45), m.index ?? 0)
      });
    }
    return out.sort((a, b) => a.index - b.index);
  }
  var PAYOUT_CONTEXT = /\b(?:payout|prize|purse|pot|win|cash|award|worth|value)\b/i;
  var FEE_CONTEXT = /\b(?:entry|fee|cost|price|buy[\s-]?in)\b|\bper\s+(?:player|person|team)\b|\bpp\b|\/\s*(?:player|person|team)\b/i;
  var PER_PLAYER = /\bper\s+(?:player|person)\b|\/\s*(?:player|person)\b|\bpp\b|\beach\b/i;
  var PER_TEAM = /\bper\s+team\b|\/\s*team\b|\ba\s+team\b|\bteam\b/i;
  function findFee(text) {
    const money = /\$\s?(\d{1,4}(?:\.\d{2})?)/g;
    const candidates = [];
    for (const m of text.matchAll(money)) {
      const at = m.index ?? 0;
      const before = text.slice(Math.max(0, at - 60), at);
      const after = text.slice(at + m[0].length, at + m[0].length + 40);
      const around = `${before} ${after}`;
      if (PAYOUT_CONTEXT.test(around) && !FEE_CONTEXT.test(around)) continue;
      const window = after.slice(0, 20);
      const perTeam = PER_TEAM.test(window);
      const perPlayer = PER_PLAYER.test(window);
      let score = 0;
      if (FEE_CONTEXT.test(before)) score += 2;
      if (perTeam || perPlayer) score += 3;
      if (/\b(?:entry|fee|cost)\b/i.test(before.slice(-30))) score += 2;
      candidates.push({
        amount: m[1],
        basis: perTeam ? "per_team" : "per_player",
        score
      });
    }
    if (!candidates.length) return null;
    candidates.sort((a, b) => b.score - a.score);
    const best = candidates[0];
    if (best.score === 0) return null;
    return { amount: best.amount, basis: best.basis };
  }
  function findPayout(text) {
    for (const line of text.split("\n")) {
      const l = squash(line);
      if (!l) continue;
      if (/\b(?:payout|prize|purse|prizes)\b/i.test(l) && /\$|\bcash\b|\bmedal|\bprize/i.test(l)) {
        return l.replace(/^[^A-Za-z$]*/, "").replace(/^(?:payouts?|prizes?|purse)\s*[:\-–—]\s*/i, "").slice(0, 200);
      }
    }
    return null;
  }
  function findFormats(text) {
    const found = /* @__PURE__ */ new Set();
    const GENDER_PATTERNS = [
      [/\breverse\s+co-?ed\b/gi, "reverse-coed"],
      [/\bco-?ed\b|\bmixed\b/gi, "coed"],
      [/\b(?:men'?s|mens|men)\b/gi, "mens"],
      [/\b(?:women'?s|womens|women|ladies)\b/gi, "womens"]
    ];
    const genders = [];
    for (const [re, value] of GENDER_PATTERNS) {
      for (const m of text.matchAll(re)) {
        genders.push({ index: m.index ?? 0, end: (m.index ?? 0) + m[0].length, value });
      }
    }
    const reverses = genders.filter((g) => g.value === "reverse-coed");
    const cleanedGenders = genders.filter(
      (g) => !(g.value === "coed" && reverses.some((r) => g.index >= r.index && g.end <= r.end))
    );
    cleanedGenders.sort((a, b) => a.index - b.index);
    const sizes = [];
    for (const [re, size] of TEAM_SIZES) {
      for (const m of text.matchAll(new RegExp(re.source, "gi"))) {
        sizes.push({ index: m.index ?? 0, end: 0, value: String(size) });
      }
    }
    sizes.sort((a, b) => a.index - b.index);
    const MAX_GAP = 30;
    for (const size of sizes) {
      const sizeSlug = SIZE_TO_SLUG[Number(size.value)];
      if (!sizeSlug) continue;
      const preceding = cleanedGenders.filter((g) => g.end <= size.index && size.index - g.end <= MAX_GAP).pop();
      const following = cleanedGenders.find(
        (g) => g.index > size.index && g.index - size.index <= MAX_GAP
      );
      if (preceding) {
        const run = [preceding];
        let i = cleanedGenders.indexOf(preceding);
        while (i > 0) {
          const prev = cleanedGenders[i - 1];
          const between = text.slice(prev.end, run[0].index);
          if (!/^[\s,&/]*(?:and)?[\s,&/]*$/i.test(between)) break;
          run.unshift(prev);
          i--;
        }
        for (const g of run) found.add(`${g.value}-${sizeSlug}`);
      } else if (following) {
        found.add(`${following.value}-${sizeSlug}`);
      }
    }
    if (/\bking\s*(?:&|and)\s*queen\b|\bkotb\b|\bqotb\b/i.test(text)) {
      found.add("king-queen-of-the-beach");
    }
    return [...found];
  }
  function findDivisions(text) {
    const found = /* @__PURE__ */ new Set();
    const addUnambiguous = (segment) => {
      for (const [re, slug] of DIVISION_TOKENS) if (re.test(segment)) found.add(slug);
    };
    addUnambiguous(text);
    const divisionLines = text.split("\n").filter((l) => /\bdiv(?:ision)?s?\b|\blevels?\b|\bbrackets?\b/i.test(l));
    const lettersFrom = (segment) => {
      for (const m of segment.matchAll(/\b(AAA|AA|BB|[ABC])\b/g)) {
        const token = m[1];
        if (token === "AAA") found.add("aaa");
        else if (token === "AA") found.add("aa");
        else if (token === "BB") found.add("bb");
        else found.add(token.toLowerCase());
      }
    };
    for (const line of divisionLines) lettersFrom(line);
    for (const m of text.matchAll(
      /\b(?:open|AAA|AA|BB|[ABC]|rec|recreational|masters)(?:\s*[\/,&]\s*(?:open|AAA|AA|BB|[ABC]|rec|recreational|masters)\b){1,}/gi
    )) {
      const run = m[0];
      const strong = (run.match(/\b(?:open|AAA|AA|BB|rec|recreational|masters)\b/gi) ?? []).length;
      if (strong >= 1 && run.split(/[\/,&]/).length >= 2) {
        addUnambiguous(run);
        lettersFrom(run);
      }
    }
    return [...found];
  }
  function findSurfaces(text) {
    const found = /* @__PURE__ */ new Set();
    if (/\b(?:beach|sand)\b/i.test(text)) found.add("beach");
    if (/\bgrass\b/i.test(text)) found.add("grass");
    if (/\bturf\b/i.test(text)) found.add("turf");
    if (/\bindoors?\b/i.test(text)) found.add("indoor");
    return [...found];
  }
  var STREET = /\b\d{1,6}\s+[NSEW]?\.?\s*[A-Za-z0-9'.\- ]{2,40}\b(?:street|st|avenue|ave|road|rd|drive|dr|boulevard|blvd|lane|ln|way|court|ct|circle|cir|parkway|pkwy|highway|hwy|terrace|ter|place|pl|trail|trl)\b\.?/i;
  function findPlace(text) {
    const place = {};
    const stateNames = Object.keys(STATES).sort((a, b) => b.length - a.length);
    const statePattern = new RegExp(
      `\\b(${[...STATE_CODES].join("|")}|${stateNames.join("|")})\\b`,
      "gi"
    );
    for (const m of text.matchAll(statePattern)) {
      const raw = squash(m[1]);
      const code = raw.length === 2 ? raw.toUpperCase() : STATES[raw.toLowerCase()];
      if (!code || !STATE_CODES.has(code)) continue;
      if (raw.length === 2 && raw !== raw.toUpperCase()) continue;
      const before = text.slice(0, m.index ?? 0);
      const cityMatch = before.match(
        /([A-Z][A-Za-z.'-]*(?:\s+[A-Z][A-Za-z.'-]*){0,3})\s*,\s*$/
      );
      if (!cityMatch) continue;
      const city = squash(cityMatch[1]);
      if (/^(?:mon|tues|wednes|thurs|fri|satur|sun)day$/i.test(city)) continue;
      if (MONTHS[city.toLowerCase()] !== void 0) continue;
      place.city = city;
      place.state = code;
      break;
    }
    const zip = text.match(/\b(\d{5})(?:-\d{4})?\b/);
    if (zip) place.postal_code = zip[1];
    const street = text.match(STREET);
    if (street) {
      const line = text.split("\n").find((l) => l.includes(street[0]));
      place.address_line = squash((line ?? street[0]).replace(/^\s*(?:location|venue|where|address)\s*:\s*/i, ""));
    }
    const labelled = text.match(/^\s*(?:location|venue|where|site|played?\s+at)\s*:\s*(.+)$/im);
    if (labelled) {
      const value = squash(labelled[1]);
      const beforeComma = value.split(",")[0];
      if (beforeComma && !STREET.test(beforeComma) && beforeComma.length <= 80) {
        place.venue_name = beforeComma;
      }
    }
    if (!place.venue_name) {
      const at = text.match(/\bat\s+((?:[A-Z][A-Za-z'&.-]*\s+){0,4}(?:Park|Beach|Courts?|Complex|Center|Centre|Club|Field|Fields|Gardens|Sports\s+\w+))\b/);
      if (at) place.venue_name = squash(at[1]);
    }
    if (!place.venue_name && place.city) {
      const line = text.split("\n").find((l) => new RegExp(`${escapeRegex(place.city)}\\s*,`).test(l));
      if (line) {
        const beforeCity = line.slice(0, line.indexOf(place.city));
        const candidate = squash(
          beforeCity.split(",").filter((s) => squash(s)).pop() ?? ""
        ).replace(/^\s*(?:location|venue|where|address)\s*:\s*/i, "").replace(/[\s\-–—|·:]+$/, "");
        const plausible = candidate.length >= 3 && candidate.length <= 60 && /^[A-Z]/.test(candidate) && !STREET.test(candidate) && !/^\d/.test(candidate);
        if (plausible) place.venue_name = candidate;
      }
    }
    return place;
  }
  function findName(text, firstDateIndex) {
    const lines = text.split("\n").map(squash).filter(Boolean);
    for (const line of lines.slice(0, 6)) {
      const words = line.split(" ").filter(Boolean);
      if (/^https?:/i.test(line)) continue;
      if (/^(?:date|when|where|location|venue|cost|entry|fee|divisions?|format)\s*:/i.test(line)) continue;
      if (line.length < 4 || words.length < 2) continue;
      const stripped = line.replace(/\b(?:mon|tues|wednes|thurs|fri|satur|sun)day\b/gi, "").replace(/\b[A-Za-z]{3,9}\.?\s+\d{1,2}(?:st|nd|rd|th)?\b/g, "").replace(/\d{1,2}\/\d{1,2}(?:\/\d{2,4})?/g, "");
      if (squash(stripped).length < line.length * 0.5) continue;
      if (line.length > 120) return null;
      if (words.length > 12) return null;
      if (/\b(?:we|we'll|we're|our|us|you|your|i'm|they)\b/i.test(line)) return null;
      if (/[.!?]\s*$/.test(line) && words.length > 4) return null;
      return line.replace(/[*_~]+/g, "").replace(/\s{2,}/g, " ").trim();
    }
    void firstDateIndex;
    return null;
  }
  function parseListing(raw, now = /* @__PURE__ */ new Date()) {
    const text = deEmoji(raw).replace(/\r\n/g, "\n");
    const fields = { surfaces: [], formats: [], divisions: [] };
    const found = [];
    const missing = [];
    const dates = findDates(text, now);
    const eventDates = dates.filter((d) => !DEADLINE_HINT.test(d.lead));
    const deadlines = dates.filter((d) => DEADLINE_HINT.test(d.lead));
    if (eventDates.length) {
      const first = eventDates[0];
      fields.starts_on = first.start;
      if (first.end) fields.ends_on = first.end;
      found.push(
        first.end ? `Dates ${first.start} to ${first.end}` : `Date ${first.start}`
      );
    } else {
      missing.push("Start date");
    }
    if (deadlines.length) {
      const deadline = deadlines[0].start;
      if (!fields.starts_on || deadline <= fields.starts_on) {
        fields.registration_deadline = deadline;
        found.push(`Registration deadline ${deadline}`);
      }
    }
    const fee = findFee(text);
    if (fee) {
      fields.entry_fee = fee.amount;
      fields.fee_basis = fee.basis;
      found.push(`Entry fee $${fee.amount} ${fee.basis === "per_team" ? "per team" : "per player"}`);
    } else {
      missing.push("Entry fee");
    }
    const payout = findPayout(text);
    if (payout) {
      fields.payout_text = payout;
      found.push("Payout / prizes");
    }
    fields.surfaces = findSurfaces(text);
    if (fields.surfaces.length) found.push(`Surface: ${fields.surfaces.join(", ")}`);
    else missing.push("Surface");
    fields.formats = findFormats(text);
    if (fields.formats.length) found.push(`Formats: ${fields.formats.length} matched`);
    else missing.push("Formats");
    fields.divisions = findDivisions(text);
    if (fields.divisions.length) found.push(`Divisions: ${fields.divisions.join(", ").toUpperCase()}`);
    else missing.push("Divisions");
    const place = findPlace(text);
    if (place.city) {
      fields.city = place.city;
      fields.state = place.state;
      found.push(`${place.city}, ${place.state}`);
    } else missing.push("City and state");
    if (place.postal_code) fields.postal_code = place.postal_code;
    if (place.address_line) fields.address_line = place.address_line;
    if (place.venue_name) {
      fields.venue_name = place.venue_name;
      found.push(`Venue: ${place.venue_name}`);
    } else missing.push("Venue name");
    const url = text.match(/https?:\/\/[^\s<>"')]+/);
    if (url) {
      fields.event_page_url = url[0].replace(/[.,]$/, "");
      found.push("Registration link");
    }
    const email = text.match(/\b[\w.+-]+@[\w-]+\.[\w.-]{2,}\b/);
    if (email) {
      fields.organizer_email = email[0];
      found.push("Organizer email");
    }
    const name = findName(text, eventDates[0]?.index ?? null);
    if (name) {
      fields.name = name;
      found.push(`Name: ${name}`);
    } else missing.push("Tournament name");
    const timeLines = text.split("\n").map(squash).filter((l) => /\b(?:check\s*-?\s*in|start|begins?|first\s+serve|players?\s+meeting|warm\s*-?\s*up)\b/i.test(l)).filter((l) => /\d/.test(l));
    if (timeLines.length) {
      fields.notes = timeLines.slice(0, 4).join("\n");
      found.push("Schedule notes");
    }
    const filled = Object.entries(fields).filter(([, v]) => Array.isArray(v) ? v.length > 0 : v !== void 0 && v !== "").map(([k]) => k);
    return { fields, filled, found, missing };
  }
  return __toCommonJS(parse_listing_exports);
})();
