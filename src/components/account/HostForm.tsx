'use client';

import { useActionState } from 'react';
import { useFormStatus } from 'react-dom';
import { saveHost, type FormState } from '@/app/account/actions';
import type { HostProfile } from '@/lib/account-fields';
import { displayPhone } from '@/lib/phone';

/**
 * The organizer side of the same account.
 *
 * Organization name is required and everything else is not, because the one
 * thing a player has to be able to see is who is running the event. The
 * placeholder does the explaining for anyone who has never given their
 * events a name: "John Doe Tournaments" is a perfectly good answer.
 */
export function HostForm({
  profile,
  accountEmail,
}: {
  profile: HostProfile | null;
  accountEmail: string;
}) {
  const [state, action] = useActionState<FormState, FormData>(saveHost, null);

  return (
    <form action={action} className="grid gap-6">
      <section className="panel p-5">
        <h2 className="t-head text-lg">Your events, publicly</h2>
        <p className="mt-2 text-sm leading-relaxed text-[color:var(--muted)]">
          This is what players see beside every event you list. A recognisable
          name is how a Saturday regular decides your event is the one
          worth the drive.
        </p>

        <div className="mt-5 grid gap-4">
          <div>
            <label className="label" htmlFor="organization_name">
              Organization name
            </label>
            <input
              id="organization_name"
              name="organization_name"
              required
              maxLength={120}
              defaultValue={profile?.organization_name ?? ''}
              className="field"
              placeholder="Gateway Beach Series — or John Doe Tournaments"
            />
            <p className="mt-1.5 text-xs leading-relaxed text-[color:var(--faint)]">
              No registered business needed. If you have not named your events
              yet, your own name plus &ldquo;Tournaments&rdquo; works, and you
              can change it whenever you land on something better.
            </p>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="label" htmlFor="contact_email">
                Contact email
              </label>
              <input
                id="contact_email"
                name="contact_email"
                type="email"
                required
                defaultValue={profile?.contact_email ?? accountEmail}
                className="field"
              />
              <p className="mt-1.5 text-xs text-[color:var(--faint)]">
                Shown to players. Use the address you already answer event
                questions from.
              </p>
            </div>

            <div>
              <label className="label" htmlFor="contact_phone">
                Contact phone
              </label>
              <input
                id="contact_phone"
                name="contact_phone"
                type="tel"
                defaultValue={displayPhone(profile?.contact_phone ?? null) ?? ''}
                className="field"
                placeholder="10-digit mobile number"
              />
            </div>
          </div>

          <div>
            <label className="label" htmlFor="website_url">
              Website or Facebook page <span className="normal-case">(optional)</span>
            </label>
            <input
              id="website_url"
              name="website_url"
              defaultValue={profile?.website_url ?? ''}
              className="field"
              placeholder="facebook.com/your-page"
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-[1fr_7rem]">
            <div>
              <label className="label" htmlFor="city">
                City
              </label>
              <input
                id="city"
                name="city"
                defaultValue={profile?.city ?? ''}
                className="field"
                placeholder="St. Louis"
              />
            </div>
            <div>
              <label className="label" htmlFor="state">
                State
              </label>
              <input
                id="state"
                name="state"
                maxLength={2}
                defaultValue={profile?.state ?? ''}
                className="field uppercase"
                placeholder="MO"
              />
            </div>
          </div>

          <div>
            <label className="label" htmlFor="about">
              About <span className="normal-case">(optional, 500 characters)</span>
            </label>
            <textarea
              id="about"
              name="about"
              rows={4}
              maxLength={500}
              defaultValue={profile?.about ?? ''}
              className="field resize-y"
              placeholder="Who you are, how long you have been running events, what your events are like."
            />
          </div>
        </div>
      </section>

      {state?.error && (
        <p
          role="alert"
          className="t-mono text-[11px] uppercase leading-relaxed tracking-wider text-[color:var(--coral-ink)]"
        >
          {state.error}
        </p>
      )}
      {state?.notice && <p className="panel tone-good p-3 text-sm">{state.notice}</p>}

      <div className="flex justify-end">
        <Submit isNew={!profile} />
      </div>
    </form>
  );
}

function Submit({ isNew }: { isNew: boolean }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className="btn-primary" disabled={pending}>
      {pending ? 'Saving…' : isNew ? 'Create organizer profile' : 'Save organizer profile'}
    </button>
  );
}
