# Phase 2 — Accounts and profiles: as built

Approved by Tom on 26 September 2026 and built the same day. This document
records what was decided and what the code now does, so the decisions are
findable later without re-reading a chat log.

Supersedes the "for approval" draft of 24 September.

---

## 1. Decisions

| Question | Decision |
|---|---|
| Sign-in | Google **and** email + password, both, converging on one account |
| Account model | One account, additive Athlete / Host roles, toggled inside the account |
| Age floor | **13+.** Under-13 accounts are refused at sign-up |
| Age data | A self-declared **bracket**, never a date of birth |
| Minors | May hold accounts. **No phone number, no text messages, ever** |
| Gender | Optional: male / female / prefer not to say |
| Phone | Optional but recommended, adults only, with TCPA consent captured at the same moment |
| ZIP changes | Unrestricted, until there is a paywall to protect |
| Privacy / terms | I draft, a lawyer reviews before launch |
| Contact address | `hello@joincompete.com` |
| Plan column | Present, unused. No gating, no payment tables |
| Event lists | Saved, Upcoming (registered), History (attended) |

Two things were deliberately settled as *separate* questions, because
conflating them is what makes this area go wrong:

* **What COMPETE lists** — adult recreational events only. Unchanged, and
  still enforced by a CHECK constraint in `001_schema.sql`.
* **Who may hold an account** — anyone 13 or over. A 16-year-old who plays
  in open tournaments is a real user.

Whether any particular event will accept an under-18 player is the
organizer's decision, and the site says so rather than implying otherwise.
Many organizers require 18+ for insurance and waiver reasons.

---

## 2. Age, and why brackets

Stored: one of `under_18`, `18_24`, `25_34`, `35_44`, `45_54`, `55_plus`.
Not stored: date of birth, in any form, anywhere.

The bracket does two jobs at once — it confirms adulthood and gives
advertisers something to target later — so there is no separate "I am over
18" checkbox. Sign-up does ask for one explicit confirmation, that the
person is 13 or older, because the consequence of getting that wrong is a
federal obligation rather than a bad recommendation.

**COPPA** attaches a verifiable-parental-consent requirement to personal
information collected from children under 13. Building that is real work for
approximately zero users, so the floor is 13 and the obligation never
arises.

The bracket is self-reported and never re-verified. It will drift as people
age; that is accepted rather than solved.

---

## 3. Athlete profile — as built

| Field | Required | Visible | Notes |
|---|---|---|---|
| Display name | yes | yes | |
| Email | yes | no | Sign-in, resets |
| Home ZIP | no | no | Drives the Local rail and radius search |
| Travel radius | no (100 mi) | no | 10–250 |
| Age bracket | at sign-up | no | See §2 |
| Gender | no | no | male / female / prefer not to say |
| Mobile phone | no | no | Adults only — see §4 |
| Preferred sports | no | no | |
| Preferred surfaces | no | no | Per sport |
| Preferred formats | no | no | Per sport |
| Preferred divisions | no | no | Per sport |
| Home city & state | derived | yes | From the ZIP, never typed |
| Avatar | — | — | Deferred; needs storage and a moderation answer |

City, state and coordinates are always derived from the ZIP, so they cannot
disagree with it.

Two constraints in the database rather than in a comment:

```sql
constraint athlete_no_minor_phone
  check (age_bracket is distinct from 'under_18' or phone_e164 is null),
constraint athlete_alerts_need_phone
  check (sms_alerts_enabled is false or phone_e164 is not null)
```

Switching a profile to the under-18 bracket clears any phone number and
turns alerts off. That is the safe direction to resolve the conflict in.

---

## 4. Phone numbers and TCPA

The Telephone Consumer Protection Act attaches damages of $500 per message,
$1,500 if wilful, to marketing texts sent without prior express written
consent — and gives the recipient a private right of action, which is why
there is an industry of firms that do nothing else.

Consent cannot be added retroactively. A number collected without a record
is a number that can never be marketed to.

So the profile form presents **two separate, unticked boxes**, each showing
the full disclosure rather than a summary:

* **Transactional** — details about events you saved or registered for.
* **Marketing** — alerts when a new tournament matches your saved filters.

Neither is a condition of anything, and the form says so. The wording lives
in `src/lib/sms-consent.ts` with a version string, and every consent row
stores the exact text shown, the version, the timestamp, the IP address and
the user agent. `sms_consents` is **append-only**: revoking inserts a
`revoked` row rather than deleting the grant. Current state is the view
`sms_consent_current`.

**STOP, HELP and START** are carrier-mandated and will always work.
**SNOOZE** is COMPETE's own addition — a beach player in January is not an
unsubscribe, they are back in April — implemented as
`athlete_profiles.sms_snoozed_until` with 2-week, 1-month, 3-month and
6-month choices on the profile.

Nothing sends messages yet. This phase captures consent correctly so the
first year of the list is usable when a provider is added.

---

## 5. Host profile — as built

| Field | Required | Notes |
|---|---|---|
| Organization name | yes | Placeholder suggests "John Doe Tournaments" for anyone without a brand |
| Contact email | yes | Public. Also what claims existing events |
| Contact phone | no | |
| Website or Facebook page | no | `https://` added if missing |
| City / state | no | |
| About | no | 500 characters |
| Logo | — | Deferred with avatars |

Saving a host profile sets `is_host` and then looks for an organizer already
in the database with that contact email. If one is found and unclaimed, it
is linked, and the events already listed under it appear on the page. That
is how the 23 organizers in the launch data keep their history.

---

## 6. Event lists

One row per account + event in `account_events`, with a relation that moves
forward: `saved` → `registered` → `attended`. An event is therefore never in
two lists at once.

Which list it appears in is a function of the relation **and** the date:

| List | Rule |
|---|---|
| Saved | relation `saved`, not finished |
| Coming up | relation `registered`, not finished |
| History | relation `registered` or `attended`, finished |

A registered event moves into history by itself the day after it ends. There
is no nightly job to fall behind and nothing to reconcile when one does.

---

## 7. What still needs you

**a. Lawyer review of `/privacy` and `/terms`.** Both are written and
published, drafted against what the software actually does. Before launch:

* Replace `LEGAL_ENTITY` in `src/lib/legal.ts` with the exact registered
  name of the LLC.
* Confirm `GOVERNING_STATE` (currently Missouri).
* Have a lawyer read both. The two things a template would not have handled
  are the SMS consent language and the under-18 position, and those are
  exactly the two worth a professional eye.

**b. Google Cloud project**, for Google sign-in. Needs a published privacy
policy URL, which now exists. Set `GOOGLE_CLIENT_ID` and
`GOOGLE_CLIENT_SECRET`; until then the Google buttons do not appear at all,
rather than appearing and failing.

**c. An email sender.** Password resets and email confirmation need one.
Resend's free tier covers 3,000 messages a month. Set `RESEND_API_KEY` and
`MAIL_FROM`. Without it, the site works and the emails are written to the
server log instead of being sent — fine for testing, not for real users.

**d. The `hello@joincompete.com` mailbox**, which the site now points at
throughout.

---

## 8. Security review, and what it changed

The authentication, profile and consent code was reviewed by a separate pass
that had not written it. It found real holes. All of them are fixed, and each
has a regression test in `tests/accounts.spec.ts`. Recorded here because the
reasoning matters more than the diff:

**Account pre-hijacking through Google.** Linking a Google account to an
existing COMPETE account on Google's word alone meant someone could register
`you@gmail.com` with a password of their choosing, wait, and collect you when
you later clicked "Continue with Google". Now the existing account must also
have proved the address on *our* side — confirmed its email, or have no
password for an attacker to have set.

**Organizer identity theft by typing an email.** Claiming an organizer
already in the database was matched against the contact email typed into the
host form. Those addresses are printed on every event page, and the
"unclaimed only" rule meant the first person to type one locked the real
organizer out permanently. Now the match is against the account's own
*confirmed* address, and never the typed field.

**A minor's consent record surviving the minor rule.** Clearing the phone
number turned alerts off but left the `granted` consent row in place, with
the old number on it. Anything that later joined against
`sms_consent_current` — the natural thing for a sender to do — would have
read "yes, text them here" about a profile that had since become an
under-18 one. Removing a number now writes an explicit revocation.

**Consent carried over to a new phone number.** Editing a number left the
old consent standing, so COMPETE would have texted number B holding evidence
that named number A. Consent is now per-number: change it and permission
starts again from nothing.

**A password reset that didn't lock anyone out.** Resetting a password left
every existing 60-day session working — including the one the reset was
meant to stop. It now signs out every device.

**Open redirect on sign-in.** `startsWith('/')` accepts `//evil.com`, which
resolves to another origin, so a crafted link could authenticate somebody on
the real sign-in page and then hand them to a lookalike.

Also fixed: unvalidated server-action input that could reach Postgres and
throw (non-integer radius, malformed ids, out-of-range snooze); email
confirmation being consumed by mail scanners and link previews rather than by
a person, which is now a button; a timing equaliser on sign-in that was
measurably *slower* for unknown addresses than for real ones, i.e. exactly
backwards; a password-reset email whose delivery failure was reported to the
user as success; and no rate limit on sign-in or reset requests.

The rate limiter (`src/lib/rate-limit.ts`) is in-process and honest about it:
it stops one script grinding a password list and stops the email quota being
burned in a minute. It is not distributed-attack protection, and the file
says so.

---

## 9. Explicitly not in this phase

Payments and any paywall logic; sending text messages; host event
submission; registration and rosters; avatars and logos; enterprise SSO;
identity or age *verification*; waivers; and any social graph — follows,
messaging, comments, team chat.
