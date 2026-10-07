/* =====================================================================
   COMPETE — interactive preview
   ---------------------------------------------------------------------
   A standalone reproduction of the running application, so the whole
   platform can be clicked through without deploying it.

   What is real here: every event, venue, organizer, surface, format and
   division comes from the seeded database; the radius search uses the
   same haversine maths against the same bundled US postal table; the map
   is the same Albers-projected geometry with the same validated colour
   ramp; the paste-and-parse reader is the production parser compiled for
   the browser, not a mock.

   What is not: there is no server, so accounts, saves and consent
   records live in memory and vanish on reload. The preview bar at the
   top says so rather than letting anyone assume otherwise.
   ===================================================================== */

(function () {
  'use strict';

  var PAGE_SIZE = 24;
  var LOCAL_RADIUS = 100;

  var S = {
    data: null,
    zips: null,          // "12345" -> { lat, lng, city, state }
    shiftDays: 0,        // season preview offset
    account: null,
    profile: null,
    host: null,
    relations: {},       // eventId -> saved | registered | attended
    consents: [],        // append-only, mirrors the sms_consents table
    homeZip: null,
    datesOpen: false,
    toast: null,
  };

  // ------------------------------------------------------------------
  // Small helpers
  // ------------------------------------------------------------------

  function esc(value) {
    if (value === null || value === undefined) return '';
    return String(value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function el(id) { return document.getElementById(id); }

  function todayIso() {
    var now = new Date();
    return (
      now.getUTCFullYear() +
      '-' + String(now.getUTCMonth() + 1).padStart(2, '0') +
      '-' + String(now.getUTCDate()).padStart(2, '0')
    );
  }

  /** Adds days to an ISO date without letting local time zones shift it. */
  function addDays(iso, days) {
    if (!iso || !days) return iso;
    var p = iso.split('-').map(Number);
    var d = new Date(Date.UTC(p[0], p[1] - 1, p[2] + days));
    return (
      d.getUTCFullYear() +
      '-' + String(d.getUTCMonth() + 1).padStart(2, '0') +
      '-' + String(d.getUTCDate()).padStart(2, '0')
    );
  }

  /* The season-preview offset is applied at the single point where an
     event's dates are read, so nothing downstream has to know about it. */
  function startsOn(e) { return addDays(e.startsOn, S.shiftDays); }
  function endsOn(e) { return e.endsOn ? addDays(e.endsOn, S.shiftDays) : null; }
  function finishesOn(e) { return endsOn(e) || startsOn(e); }
  function deadlineOn(e) { return e.deadline ? addDays(e.deadline, S.shiftDays) : null; }

  function formatDate(iso, style) {
    if (!iso) return '';
    var p = iso.split('-').map(Number);
    var d = new Date(Date.UTC(p[0], p[1] - 1, p[2]));
    return d.toLocaleDateString('en-US', {
      timeZone: 'UTC',
      weekday: style === 'short' ? 'short' : 'long',
      month: style === 'short' ? 'short' : 'long',
      day: 'numeric',
      year: style === 'short' ? undefined : 'numeric',
    });
  }

  function formatDateRange(a, b) {
    if (!b || b === a) return formatDate(a);
    var sp = a.split('-'), ep = b.split('-');
    if (sp[0] === ep[0] && sp[1] === ep[1]) {
      return formatDate(a).replace(/, \d{4}$/, '') + ' – ' + Number(ep[2]) + ', ' + ep[0];
    }
    return formatDate(a, 'short') + ' – ' + formatDate(b, 'short') + ', ' + ep[0];
  }

  function formatMoney(cents, basis) {
    if (cents === null || cents === undefined) return 'See event page';
    var dollars = cents / 100;
    var amount = dollars % 1 === 0 ? '$' + dollars.toFixed(0) : '$' + dollars.toFixed(2);
    return amount + (basis === 'per_team' ? ' / team' : ' / player');
  }

  function daysUntil(iso) {
    var p = iso.split('-').map(Number);
    var target = Date.UTC(p[0], p[1] - 1, p[2]);
    var n = new Date();
    var start = Date.UTC(n.getUTCFullYear(), n.getUTCMonth(), n.getUTCDate());
    return Math.round((target - start) / 86400000);
  }

  function countdownLabel(iso) {
    var n = daysUntil(iso);
    if (n < 0) return 'Past';
    if (n === 0) return 'Today';
    if (n === 1) return 'Tomorrow';
    if (n < 7) return 'In ' + n + ' days';
    if (n < 14) return 'Next week';
    if (n < 60) return 'In ' + Math.round(n / 7) + ' weeks';
    return 'In ' + Math.round(n / 30) + ' months';
  }

  /** Great-circle distance in miles — the same formula as miles_between(). */
  function milesBetween(lat1, lng1, lat2, lng2) {
    var rad = Math.PI / 180;
    var dLat = (lat2 - lat1) * rad;
    var dLng = (lng2 - lng1) * rad;
    var a =
      Math.pow(Math.sin(dLat / 2), 2) +
      Math.cos(lat1 * rad) * Math.cos(lat2 * rad) * Math.pow(Math.sin(dLng / 2), 2);
    return 3958.7613 * 2 * Math.asin(Math.sqrt(a));
  }

  function venueOf(e) { return S.data.venueById[e.venueId] || null; }
  function organizerOf(e) { return S.data.organizerById[e.organizerId] || null; }

  function venueLine(e) {
    var v = venueOf(e);
    if (!v) return 'Location to be announced';
    var city = [v.city, v.state].filter(Boolean).join(', ');
    return [v.name, city].filter(Boolean).join(' · ');
  }

  function nameOf(kind, slug) {
    var row = S.data.refBySlug[kind][slug];
    return row ? row.name : slug;
  }

  var GENDER_LABELS = { mens: "Men's", womens: "Women's", coed: 'Coed', open: 'Open' };

  function surfaceChipClass(slug) {
    return {
      beach: 'chip-beach', grass: 'chip-grass', turf: 'chip-turf',
      indoor: 'chip-indoor', outdoor: 'chip-turf',
    }[slug] || 'chip-muted';
  }

  function toast(message) {
    S.toast = message;
    render();
    window.setTimeout(function () {
      if (S.toast === message) { S.toast = null; render(); }
    }, 3200);
  }

  // ------------------------------------------------------------------
  // Routing
  // ------------------------------------------------------------------

  function route() {
    var raw = window.location.hash.replace(/^#/, '') || '/';
    var qIndex = raw.indexOf('?');
    var path = qIndex === -1 ? raw : raw.slice(0, qIndex);
    var query = new URLSearchParams(qIndex === -1 ? '' : raw.slice(qIndex + 1));
    return { parts: path.split('/').filter(Boolean), query: query };
  }

  function go(href) {
    window.location.hash = href;
  }

  function hrefWith(changes) {
    var r = route();
    var q = new URLSearchParams(r.query.toString());
    Object.keys(changes).forEach(function (key) {
      var value = changes[key];
      if (value === null || value === undefined || value === '') q.delete(key);
      else q.set(key, value);
    });
    if (!('page' in changes)) q.delete('page');
    var s = q.toString();
    return '/' + r.parts.join('/') + (s ? '?' + s : '');
  }

  // ------------------------------------------------------------------
  // Filtering — the same closed filter list as the production app
  // ------------------------------------------------------------------

  function parseFilters(query) {
    return {
      sport: query.get('sport') || 'volleyball',
      surfaces: (query.getAll('surface') || []),
      formats: (query.getAll('format') || []),
      genders: (query.getAll('gender') || []),
      divisions: (query.getAll('division') || []),
      state: query.get('state') || '',
      zip: query.get('zip') || '',
      radius: Number(query.get('radius') || 0) || 0,
      from: query.get('from') || '',
      to: query.get('to') || '',
      sort: query.get('sort') || 'date',
      page: Math.max(1, Number(query.get('page') || 1)),
      past: query.get('past') === '1',
    };
  }

  function anyFilter(f) {
    return Boolean(
      f.surfaces.length || f.formats.length || f.genders.length ||
      f.divisions.length || f.state || f.zip || f.from || f.to || f.past,
    );
  }

  function originFor(zip) {
    if (!zip) return null;
    var hit = S.zips[zip.trim()];
    if (!hit) return null;
    return { lat: hit.lat, lng: hit.lng, label: hit.city + ', ' + hit.state };
  }

  /**
   * Applies every filter except the one named, which is how a facet count
   * says "how many more you would get" rather than "how many you have".
   */
  function applyFilters(f, except) {
    var day = todayIso();
    var origin = f.radius ? originFor(f.zip) : null;

    return S.data.events.filter(function (e) {
      if (e.sport !== f.sport) return false;

      if (!f.past && except !== 'date') {
        if (finishesOn(e) < day) return false;
      }
      if (f.from && except !== 'date' && startsOn(e) < f.from) return false;
      if (f.to && except !== 'date' && startsOn(e) > f.to) return false;

      if (except !== 'surface' && f.surfaces.length &&
          !f.surfaces.some(function (s) { return e.surfaces.indexOf(s) !== -1; })) return false;
      if (except !== 'format' && f.formats.length &&
          !f.formats.some(function (key) { return eventHasFormatKey(e, key); })) return false;
      if (except !== 'gender' && f.genders.length &&
          !f.genders.some(function (s) { return e.genders.indexOf(s) !== -1; })) return false;
      if (except !== 'division' && f.divisions.length &&
          !f.divisions.some(function (s) { return e.divisions.indexOf(s) !== -1; })) return false;

      var v = venueOf(e);
      if (except !== 'state' && f.state && (!v || v.state !== f.state)) return false;

      if (origin && except !== 'radius') {
        if (!v || v.lat === null || v.lng === null) return false;
        if (milesBetween(origin.lat, origin.lng, v.lat, v.lng) > f.radius) return false;
      }
      return true;
    });
  }

  function withDistance(events, origin) {
    return events.map(function (e) {
      var v = venueOf(e);
      var d = origin && v && v.lat !== null
        ? milesBetween(origin.lat, origin.lng, v.lat, v.lng)
        : null;
      return { e: e, distance: d };
    });
  }

  function sortRows(rows, sort) {
    var copy = rows.slice();
    if (sort === 'distance') {
      copy.sort(function (a, b) {
        if (a.distance === null) return 1;
        if (b.distance === null) return -1;
        return a.distance - b.distance || startsOn(a.e).localeCompare(startsOn(b.e));
      });
    } else if (sort === 'price') {
      copy.sort(function (a, b) {
        var af = a.e.feeCents === null ? Infinity : a.e.feeCents;
        var bf = b.e.feeCents === null ? Infinity : b.e.feeCents;
        return af - bf || startsOn(a.e).localeCompare(startsOn(b.e));
      });
    } else {
      copy.sort(function (a, b) {
        return startsOn(a.e).localeCompare(startsOn(b.e)) || a.e.name.localeCompare(b.e.name);
      });
    }
    return copy;
  }

  function countBy(f, kind, slugs, field) {
    var base = applyFilters(f, kind);
    return slugs.map(function (option) {
      var n = base.filter(function (e) { return e[field].indexOf(option.slug) !== -1; }).length;
      return { slug: option.slug, name: option.name, count: n };
    }).filter(function (o) { return o.count > 0 || f[kind + 's'] && f[kind + 's'].indexOf(o.slug) !== -1; });
  }

  // ------------------------------------------------------------------
  // Derived collections
  // ------------------------------------------------------------------

  function upcomingEvents(sport) {
    var day = todayIso();
    return S.data.events.filter(function (e) {
      return e.sport === sport && finishesOn(e) >= day;
    });
  }

  function stateCounts(sport) {
    var day = todayIso();
    var map = {};
    S.data.events.forEach(function (e) {
      if (e.sport !== sport) return;
      var v = venueOf(e);
      if (!v || !v.state) return;
      if (!map[v.state]) map[v.state] = { upcoming: 0, total: 0, organizers: {} };
      map[v.state].total += 1;
      if (finishesOn(e) >= day) map[v.state].upcoming += 1;
      if (e.organizerId) map[v.state].organizers[e.organizerId] = true;
    });
    Object.keys(map).forEach(function (k) {
      map[k].organizers = Object.keys(map[k].organizers).length;
    });
    return map;
  }

  function stepFor(counts) {
    var scale = S.data.scale;
    if (!counts || counts.total === 0) return scale.empty;
    if (counts.upcoming === 0) return scale.dormant;
    for (var i = 0; i < scale.steps.length; i += 1) {
      if (counts.upcoming >= scale.steps[i].min) return scale.steps[i];
    }
    return scale.steps[scale.steps.length - 1];
  }

  /**
   * Hybrid featured rail: staff picks first, in their set order, then
   * topped up by payout, division breadth and imminence. Anything in the
   * top-up is labelled as a top-up, never passed off as a pick.
   */
  function featuredEvents(sport, limit) {
    var up = upcomingEvents(sport);
    var picks = up.filter(function (e) { return e.featured; })
      .sort(function (a, b) { return (a.featuredRank || 99) - (b.featuredRank || 99); });

    var rest = up.filter(function (e) { return !e.featured; }).sort(function (a, b) {
      var score = function (e) {
        return (e.payout ? 2 : 0) + Math.min(e.divisions.length, 4) / 4;
      };
      return score(b) - score(a) || startsOn(a).localeCompare(startsOn(b));
    });

    return picks.concat(rest).slice(0, limit);
  }

  function localEvents(sport, origin, radius, limit) {
    if (!origin) return [];
    return withDistance(upcomingEvents(sport), origin)
      .filter(function (r) { return r.distance !== null && r.distance <= radius; })
      .sort(function (a, b) { return a.distance - b.distance; })
      .slice(0, limit);
  }

  // ------------------------------------------------------------------
  // Components
  // ------------------------------------------------------------------

  function eventCard(e, distance) {
    var start = startsOn(e);
    var p = start.split('-').map(Number);
    var d = new Date(Date.UTC(p[0], p[1] - 1, p[2]));
    var v = venueOf(e);
    var chips = e.surfaces.slice(0, 2).map(function (s) {
      return '<span class="' + surfaceChipClass(s) + '">' + esc(nameOf('surface', s)) + '</span>';
    }).join('');
    var formats = e.formats.slice(0, 3).map(function (s) { return nameOf('format', s); }).join(' · ');
    var extra = e.formats.length > 3 ? ' +' + (e.formats.length - 3) : '';

    return (
      '<a class="card" href="#/events/' + esc(e.slug) + '">' +
        '<div class="ecard">' +
          '<div class="ecard-date">' +
            '<span class="ecard-month">' + d.toLocaleDateString('en-US', { month: 'short', timeZone: 'UTC' }) + '</span>' +
            '<span class="ecard-day">' + d.getUTCDate() + '</span>' +
            '<span class="ecard-wd">' + d.toLocaleDateString('en-US', { weekday: 'short', timeZone: 'UTC' }) + '</span>' +
          '</div>' +
          '<div class="ecard-body">' +
            '<div class="flex wrapf g2 center" style="margin-bottom:8px">' + chips +
              (e.featured ? '<span class="chip-featured">Featured</span>' : '') +
              '<span class="chip-muted">' + esc(countdownLabel(start)) + '</span>' +
            '</div>' +
            '<h3 class="t-head" style="font-size:16px;line-height:1.25">' + esc(e.name) + '</h3>' +
            '<p class="small muted mt2">' + esc(venueLine(e)) + '</p>' +
            '<p class="tiny faint mt2">' + esc(formats + extra || 'Formats to be announced') + '</p>' +
            '<div class="flex wrapf g3 center mt3">' +
              '<span class="small bold">' + esc(formatMoney(e.feeCents, e.feeBasis)) + '</span>' +
              (distance !== null && distance !== undefined
                ? '<span class="tiny surf">' + (distance < 1 ? 'Less than a mile away' : Math.round(distance) + ' mi away') + '</span>'
                : '') +
              (v && v.precision !== 'exact' ? '<span class="tiny faint">approx. location</span>' : '') +
            '</div>' +
          '</div>' +
        '</div>' +
      '</a>'
    );
  }

  function saveButton(eventId, small) {
    var rel = S.relations[eventId] || null;
    var cls = small ? 'btn btn-ghost btn-sm' : 'btn btn-ghost';
    var primary = small ? 'btn btn-primary btn-sm' : 'btn btn-primary';

    if (rel === 'registered') {
      return '<div class="flex wrapf g2 center">' +
        '<span class="chip-accent">You are in</span>' +
        '<button class="' + cls + '" data-act="relate" data-id="' + esc(eventId) + '" data-rel="saved">Not going</button>' +
      '</div>';
    }
    if (rel === 'saved') {
      return '<div class="flex wrapf g2 center">' +
        '<button class="' + primary + '" data-act="relate" data-id="' + esc(eventId) + '" data-rel="registered">I&#39;m registered</button>' +
        '<button class="' + cls + '" data-act="relate" data-id="' + esc(eventId) + '" data-rel="">Unsave</button>' +
      '</div>';
    }
    return '<button class="' + cls + '" data-act="relate" data-id="' + esc(eventId) + '" data-rel="saved">Save</button>';
  }

  function emptyState(title, body, cta) {
    return '<div class="panel" style="padding:56px 24px;text-align:center">' +
      '<p class="t-display coral" style="font-size:24px">' + esc(title) + '</p>' +
      '<p class="small muted mt3" style="max-width:420px;margin-left:auto;margin-right:auto">' + esc(body) + '</p>' +
      (cta || '') +
    '</div>';
  }

  // ------------------------------------------------------------------
  // The US map
  // ------------------------------------------------------------------

  function usMap(sport, opts) {
    var counts = stateCounts(sport);
    var linked = opts && opts.linked !== false;
    var height = (opts && opts.height) || 'auto';

    var paths = S.data.map.states.map(function (st) {
      var c = counts[st.code];
      var step = stepFor(c);
      var label = st.name + ' — ' +
        (!c || c.total === 0 ? 'no events listed'
          : c.upcoming === 0 ? 'community here, nothing scheduled'
          : c.upcoming + (c.upcoming === 1 ? ' upcoming event' : ' upcoming events'));

      var common =
        ' d="' + st.d + '" fill="' + step.fill + '" stroke="' + step.stroke +
        '" stroke-width="' + step.strokeWidth + '"';

      if (!linked || !c || c.upcoming === 0) {
        return '<path class="state-flat"' + common + '><title>' + esc(label) + '</title></path>';
      }
      return '<a href="#/communities/' + esc(sport) + '/' + st.code.toLowerCase() + '">' +
        '<path class="state-shape"' + common + '><title>' + esc(label) + '</title></path></a>';
    }).join('');

    return '<svg viewBox="' + S.data.map.viewBox + '" role="img" aria-label="Map of the United States" ' +
      'style="width:100%;height:' + height + ';display:block">' + paths + '</svg>';
  }

  function mapLegend() {
    var scale = S.data.scale;
    var items = scale.steps.slice().reverse().map(function (s) {
      return legendSwatch(s.fill, s.stroke, s.label);
    }).join('') + legendSwatch(scale.dormant.fill, scale.dormant.stroke, scale.dormant.label) +
      legendSwatch(scale.empty.fill, scale.empty.stroke, scale.empty.label);
    return '<div class="flex wrapf g3 center">' + items + '</div>';
  }

  function legendSwatch(fill, stroke, label) {
    return '<span class="flex center g2 tiny muted">' +
      '<span style="width:16px;height:16px;border-radius:4px;background:' + fill +
      ';border:1.5px solid ' + stroke + ';display:inline-block"></span>' + esc(label) + '</span>';
  }

  /** Groups venues that would overlap at this zoom — ports src/lib/cluster.ts. */
  function clusterVenues(rows, threshold) {
    var placed = rows.filter(function (r) { return r.venue.x !== null; });
    placed.sort(function (a, b) { return b.events.length - a.events.length; });

    var groups = [];
    placed.forEach(function (row) {
      var home = null;
      for (var i = 0; i < groups.length; i += 1) {
        var anchor = groups[i][0].venue;
        if (Math.hypot(anchor.x - row.venue.x, anchor.y - row.venue.y) <= threshold) {
          home = groups[i];
          break;
        }
      }
      if (home) home.push(row);
      else groups.push([row]);
    });

    return groups.map(function (members) {
      var cities = {};
      var count = 0;
      members.forEach(function (m) { cities[m.venue.city] = true; count += m.events.length; });
      var cityNames = Object.keys(cities);
      return {
        x: members[0].venue.x,
        y: members[0].venue.y,
        label: cityNames.length === 1 ? cityNames[0] : members.length + ' venues',
        count: count,
        approximate: members.some(function (m) { return m.venue.precision !== 'exact'; }),
        members: members,
      };
    });
  }

  // ------------------------------------------------------------------
  // Views
  // ------------------------------------------------------------------

  function homeView() {
    var sport = 'volleyball';
    var origin = S.profile && S.profile.zip ? originFor(S.profile.zip) : originFor(S.homeZip);
    var radius = S.profile && S.profile.radius ? S.profile.radius : LOCAL_RADIUS;
    var featured = featuredEvents(sport, 3);
    var local = localEvents(sport, origin, radius, 6);
    var up = upcomingEvents(sport);
    var counts = stateCounts(sport);
    var liveStates = Object.keys(counts).filter(function (k) { return counts[k].upcoming > 0; }).length;
    var organizers = {};
    up.forEach(function (e) { if (e.organizerId) organizers[e.organizerId] = true; });

    var zipValue = (S.profile && S.profile.zip) || S.homeZip || '';

    return (
      '<section class="band-sun" style="border-bottom:2px solid var(--line);position:relative;overflow:hidden">' +
        '<div class="pat-rays" style="position:absolute;inset:0;opacity:0.5;pointer-events:none"></div>' +
        '<div class="wrap py12" style="position:relative">' +
          '<p class="t-kicker surf">Adult recreational sports</p>' +
          '<h1 class="t-display mt3" style="font-size:clamp(32px,6vw,56px);line-height:1.02;max-width:760px">' +
            'Find the events<br><span class="coral">you never knew existed.</span>' +
          '</h1>' +
          '<p class="mt4 muted" style="max-width:520px;font-size:17px">' +
            'Every adult tournament, league and open play in one place — connecting ' +
            'the people who run events with the people looking for their next one.' +
          '</p>' +

          '<form class="panel p4 mt6" data-form="homezip" style="max-width:480px">' +
            '<label class="label" for="homezip">Your ZIP code</label>' +
            '<div class="flex g2">' +
              '<input class="field" id="homezip" name="zip" inputmode="numeric" maxlength="5" ' +
                'placeholder="63110" value="' + esc(zipValue) + '">' +
              '<button class="btn btn-primary" type="submit">Go</button>' +
            '</div>' +
            '<p class="tiny faint mt2">' +
              (origin ? 'Showing events near ' + esc(origin.label) + '.' : 'Tell us where you play and local events appear below.') +
            '</p>' +
          '</form>' +

          '<dl class="flex wrapf g6 mt8">' +
            statTile(up.length, 'upcoming events') +
            statTile(liveStates, liveStates === 1 ? 'state' : 'states') +
            statTile(Object.keys(organizers).length, 'organizers') +
          '</dl>' +
        '</div>' +
        '<div class="edge-scallop"></div>' +
      '</section>' +

      '<section class="wrap py10">' +
        '<div class="flex between baseline g3">' +
          '<h2 class="t-head" style="font-size:22px">Featured events</h2>' +
          '<a class="tiny surf" href="#/events">See all →</a>' +
        '</div>' +
        (featured.length
          ? '<div class="cols-3 mt5">' + featured.map(function (e) {
              return '<div class="flex col g2">' +
                '<span class="' + (e.featured ? 'chip-featured' : 'chip-muted') + '" style="align-self:flex-start">' +
                  (e.featured ? 'Featured' : 'Worth a look') + '</span>' +
                eventCard(e) +
                '<div class="flex end">' + saveButton(e.id, true) + '</div>' +
              '</div>';
            }).join('') + '</div>'
          : '<p class="muted mt4">Nothing upcoming to feature right now.</p>') +
      '</section>' +

      '<section class="wrap py10" style="border-top:2px solid var(--line)">' +
        '<div class="flex between baseline g3">' +
          '<h2 class="t-head" style="font-size:22px">Events near you</h2>' +
          (origin ? '<a class="tiny surf" href="#/events?zip=' + esc(zipValue) + '&radius=' + radius + '">See all nearby →</a>' : '') +
        '</div>' +
        (!origin
          ? '<p class="muted mt4">Tell us where you play — the ZIP box above — and this fills with what is near you.</p>'
          : local.length
            ? '<p class="tiny faint mt2">Within ' + radius + ' miles of ' + esc(origin.label) + '</p>' +
              '<div class="cols-3 mt5">' + local.map(function (r) {
                return '<div class="flex col g2">' + eventCard(r.e, r.distance) +
                  '<div class="flex end">' + saveButton(r.e.id, true) + '</div></div>';
              }).join('') + '</div>'
            : '<p class="muted mt4">Nothing on the calendar within ' + radius + ' miles of ' + esc(origin.label) +
              ' yet. Try a wider radius on the <a class="surf" href="#/events">browse page</a>.</p>') +
      '</section>' +

      '<section class="band-aqua" style="border-top:2px solid var(--line)">' +
        '<div class="wrap py10">' +
          '<div class="flex between baseline g3 wrapf">' +
            '<h2 class="t-head" style="font-size:22px">Browse the country</h2>' +
            '<a class="tiny surf" href="#/communities">All communities →</a>' +
          '</div>' +
          '<p class="muted small mt2" style="max-width:520px">Pick a state and see where people are playing.</p>' +
          '<div class="panel p4 mt5">' + usMap(sport) + '</div>' +
          '<div class="mt4">' + mapLegend() + '</div>' +
        '</div>' +
      '</section>'
    );
  }

  function statTile(value, label) {
    return '<div><dd class="t-head coral" style="font-size:28px;margin:0">' + value + '</dd>' +
      '<dt class="kicker-up mt1">' + esc(label) + '</dt></div>';
  }

  // -------------------------------------------------- browse

  function browseView(query) {
    var f = parseFilters(query);
    var origin = f.radius ? originFor(f.zip) : null;
    var matched = applyFilters(f, null);
    var rows = sortRows(withDistance(matched, origin), f.sort);

    var lastPage = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
    var page = Math.min(f.page, lastPage);
    var slice = rows.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

    var context = origin
      ? 'Within ' + f.radius + ' miles of ' + origin.label
      : f.state
        ? 'In ' + (S.data.stateNames[f.state] || f.state)
        : 'Everywhere in the United States';

    return (
      '<div class="band-sun" style="border-bottom:2px solid var(--line)">' +
        '<div class="wrap py8">' +
          '<p class="t-kicker surf">Browse</p>' +
          '<h1 class="t-display mt2" style="font-size:clamp(26px,4vw,38px)">Every <span class="coral">event</span></h1>' +
        '</div>' +
      '</div>' +

      '<div class="wrap mt8 browse-grid" style="padding-bottom:48px">' +
        '<aside class="filter-rail">' + filterPanel(f, rows.length) + '</aside>' +
        '<section>' +
          '<div class="flex wrapf between baseline g3" style="border-bottom:2px solid var(--line);padding-bottom:12px;margin-bottom:20px">' +
            '<div>' +
              '<h2 class="t-head" style="font-size:20px">' + rows.length + ' ' + (rows.length === 1 ? 'event' : 'events') + '</h2>' +
              '<p class="kicker-up mt1">' + esc(context) + '</p>' +
            '</div>' +
            '<nav class="flex center g1">' +
              '<span class="t-kicker" style="margin-right:4px">Sort</span>' +
              sortLink('date', 'Date', f.sort) +
              (origin ? sortLink('distance', 'Distance', f.sort) : '') +
              sortLink('price', 'Price', f.sort) +
            '</nav>' +
          '</div>' +

          activePills(f) +

          (slice.length === 0
            ? emptyState(
                anyFilter(f) ? 'Nothing matches that' : 'Nothing on the calendar',
                anyFilter(f)
                  ? 'Loosen a filter — a wider radius or a longer date range usually does it.'
                  : 'No upcoming events for this sport yet.',
                '<a class="btn btn-ghost mt6" href="#/events">Clear all filters</a>')
            : '<ul class="cols-2" style="list-style:none;padding:0;margin:0">' +
                slice.map(function (r) {
                  return '<li class="flex col g2">' + eventCard(r.e, r.distance) +
                    '<div class="flex end">' + saveButton(r.e.id, true) + '</div></li>';
                }).join('') +
              '</ul>') +

          (lastPage > 1 ? pagination(page, lastPage) : '') +
        '</section>' +
      '</div>'
    );
  }

  function sortLink(value, label, current) {
    var on = current === value;
    return '<a class="' + (on ? 'tab' : 'tab') + '" ' + (on ? 'aria-current="page"' : '') +
      ' href="#' + hrefWith({ sort: value }) + '">' + label + '</a>';
  }

  function pagination(page, lastPage) {
    var prev = page > 1 ? '<a class="btn btn-ghost btn-sm" href="#' + hrefWith({ page: page - 1 }) + '">← Previous</a>' : '';
    var next = page < lastPage ? '<a class="btn btn-ghost btn-sm" href="#' + hrefWith({ page: page + 1 }) + '">Next →</a>' : '';
    return '<div class="flex between center mt8">' + (prev || '<span></span>') +
      '<span class="kicker-up">Page ' + page + ' of ' + lastPage + '</span>' + (next || '<span></span>') + '</div>';
  }

  function activePills(f) {
    var pills = [];
    var add = function (label, changes) {
      pills.push('<a class="pill" href="#' + hrefWith(changes) + '">' + esc(label) + ' ✕</a>');
    };
    f.surfaces.forEach(function (s) { add(nameOf('surface', s), { surface: null }); });
    f.formats.forEach(function (key) {
      var g = formatGroups(f.sport).find(function (x) { return x.slug === key; });
      add(g ? g.name : key, { format: null });
    });
    f.genders.forEach(function (s) { add(GENDER_LABELS[s] || s, { gender: null }); });
    f.divisions.forEach(function (s) { add(nameOf('division', s), { division: null }); });
    if (f.state) add(S.data.stateNames[f.state] || f.state, { state: null });
    if (f.radius && f.zip) add(f.radius + ' mi of ' + f.zip, { radius: null, zip: null });
    if (f.from) add('From ' + f.from, { from: null });
    if (f.to) add('To ' + f.to, { to: null });
    if (f.past) add('Including past', { past: null });

    if (!pills.length) return '';
    return '<div class="flex wrapf g2" style="margin-bottom:16px">' + pills.join('') +
      '<a class="tiny surf" style="align-self:center" href="#/events?sport=' + esc(f.sport) + '">Clear all</a></div>';
  }

  function filterPanel(f, resultCount) {
    var sports = S.data.sports;
    var surfaces = countBy(f, 'surface', S.data.surfaces.filter(bySport(f.sport)), 'surfaces');
    var formatBase = applyFilters(f, 'format');
    var formats = formatGroups(f.sport).map(function (g) {
      return {
        slug: g.slug,
        name: g.name,
        count: formatBase.filter(function (e) {
          return g.slugs.some(function (slug) { return e.formats.indexOf(slug) !== -1; });
        }).length,
      };
    }).filter(function (o) { return o.count > 0 || f.formats.indexOf(o.slug) !== -1; });
    var divisions = countBy(f, 'division', S.data.divisions.filter(bySport(f.sport)), 'divisions');

    var genderOptions = ['mens', 'womens', 'coed', 'open'].map(function (g) {
      var base = applyFilters(f, 'gender');
      return { slug: g, name: GENDER_LABELS[g], count: base.filter(function (e) { return e.genders.indexOf(g) !== -1; }).length };
    }).filter(function (o) { return o.count > 0 || f.genders.indexOf(o.slug) !== -1; });

    var states = {};
    applyFilters(f, 'state').forEach(function (e) {
      var v = venueOf(e);
      if (v && v.state) states[v.state] = (states[v.state] || 0) + 1;
    });
    var stateList = Object.keys(states).sort(function (a, b) {
      return (S.data.stateNames[a] || a).localeCompare(S.data.stateNames[b] || b);
    });

    return '<div class="panel p4">' +
      '<div class="flex between baseline">' +
        '<h2 class="t-head" style="font-size:16px">Filters</h2>' +
        '<span class="kicker-up">' + resultCount + ' shown</span>' +
      '</div>' +

      (sports.length > 1
        ? '<div class="mt4"><span class="label">Sport</span><div class="flex wrapf g2">' +
          sports.map(function (s) {
            var on = f.sport === s.slug;
            return '<a class="toggle-chip" style="' + (on ? 'background:var(--surf-ink);color:#fff;border-color:var(--surf-ink)' : '') + '" ' +
              'href="#/events?sport=' + esc(s.slug) + '">' + esc(s.name) + '</a>';
          }).join('') + '</div></div>'
        : '') +

      '<form class="mt5" data-form="location">' +
        '<span class="label">Near a ZIP code</span>' +
        '<div class="flex g2">' +
          '<input class="field" name="zip" inputmode="numeric" maxlength="5" placeholder="60614" value="' + esc(f.zip) + '">' +
          '<select class="field" name="radius" style="width:auto">' +
            [0, 10, 25, 50, 100, 250].map(function (r) {
              return '<option value="' + r + '"' + (f.radius === r ? ' selected' : '') + '>' +
                (r === 0 ? 'Any' : r + ' mi') + '</option>';
            }).join('') +
          '</select>' +
        '</div>' +
        '<button class="btn btn-ghost btn-sm mt2 w-full" type="submit">Apply</button>' +
        (f.zip && !originFor(f.zip) ? '<p class="tiny coral mt2">We do not recognise that ZIP code.</p>' : '') +
      '</form>' +

      dateControl(f) +

      (stateList.length
        ? '<div class="mt5"><span class="label">State</span>' +
          '<select class="field" data-act="state">' +
            '<option value="">Every state</option>' +
            stateList.map(function (code) {
              return '<option value="' + code + '"' + (f.state === code ? ' selected' : '') + '>' +
                esc(S.data.stateNames[code] || code) + ' (' + states[code] + ')</option>';
            }).join('') +
          '</select></div>'
        : '') +

      facetGroup('Surface', 'surface', surfaces, f.surfaces) +
      facetGroup('Format', 'format', formats, f.formats) +
      facetGroup('Gender', 'gender', genderOptions, f.genders) +
      facetGroup('Division', 'division', divisions, f.divisions) +

      '<label class="facet mt5"><input type="checkbox" data-act="past"' + (f.past ? ' checked' : '') + '>' +
        '<span class="facet-label"><span class="facet-box">✓</span>Include past events</span></label>' +

      '<a class="btn btn-ghost btn-sm w-full mt4" href="#/events?sport=' + esc(f.sport) + '">Clear filters</a>' +
    '</div>';
  }

  /**
   * One control for the whole date range.
   *
   * Two date inputs side by side did not fit the rail — the second ran past
   * its edge — and two bare fields are a poor way to ask "when are you
   * free". This is a button showing the current range which opens a panel
   * holding the presets most people want, with the fields stacked beneath.
   */
  function dateControl(f) {
    var summary = f.from && f.to
      ? formatDate(f.from, 'short') + ' – ' + formatDate(f.to, 'short')
      : f.from ? 'From ' + formatDate(f.from, 'short')
      : f.to ? 'Until ' + formatDate(f.to, 'short')
      : 'Any date';

    var presets = [
      ['Any date', '', ''],
      ['This weekend', weekendStart(), addDays(weekendStart(), 1)],
      ['Next 30 days', todayIso(), addDays(todayIso(), 30)],
      ['Next 3 months', todayIso(), addDays(todayIso(), 90)],
    ];

    return '<div class="mt5" style="position:relative">' +
      '<span class="label">Dates</span>' +
      '<button type="button" class="field flex between center g2" data-act="dates-toggle" ' +
        'style="text-align:left;cursor:pointer" aria-expanded="' + (S.datesOpen ? 'true' : 'false') + '">' +
        '<span' + (f.from || f.to ? '' : ' class="faint"') + '>' + esc(summary) + '</span>' +
        '<span class="faint" aria-hidden>' + (S.datesOpen ? '▴' : '▾') + '</span>' +
      '</button>' +
      (S.datesOpen
        ? '<div class="date-pop">' +
            '<div class="flex wrapf g2">' +
              presets.map(function (p) {
                return '<button type="button" class="btn btn-ghost btn-sm" data-act="date-preset" ' +
                  'data-from="' + p[1] + '" data-to="' + p[2] + '">' + p[0] + '</button>';
              }).join('') +
            '</div>' +
            '<form class="grid g3 mt3" data-form="dates">' +
              '<div><label class="label" for="d-from">From</label>' +
                '<input class="field" id="d-from" type="date" name="from" value="' + esc(f.from) + '"></div>' +
              '<div><label class="label" for="d-to">Until</label>' +
                '<input class="field" id="d-to" type="date" name="to" value="' + esc(f.to) + '"></div>' +
              '<button class="btn btn-primary btn-sm w-full" type="submit">Apply dates</button>' +
            '</form>' +
          '</div>'
        : '') +
    '</div>';
  }

  /** The coming Saturday, or today if it already is one. */
  function weekendStart() {
    var d = new Date();
    return addDays(todayIso(), (6 - d.getDay() + 7) % 7);
  }

  function bySport(sport) {
    return function (row) { return row.sport === sport; };
  }

  /**
   * Formats collapse to team size.
   *
   * "Men's Doubles", "Women's Doubles", "Coed Doubles" and "Reverse Coed
   * Doubles" are one choice — Doubles — because the Gender filter beside it
   * already says who is playing, and saying it twice made the list four
   * times longer. A size holding only one format keeps that format's own
   * name, so "King & Queen of the Beach" is not flattened into "1".
   */
  var SIZE_NAMES = { 2: 'Doubles', 3: 'Triples', 4: 'Quads', 5: 'Fives', 6: 'Sixes', 8: 'Eights' };

  function formatKey(row) {
    return row.teamSize === null || row.teamSize === undefined
      ? row.slug
      : 'size-' + row.teamSize;
  }

  function formatGroups(sport) {
    var order = [];
    var byKey = {};
    S.data.formats.filter(bySport(sport)).forEach(function (row) {
      var key = formatKey(row);
      if (!byKey[key]) { byKey[key] = { slug: key, rows: [], teamSize: row.teamSize }; order.push(key); }
      byKey[key].rows.push(row);
    });
    return order.map(function (key) {
      var g = byKey[key];
      g.name = g.rows.length === 1 ? g.rows[0].name : (SIZE_NAMES[g.teamSize] || g.rows[0].name);
      g.slugs = g.rows.map(function (r) { return r.slug; });
      return g;
    });
  }

  function eventHasFormatKey(e, key) {
    var group = formatGroups(e.sport).find(function (g) { return g.slug === key; });
    if (!group) return false;
    return group.slugs.some(function (slug) { return e.formats.indexOf(slug) !== -1; });
  }

  function facetGroup(label, key, options, active) {
    if (!options.length) return '';
    return '<fieldset class="mt5" style="border:0;padding:0;margin-left:0;margin-right:0">' +
      '<legend class="label">' + esc(label) + '</legend>' +
      options.map(function (o) {
        var on = active.indexOf(o.slug) !== -1;
        return '<label class="facet">' +
          '<input type="checkbox" data-act="facet" data-key="' + key + '" value="' + esc(o.slug) + '"' + (on ? ' checked' : '') + '>' +
          '<span class="facet-label"><span class="facet-box">✓</span>' + esc(o.name) + '</span>' +
          '<span class="facet-count">' + o.count + '</span>' +
        '</label>';
      }).join('') +
    '</fieldset>';
  }

  // -------------------------------------------------- event detail

  function eventView(slug) {
    var e = S.data.eventBySlug[slug];
    if (!e) return notFoundView('That event is not in the preview data.');

    var v = venueOf(e);
    var org = organizerOf(e);
    var start = startsOn(e);
    var mapsQuery = v
      ? (v.address ? (v.name || '') + ' ' + v.address : [v.name, v.city, v.state].filter(Boolean).join(', '))
      : e.name;

    var nearby = v && v.lat !== null
      ? withDistance(upcomingEvents(e.sport).filter(function (o) { return o.id !== e.id; }),
          { lat: v.lat, lng: v.lng })
          .filter(function (r) { return r.distance !== null && r.distance <= 75; })
          .sort(function (a, b) { return a.distance - b.distance; })
          .slice(0, 3)
      : [];

    var facts = [
      ['When', formatDateRange(start, endsOn(e)) + (e.startTime ? ' · starts ' + e.startTime : '')],
      ['Where', venueLine(e) + (v && v.address ? ' · ' + v.address : '')],
      ['Entry', formatMoney(e.feeCents, e.feeBasis)],
      e.payout ? ['Payout', e.payout] : null,
      deadlineOn(e) ? ['Register by', formatDate(deadlineOn(e))] : null,
      e.surfaces.length ? ['Surface', e.surfaces.map(function (s) { return nameOf('surface', s); }).join(', ')] : null,
      e.formats.length ? ['Formats', e.formats.map(function (s) { return nameOf('format', s); }).join(', ')] : null,
      e.divisions.length ? ['Divisions', e.divisions.map(function (s) { return nameOf('division', s); }).join(', ')] : null,
      e.genders.length ? ['Who plays', e.genders.map(function (g) { return GENDER_LABELS[g] || g; }).join(', ')] : null,
      org ? ['Organizer', org.name] : null,
    ].filter(Boolean);

    return (
      '<div class="band-sun" style="border-bottom:2px solid var(--line)">' +
        '<div class="wrap py8">' +
          '<a class="tiny surf" href="#/events">← Back to browsing</a>' +
          '<div class="flex wrapf g2 center mt4">' +
            e.surfaces.map(function (s) {
              return '<span class="' + surfaceChipClass(s) + '">' + esc(nameOf('surface', s)) + '</span>';
            }).join('') +
            (e.featured ? '<span class="chip-featured">Featured</span>' : '') +
            '<span class="chip-muted">' + esc(countdownLabel(start)) + '</span>' +
            '<span class="chip-muted">Adult recreational event</span>' +
          '</div>' +
          '<h1 class="t-head mt3" style="font-size:clamp(24px,4vw,38px);line-height:1.15;max-width:820px">' + esc(e.name) + '</h1>' +
          '<p class="mt3 muted" style="font-size:16px">' + esc(formatDateRange(start, endsOn(e))) + ' · ' + esc(venueLine(e)) + '</p>' +
          '<div class="flex wrapf g2 mt6">' +
            (e.url ? '<a class="btn btn-primary" href="' + esc(e.url) + '" target="_blank" rel="noopener noreferrer nofollow">Register on organizer site ↗</a>' : '') +
            '<button class="btn btn-ghost" data-act="ics" data-slug="' + esc(e.slug) + '">Add to calendar</button>' +
            '<a class="btn btn-ghost" href="https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent(mapsQuery) + '" target="_blank" rel="noopener noreferrer">Open in maps ↗</a>' +
            saveButton(e.id, false) +
          '</div>' +
        '</div>' +
      '</div>' +

      '<div class="wrap py10 max3">' +
        '<dl class="panel p5" style="display:grid;gap:14px;margin:0">' +
          facts.map(function (row) {
            return '<div class="flex g4" style="align-items:flex-start">' +
              '<dt class="kicker-up" style="width:120px;flex-shrink:0;padding-top:3px">' + esc(row[0]) + '</dt>' +
              '<dd class="small" style="margin:0;flex:1">' + esc(row[1]) + '</dd>' +
            '</div>';
          }).join('') +
        '</dl>' +

        (e.notes ? '<div class="panel p5 mt5"><h2 class="t-head" style="font-size:16px">Notes from the organizer</h2>' +
          '<p class="small muted mt3" style="white-space:pre-wrap">' + esc(e.notes) + '</p></div>' : '') +

        (v && v.precision !== 'exact'
          ? '<p class="panel tone-warn p4 mt5 small">The exact address has not been confirmed, so the map pin is approximate. Check with the organizer before you set off.</p>'
          : '') +

        (nearby.length
          ? '<section class="mt10"><h2 class="list-head">Also nearby <span>' + nearby.length + '</span></h2>' +
            '<div class="cols-2 mt5">' + nearby.map(function (r) { return eventCard(r.e, r.distance); }).join('') + '</div></section>'
          : '') +
      '</div>'
    );
  }

  // -------------------------------------------------- communities

  function communitiesView() {
    var cards = S.data.sports.map(function (sport) {
      var counts = stateCounts(sport.slug);
      var upcoming = Object.keys(counts).reduce(function (n, k) { return n + counts[k].upcoming; }, 0);
      var states = Object.keys(counts).filter(function (k) { return counts[k].upcoming > 0; }).length;
      var organizers = {};
      upcomingEvents(sport.slug).forEach(function (e) { if (e.organizerId) organizers[e.organizerId] = true; });
      var live = sport.active && upcoming > 0;

      if (!live) {
        return '<div class="panel p5 flex col between" style="opacity:0.85">' +
          '<div><span class="chip-muted">Coming soon</span>' +
          '<h2 class="t-head mt3" style="font-size:18px">' + esc(sport.name) + '</h2>' +
          '<p class="small muted mt2">' + esc(sport.name) + ' is set up and ready for listings. It goes live on the map as soon as there are events to show.</p></div>' +
          '<span class="btn btn-ghost mt5 w-full" style="cursor:default;opacity:0.7">No events listed yet</span>' +
        '</div>';
      }

      return '<a class="card p5" href="#/communities/' + esc(sport.slug) + '">' +
        '<div><span class="chip-accent">Live</span>' +
        '<h2 class="t-head mt3" style="font-size:18px">' + esc(sport.name) + '</h2>' +
        '<p class="small muted mt2">Browse the map and pick a state.</p></div>' +
        '<dl class="flex wrapf g4 mt5" style="border-top:2px solid var(--line);padding-top:16px;margin-bottom:0">' +
          miniStat(upcoming, 'upcoming') + miniStat(states, states === 1 ? 'state' : 'states') +
          miniStat(Object.keys(organizers).length, 'organizers') +
        '</dl>' +
      '</a>';
    }).join('');

    return '<div class="band-sun" style="border-bottom:2px solid var(--line)">' +
        '<div class="wrap py12">' +
          '<p class="t-kicker surf">Communities</p>' +
          '<h1 class="t-display mt3" style="font-size:clamp(28px,5vw,42px);line-height:1.05;max-width:640px">' +
            'Pick your sport.<br><span class="coral">Find your people.</span></h1>' +
          '<p class="mt4 muted max2">Every adult sport on COMPETE, and a map of where it is being played.</p>' +
        '</div></div>' +
      '<div class="wrap py12"><div class="cols-3">' + cards + '</div></div>';
  }

  function miniStat(value, label) {
    return '<div class="flex baseline g1"><dd class="t-head coral" style="font-size:18px;margin:0">' + value + '</dd>' +
      '<span class="kicker-up">' + esc(label) + '</span></div>';
  }

  function sportMapView(sportSlug) {
    var sport = S.data.sportBySlug[sportSlug];
    if (!sport) return notFoundView('No such sport.');

    var counts = stateCounts(sportSlug);
    var live = Object.keys(counts).filter(function (k) { return counts[k].upcoming > 0; })
      .sort(function (a, b) { return counts[b].upcoming - counts[a].upcoming; });
    var dormant = Object.keys(counts).filter(function (k) { return counts[k].upcoming === 0 && counts[k].total > 0; });

    return '<div class="band-sun" style="border-bottom:2px solid var(--line)">' +
        '<div class="wrap py8">' +
          '<nav class="kicker-up flex wrapf g2"><a href="#/communities">Communities</a><span>/</span>' +
            '<span class="muted">' + esc(sport.name) + '</span></nav>' +
          '<h1 class="t-display mt3" style="font-size:clamp(26px,4vw,38px)">' + esc(sport.name) +
            ' across the <span class="coral">United States</span></h1>' +
          '<p class="mt3 muted max2">Click a state to zoom in on where the events actually are.</p>' +
        '</div></div>' +

      '<div class="wrap py10">' +
        '<div class="panel p4">' + usMap(sportSlug) + '</div>' +
        '<div class="mt5">' + mapLegend() + '</div>' +

        '<section class="mt10"><h2 class="list-head">States with events <span>' + live.length + '</span></h2>' +
          '<div class="flex wrapf g2 mt4">' + live.map(function (code) {
            return '<a class="toggle-chip" href="#/communities/' + esc(sportSlug) + '/' + code.toLowerCase() + '">' +
              esc(S.data.stateNames[code] || code) + ' · ' + counts[code].upcoming + '</a>';
          }).join('') + '</div>' +
        '</section>' +

        (dormant.length
          ? '<section class="mt8"><h2 class="list-head">Listed before, nothing scheduled <span>' + dormant.length + '</span></h2>' +
            '<p class="small muted mt3">There is a scene in ' +
            dormant.map(function (c) { return esc(S.data.stateNames[c] || c); }).join(', ') +
            ' — the 2026 season there is simply over. That is a different answer from "nobody plays here", which is why the map colours them differently.</p></section>'
          : '') +
      '</div>';
  }

  function stateView(sportSlug, code) {
    var sport = S.data.sportBySlug[sportSlug];
    var shape = S.data.stateByCode[code];
    if (!sport || !shape) return notFoundView('No such state.');

    var day = todayIso();
    var byVenue = {};
    S.data.events.forEach(function (e) {
      if (e.sport !== sportSlug) return;
      if (finishesOn(e) < day) return;
      var v = venueOf(e);
      if (!v || v.state !== code) return;
      if (!byVenue[v.id]) byVenue[v.id] = { venue: v, events: [] };
      byVenue[v.id].events.push(e);
    });

    var rows = Object.keys(byVenue).map(function (k) { return byVenue[k]; });
    var unmapped = rows.filter(function (r) { return r.venue.x === null; });
    var frame = Math.max(
      shape.bounds[1][0] - shape.bounds[0][0],
      shape.bounds[1][1] - shape.bounds[0][1],
    );
    var clusters = clusterVenues(rows, frame * 0.03);
    var eventTotal = rows.reduce(function (n, r) { return n + r.events.length; }, 0);

    var pad = frame * 0.12;
    var minX = shape.bounds[0][0] - pad, minY = shape.bounds[0][1] - pad;
    var w = (shape.bounds[1][0] - shape.bounds[0][0]) + pad * 2;
    var h = (shape.bounds[1][1] - shape.bounds[0][1]) + pad * 2;

    var pins = clusters.map(function (c, i) {
      var r = Math.max(frame * 0.018, Math.min(frame * 0.05, frame * 0.014 * Math.sqrt(c.count)));
      return '<g>' +
        '<circle cx="' + c.x + '" cy="' + c.y + '" r="' + r + '" fill="var(--coral)" ' +
          'stroke="var(--coral-ink)" stroke-width="' + (frame * 0.004) + '" opacity="0.92"></circle>' +
        '<title>' + esc(c.label + ' — ' + c.count + ' ' + (c.count === 1 ? 'event' : 'events') +
          ' at ' + c.members.length + ' ' + (c.members.length === 1 ? 'venue' : 'venues')) + '</title>' +
        '<text x="' + c.x + '" y="' + (c.y + r * 0.36) + '" text-anchor="middle" ' +
          'font-size="' + (r * 0.95) + '" font-weight="700" fill="#fff" style="pointer-events:none">' + c.count + '</text>' +
      '</g>';
    }).join('');

    return '<div class="band-sun" style="border-bottom:2px solid var(--line)">' +
        '<div class="wrap py8">' +
          '<nav class="kicker-up flex wrapf g2"><a href="#/communities">Communities</a><span>/</span>' +
            '<a href="#/communities/' + esc(sportSlug) + '">' + esc(sport.name) + '</a><span>/</span>' +
            '<span class="muted">' + esc(shape.name) + '</span></nav>' +
          '<h1 class="t-display mt3" style="font-size:clamp(24px,4vw,36px)">' + esc(sport.name) +
            ' in <span class="coral">' + esc(shape.name) + '</span></h1>' +
          '<p class="mt3 muted max2">' +
            (eventTotal > 0
              ? eventTotal + ' upcoming ' + (eventTotal === 1 ? 'event' : 'events') + ' at ' + rows.length + ' ' +
                (rows.length === 1 ? 'venue' : 'venues') + '. Hover a pin to see what is on there.'
              : 'Nothing is on the calendar in ' + esc(shape.name) + ' right now.') +
          '</p>' +
        '</div></div>' +

      '<div class="wrap py10">' +
        (clusters.length
          ? '<div class="panel p4">' +
              // A tall state at width:100% runs off the screen, so the frame
              // is capped and the shape letterboxes inside it.
              '<svg viewBox="' + minX + ' ' + minY + ' ' + w + ' ' + h + '" ' +
                'style="width:100%;height:min(58vh,520px);display:block" ' +
                'role="img" aria-label="Map of ' + esc(shape.name) + '">' +
                '<path d="' + shape.d + '" fill="var(--empty)" stroke="var(--line-strong)" stroke-width="' + (frame * 0.004) + '"></path>' +
                pins +
              '</svg>' +
            '</div>' +

            '<section class="mt8"><h2 class="list-head">What is on <span>' + eventTotal + '</span></h2>' +
              '<div class="grid g4 mt5">' + clusters.sort(function (a, b) { return b.count - a.count; }).map(function (c) {
                return '<div class="panel p4">' +
                  '<div class="flex between baseline g3 wrapf">' +
                    '<h3 class="t-head" style="font-size:16px">' + esc(c.label) + '</h3>' +
                    '<span class="kicker-up">' + c.count + ' ' + (c.count === 1 ? 'event' : 'events') +
                      (c.approximate ? ' · approx. location' : '') + '</span>' +
                  '</div>' +
                  '<ul class="grid g2 mt3" style="list-style:none;padding:0;margin:0">' +
                    c.members.map(function (m) {
                      return '<li>' +
                        '<p class="tiny faint">' + esc(m.venue.name) + '</p>' +
                        m.events.sort(function (a, b) { return startsOn(a).localeCompare(startsOn(b)); })
                          .map(function (e) {
                            return '<a class="flex between g3 small" style="padding:4px 0" href="#/events/' + esc(e.slug) + '">' +
                              '<span class="truncate">' + esc(e.name) + '</span>' +
                              '<span class="tiny faint" style="flex-shrink:0">' + esc(formatDate(startsOn(e), 'short')) + '</span></a>';
                          }).join('') +
                      '</li>';
                    }).join('') +
                  '</ul>' +
                '</div>';
              }).join('') + '</div>' +
            '</section>'
          : emptyState('Nothing scheduled here',
              'No ' + sport.name.toLowerCase() + ' events are coming up in ' + shape.name + '.',
              '<a class="btn btn-primary mt6" href="#/communities/' + esc(sportSlug) + '">Back to the map</a>')) +

        (unmapped.length
          ? '<p class="panel tone-warn p4 mt8 small">' + unmapped.length + ' ' +
            (unmapped.length === 1 ? 'venue has' : 'venues have') + ' no coordinates yet, so ' +
            (unmapped.length === 1 ? 'it is' : 'they are') + ' not on the map.</p>'
          : '') +

        '<div class="flex wrapf g2 mt8">' +
          '<a class="btn btn-primary" href="#/events?sport=' + esc(sportSlug) + '&state=' + esc(code) + '">See all ' + esc(shape.name) + ' events as a list</a>' +
          '<a class="btn btn-ghost" href="#/communities/' + esc(sportSlug) + '">← Back to the US map</a>' +
        '</div>' +
      '</div>';
  }

  function notFoundView(message) {
    return '<div class="wrap py12">' + emptyState('Not found', message,
      '<a class="btn btn-primary mt6" href="#/">Back to the homepage</a>') + '</div>';
  }

  // ------------------------------------------------------------------
  // Accounts
  // ------------------------------------------------------------------

  var AGE_BRACKETS = [
    { value: 'under_18', label: 'Under 18' },
    { value: '18_24', label: '18–24' },
    { value: '25_34', label: '25–34' },
    { value: '35_44', label: '35–44' },
    { value: '45_54', label: '45–54' },
    { value: '55_plus', label: '55+' },
  ];

  var SMS_MARKETING =
    'I agree to receive automated text messages from COMPETE Sports about new ' +
    'events that match the sports, location and filters saved ' +
    'on my profile. Message frequency varies, typically a few times a month. ' +
    'Message and data rates may apply. Reply STOP at any time to stop all ' +
    'messages, SNOOZE to pause them, or HELP for help. Consent is not required ' +
    'to use COMPETE and I can browse and save events without it.';

  var SMS_TRANSACTIONAL =
    'I agree to receive text messages from COMPETE Sports and event organizers ' +
    'about events I register for or save — schedule changes, directions, court ' +
    'assignments and day-of details. Message and data rates may apply. Reply ' +
    'STOP to stop, HELP for help.';

  function joinView() {
    if (S.account) { go('/account'); return ''; }
    return '<div class="wrap py12" style="display:flex;justify-content:center">' +
      '<div style="width:100%;max-width:440px">' +
        '<p class="t-kicker surf">Free, always</p>' +
        '<h1 class="t-display mt3" style="font-size:30px;line-height:1.15">Keep track of your season.</h1>' +
        '<p class="mt3 muted">Save events you are weighing up, mark the ones you are in, and keep a record of what you played.</p>' +

        '<form class="panel p6 mt6 grid g4" data-form="join">' +
          '<div><label class="label" for="j-name">Your name</label>' +
            '<input class="field" id="j-name" name="name" required maxlength="60" placeholder="Tommy H."></div>' +
          '<div><label class="label" for="j-email">Email</label>' +
            '<input class="field" id="j-email" name="email" type="email" required placeholder="you@example.com"></div>' +
          '<div><label class="label" for="j-pass">Password</label>' +
            '<input class="field" id="j-pass" name="password" type="password" required minlength="10">' +
            '<p class="tiny faint mt2">At least 10 characters. Length beats punctuation.</p></div>' +

          '<fieldset style="border:0;padding:0;margin:0"><legend class="label">Age range</legend>' +
            '<div class="flex wrapf g2">' + AGE_BRACKETS.map(function (b) {
              return '<label class="toggle-chip"><input type="radio" name="bracket" value="' + b.value + '" required>' +
                '<span>' + b.label + '</span></label>';
            }).join('') + '</div>' +
            '<p class="tiny faint mt2" id="bracket-note">A range, not a birthday — we never ask for or store your date of birth.</p>' +
          '</fieldset>' +

          '<label class="flex g2 small muted" style="align-items:flex-start">' +
            '<input type="checkbox" name="age13" required style="margin-top:4px"> I am 13 or older.</label>' +
          '<label class="flex g2 small muted" style="align-items:flex-start">' +
            '<input type="checkbox" name="terms" required style="margin-top:4px"> I agree to the ' +
            '<a class="surf" href="#/terms">terms</a> and <a class="surf" href="#/privacy">privacy policy</a>.</label>' +

          '<div class="tiny coral" data-slot="join-error"></div>' +
          '<button class="btn btn-primary w-full" type="submit">Create my account</button>' +
          '<p class="small muted" style="text-align:center">Already have one? ' +
            '<a class="surf" href="#/signin">Sign in</a></p>' +
        '</form>' +

        '<p class="kicker-up mt6">Accounts are for ages 13 and up. We never ask for your date of birth.</p>' +
      '</div></div>';
  }

  function signinView() {
    if (S.account) { go('/account'); return ''; }
    return '<div class="wrap py12" style="display:flex;justify-content:center">' +
      '<div style="width:100%;max-width:380px">' +
        '<h1 class="t-display" style="font-size:30px">Welcome back.</h1>' +
        '<p class="mt2 muted">Your saved events are where you left them.</p>' +
        '<div class="panel p6 mt6">' +
          '<p class="panel tone-warn p4 small">There is no server behind this preview, so sign-in is not wired up here. ' +
            '<a class="surf" href="#/join">Create a preview account</a> instead — it behaves exactly like the real one for everything after sign-up.</p>' +
        '</div>' +
      '</div></div>';
  }

  function accountShell(active, body) {
    if (!S.account) {
      return '<div class="wrap py12">' + emptyState('You are signed out',
        'Create a preview account to see profiles, saved events and the organizer side.',
        '<a class="btn btn-primary mt6" href="#/join">Create an account</a>') + '</div>';
    }
    var tabs = [
      ['/account', 'Player profile'],
      ['/account/events', 'My events'],
      ['/account/host', S.host ? 'Organizer profile' : 'Run events?'],
    ].map(function (t) {
      return '<a class="tab" href="#' + t[0] + '"' + (active === t[0] ? ' aria-current="page"' : '') + '>' + t[1] + '</a>';
    }).join('');

    return '<div class="band-aqua" style="border-bottom:2px solid var(--line)">' +
        '<div class="wrap py8">' +
          '<p class="t-kicker surf">Your account</p>' +
          '<h1 class="t-display mt2" style="font-size:28px">' + esc(S.account.name) + '</h1>' +
          '<p class="kicker-up mt2">' + esc(S.account.email) + ' · not yet confirmed</p>' +
          '<nav class="flex wrapf g2 mt6" style="align-items:center">' + tabs +
            '<button class="btn btn-ghost btn-sm" style="margin-left:auto" data-act="signout">Sign out</button>' +
          '</nav>' +
        '</div></div>' +
      '<div class="wrap py10">' + body + '</div>';
  }

  function accountView() {
    if (!S.account) return accountShell('/account', '');
    var p = S.profile;
    var isMinor = p.bracket === 'under_18';
    var origin = originFor(p.zip);
    var marketing = currentConsent('marketing');
    var transactional = currentConsent('transactional');

    var body =
      '<div class="grid g8 max3">' +

      '<div class="panel tone-warn p5">' +
        '<p class="t-head" style="font-size:16px">Confirm your email</p>' +
        '<p class="small mt2">We sent a link to <strong>' + esc(S.account.email) + '</strong>. Until you click it we cannot ' +
          'reset your password if you forget it, and we cannot attach any events already listed under that address ' +
          'to your organizer profile.</p>' +
        '<p class="tiny mt3" style="opacity:0.85">In the preview no email is actually sent — this is the banner the real site shows.</p>' +
      '</div>' +

      (p.alerts ? alertStatus(p) : '') +

      '<form class="grid g8" data-form="profile">' +

        '<section class="panel p5">' +
          '<h2 class="t-head" style="font-size:18px">You</h2>' +
          '<div class="cols-2 mt4">' +
            '<div><label class="label" for="p-name">Name</label>' +
              '<input class="field" id="p-name" name="name" value="' + esc(S.account.name) + '" required maxlength="60"></div>' +
            '<div><label class="label" for="p-zip">Home ZIP</label>' +
              '<input class="field" id="p-zip" name="zip" inputmode="numeric" maxlength="5" value="' + esc(p.zip || '') + '" placeholder="63110">' +
              '<p class="tiny faint mt2">' + (origin
                ? esc(origin.label) + ' — this is what fills your Local list.'
                : 'This is what fills your Local list on the homepage.') + '</p></div>' +
          '</div>' +
          '<div class="mt4"><label class="label" for="p-radius">How far you will drive — <span data-slot="radius">' + p.radius + '</span> miles</label>' +
            '<input type="range" id="p-radius" name="radius" min="10" max="250" step="10" value="' + p.radius + '" style="width:100%;accent-color:var(--surf-ink)"></div>' +
        '</section>' +

        '<section class="panel p5">' +
          '<div class="flex between baseline g3"><h2 class="t-head" style="font-size:18px">Optional</h2>' +
            '<span class="kicker-up">leave any of it blank</span></div>' +
          '<fieldset class="mt4" style="border:0;padding:0;margin:0"><legend class="label">Age range</legend>' +
            '<div class="flex wrapf g2">' + AGE_BRACKETS.map(function (b) {
              return '<label class="toggle-chip"><input type="radio" name="bracket" value="' + b.value + '"' +
                (p.bracket === b.value ? ' checked' : '') + '><span>' + b.label + '</span></label>';
            }).join('') + '</div>' +
            '<p class="tiny faint mt2">A range only. COMPETE never asks for or stores your date of birth.</p>' +
          '</fieldset>' +
          '<fieldset class="mt5" style="border:0;padding:0;margin:0"><legend class="label">Gender</legend>' +
            '<div class="flex wrapf g2">' +
              [['male', 'Male'], ['female', 'Female'], ['undisclosed', 'Prefer not to say']].map(function (g) {
                return '<label class="toggle-chip"><input type="radio" name="gender" value="' + g[0] + '"' +
                  (p.gender === g[0] ? ' checked' : '') + '><span>' + g[1] + '</span></label>';
              }).join('') + '</div>' +
          '</fieldset>' +
        '</section>' +

        '<section class="panel p5">' +
          '<h2 class="t-head" style="font-size:18px">Text messages</h2>' +
          (isMinor
            ? '<p class="panel tone-warn p4 mt4 small">COMPETE does not send text messages to anyone under 18, so there is ' +
              'no phone number on this account. Keep browsing and saving events as normal.</p>'
            : '<p class="small muted mt2">Recommended, not required. A number is how organizers reach you the morning a ' +
              'start time moves or a court changes — the thing email is too slow for.</p>' +
              '<div class="mt4" style="max-width:280px"><label class="label" for="p-phone">Mobile number</label>' +
                '<input class="field" id="p-phone" name="phone" type="tel" value="' + esc(p.phone || '') + '" placeholder="10-digit mobile number"></div>' +
              (p.phone
                ? '<div class="grid g4 mt5">' +
                    '<label class="flex g2 small muted" style="align-items:flex-start">' +
                      '<input type="checkbox" name="sms_transactional" style="margin-top:4px"' +
                      (transactional ? ' checked' : '') + '><span>' + SMS_TRANSACTIONAL + '</span></label>' +
                    '<label class="flex g2 small muted" style="align-items:flex-start">' +
                      '<input type="checkbox" name="sms_marketing" style="margin-top:4px"' +
                      (marketing ? ' checked' : '') + '><span>' + SMS_MARKETING + '</span></label>' +
                  '</div>'
                : '<p class="tiny faint mt3">Add a number and the two consent boxes appear — both unticked, as they must be.</p>')) +
        '</section>' +

        '<section class="panel p5">' +
          '<h2 class="t-head" style="font-size:18px">What you play</h2>' +
          '<p class="small muted mt2">This narrows your Local list and, if you turn texts on, decides which new events are worth interrupting you for.</p>' +
          prefGroup('Sports', 'sports', S.data.sports.map(function (s) { return { slug: s.slug, name: s.name, sport: s.slug }; }), p.prefs.sports) +
          prefGroup('Surfaces', 'surfaces', S.data.surfaces, p.prefs.surfaces) +
          prefGroup('Formats', 'formats', S.data.formats, p.prefs.formats) +
          prefGroup('Divisions', 'divisions', S.data.divisions, p.prefs.divisions) +
        '</section>' +

        '<div class="flex end"><button class="btn btn-primary" type="submit">Save profile</button></div>' +
      '</form>' +

      consentLog() +
      '</div>';

    return accountShell('/account', body);
  }

  function prefGroup(label, key, rows, active) {
    if (!rows.length) return '';
    var sports = [];
    rows.forEach(function (r) { if (sports.indexOf(r.sport) === -1) sports.push(r.sport); });
    var showHeadings = key !== 'sports' && sports.length > 1;

    return '<fieldset class="mt5" style="border:0;padding:0;margin:0"><legend class="label">' + esc(label) + '</legend>' +
      '<div class="grid g3">' + sports.map(function (sp) {
        var name = S.data.sportBySlug[sp] ? S.data.sportBySlug[sp].name : sp;
        return '<div>' +
          (showHeadings ? '<p class="kicker-up" style="margin-bottom:6px">' + esc(name) + '</p>' : '') +
          '<div class="flex wrapf g2">' + rows.filter(function (r) { return r.sport === sp; }).map(function (r) {
            var on = active.indexOf(r.slug) !== -1;
            return '<label class="toggle-chip"><input type="checkbox" name="pref_' + key + '" value="' + esc(r.slug) + '"' +
              (on ? ' checked' : '') + '><span>' + esc(r.name) + '</span></label>';
          }).join('') + '</div>' +
        '</div>';
      }).join('') + '</div></fieldset>';
  }

  function alertStatus(p) {
    var snoozed = p.snoozedUntil && p.snoozedUntil > todayIso();
    return '<div class="panel p5 ' + (snoozed ? 'tone-mute' : 'tone-good') + '">' +
      '<div class="flex wrapf between baseline g2">' +
        '<p class="t-head" style="font-size:16px">' +
          (snoozed ? 'Alerts paused until ' + esc(formatDate(p.snoozedUntil)) : 'New-event alerts are on') + '</p>' +
        (snoozed ? '<button class="btn btn-ghost btn-sm" data-act="snooze" data-days="0">Resume now</button>' : '') +
      '</div>' +
      '<p class="small mt2">' + (snoozed
        ? 'We will not text you until then. Your saved filters are untouched.'
        : 'We text you when an event is added that matches your sports, filters and travel radius.') + '</p>' +
      (!snoozed
        ? '<div class="flex wrapf g2 center mt4"><span class="kicker-up">Pause for</span>' +
          [[14, '2 weeks'], [30, '1 month'], [90, '3 months'], [180, '6 months']].map(function (c) {
            return '<button class="btn btn-ghost btn-sm" data-act="snooze" data-days="' + c[0] + '">' + c[1] + '</button>';
          }).join('') + '</div>'
        : '') +
    '</div>';
  }

  function currentConsent(purpose) {
    for (var i = S.consents.length - 1; i >= 0; i -= 1) {
      if (S.consents[i].purpose === purpose) return S.consents[i].action === 'granted';
    }
    return false;
  }

  function consentLog() {
    if (!S.consents.length) return '';
    return '<section class="panel p5">' +
      '<h2 class="t-head" style="font-size:16px">Consent record <span class="kicker-up">what the database would hold</span></h2>' +
      '<p class="small muted mt2">Append-only: withdrawing writes a new row rather than deleting the old one. This is the evidence that makes a text message lawful to send.</p>' +
      '<div class="mt4" style="overflow-x:auto">' +
        '<table class="small" style="width:100%;border-collapse:collapse">' +
          '<thead><tr>' + ['When', 'Purpose', 'Action', 'Number', 'Disclosure'].map(function (h) {
            return '<th class="kicker-up" style="text-align:left;padding:6px 10px 6px 0;border-bottom:2px solid var(--line)">' + h + '</th>';
          }).join('') + '</tr></thead>' +
          '<tbody>' + S.consents.slice().reverse().map(function (c) {
            return '<tr>' +
              '<td style="padding:6px 10px 6px 0;border-bottom:1px solid var(--line)">' + esc(c.at) + '</td>' +
              '<td style="padding:6px 10px 6px 0;border-bottom:1px solid var(--line)">' + esc(c.purpose) + '</td>' +
              '<td style="padding:6px 10px 6px 0;border-bottom:1px solid var(--line)">' +
                '<span class="' + (c.action === 'granted' ? 'chip-turf' : 'chip-muted') + '">' + esc(c.action) + '</span></td>' +
              '<td style="padding:6px 10px 6px 0;border-bottom:1px solid var(--line)">' + esc(c.phone) + '</td>' +
              '<td class="tiny faint" style="padding:6px 0;border-bottom:1px solid var(--line);max-width:260px">' +
                esc(c.text.slice(0, 70)) + '…</td>' +
            '</tr>';
          }).join('') + '</tbody>' +
        '</table>' +
      '</div>' +
    '</section>';
  }

  function myEventsView() {
    if (!S.account) return accountShell('/account/events', '');
    var day = todayIso();
    var all = Object.keys(S.relations).map(function (id) {
      return { e: S.data.eventById[id], rel: S.relations[id] };
    }).filter(function (r) { return r.e; });

    var saved = all.filter(function (r) { return r.rel === 'saved' && finishesOn(r.e) >= day; });
    var upcoming = all.filter(function (r) { return r.rel === 'registered' && finishesOn(r.e) >= day; });
    var history = all.filter(function (r) { return r.rel !== 'saved' && finishesOn(r.e) < day; });

    var sortByDate = function (a, b) { return startsOn(a.e).localeCompare(startsOn(b.e)); };
    saved.sort(sortByDate); upcoming.sort(sortByDate); history.sort(sortByDate).reverse();

    if (!saved.length && !upcoming.length && !history.length) {
      return accountShell('/account/events', emptyState('Nothing here yet',
        'Save an event and it lands here. Mark yourself registered and it moves to Coming up, then into your history the day after it finishes.',
        '<a class="btn btn-primary mt6" href="#/events">Find something to play</a>'));
    }

    var section = function (title, rows, blank) {
      return '<section><h2 class="list-head">' + title + ' <span>' + rows.length + '</span></h2>' +
        (rows.length
          ? '<ul class="grid g3 mt4" style="list-style:none;padding:0;margin:0">' + rows.map(function (r) {
              return '<li class="grid g2">' + eventCard(r.e) + '<div class="flex end">' + saveButton(r.e.id, true) + '</div></li>';
            }).join('') + '</ul>'
          : '<p class="small muted mt4">' + esc(blank) + '</p>') +
      '</section>';
    };

    return accountShell('/account/events',
      '<div class="grid g10 max3" style="gap:40px">' +
        section('Coming up', upcoming, 'Nothing you have marked yourself registered for.') +
        section('Saved', saved, 'Nothing saved. The Save button is on every event.') +
        '<section><h2 class="list-head">History <span>' + history.length + '</span></h2>' +
          (history.length
            ? '<details class="mt4"><summary class="kicker-up surf" style="cursor:pointer">Show what you have played</summary>' +
              '<ul class="grid g2 mt4" style="list-style:none;padding:0;margin:0">' + history.map(function (r) {
                return '<li><a class="panel flex between baseline g4" style="padding:12px 16px" href="#/events/' + esc(r.e.slug) + '">' +
                  '<span style="min-width:0"><span class="small bold truncate" style="display:block">' + esc(r.e.name) + '</span>' +
                  '<span class="kicker-up">' + esc(venueLine(r.e)) + '</span></span>' +
                  '<span class="kicker-up" style="flex-shrink:0">' + esc(formatDateRange(startsOn(r.e), endsOn(r.e))) + '</span></a></li>';
              }).join('') + '</ul></details>'
            : '<p class="small muted mt4">Once an event you were registered for has finished, it shows up here on its own.</p>') +
        '</section>' +
      '</div>');
  }

  function hostView() {
    if (!S.account) return accountShell('/account/host', '');
    var h = S.host;
    return accountShell('/account/host',
      '<div class="grid g6 max3">' +
        (!h ? '<div class="panel p5">' +
          '<h2 class="t-head" style="font-size:18px">Run events?</h2>' +
          '<p class="small muted mt2">Same login, second hat. Fill this in and your events carry your name and contact ' +
          'details, so players know who they are entering with. Listing on COMPETE is free, and registration stays ' +
          'wherever you already run it.</p>' +
          '<p class="small muted mt3">Submitting your own events comes in the next phase. For now this profile is how ' +
          'we match you to the events already listed under your email.</p></div>' : '') +

        '<form class="panel p5 grid g4" data-form="host">' +
          '<h2 class="t-head" style="font-size:18px">Your events, publicly</h2>' +
          '<div><label class="label" for="h-org">Organization name</label>' +
            '<input class="field" id="h-org" name="org" required maxlength="120" value="' + esc(h ? h.org : '') + '" ' +
            'placeholder="Gateway Beach Series — or John Doe Tournaments">' +
            '<p class="tiny faint mt2">No registered business needed. If you have not named your events yet, your own ' +
            'name plus &ldquo;Tournaments&rdquo; works.</p></div>' +
          '<div class="cols-2">' +
            '<div><label class="label" for="h-email">Contact email</label>' +
              '<input class="field" id="h-email" name="email" type="email" required value="' + esc(h ? h.email : S.account.email) + '"></div>' +
            '<div><label class="label" for="h-phone">Contact phone</label>' +
              '<input class="field" id="h-phone" name="phone" type="tel" value="' + esc(h ? h.phone : '') + '" placeholder="10-digit mobile number"></div>' +
          '</div>' +
          '<div><label class="label" for="h-web">Website or Facebook page (optional)</label>' +
            '<input class="field" id="h-web" name="website" value="' + esc(h ? h.website : '') + '" placeholder="facebook.com/your-page"></div>' +
          '<div class="cols-2">' +
            '<div><label class="label" for="h-city">City</label>' +
              '<input class="field" id="h-city" name="city" value="' + esc(h ? h.city : '') + '" placeholder="St. Louis"></div>' +
            '<div><label class="label" for="h-state">State</label>' +
              '<input class="field" id="h-state" name="state" maxlength="2" style="text-transform:uppercase" value="' + esc(h ? h.state : '') + '" placeholder="MO"></div>' +
          '</div>' +
          '<div><label class="label" for="h-about">About (optional, 500 characters)</label>' +
            '<textarea class="field" id="h-about" name="about" rows="4" maxlength="500">' + esc(h ? h.about : '') + '</textarea></div>' +
          '<div class="tiny coral" data-slot="host-error"></div>' +
          '<div class="flex end"><button class="btn btn-primary" type="submit">' +
            (h ? 'Save organizer profile' : 'Create organizer profile') + '</button></div>' +
        '</form>' +

        '<p class="panel tone-mute p4 small">Claiming the events already in the database is matched on your account&rsquo;s ' +
          'own <em>confirmed</em> email — never on whatever is typed in the contact field. Organizer emails are printed on ' +
          'every event page, so trusting the typed one would let anybody claim someone else&rsquo;s events.</p>' +
      '</div>');
  }

  // ------------------------------------------------------------------
  // Admin — paste and parse
  // ------------------------------------------------------------------

  var SAMPLE_POST =
    "🏐 SAND SLAM 2026 🏐\n\n" +
    "Saturday, August 15, 2026\n" +
    "North Avenue Beach, Chicago, IL 60614\n\n" +
    "Men's Doubles, Women's Doubles + Coed Quads\n" +
    "AA, A and BB divisions\n\n" +
    "$40 per player — $1,200 cash payout to the winners\n" +
    "Registration closes Aug 10\n\n" +
    "Sign up: https://example.com/sandslam";

  function adminView(parsed) {
    var fields = parsed ? parsed.fields : null;

    return '<div class="band-deep"><div class="wrap py8">' +
        '<p class="t-kicker" style="color:var(--sun)">Staff tools</p>' +
        '<h1 class="t-display mt2" style="font-size:28px">Paste and parse</h1>' +
        '<p class="mt3" style="color:rgba(255,255,255,0.75);max-width:560px">Paste an event post from Facebook and the ' +
          'form fills itself. This is the production parser, compiled for the browser — the same code, the same rules, ' +
          'no AI service and nothing invented.</p>' +
      '</div></div>' +

      '<div class="wrap py10">' +
        '<div class="browse-grid">' +
          '<div>' +
            '<form data-form="paste">' +
              '<label class="label" for="paste">Paste the post</label>' +
              '<textarea class="field" id="paste" name="raw" rows="16" style="font-family:ui-monospace,monospace;font-size:13px">' +
                esc(parsed ? parsed.raw : SAMPLE_POST) + '</textarea>' +
              '<div class="flex g2 mt3">' +
                '<button class="btn btn-primary" type="submit">Read it</button>' +
                '<button class="btn btn-ghost" type="button" data-act="sample">Reset sample</button>' +
              '</div>' +
            '</form>' +
          '</div>' +

          '<div>' +
            (!parsed
              ? '<div class="panel p5"><p class="muted small">Press <strong>Read it</strong> and the extracted fields ' +
                'appear here, exactly as they would drop into the entry form.</p></div>'
              : '<div class="panel p5">' +
                  '<div class="flex between baseline g3 wrapf">' +
                    '<h2 class="t-head" style="font-size:18px">What it read</h2>' +
                    '<span class="kicker-up">' + parsed.filled.length + ' of ' +
                      (parsed.filled.length + parsed.missing.length) + ' fields</span>' +
                  '</div>' +
                  '<dl class="grid g3 mt4">' + Object.keys(fields).map(function (key) {
                    var value = fields[key];
                    if (value === null || value === undefined || value === '') return '';
                    return '<div class="flex g3" style="align-items:flex-start">' +
                      '<dt class="kicker-up" style="width:120px;flex-shrink:0;padding-top:2px">' + esc(key.replace(/_/g, ' ')) + '</dt>' +
                      '<dd class="small" style="margin:0;flex:1">' +
                        esc(Array.isArray(value) ? value.join(', ') : String(value)) + '</dd></div>';
                  }).join('') + '</dl>' +

                  (parsed.missing.length
                    ? '<div class="panel tone-warn p4 mt5"><p class="small bold">Left blank on purpose</p>' +
                      '<p class="small mt2">' + esc(parsed.missing.join(', ')) + '</p>' +
                      '<p class="tiny mt2">The parser refuses to guess. A wrong value is worse than a blank one, ' +
                      'because a blank field asks to be filled in and a wrong one does not.</p></div>'
                    : '<p class="panel tone-good p4 mt5 small">Everything it needs was in the post.</p>') +
                '</div>') +
          '</div>' +
        '</div>' +

        '<div class="panel p5 mt8">' +
          '<h2 class="t-head" style="font-size:16px">Try breaking it</h2>' +
          '<p class="small muted mt2">Edit the post and watch what happens. Some things worth trying: change ' +
            '<code>$40 per player</code> to <code>$150/team</code>; swap the date for <code>Sat 8/15</code>; delete the ' +
            'divisions line; or paste in a chatty post with no clear name — it will leave the name blank rather than ' +
            'using a sentence.</p>' +
        '</div>' +
      '</div>';
  }

  // ------------------------------------------------------------------
  // Static pages
  // ------------------------------------------------------------------

  function aboutView() {
    return '<div class="band-sun" style="border-bottom:2px solid var(--line)"><div class="wrap py12">' +
        '<p class="t-kicker surf">About</p>' +
        '<h1 class="t-display mt3" style="font-size:clamp(26px,4vw,38px);max-width:600px">One place to find your next game.</h1>' +
      '</div></div>' +
      '<div class="wrap py12 max3 grid g8">' +
        section('The problem',
          ['Adult recreational sport is thriving, and finding it is miserable. Tournaments live in Facebook groups, ' +
           'group texts, screenshots of flyers, and half a dozen registration platforms that do not talk to each other. ' +
           'Players miss events happening forty minutes from their house. Organizers fill late or not at all.',
           'Time is the one thing none of us gets back. Spending it hunting for a Saturday game is a bad trade.']) +
        section('What COMPETE does',
          ['COMPETE puts adult events in one searchable place. Filter by how far you will drive, the weekend you ' +
           'are free, the surface you like, the format you play, and the division you belong in.',
           'We are starting with volleyball, where the community is loudest and the fragmentation is worst. Other adult sports follow.']) +
        section('Adult events, and who can enter them',
          ['COMPETE lists adult recreational events only. We do not list youth events or age-group play, and we are not going to.',
           'Accounts are a separate question. A 16-year-old who plays in open events can have one — accounts are for ' +
           'ages 13 and up — but whether any particular event will take an under-18 player is the organizer’s call, not ' +
           'ours. Plenty require 18 and over. Ask them before you register. We never store a date of birth, and we never ' +
           'text anyone under 18.']) +
      '</div>';
  }

  function section(heading, paragraphs) {
    return '<section><h2 class="t-head" style="font-size:20px">' + esc(heading) + '</h2>' +
      paragraphs.map(function (p) { return '<p class="mt3 muted" style="line-height:1.65">' + esc(p) + '</p>'; }).join('') +
      '</section>';
  }

  function legalView(doc) {
    return '<div class="band-aqua" style="border-bottom:2px solid var(--line)"><div class="wrap py10">' +
        '<p class="t-kicker surf">' + esc(doc.kicker) + '</p>' +
        '<h1 class="t-display mt3" style="font-size:clamp(26px,4vw,38px)">' + esc(doc.title) + '</h1>' +
        '<p class="kicker-up mt3">Effective ' + esc(doc.effective) + ' · draft, pending legal review</p>' +
      '</div></div>' +
      '<div class="wrap py10" style="max-width:680px">' +
        doc.intro.map(function (p) { return '<p class="muted mt3" style="line-height:1.7">' + p + '</p>'; }).join('') +
        '<div class="grid g8 mt8">' + doc.clauses.map(function (c) {
          return '<section><h2 class="t-head" style="border-bottom:2px solid var(--line);padding-bottom:8px;font-size:18px">' +
            esc(c[0]) + '</h2>' +
            c[1].map(function (p) { return '<p class="small muted mt3" style="line-height:1.7">' + p + '</p>'; }).join('') +
          '</section>';
        }).join('') + '</div>' +
      '</div>';
  }

  // ------------------------------------------------------------------
  // Chrome
  // ------------------------------------------------------------------

  function previewBar() {
    var shifted = S.shiftDays !== 0;
    return '<div class="pv-bar"><div class="pv-inner">' +
      '<span class="pv-tag">Preview</span>' +
      '<span class="pv-note">Real data, no server — accounts and saves live in memory and reset on reload.</span>' +
      '<span class="pv-actions">' +
        '<button class="pv-btn" data-act="shift" aria-pressed="' + shifted + '">' +
          (shifted ? '2027 season ✓' : 'Preview a full season') + '</button>' +
        '<button class="pv-btn" data-act="reset">Reset</button>' +
      '</span>' +
    '</div></div>';
  }

  function header() {
    return '<header class="site-header"><div class="wrap header-inner">' +
        '<a class="flex center g2" href="#/" aria-label="COMPETE home">' +
          '<span class="logo-badge" aria-hidden="true">C</span>' +
          '<span class="t-display" style="font-size:18px">COMPETE</span></a>' +
        '<nav class="flex center g1">' +
          '<a class="nav-link nav-hide" href="#/events">Find events</a>' +
          '<a class="nav-link" href="#/communities">Communities</a>' +
          '<a class="nav-link nav-hide" href="#/about">About</a>' +
          '<a class="nav-link nav-hide" href="#/admin">Staff</a>' +
          (S.account
            ? '<a class="btn btn-primary btn-sm" href="#/account">My COMPETE</a>'
            : '<a class="nav-link nav-hide" href="#/signin">Sign in</a>' +
              '<a class="btn btn-primary btn-sm" href="#/join">Join free</a>') +
        '</nav>' +
      '</div><div class="rule-rainbow"></div></header>';
  }

  function footer() {
    return '<footer class="band-deep" style="margin-top:80px"><div class="wrap py10">' +
      '<div class="flex wrapf between g6">' +
        '<div style="max-width:320px">' +
          '<p class="t-display" style="font-size:17px">COMPETE</p>' +
          '<p class="small mt2" style="color:rgba(255,255,255,0.75)">Adult recreational sports, one place to find them. ' +
            'Built for the players who still set an alarm on a Saturday.</p></div>' +
        '<div class="flex col g2 small" style="color:rgba(255,255,255,0.75)">' +
          '<a href="#/communities">Communities</a><a href="#/about">About COMPETE</a>' +
          '<a href="#/privacy">Privacy policy</a><a href="#/terms">Terms of use</a>' +
          '<a href="#/admin">Staff tools</a></div>' +
      '</div>' +
      '<p class="kicker-up mt8" style="color:rgba(255,255,255,0.45)">© 2026 COMPETE Sports · Adult recreational events only</p>' +
    '</div></footer>';
  }

  // ------------------------------------------------------------------
  // Render
  // ------------------------------------------------------------------

  var lastParsed = null;

  function render() {
    var r = route();
    var body;

    if (r.parts.length === 0) body = homeView();
    else if (r.parts[0] === 'events' && r.parts.length === 1) body = browseView(r.query);
    else if (r.parts[0] === 'events') body = eventView(r.parts[1]);
    else if (r.parts[0] === 'communities' && r.parts.length === 1) body = communitiesView();
    else if (r.parts[0] === 'communities' && r.parts.length === 2) body = sportMapView(r.parts[1]);
    else if (r.parts[0] === 'communities') body = stateView(r.parts[1], r.parts[2].toUpperCase());
    else if (r.parts[0] === 'join') body = joinView();
    else if (r.parts[0] === 'signin') body = signinView();
    else if (r.parts[0] === 'account' && r.parts.length === 1) body = accountView();
    else if (r.parts[0] === 'account' && r.parts[1] === 'events') body = myEventsView();
    else if (r.parts[0] === 'account' && r.parts[1] === 'host') body = hostView();
    else if (r.parts[0] === 'admin') body = adminView(lastParsed);
    else if (r.parts[0] === 'about') body = aboutView();
    else if (r.parts[0] === 'privacy') body = legalView(window.COMPETE_LEGAL.privacy);
    else if (r.parts[0] === 'terms') body = legalView(window.COMPETE_LEGAL.terms);
    else body = notFoundView('No page at that address.');

    el('app').innerHTML =
      previewBar() + header() + '<main>' + body + '</main>' + footer() +
      (S.toast
        ? '<div class="panel tone-good p4 small" style="position:fixed;left:50%;bottom:24px;transform:translateX(-50%);' +
          'z-index:80;box-shadow:0 8px 24px rgba(0,0,0,0.18)">' + esc(S.toast) + '</div>'
        : '');
  }

  // ------------------------------------------------------------------
  // Interaction
  // ------------------------------------------------------------------

  function relate(id, rel) {
    if (!S.account) {
      toast('Create a preview account first — saves need somewhere to live.');
      go('/join');
      return;
    }
    if (!rel) delete S.relations[id];
    else S.relations[id] = rel;
    render();
  }

  function downloadIcs(slug) {
    var e = S.data.eventBySlug[slug];
    if (!e) return;
    var v = venueOf(e);
    var compact = function (iso) { return iso.replace(/-/g, ''); };
    var end = addDays(endsOn(e) || startsOn(e), 1);
    var escIcs = function (s) {
      return String(s).replace(/\\/g, '\\\\').replace(/;/g, '\\;')
        .replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');
    };
    var location = v ? [v.name, v.address, [v.city, v.state, v.zip].filter(Boolean).join(', ')]
      .filter(Boolean).join(', ') : '';
    var description = [
      e.formats.length ? 'Formats: ' + e.formats.map(function (s) { return nameOf('format', s); }).join(', ') : null,
      e.divisions.length ? 'Divisions: ' + e.divisions.map(function (s) { return nameOf('division', s); }).join(', ') : null,
      e.feeCents !== null ? 'Entry: ' + formatMoney(e.feeCents, e.feeBasis) : null,
      e.url ? 'Register: ' + e.url : null,
    ].filter(Boolean).join('\n');

    var lines = [
      'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//COMPETE Sports//Event Discovery//EN',
      'CALSCALE:GREGORIAN', 'METHOD:PUBLISH', 'BEGIN:VEVENT',
      'UID:' + e.id + '@joincompete.com',
      'DTSTAMP:' + new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, ''),
      'DTSTART;VALUE=DATE:' + compact(startsOn(e)),
      'DTEND;VALUE=DATE:' + compact(end),
      'SUMMARY:' + escIcs(e.name),
      'LOCATION:' + escIcs(location),
      'DESCRIPTION:' + escIcs(description),
      'END:VEVENT', 'END:VCALENDAR',
    ];

    var blob = new Blob([lines.join('\r\n') + '\r\n'], { type: 'text/calendar;charset=utf-8' });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = e.slug + '.ics';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    window.setTimeout(function () { URL.revokeObjectURL(a.href); }, 1000);
    toast('Calendar file downloaded — the real .ics, generated the same way.');
  }

  function normalisePhone(input) {
    var digits = String(input).replace(/\D+/g, '');
    var local = digits.length === 11 && digits.charAt(0) === '1' ? digits.slice(1) : digits;
    if (!local.length) return { ok: false, error: 'Enter a phone number.' };
    if (local.length !== 10) return { ok: false, error: 'US numbers are 10 digits — check for a missing or extra one.' };
    if (/^[01]/.test(local)) return { ok: false, error: 'That area code does not exist.' };
    if (/^[01]/.test(local.slice(3))) return { ok: false, error: 'That is not a valid number.' };
    if (local.slice(3, 6) === '555' && local.slice(6, 8) === '01') {
      return { ok: false, error: 'That is a placeholder number, not a real one.' };
    }
    return {
      ok: true,
      e164: '+1' + local,
      display: '(' + local.slice(0, 3) + ') ' + local.slice(3, 6) + '-' + local.slice(6),
    };
  }

  function recordConsent(purpose, granted, phone) {
    S.consents.push({
      at: new Date().toISOString().slice(0, 16).replace('T', ' '),
      purpose: purpose,
      action: granted ? 'granted' : 'revoked',
      phone: phone,
      text: purpose === 'marketing' ? SMS_MARKETING : SMS_TRANSACTIONAL,
    });
  }

  function revokeAll(phone) {
    ['transactional', 'marketing'].forEach(function (p) {
      if (currentConsent(p)) recordConsent(p, false, phone);
    });
  }

  function handleSubmit(form, event) {
    var kind = form.getAttribute('data-form');
    var data = new FormData(form);
    event.preventDefault();

    if (kind === 'homezip') {
      var zip = String(data.get('zip') || '').trim();
      if (zip && !originFor(zip)) { toast('We do not recognise that ZIP code.'); return; }
      S.homeZip = zip || null;
      if (S.profile) S.profile.zip = zip || null;
      render();
      return;
    }

    if (kind === 'location') {
      go(hrefWith({ zip: String(data.get('zip') || '').trim(), radius: data.get('radius') }));
      return;
    }

    if (kind === 'dates') {
      S.datesOpen = false;
      go(hrefWith({ from: data.get('from'), to: data.get('to') }));
      return;
    }

    if (kind === 'join') {
      var bracket = data.get('bracket');
      if (!bracket) return;
      S.account = { name: String(data.get('name')).trim(), email: String(data.get('email')).trim().toLowerCase() };
      S.profile = {
        zip: S.homeZip, radius: 100, bracket: bracket, gender: null, phone: null,
        alerts: false, snoozedUntil: null,
        prefs: { sports: [], surfaces: [], formats: [], divisions: [] },
      };
      toast('You are in. Add your home ZIP and your local events appear on the homepage.');
      go('/account');
      return;
    }

    if (kind === 'profile') {
      var p = S.profile;
      var newBracket = data.get('bracket') || p.bracket;
      var isMinor = newBracket === 'under_18';
      var zipValue = String(data.get('zip') || '').trim();
      if (zipValue && !originFor(zipValue)) { toast('We do not recognise that ZIP code.'); return; }

      var phoneRaw = String(data.get('phone') || '').trim();
      var newPhone = null;
      if (!isMinor && phoneRaw) {
        var parsed = normalisePhone(phoneRaw);
        if (!parsed.ok) { toast(parsed.error); return; }
        newPhone = parsed.display;
      }

      var oldPhone = p.phone;
      S.account.name = String(data.get('name')).trim();
      p.zip = zipValue || null;
      p.radius = Number(data.get('radius')) || 100;
      p.bracket = newBracket;
      p.gender = data.get('gender') || null;
      p.prefs = {
        sports: data.getAll('pref_sports'),
        surfaces: data.getAll('pref_surfaces'),
        formats: data.getAll('pref_formats'),
        divisions: data.getAll('pref_divisions'),
      };

      if (!newPhone) {
        // The number is gone — deleted, or removed because the profile
        // became an under-18 one. Withdraw the consents explicitly, or the
        // record keeps saying "yes, text them here" about a number that is
        // no longer on the account.
        if (oldPhone) revokeAll(oldPhone);
        p.phone = null;
        p.alerts = false;
        p.snoozedUntil = null;
      } else {
        var changedNumber = oldPhone && oldPhone !== newPhone;
        if (changedNumber) revokeAll(oldPhone);
        p.phone = newPhone;

        ['transactional', 'marketing'].forEach(function (purpose) {
          var wanted = data.get('sms_' + purpose) === 'on';
          var have = changedNumber ? false : currentConsent(purpose);
          if (have !== wanted) recordConsent(purpose, wanted, newPhone);
        });
        p.alerts = data.get('sms_marketing') === 'on';
        if (!p.alerts) p.snoozedUntil = null;
      }

      toast(isMinor && oldPhone
        ? 'Saved. The phone number and every text consent were removed — no minor is ever messaged.'
        : 'Saved.');
      render();
      return;
    }

    if (kind === 'host') {
      var org = String(data.get('org') || '').trim();
      if (!org) return;
      S.host = {
        org: org,
        email: String(data.get('email') || '').trim(),
        phone: String(data.get('phone') || '').trim(),
        website: String(data.get('website') || '').trim(),
        city: String(data.get('city') || '').trim(),
        state: String(data.get('state') || '').trim().toUpperCase(),
        about: String(data.get('about') || '').trim(),
      };
      toast('Saved. Confirm your email and any events already listed under it become yours.');
      render();
      return;
    }

    if (kind === 'paste') {
      var raw = String(data.get('raw') || '');
      var result = window.CompeteParser.parseListing(raw);
      lastParsed = { raw: raw, fields: result.fields, filled: result.filled, missing: result.missing };
      render();
      var panel = document.querySelector('[data-form="paste"]');
      if (panel) panel.scrollIntoView({ block: 'nearest' });
      return;
    }
  }

  function bind() {
    document.addEventListener('submit', function (event) {
      var form = event.target.closest('[data-form]');
      if (form) handleSubmit(form, event);
    });

    document.addEventListener('click', function (event) {
      var target = event.target.closest('[data-act]');
      if (!target) return;
      var act = target.getAttribute('data-act');

      if (act === 'relate') {
        event.preventDefault();
        relate(target.getAttribute('data-id'), target.getAttribute('data-rel'));
      } else if (act === 'ics') {
        event.preventDefault();
        downloadIcs(target.getAttribute('data-slug'));
      } else if (act === 'signout') {
        S.account = null; S.profile = null; S.host = null;
        S.relations = {}; S.consents = [];
        go('/');
        render();
      } else if (act === 'shift') {
        // 2026 season dates moved forward a year, so the calendar is full.
        // Off by default, because the real state of the data — 22 upcoming
        // events out of 118 — is the thing worth knowing.
        S.shiftDays = S.shiftDays === 0 ? 365 : 0;
        toast(S.shiftDays
          ? 'Season shifted to 2027 so you can see a full calendar. This is a preview control — the real dates are unchanged.'
          : 'Back to the real dates: 22 of 118 approved events are still upcoming.');
        render();
      } else if (act === 'reset') {
        S.account = null; S.profile = null; S.host = null; S.relations = {};
        S.consents = []; S.homeZip = null; S.shiftDays = 0; lastParsed = null;
        go('/');
        render();
      } else if (act === 'snooze') {
        var days = Number(target.getAttribute('data-days'));
        S.profile.snoozedUntil = days > 0 ? addDays(todayIso(), days) : null;
        render();
      } else if (act === 'dates-toggle') {
        S.datesOpen = !S.datesOpen;
        render();
      } else if (act === 'date-preset') {
        S.datesOpen = false;
        go(hrefWith({ from: target.getAttribute('data-from'), to: target.getAttribute('data-to') }));
      } else if (act === 'sample') {
        var box = el('paste');
        if (box) box.value = SAMPLE_POST;
      }
    });

    document.addEventListener('change', function (event) {
      var target = event.target.closest('[data-act]');
      if (!target) return;
      var act = target.getAttribute('data-act');

      if (act === 'facet') {
        var r = route();
        var key = target.getAttribute('data-key');
        var q = new URLSearchParams(r.query.toString());
        var values = q.getAll(key).filter(function (v) { return v !== target.value; });
        if (target.checked) values.push(target.value);
        q.delete(key);
        values.forEach(function (v) { q.append(key, v); });
        q.delete('page');
        go('/' + r.parts.join('/') + (q.toString() ? '?' + q.toString() : ''));
      } else if (act === 'state') {
        go(hrefWith({ state: target.value }));
      } else if (act === 'past') {
        go(hrefWith({ past: target.checked ? '1' : null }));
      }
    });

    // Live feedback while dragging the radius slider and picking an age.
    document.addEventListener('input', function (event) {
      if (event.target.name === 'radius' && event.target.type === 'range') {
        var slot = document.querySelector('[data-slot="radius"]');
        if (slot) slot.textContent = event.target.value;
      }
      if (event.target.name === 'bracket') {
        var note = el('bracket-note');
        if (note) {
          note.innerHTML = event.target.value === 'under_18'
            ? 'A range, not a birthday. <span style="color:var(--coral-ink)">Under-18 accounts cannot add a phone ' +
              'number and never receive texts from COMPETE.</span>'
            : 'A range, not a birthday — we never ask for or store your date of birth.';
        }
      }
    });

    window.addEventListener('hashchange', function () {
      render();
      window.scrollTo({ top: 0, behavior: 'instant' in window ? 'instant' : 'auto' });
    });
  }

  // ------------------------------------------------------------------
  // Boot
  // ------------------------------------------------------------------

  function index(data) {
    data.eventById = {};
    data.eventBySlug = {};
    data.events.forEach(function (e) { data.eventById[e.id] = e; data.eventBySlug[e.slug] = e; });

    data.venueById = {};
    data.venues.forEach(function (v) { data.venueById[v.id] = v; });

    data.organizerById = {};
    data.organizers.forEach(function (o) { data.organizerById[o.id] = o; });

    data.sportBySlug = {};
    data.sports.forEach(function (s) { data.sportBySlug[s.slug] = s; });

    data.refBySlug = { surface: {}, format: {}, division: {} };
    data.surfaces.forEach(function (r) { data.refBySlug.surface[r.slug] = r; });
    data.formats.forEach(function (r) { data.refBySlug.format[r.slug] = r; });
    data.divisions.forEach(function (r) { data.refBySlug.division[r.slug] = r; });

    data.stateNames = {};
    data.stateByCode = {};
    data.map.states.forEach(function (s) { data.stateNames[s.code] = s.name; data.stateByCode[s.code] = s; });

    return data;
  }

  function parseZips(text) {
    var table = {};
    text.split(';').forEach(function (row) {
      if (!row) return;
      var parts = row.split(',');
      table[parts[0]] = {
        lat: Number(parts[1]), lng: Number(parts[2]),
        city: parts[3], state: parts[4],
      };
    });
    return table;
  }

  function boot() {
    Promise.all([
      fetch('data.json').then(function (r) { return r.json(); }),
      fetch('zips.txt').then(function (r) { return r.text(); }),
    ]).then(function (results) {
      S.data = index(results[0]);
      S.zips = parseZips(results[1]);
      bind();
      render();
    }).catch(function (error) {
      el('app').innerHTML =
        '<div class="wrap py12"><div class="panel p6">' +
        '<h1 class="t-head">The preview data did not load</h1>' +
        '<p class="small muted mt3">' + esc(String(error)) + '</p></div></div>';
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
