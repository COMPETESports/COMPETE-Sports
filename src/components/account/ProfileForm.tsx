'use client';

import { useActionState, useState } from 'react';
import { useFormStatus } from 'react-dom';
import { saveProfile, type FormState } from '@/app/account/actions';
import { AGE_BRACKETS, GENDER_OPTIONS, type AthleteProfile } from '@/lib/account-fields';
import { displayPhone } from '@/lib/phone';
import {
  SMS_MARKETING_DISCLOSURE,
  SMS_TRANSACTIONAL_DISCLOSURE,
} from '@/lib/sms-consent';
import type { RefRow } from '@/lib/ref-data';

interface Options {
  sports: { id: string; slug: string; name: string }[];
  surfaces: RefRow[];
  formats: RefRow[];
  divisions: RefRow[];
}

/**
 * The athlete profile.
 *
 * Only two fields do real work: the name, and the home ZIP that drives the
 * Local rail and the radius search. Everything else is volunteered — age
 * range, gender, phone, what you like to play — and the form says so rather
 * than implying every box is expected.
 *
 * The two SMS boxes are the legally interesting part. Both start unticked,
 * both show the full disclosure rather than a summary, and neither is a
 * condition of anything. What the server stores is the exact wording
 * rendered here, so this text and the record can never disagree.
 */
export function ProfileForm({
  displayName,
  profile,
  options,
  selected,
  consent,
}: {
  displayName: string;
  profile: AthleteProfile | null;
  options: Options;
  selected: { sports: string[]; surfaces: string[]; formats: string[]; divisions: string[] };
  // Each purpose carries the number the consent was given for, so a box is
  // only pre-ticked when the consent on file is for the number on the profile.
  consent: {
    transactional: { granted: boolean; phoneE164: string | null };
    marketing: { granted: boolean; phoneE164: string | null };
  };
}) {
  const [state, action] = useActionState<FormState, FormData>(saveProfile, null);
  const [bracket, setBracket] = useState<string>(profile?.age_bracket ?? '');
  const [phone, setPhone] = useState<string>(displayPhone(profile?.phone_e164 ?? null) ?? '');

  const isMinor = bracket === 'under_18';
  const hasPhone = phone.trim().length > 0;

  return (
    <form action={action} className="grid gap-8">
      {/* ---------------------------------------------------------- basics */}
      <section className="panel p-5">
        <h2 className="t-head text-lg">You</h2>

        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <div>
            <label className="label" htmlFor="display_name">
              Name
            </label>
            <input
              id="display_name"
              name="display_name"
              defaultValue={displayName}
              required
              maxLength={60}
              className="field"
            />
          </div>

          <div>
            <label className="label" htmlFor="home_postal_code">
              Home ZIP
            </label>
            <input
              id="home_postal_code"
              name="home_postal_code"
              defaultValue={profile?.home_postal_code ?? ''}
              inputMode="numeric"
              pattern="[0-9]{5}"
              maxLength={5}
              className="field"
              placeholder="63110"
            />
            <p className="mt-1.5 text-xs text-[color:var(--faint)]">
              {profile?.home_city
                ? `${profile.home_city}, ${profile.home_state} — this is what fills your Local list.`
                : 'This is what fills your Local list on the homepage.'}
            </p>
          </div>
        </div>

        <div className="mt-4">
          <label className="label" htmlFor="travel_radius_miles">
            How far you will drive — {profile?.travel_radius_miles ?? 100} miles
          </label>
          <input
            id="travel_radius_miles"
            name="travel_radius_miles"
            type="range"
            min={10}
            max={250}
            step={10}
            defaultValue={profile?.travel_radius_miles ?? 100}
            className="w-full accent-[color:var(--surf-ink)]"
          />
        </div>
      </section>

      {/* ------------------------------------------------------- optional */}
      <section className="panel p-5">
        <div className="flex items-baseline justify-between gap-3">
          <h2 className="t-head text-lg">Optional</h2>
          <span className="t-mono text-[10px] uppercase tracking-[0.15em] text-[color:var(--faint)]">
            leave any of it blank
          </span>
        </div>

        <fieldset className="mt-4">
          <legend className="label">Age range</legend>
          <div className="flex flex-wrap gap-2">
            {AGE_BRACKETS.map((option) => (
              <label key={option.value} className="toggle-chip">
                <input
                  type="radio"
                  name="age_bracket"
                  value={option.value}
                  checked={bracket === option.value}
                  onChange={() => setBracket(option.value)}
                  className="sr-only"
                />
                <span>{option.label}</span>
              </label>
            ))}
          </div>
          <p className="mt-2 text-xs text-[color:var(--faint)]">
            A range only. COMPETE never asks for or stores your date of birth.
          </p>
        </fieldset>

        <fieldset className="mt-5">
          <legend className="label">Gender</legend>
          <div className="flex flex-wrap gap-2">
            {GENDER_OPTIONS.map((option) => (
              <label key={option.value} className="toggle-chip">
                <input
                  type="radio"
                  name="gender"
                  value={option.value}
                  defaultChecked={profile?.gender === option.value}
                  className="sr-only"
                />
                <span>{option.label}</span>
              </label>
            ))}
          </div>
        </fieldset>
      </section>

      {/* ---------------------------------------------------------- texts */}
      <section className="panel p-5">
        <h2 className="t-head text-lg">Text messages</h2>

        {isMinor ? (
          <p className="panel tone-warn mt-4 p-4 text-sm leading-relaxed">
            COMPETE does not send text messages to anyone under 18, so there is
            no phone number on this account. Keep browsing and saving events as
            normal — you will just get event news by email instead.
          </p>
        ) : (
          <>
            <p className="mt-2 text-sm leading-relaxed text-[color:var(--muted)]">
              Recommended, not required. A number is how organizers reach you
              the morning a start time moves or a court changes — the thing
              email is too slow for.
            </p>

            <div className="mt-4 max-w-xs">
              <label className="label" htmlFor="phone">
                Mobile number
              </label>
              <input
                id="phone"
                name="phone"
                type="tel"
                value={phone}
                onChange={(event) => setPhone(event.target.value)}
                autoComplete="tel-national"
                className="field"
                placeholder="10-digit mobile number"
              />
            </div>

            {hasPhone && (
              <div className="mt-5 grid gap-4">
                <label className="flex gap-2.5 text-sm leading-relaxed">
                  <input
                    type="checkbox"
                    name="sms_transactional"
                    value="yes"
                    defaultChecked={
                      consent.transactional.granted &&
                      consent.transactional.phoneE164 === profile?.phone_e164
                    }
                    className="mt-1 shrink-0"
                  />
                  <span className="text-[color:var(--muted)]">
                    {SMS_TRANSACTIONAL_DISCLOSURE}
                  </span>
                </label>

                <label className="flex gap-2.5 text-sm leading-relaxed">
                  <input
                    type="checkbox"
                    name="sms_marketing"
                    value="yes"
                    defaultChecked={
                      consent.marketing.granted &&
                      consent.marketing.phoneE164 === profile?.phone_e164
                    }
                    className="mt-1 shrink-0"
                  />
                  <span className="text-[color:var(--muted)]">
                    {SMS_MARKETING_DISCLOSURE}
                  </span>
                </label>
              </div>
            )}
          </>
        )}
      </section>

      {/* ----------------------------------------------------- what you play */}
      <section className="panel p-5">
        <h2 className="t-head text-lg">What you play</h2>
        <p className="mt-2 text-sm leading-relaxed text-[color:var(--muted)]">
          This narrows your Local list and, if you turn texts on, decides which
          new events are worth interrupting you for.
        </p>

        <fieldset className="mt-5">
          <legend className="label">Sports</legend>
          <div className="flex flex-wrap gap-2">
            {options.sports.map((sport) => (
              <label key={sport.id} className="toggle-chip">
                <input
                  type="checkbox"
                  name="pref_sports"
                  value={sport.id}
                  defaultChecked={selected.sports.includes(sport.id)}
                  className="sr-only"
                />
                <span>{sport.name}</span>
              </label>
            ))}
          </div>
        </fieldset>

        <PrefGroup
          label="Surfaces"
          name="pref_surfaces"
          rows={options.surfaces}
          selected={selected.surfaces}
        />
        <PrefGroup
          label="Formats"
          name="pref_formats"
          rows={options.formats}
          selected={selected.formats}
        />
        <PrefGroup
          label="Divisions"
          name="pref_divisions"
          rows={options.divisions}
          selected={selected.divisions}
        />
      </section>

      {state?.error && (
        <p
          role="alert"
          className="t-mono text-[11px] uppercase leading-relaxed tracking-wider text-[color:var(--coral-ink)]"
        >
          {state.error}
        </p>
      )}
      {state?.notice && (
        <p className="panel tone-good p-3 text-sm">{state.notice}</p>
      )}

      <div className="flex justify-end">
        <Submit />
      </div>
    </form>
  );
}

/**
 * Surfaces, formats and divisions belong to a sport, so they are grouped by
 * one. Hiding the sport heading when there is only one avoids a lonely
 * "Volleyball" label above every group before pickleball has any data.
 */
function PrefGroup({
  label,
  name,
  rows,
  selected,
}: {
  label: string;
  name: string;
  rows: RefRow[];
  selected: string[];
}) {
  if (!rows.length) return null;

  const sports = [...new Set(rows.map((r) => r.sport_name))];
  const showSportHeadings = sports.length > 1;

  return (
    <fieldset className="mt-5">
      <legend className="label">{label}</legend>
      <div className="grid gap-3">
        {sports.map((sportName) => (
          <div key={sportName}>
            {showSportHeadings && (
              <p className="t-mono mb-1.5 text-[10px] uppercase tracking-[0.15em] text-[color:var(--faint)]">
                {sportName}
              </p>
            )}
            <div className="flex flex-wrap gap-2">
              {rows
                .filter((row) => row.sport_name === sportName)
                .map((row) => (
                  <label key={row.id} className="toggle-chip">
                    <input
                      type="checkbox"
                      name={name}
                      value={row.id}
                      defaultChecked={selected.includes(row.id)}
                      className="sr-only"
                    />
                    <span>{row.name}</span>
                  </label>
                ))}
            </div>
          </div>
        ))}
      </div>
    </fieldset>
  );
}

function Submit() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className="btn-primary" disabled={pending}>
      {pending ? 'Saving…' : 'Save profile'}
    </button>
  );
}
