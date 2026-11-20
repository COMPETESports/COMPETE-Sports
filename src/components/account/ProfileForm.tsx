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
import type { PreferenceDivision, PreferenceFormat, PreferenceSport, RefRow } from '@/lib/ref-data';
import { WhatYouPlay } from './WhatYouPlay';

interface Options {
  sports: PreferenceSport[];
  surfaces: RefRow[];
  formats: PreferenceFormat[];
  divisions: PreferenceDivision[];
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
  // Live, so the number moves with the thumb. It used to print the SAVED
  // value, which never changed while dragging (Tom, 15 Nov).
  const [radius, setRadius] = useState<number>(profile?.travel_radius_miles ?? 100);
  // Male / Female only, and a second tap clears it -- optional, never
  // forced (Tom, 15 Nov). A radio cannot be un-ticked, hence buttons.
  const [gender, setGender] = useState<string>(
    profile?.gender === 'male' || profile?.gender === 'female' ? profile.gender : '',
  );
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
              Home ZIP — required
            </label>
            <input
              id="home_postal_code"
              name="home_postal_code"
              defaultValue={profile?.home_postal_code ?? ''}
              required
              inputMode="numeric"
              pattern="[0-9]{5}"
              maxLength={5}
              className="field"
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
            How far you will drive — {radius} miles
          </label>
          <input
            id="travel_radius_miles"
            name="travel_radius_miles"
            type="range"
            min={10}
            max={250}
            step={10}
            value={radius}
            onChange={(e) => setRadius(Number(e.target.value))}
            className="w-full accent-[color:var(--surf-ink)]"
          />
        </div>
      </section>

      {/* ------------------------------------------------------ age, gender */}
      {/* Age range is REQUIRED (Tom, 15 Nov) -- it is what keeps texts away
          from under-18s. Gender stays optional. */}
      <section className="panel p-5">
        <fieldset>
          <legend className="label">Age range — required</legend>
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
          <legend className="label">Gender — optional</legend>
          <div className="flex flex-wrap gap-2">
            {GENDER_OPTIONS.filter((o) => o.value !== 'undisclosed').map((option) => {
              const on = gender === option.value;
              return (
                <button
                  key={option.value}
                  type="button"
                  aria-pressed={on}
                  onClick={() => setGender(on ? '' : option.value)}
                  className="toggle-chip"
                  style={
                    on
                      ? { color: 'var(--void)', borderColor: 'var(--beach)', background: 'var(--beach)' }
                      : undefined
                  }
                >
                  <span>{option.label}</span>
                </button>
              );
            })}
          </div>
          <input type="hidden" name="gender" value={gender} />
          <p className="mt-2 text-xs text-[color:var(--faint)]">
            Tap again to clear it.
          </p>
        </fieldset>
      </section>

      {/* ----------------------------------------------------- what you play */}
      {/* Above the texts since 19 Nov: it is what makes the site yours, and
          it reads gender from the section just before it. */}
      <WhatYouPlay
        sports={options.sports}
        surfaces={options.surfaces}
        formats={options.formats}
        divisions={options.divisions}
        selected={selected}
        gender={gender}
      />

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

function Submit() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className="btn-primary" disabled={pending}>
      {pending ? 'Saving…' : 'Save profile'}
    </button>
  );
}
