'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import { sql } from './db';
import { setEventFeatured } from './queries';
import { isSignedIn } from './auth';
import { geocode } from './geocode';
import { currentAccount } from './accounts';
import { sendMail } from './mailer';

/**
 * The Phase 1 admin-managed event entry workflow: create, edit and
 * publish event records until Host publishing arrives in Phase 3.
 */

const EventInput = z.object({
  id: z.string().uuid().optional(),
  name: z.string().trim().min(3, 'Give the event a name.').max(200),
  // Widened to three by 014; the column allowed only two before that.
  event_type: z.enum(['tournament', 'league', 'open_play']).default('tournament'),
  sport: z.string().trim().min(1),
  starts_on: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Pick a start date.'),
  ends_on: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).or(z.literal('')).optional(),
  // Weekly tip-off time. A league plays at the same time every week.
  start_time: z.string().regex(/^\d{2}:\d{2}$/).or(z.literal('')).nullish(),
  // Tournament only. "8am check-in, 9am first serve" is how a flyer reads.
  check_in_time: z.string().regex(/^\d{2}:\d{2}$/).or(z.literal('')).nullish(),
  // The captain's meeting, kept separate from check-in. Never required.
  meeting_time: z.string().regex(/^\d{2}:\d{2}$/).or(z.literal('')).nullish(),
  // Open play is advertised as "6 to 9"; a tournament ends when it ends.
  end_time: z.string().regex(/^\d{2}:\d{2}$/).or(z.literal('')).nullish(),
  is_ongoing: z.boolean().default(false),
  // League shape - see 015_league_schedule.sql. 0 = Sunday.
  league_days: z.array(z.number().int().min(0).max(6)).max(7).default([]),
  league_weeks: z.string().trim().nullish(),
  playoffs: z.boolean().default(false),
  league_dates: z
    .array(
      z.object({
        plays_on: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        skipped: z.boolean().default(false),
        note: z.string().trim().max(200).nullish(),
      }),
    )
    .default([]),
  registration_deadline: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).or(z.literal('')).optional(),
  entry_fee: z.string().trim().optional(),
  fee_basis: z.enum(['per_player', 'per_team']).default('per_player'),
  payout_text: z.string().trim().max(500).optional(),
  event_page_url: z.string().trim().url('Event page must be a full URL.').or(z.literal('')).optional(),
  flyer_url: z.string().trim().url().or(z.literal('')).optional(),
  notes: z.string().trim().max(4000).optional(),
  venue_name: z.string().trim().min(2, 'Give the venue a name.').max(200),
  // Set only by a Google lookup. Blank means fall back to geocoding the
  // ZIP, which is how all 165 existing venues were placed.
  venue_latitude: z.coerce.number().min(-90).max(90).nullish(),
  venue_longitude: z.coerce.number().min(-180).max(180).nullish(),
  venue_place_id: z.string().trim().max(400).nullish(),
  venue_business_status: z.string().trim().max(60).nullish(),
  address_line: z.string().trim().max(300).optional(),
  city: z.string().trim().min(2, 'City is required.').max(120),
  state: z.string().trim().length(2, 'Use the two-letter state code.'),
  // ZIP+4 is what a flyer prints; keep the five that radius search uses.
  postal_code: z
    .string()
    .trim()
    .regex(/^\d{5}(-\d{4})?$/, 'Use a 5-digit ZIP code.')
    .or(z.literal(''))
    .optional()
    .transform((v) => (v ? v.slice(0, 5) : v)),
  organizer_name: z.string().trim().max(200).optional(),
  organizer_email: z.string().trim().email().or(z.literal('')).optional(),
  // Brackets replace the old flat surface/format/division lists. A group is one
  // gender+format (gender lives on the format row) and the divisions that
  // bracket runs. event_formats and event_divisions are derived from these
  // below, so single-axis filters keep working unchanged.
  brackets: z
    .array(
      z.object({
        // One surface per bracket. Null only where the source never said.
        surface: z.string().trim().min(1).nullish(),
        format: z.string().trim().min(1),
        // Blind Draw, KOB or QOB. Null for most brackets — see 012.
        subFormat: z.string().trim().min(1).nullish(),
        // Empty is legitimate: it records a bracket whose division the
        // organizer did not state, rather than inventing one.
        divisions: z.array(z.string().trim().min(1)).default([]),
      }),
    )
    .min(1, 'Add at least one bracket.'),
  status: z.enum(['draft', 'pending', 'approved', 'declined', 'cancelled', 'archived']).default('draft'),
})
  /**
   * A league needs a night and at least one night that plays. Checked
   * here rather than per-field because both only matter when the event
   * type is 'league' - a tournament must not be asked for either.
   */
  .superRefine((val, ctx) => {
    // Open play is a dated series of up to 12 weeks since 15 Nov 2026.
    if (val.event_type === 'open_play') {
      if (val.league_days.length === 0) {
        ctx.addIssue({ code: 'custom', path: ['league_days'], message: 'Pick which nights open play runs.' });
      }
      const weeks = Number(val.league_weeks);
      if (!weeks || weeks < 1 || weeks > 12) {
        ctx.addIssue({
          code: 'custom',
          path: ['league_weeks'],
          message: 'Open play runs for 1 to 12 weeks. Renew it to go longer.',
        });
      }
      if (!val.league_dates.some((d) => !d.skipped)) {
        ctx.addIssue({
          code: 'custom',
          path: ['league_dates'],
          message: 'No sessions are left on. Set the weeks, and switch back on any date you turned off.',
        });
      }
      return;
    }

    if (val.event_type !== 'league') return;

    if (val.league_days.length === 0) {
      ctx.addIssue({
        code: 'custom',
        path: ['league_days'],
        message: 'Pick which night of the week the league plays.',
      });
    }

    if (!val.league_dates.some((d) => !d.skipped)) {
      ctx.addIssue({
        code: 'custom',
        path: ['league_dates'],
        message:
          'This season has no nights that play. Set the number of weeks, and restore any night you skipped.',
      });
    }
  });

export type ActionState = {
  ok: boolean;
  message: string;
  fieldErrors?: Record<string, string>;
  /**
   * Where the event now lives, so the form can offer a way to it.
   *
   * Tom, 27 Oct: saving as "Approved - live on the site" used to return a
   * green line and nothing else, which leaves you wondering whether it
   * worked. Publishing to a live site should end with somewhere to go.
   */
  saved?: { id: string; slug: string; status: string };
};

function slugify(s: string): string {
  return s
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
}

function parseFee(raw: string | undefined): number | null {
  if (!raw || !raw.trim()) return null;
  const match = raw.replace(/[$,]/g, '').match(/\d+(?:\.\d{1,2})?/);
  if (!match) return null;
  return Math.round(Number(match[0]) * 100);
}

export async function saveEvent(
  _prev: ActionState | null,
  formData: FormData,
): Promise<ActionState> {
  if (!(await isSignedIn())) redirect('/admin');
  return persistEvent(formData, { kind: 'staff' });
}

/**
 * As-you-type organization matches for the public form (Tom, 23 Nov):
 * after 3 letters, up to 5, and only organizations that already have an
 * event on the site -- never the CRM's researched-but-unpublished list.
 * Signed-in, confirmed accounts only, to keep it from being scraped.
 */
export async function matchPublicOrganizers(
  q: string,
): Promise<{ id: string; name: string; city: string | null; state: string | null }[]> {
  const account = await currentAccount();
  if (!account?.email_verified_at) return [];
  const term = q.trim();
  if (term.length < 3) return [];
  const rows = await sql<{ id: string; name: string; city: string | null; state: string | null }[]>`
    select o.id, o.name, o.city, o.state
      from organizers o
     where o.name ilike ${'%' + term + '%'}
       and exists (select 1 from events e where e.organizer_id = o.id and e.status in ('approved','archived'))
     order by (o.name ilike ${term + '%'}) desc, o.name
     limit 5`;
  return [...rows];
}

/** Submissions one account can make in 24 hours. */
const SUBMISSIONS_PER_DAY = 5;

/**
 * The public submission form (22 Nov 2026). Signed-in accounts with a
 * confirmed email only -- Tom's call, and the strongest bot protection
 * available until the security review. The event is created as 'pending'
 * and stays invisible until Tom approves it.
 */
export async function submitEvent(
  _prev: ActionState | null,
  formData: FormData,
): Promise<ActionState> {
  const account = await currentAccount();
  if (!account) return { ok: false, message: 'Sign in to submit an event.' };
  if (!account.email_verified_at) {
    return {
      ok: false,
      message: 'Confirm your email first — use the link we sent when you signed up, or ask for a new one from your account page.',
    };
  }

  const [{ n }] = await sql<{ n: number }[]>`
    select count(*)::int as n from events
     where submitted_by = ${account.id} and submitted_at > now() - interval '1 day'`;
  if (n >= SUBMISSIONS_PER_DAY) {
    return {
      ok: false,
      message: `That's ${SUBMISSIONS_PER_DAY} events in the last day, which is the limit for now. Try again tomorrow, or email hello@joincompete.com.`,
    };
  }

  const result = await persistEvent(formData, { kind: 'submission', accountId: account.id });
  if (result.ok && result.saved) {
    console.info(`[submission] ${result.saved.id} from account ${account.id}`);
  }
  return result;
}

/**
 * Approve or decline a submission, and tell the submitter. Staff only.
 * A decline needs a reason: it goes in the email, and an unexplained no
 * is how a helpful friend stops helping.
 */
export async function reviewSubmission(
  id: string,
  decision: 'approve' | 'decline',
  reason: string,
): Promise<{ ok: boolean; message: string }> {
  if (!(await isSignedIn())) return { ok: false, message: 'Sign in first.' };
  const note = reason.trim().slice(0, 1000);
  if (decision === 'decline' && !note) {
    return { ok: false, message: 'Add a short reason — it goes in the email to the submitter.' };
  }

  const [row] = await sql<{ name: string; slug: string; email: string | null; display_name: string | null }[]>`
    update events e set
      status       = ${decision === 'approve' ? 'approved' : 'declined'},
      published_at = case when ${decision} = 'approve' and e.published_at is null then now() else e.published_at end,
      reviewed_at  = now(),
      review_note  = ${decision === 'decline' ? note : null}
    from events before
    left join accounts a on a.id = before.submitted_by
    where e.id = ${id} and before.id = e.id
    returning e.name, e.slug, a.email, a.display_name`;
  if (!row) return { ok: false, message: 'That event no longer exists.' };

  revalidatePath('/');
  revalidatePath('/admin/events');
  revalidatePath('/admin');

  if (!row.email) {
    return { ok: true, message: decision === 'approve' ? 'Approved and live.' : 'Declined.' };
  }

  const site = process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000';
  const hello = row.display_name ? `Hi ${row.display_name.split(' ')[0]},` : 'Hi,';
  const sent = await sendMail(
    decision === 'approve'
      ? {
          to: row.email,
          subject: `Your event is live on COMPETE: ${row.name}`,
          text:
            `${hello}\n\nThanks for adding ${row.name}. It's approved and live:\n\n` +
            `${site}/events/${row.slug}\n\nKeep them coming.\n\nTom, COMPETE\n`,
        }
      : {
          to: row.email,
          subject: `About the event you submitted: ${row.name}`,
          text:
            `${hello}\n\nThanks for submitting ${row.name}. We didn't publish it this time:\n\n` +
            `${note}\n\nIf that's fixable, you're welcome to submit it again at ${site}/submit.\n\nTom, COMPETE\n`,
        },
  );
  const verb = decision === 'approve' ? 'Approved and live' : 'Declined';
  return sent.ok
    ? { ok: true, message: `${verb}. ${row.email} has been emailed.` }
    : { ok: true, message: `${verb}, but the email to ${row.email} failed (${sent.detail ?? 'unknown'}).` };
}

/**
 * Who is saving. Staff can do anything the form allows. A submission
 * (public form, 22 Nov) always creates a NEW event as 'pending', and may
 * not change anything that already exists: an existing venue's address and
 * pin, or an existing organizer's name and email, stay as staff left them.
 */
type SaveMode = { kind: 'staff' } | { kind: 'submission'; accountId: string };

/**
 * NOT exported, on purpose. In a 'use server' file every exported async
 * function becomes callable from a browser, and this one checks nothing.
 * saveEvent and submitEvent each check who is calling before they get here.
 */
async function persistEvent(formData: FormData, mode: SaveMode): Promise<ActionState> {
  const staff = mode.kind === 'staff';

  const raw = {
    id: staff ? ((formData.get('id') as string) || undefined) : undefined,
    name: formData.get('name'),
    event_type: formData.get('event_type') ?? 'tournament',
    sport: formData.get('sport') ?? 'volleyball',
    starts_on: formData.get('starts_on'),
    // `?? undefined`, same reason as the fields below: when open play runs
    // until further notice the date box is disabled, a disabled input is
    // never sent, and null failed validation -- an ongoing session could
    // not be saved at all. Found the first time open play was used, 15 Nov.
    ends_on: formData.get('ends_on') ?? undefined,
    // formData.get() returns NULL for a field the browser never sent, and a
    // field only rendered for one event type is exactly that. Zod's
    // .optional() accepts undefined, not null - so a tournament failed
    // validation on two league fields that were never on screen. Tom, 3 Nov.
    start_time: formData.get('start_time') ?? undefined,
    check_in_time: formData.get('check_in_time') ?? undefined,
    meeting_time: formData.get('meeting_time') ?? undefined,
    end_time: formData.get('end_time') ?? undefined,
    is_ongoing: formData.get('is_ongoing') === 'on',
    league_days: readJsonArray(formData.get('league_days')),
    league_weeks: formData.get('league_weeks') ?? undefined,
    playoffs: formData.get('playoffs') === 'on',
    league_dates: readJsonArray(formData.get('league_dates')),
    registration_deadline: formData.get('registration_deadline'),
    entry_fee: formData.get('entry_fee'),
    fee_basis: formData.get('fee_basis') ?? 'per_player',
    payout_text: formData.get('payout_text'),
    event_page_url: formData.get('event_page_url'),
    flyer_url: formData.get('flyer_url'),
    notes: formData.get('notes'),
    venue_name: formData.get('venue_name'),
    venue_latitude: formData.get('venue_latitude') || undefined,
    venue_longitude: formData.get('venue_longitude') || undefined,
    venue_place_id: formData.get('venue_place_id') || undefined,
    venue_business_status: formData.get('venue_business_status') || undefined,
    address_line: formData.get('address_line'),
    city: formData.get('city'),
    state: String(formData.get('state') ?? '').toUpperCase(),
    postal_code: formData.get('postal_code'),
    organizer_name: formData.get('organizer_name'),
    // `?? undefined`: the field is not on every form, and a field the
    // browser never sent is null, which .optional() refuses (Tom, 22 Nov).
    organizer_email: formData.get('organizer_email') ?? undefined,
    brackets: readBrackets(formData.get('brackets')),
    // The "Save as draft" button sends its own name, and a clicked submit
    // button's value is the one the browser sends - so one click parks the
    // event without having to also change the dropdown.
    status: !staff
      ? 'draft'
      : formData.get('intent') === 'draft' ? 'draft' : (formData.get('status') ?? 'draft'),
  };

  const parsed = EventInput.safeParse(raw);
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      const key = String(issue.path[0] ?? 'form');
      fieldErrors[key] ??= issue.message;
    }
    return { ok: false, message: 'Some fields need fixing.', fieldErrors };
  }
  const input = parsed.data;
  // A submission is always 'pending' -- set here, after validation, so the
  // form can never ask for anything else.
  const status: string = staff ? input.status : 'pending';

  // The public form asks who to contact at the organization (Tom, 22 Nov),
  // so Tom can confirm the event before approving it. Required there.
  const contactFirst = String(formData.get('organizer_contact_first') ?? '').trim().slice(0, 80);
  const contactLast = String(formData.get('organizer_contact_last') ?? '').trim().slice(0, 80);
  const contactPhone = String(formData.get('organizer_contact_phone') ?? '').trim().slice(0, 40);
  // "Are you the organizer, or an athlete adding it?" (Tom, 23 Nov).
  const roleRaw = String(formData.get('submitter_role') ?? '');
  const submitterRole = roleRaw === 'organizer' || roleRaw === 'athlete' ? roleRaw : null;
  // Picked from the as-you-type matches: an organization already on COMPETE.
  const pickedOrganizer = String(formData.get('organizer_id') ?? '');
  if (!staff) {
    const missing: Record<string, string> = {};
    if (!submitterRole) missing.submitter_role = 'Tell us whether you run this event or are adding it for someone.';
    if (!input.organizer_name) missing.organizer_name = 'Which organization runs it?';
    if (contactPhone.replace(/\D/g, '').length < 10) {
      missing.organizer_contact_phone = 'A phone number for the organizer contact, with area code.';
    }
    if (!contactFirst) missing.organizer_contact_first = 'First name of the organizer contact.';
    if (!contactLast) missing.organizer_contact_last = 'Last name of the organizer contact.';
    if (!input.organizer_email) missing.organizer_email = 'An email for the organizer contact.';
    if (Object.keys(missing).length) {
      return { ok: false, message: 'Some fields need fixing.', fieldErrors: missing };
    }
  }

  if (input.ends_on && input.ends_on < input.starts_on) {
    return {
      ok: false,
      message: 'Some fields need fixing.',
      fieldErrors: { ends_on: 'End date cannot be before the start date.' },
    };
  }

  const [sport] = await sql<{ id: string }[]>`select id from sports where slug = ${input.sport}`;
  if (!sport) return { ok: false, message: `Unknown sport "${input.sport}".` };

  // ---- venue: reuse an existing one rather than add a duplicate ----
  // Google's place id is certain, so it wins. Otherwise name, city and
  // state, ignoring capitals and stray spaces: "Sand Volleyball club" is
  // the same venue as "Sand Volleyball Club".
  const placeId = input.venue_place_id || null;
  const [existingVenue] = await sql<{ id: string; latitude: number | null }[]>`
    select id, latitude from venues
    where (${placeId}::text is not null and google_place_id = ${placeId})
       or (lower(trim(name)) = lower(trim(${input.venue_name}))
           and lower(trim(city)) = lower(trim(${input.city}))
           and upper(state) = upper(${input.state}))
    order by (google_place_id is not distinct from ${placeId}) desc
    limit 1`;

  let venueId: string;
  if (existingVenue) {
    venueId = existingVenue.id;
    if (staff) {
      await sql`
        update venues set
          address_line = ${input.address_line || null},
          postal_code = ${input.postal_code || null}
        where id = ${venueId}`;
    }
  } else {
    const [row] = await sql<{ id: string }[]>`
      insert into venues (name, address_line, city, state, postal_code)
      values (${input.venue_name}, ${input.address_line || null}, ${input.city},
              ${input.state}, ${input.postal_code || null})
      returning id`;
    venueId = row.id;
  }

  /**
   * An exact pin from Google beats anything we can derive.
   *
   * Written whenever the lookup produced one, including over an existing
   * venue's approximate pin - upgrading 'postal' to 'exact' is the whole
   * point, and every venue in the database started out approximate. The
   * reverse never happens: the geocode fallback below only runs when
   * there are no coordinates at all.
   */
  const hasExact =
    typeof input.venue_latitude === 'number' && typeof input.venue_longitude === 'number';

  // A submitter can place a NEW venue, but never move an existing one.
  if (hasExact && (staff || !existingVenue)) {
    await sql`
      update venues set
        latitude = ${input.venue_latitude!}, longitude = ${input.venue_longitude!},
        geo_precision = 'exact', geocoded_at = now(),
        google_place_id = coalesce(${input.venue_place_id || null}, google_place_id),
        business_status = coalesce(${input.venue_business_status || null}, business_status)
      where id = ${venueId}`;
  }

  // Geocode whenever coordinates are missing, so a new venue is findable by
  // radius search the moment it is published.
  const needsGeocode = !hasExact && (!existingVenue || existingVenue.latitude === null);
  if (needsGeocode) {
    const query =
      input.postal_code ||
      [input.address_line, input.city, input.state].filter(Boolean).join(', ') ||
      `${input.city}, ${input.state}`;
    const point = await geocode(query);
    if (point) {
      await sql`
        update venues set
          latitude = ${point.lat}, longitude = ${point.lng},
          geo_precision = ${point.source === 'mapbox' ? 'exact' : point.source},
          geocoded_at = now()
        where id = ${venueId}`;
    }
  }

  // ---- organizer ----
  let organizerId: string | null = null;
  // A submitter who picked an existing organization from the matches gets
  // that record -- but only one already public on COMPETE, so the id can't
  // be used to attach an event to an arbitrary CRM record.
  if (!staff && /^[0-9a-f-]{36}$/i.test(pickedOrganizer)) {
    const [picked] = await sql<{ id: string }[]>`
      select o.id from organizers o
       where o.id = ${pickedOrganizer}
         and exists (select 1 from events e where e.organizer_id = o.id and e.status in ('approved','archived'))`;
    organizerId = picked?.id ?? null;
  }
  if (!organizerId && input.organizer_name) {
    const orgSlug = slugify(input.organizer_name);
    // organizers.contact_email is PUBLIC. A submitter's typed email is
    // never written there: Tom adds it on review if the organizer wants it.
    const [row] = staff
      ? await sql<{ id: string }[]>`
          insert into organizers (slug, name, contact_email)
          values (${orgSlug}, ${input.organizer_name}, ${input.organizer_email || null})
          on conflict (slug) do update
            set name = excluded.name,
                contact_email = coalesce(excluded.contact_email, organizers.contact_email)
          returning id`
      : await sql<{ id: string }[]>`
          insert into organizers (slug, name)
          values (${orgSlug}, ${input.organizer_name})
          on conflict (slug) do update set name = organizers.name
          returning id`;
    organizerId = row.id;
  }

  // ---- event ----
  const feeCents = parseFee(input.entry_fee);
  let eventId: string;

  /**
   * starts_on and ends_on stay the season's real first and last PLAYING
   * night, derived here rather than trusted from the form.
   *
   * That is what keeps every existing query working without teaching it
   * what a league is: the live/past filter, the date sort and the search
   * all read starts_on. Skip the first night for a holiday and the season
   * genuinely starts a week later, so the column has to agree.
   */
  // "League" here means any dated series: a league, or open play since
  // 15 Nov 2026. Both store their nights in league_dates.
  const isLeague = input.event_type === 'league' || input.event_type === 'open_play';
  const playingNights = input.league_dates
    .filter((d) => !d.skipped)
    .map((d) => d.plays_on)
    .sort();

  const startsOn = isLeague && playingNights.length ? playingNights[0] : input.starts_on;
  const lastNight = playingNights[playingNights.length - 1];
  const endsOn = isLeague
    ? lastNight && lastNight !== startsOn
      ? lastNight
      : null
    : input.ends_on || null;

  const leagueWeeks = isLeague && input.league_weeks ? Number(input.league_weeks) : null;
  const leagueDays = isLeague && input.league_days.length ? input.league_days : null;

  /**
   * A registration deadline after the event has already started.
   *
   * Two of these came in with the 2022-24 import - ADV Outdoor Opener
   * starts 13 Apr and closed registration on the 14th - so it is a
   * mistake that genuinely gets made, not a hypothetical. Refused on
   * save rather than cleaned up afterwards. Tom, 4 Nov.
   *
   * Checked against the DERIVED start, so a league whose first night was
   * skipped for a holiday is measured against the night it really
   * begins, not the one originally typed.
   */
  if (input.registration_deadline && input.registration_deadline > startsOn) {
    return {
      ok: false,
      message: 'Registration closes after the event starts.',
      fieldErrors: {
        registration_deadline: `This is after the ${
          isLeague ? 'first night' : 'start date'
        } (${startsOn}). Registration cannot close after play begins.`,
      },
    };
  }


  if (input.id) {
    const [row] = await sql<{ id: string }[]>`
      update events set
        name = ${input.name}, event_type = ${input.event_type},
        sport_id = ${sport.id}, venue_id = ${venueId},
        organizer_id = ${organizerId}, starts_on = ${startsOn},
        ends_on = ${endsOn},
        start_time = ${input.start_time || null},
        check_in_time = ${input.check_in_time || null},
        meeting_time = ${input.meeting_time || null},
        end_time = ${input.end_time || null},
        is_ongoing = ${input.event_type === 'open_play' ? input.is_ongoing : false},
        league_days = ${leagueDays},
        league_weeks = ${leagueWeeks},
        playoffs = ${isLeague ? input.playoffs : false},
        registration_deadline = ${input.registration_deadline || null},
        entry_fee_cents = ${feeCents}, fee_basis = ${input.fee_basis},
        payout_text = ${input.payout_text || null},
        event_page_url = ${input.event_page_url || null},
        flyer_url = ${input.flyer_url || null},
        notes = ${input.notes || null}, status = ${status},
        published_at = case
          when ${status} = 'approved' and published_at is null then now()
          else published_at end
      where id = ${input.id}
      returning id`;
    if (!row) return { ok: false, message: 'That event no longer exists.' };
    eventId = row.id;
  } else {
    let slug = slugify(`${input.name}-${input.city}-${startsOn}`);
    const [clash] = await sql<{ id: string }[]>`select id from events where slug = ${slug}`;
    if (clash) slug = `${slug}-${Date.now().toString(36).slice(-4)}`;

    const [row] = await sql<{ id: string }[]>`
      insert into events (
        slug, name, event_type, sport_id, venue_id, organizer_id, starts_on, ends_on,
        start_time, check_in_time, meeting_time, end_time, is_ongoing,
        league_days, league_weeks, playoffs,
        registration_deadline, entry_fee_cents, fee_basis, payout_text,
        event_page_url, flyer_url, notes, status, source, created_by, published_at,
        submitted_by, submitted_at, submitter_role
      ) values (
        ${slug}, ${input.name}, ${input.event_type}, ${sport.id}, ${venueId}, ${organizerId},
        ${startsOn}, ${endsOn},
        ${input.start_time || null}, ${input.check_in_time || null}, ${input.meeting_time || null},
        ${input.end_time || null}, ${input.event_type === 'open_play' ? input.is_ongoing : false},
        ${leagueDays}, ${leagueWeeks},
        ${isLeague ? input.playoffs : false},
        ${input.registration_deadline || null}, ${feeCents}, ${input.fee_basis},
        ${input.payout_text || null}, ${input.event_page_url || null},
        ${input.flyer_url || null}, ${input.notes || null}, ${status},
        ${staff ? 'admin' : 'submission'}, ${staff ? 'admin' : 'submission'},
        ${status === 'approved' ? sql`now()` : null},
        ${mode.kind === 'submission' ? mode.accountId : null},
        ${mode.kind === 'submission' ? sql`now()` : null},
        ${mode.kind === 'submission' ? submitterRole : null}
      )
      returning id`;
    eventId = row.id;
  }

  // A submitted contact goes in the PRIVATE contacts table, marked as
  // unverified and tied to this event, never on the public organizer record.
  if (mode.kind === 'submission' && organizerId && input.organizer_email) {
    await sql`
      insert into organizer_contacts (organizer_id, name, email, phone, notes)
      select ${organizerId}, ${`${contactFirst} ${contactLast}`.trim()}, ${input.organizer_email},
             ${contactPhone || null},
             ${`Unverified — from a public submission (event ${eventId}).`}
       where not exists (
         select 1 from organizer_contacts
          where organizer_id = ${organizerId} and lower(email) = lower(${input.organizer_email}))`;
  }

  // The flat lists are derived, never entered. They exist so a one-axis
  // filter ("show me anything coed") can be answered from the view without
  // a join, and they can no longer disagree with the brackets.
  const formatSlugs = [...new Set(input.brackets.map((b) => b.format))];
  const divisionSlugs = [...new Set(input.brackets.flatMap((b) => b.divisions))];
  const surfaceSlugs = [
    ...new Set(input.brackets.map((b) => b.surface).filter((s): s is string => !!s)),
  ];

  await replaceLinks(eventId, sport.id, surfaceSlugs, 'event_surfaces', 'surfaces', 'surface_id');
  await replaceLinks(eventId, sport.id, formatSlugs, 'event_formats', 'formats', 'format_id');
  await replaceLinks(eventId, sport.id, divisionSlugs, 'event_divisions', 'divisions', 'division_id');
  await replaceBrackets(eventId, sport.id, input.brackets);
  await replaceLeagueDates(eventId, isLeague ? input.league_dates : []);

  revalidatePath('/');
  revalidatePath('/admin/events');
  const [saved] = await sql<{ slug: string }[]>`select slug from events where id = ${eventId}`;

  if (!staff) {
    revalidatePath('/admin');
    return {
      ok: true,
      message: 'Thanks — your event is in the review queue. We will email you when it is approved.',
      saved: { id: eventId, slug: saved?.slug ?? '', status },
    };
  }

  return {
    ok: true,
    message:
      status === 'approved'
        ? input.id
          ? 'Updated and live on the site.'
          : 'Created and live on the site.'
        : input.id
          ? 'Updated. Still a draft, so not public yet.'
          : 'Created as a draft, so not public yet.',
    saved: { id: eventId, slug: saved?.slug ?? '', status },
  };
}

/**
 * The hidden `brackets` field is JSON rather than repeated form inputs,
 * because a group is a shape (one format, many divisions) and repeated
 * fields cannot express which division belongs to which format — which is
 * the exact ambiguity this whole change exists to remove.
 *
 * Anything unparseable becomes an empty list and fails zod's min(1) with a
 * message, rather than throwing.
 */
/**
 * A hidden field carrying JSON. Malformed input becomes an empty array
 * rather than an exception, and Zod then reports it as a field error -
 * the form has to come back with a message, not a stack trace.
 */
function readJsonArray(raw: FormDataEntryValue | null): unknown[] {
  if (typeof raw !== 'string' || !raw.trim()) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

const readBrackets = readJsonArray;

/**
 * The nights a league plays.
 *
 * Replaced wholesale rather than diffed, same as brackets: the form
 * always sends the complete schedule, so a night the director removed is
 * one that is absent from the list, not one marked for deletion.
 *
 * Called with an empty list for anything that is not a league, which is
 * what clears the schedule if an event's type is changed from league to
 * tournament - otherwise a stale set of Tuesdays would outlive the
 * season it belonged to.
 */
async function replaceLeagueDates(
  eventId: string,
  dates: { plays_on: string; skipped: boolean; note?: string | null }[],
): Promise<void> {
  await sql`delete from league_dates where event_id = ${eventId}`;
  if (!dates.length) return;

  await sql`
    insert into league_dates ${sql(
      dates.map((d) => ({
        event_id: eventId,
        plays_on: d.plays_on,
        skipped: d.skipped,
        note: d.note ?? null,
      })),
      'event_id',
      'plays_on',
      'skipped',
      'note',
    )}
    on conflict (event_id, plays_on) do update
      set skipped = excluded.skipped, note = excluded.note`;
}

/**
 * Brackets stated by a person, so confirmed = true.
 *
 * This is the first path in COMPETE that can produce a confirmed bracket.
 * Every one of the 2,574 rows written by 004's backfill is confirmed =
 * false, because it derived them as a cross product of flat lists that
 * never recorded which combinations actually ran.
 */
async function replaceBrackets(
  eventId: string,
  sportId: string,
  groups: {
    surface?: string | null;
    format: string;
    subFormat?: string | null;
    divisions: string[];
  }[],
): Promise<void> {
  await sql`delete from event_brackets where event_id = ${eventId}`;
  if (!groups.length) return;

  const formatSlugs = [...new Set(groups.map((g) => g.format))];
  const divisionSlugs = [...new Set(groups.flatMap((g) => g.divisions))];
  const subFormatSlugs = [
    ...new Set(groups.map((g) => g.subFormat).filter((s): s is string => !!s)),
  ];
  const surfaceSlugs = [
    ...new Set(groups.map((g) => g.surface).filter((s): s is string => !!s)),
  ];

  const [formatRows, divisionRows, subFormatRows, surfaceRows] = await Promise.all([
    sql<{ id: string; slug: string }[]>`
      select id, slug from formats
      where sport_id = ${sportId} and slug = any(${formatSlugs})`,
    divisionSlugs.length
      ? sql<{ id: string; slug: string }[]>`
          select id, slug from divisions
          where sport_id = ${sportId} and slug = any(${divisionSlugs})`
      : Promise.resolve([] as { id: string; slug: string }[]),
    subFormatSlugs.length
      ? sql<{ id: string; slug: string }[]>`
          select id, slug from sub_formats
          where sport_id = ${sportId} and slug = any(${subFormatSlugs})`
      : Promise.resolve([] as { id: string; slug: string }[]),
    surfaceSlugs.length
      ? sql<{ id: string; slug: string }[]>`
          select id, slug from surfaces
          where sport_id = ${sportId} and slug = any(${surfaceSlugs})`
      : Promise.resolve([] as { id: string; slug: string }[]),
  ]);

  const formatId = new Map(formatRows.map((r) => [r.slug, r.id]));
  const divisionId = new Map(divisionRows.map((r) => [r.slug, r.id]));
  const subFormatId = new Map(subFormatRows.map((r) => [r.slug, r.id]));
  const surfaceId = new Map(surfaceRows.map((r) => [r.slug, r.id]));

  for (const group of groups) {
    const fid = formatId.get(group.format);
    if (!fid) continue;

    // No divisions stated is one bracket with a null division, not zero
    // brackets. Null means "the source does not say" everywhere else in
    // this schema and it means the same thing here.
    const divisions: (string | null)[] = group.divisions.length ? group.divisions : [null];

    const sfid = group.subFormat ? (subFormatId.get(group.subFormat) ?? null) : null;
    const surfid = group.surface ? (surfaceId.get(group.surface) ?? null) : null;

    for (const slug of divisions) {
      const did = slug === null ? null : (divisionId.get(slug) ?? null);
      await sql`
        insert into event_brackets
          (event_id, format_id, division_id, sub_format_id, surface_id, confirmed)
        values (${eventId}, ${fid}, ${did}, ${sfid}, ${surfid}, true)`;
    }
  }
}

async function replaceLinks(
  eventId: string,
  sportId: string,
  slugs: string[],
  joinTable: string,
  refTable: string,
  refColumn: string,
): Promise<void> {
  await sql`delete from ${sql(joinTable)} where event_id = ${eventId}`;
  if (!slugs.length) return;

  const ids = await sql<{ id: string }[]>`
    select id from ${sql(refTable)}
    where sport_id = ${sportId} and slug = any(${slugs})`;

  for (const { id } of ids) {
    await sql`
      insert into ${sql(joinTable)} (event_id, ${sql(refColumn)})
      values (${eventId}, ${id})
      on conflict do nothing`;
  }
}

/**
 * Deleting an event -- drafts, and published events nobody has kept.
 *
 * Five tables point at `events` with `on delete cascade`, and one of them
 * is `account_events`: every player's saved, registered and attended
 * record. Deleting an event a player kept would take it out of their list
 * silently, so THAT is the line, not the status.
 *
 * Until 15 Nov only drafts could be deleted (Tom's rule, 28 Oct). Then a
 * published duplicate turned up -- "Deck The Balls", entered twice -- and
 * there was no way to remove it: cancelling it would have shown players
 * a cancelled copy beside the real one. Tom asked for delete on published
 * events too. So: any event with no player attached can be deleted; one a
 * player kept says how many, and points to Cancelled instead.
 *
 * Everything is re-read here rather than trusted from the form, because
 * a stale page could otherwise delete something that has since changed.
 */
export async function deleteEvent(id: string): Promise<ActionState> {
  if (!(await isSignedIn())) redirect('/admin');

  const [row] = await sql<{ status: string; name: string; kept: number }[]>`
    select e.status, e.name,
           (select count(*)::int from account_events ae where ae.event_id = e.id) as kept
      from events e
     where e.id = ${id}`;

  if (!row) return { ok: false, message: 'That event no longer exists.' };
  if (row.kept > 0) {
    return {
      ok: false,
      message: `${row.kept} ${row.kept === 1 ? 'player has' : 'players have'} saved this event, so deleting it would quietly remove it from their lists. Set its status to Cancelled instead.`,
    };
  }

  await sql`delete from events where id = ${id}`;
  revalidatePath('/admin/events');
  revalidatePath('/');
  revalidatePath('/events');
  return { ok: true, message: `Deleted "${row.name}".` };
}

export async function setEventStatus(id: string, status: string): Promise<void> {
  if (!(await isSignedIn())) redirect('/admin');
  if (!['draft', 'pending', 'approved', 'declined', 'cancelled', 'archived'].includes(status)) return;

  await sql`
    update events set
      status = ${status},
      published_at = case
        when ${status} = 'approved' and published_at is null then now()
        else published_at end
    where id = ${id}`;

  revalidatePath('/');
  revalidatePath('/admin/events');
}

/** Adds or removes an event from the homepage Featured rail. */
export async function toggleFeatured(id: string, featured: boolean): Promise<void> {
  if (!(await isSignedIn())) redirect('/admin');
  await setEventFeatured(id, featured);
  revalidatePath('/');
  revalidatePath('/admin/events');
}
