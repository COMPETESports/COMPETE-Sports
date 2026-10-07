import Link from 'next/link';
import { Clause, LegalPage } from '@/components/LegalPage';
import {
  CONTACT_EMAIL,
  GOVERNING_STATE,
  LEGAL_ENTITY,
  MINIMUM_AGE,
  SITE_DOMAIN,
  SITE_NAME,
  TERMS_EFFECTIVE,
} from '@/lib/legal';

export const metadata = {
  title: 'Terms of use',
  description:
    'The rules for using COMPETE: who can have an account, what we are responsible for, and what the event organizer is responsible for.',
  alternates: { canonical: '/terms' },
};

export default function TermsPage() {
  return (
    <LegalPage
      kicker="Terms"
      title="Terms of use"
      effective={TERMS_EFFECTIVE}
      intro={
        <>
          <p>
            These terms are the agreement between you and {LEGAL_ENTITY} for your
            use of {SITE_NAME} at {SITE_DOMAIN}. Using the site means you accept
            them.
          </p>
          <p className="mt-3">
            The one thing worth reading twice is section 4:{' '}
            {SITE_NAME} tells you where events are. It does not run them.
          </p>
        </>
      }
    >
      <Clause id="who" heading={`1. Who can use ${SITE_NAME}`}>
        <p>
          You must be at least {MINIMUM_AGE} years old to create an account. If
          you are under 18, you may hold an account, but we will not store a
          phone number for you and will not send you text messages.
        </p>
        <p>
          You are responsible for what happens under your account, so keep your
          password to yourself. Tell us at {CONTACT_EMAIL} if you think someone
          else has it.
        </p>
        <p>
          One account per person. Do not create an account for someone else
          without their say-so, and do not use a name designed to impersonate
          another player or organizer.
        </p>
      </Clause>

      <Clause id="what-it-is" heading={`2. What ${SITE_NAME} is`}>
        <p>
          {SITE_NAME} is a discovery platform for adult recreational sports. It
          collects event listings — tournaments, leagues, open play — in one searchable place so you
          can find events near you, and it links you to the organizer to enter.
        </p>
        <p>
          Using the site to browse, search and save events is free. If we
          introduce paid features later, anything you already have stays
          available on the terms you got it under, and we will tell you clearly
          before anything costs money.
        </p>
      </Clause>

      <Clause id="listings" heading="3. Event information">
        <p>
          Listings come from organizers, from public event pages and from our own
          staff entering what organizers publish. We work to keep them accurate
          and we correct mistakes when we find them.
        </p>
        <p>
          Dates move, venues change and events get cancelled, sometimes hours
          beforehand. Always confirm the details with the organizer before you
          drive anywhere. Where a listing and the organizer disagree, the
          organizer is right.
        </p>
        <p>
          If you spot something wrong in a listing, email {CONTACT_EMAIL} — that
          is genuinely useful to us.
        </p>
      </Clause>

      <Clause id="not-the-organizer" heading={`4. ${SITE_NAME} does not run the events`}>
        <p>
          Every event on {SITE_NAME} is run by an independent organizer.{' '}
          {LEGAL_ENTITY} does not host, operate, staff, officiate, insure or
          supervise any event, does not take entries or payments for them, and is
          not a party to your agreement with the organizer.
        </p>
        <p>
          <strong className="text-[color:var(--ink)]">
            Eligibility to play is the organizer&apos;s decision.
          </strong>{' '}
          Age limits, skill divisions, waivers, insurance requirements and
          registration rules are all set by them, and they vary. This matters
          most if you are under 18: many organizers require players to be 18 or
          over, and an event appearing on {SITE_NAME} is not permission to enter
          it. Ask the organizer first.
        </p>
        <p>
          Playing sport carries a risk of injury. That risk is between you and
          the organizer, and {SITE_NAME} showing you an event does not make us
          responsible for what happens at it.
        </p>
      </Clause>

      <Clause id="organizers" heading="5. If you list events">
        <p>
          You may only submit events you actually run or are authorised to
          promote, and the information you give us must be accurate — dates,
          location, fees, format and how to register.
        </p>
        <p>
          By submitting a listing you give us permission to display, format and
          promote it on {SITE_NAME} and in our own communications about the
          site. You keep ownership of everything you send us. Do not send us
          anything you do not have the rights to, including flyer artwork and
          photographs you did not make or license.
        </p>
        <p>
          We may edit listings for clarity and consistency, and we may decline or
          remove a listing — including for inaccuracy, for being a youth or
          age-group event rather than an adult one, or for any other reason. We
          will tell you why if you ask.
        </p>
      </Clause>

      <Clause id="conduct" heading="6. Things not to do">
        <p>
          Do not scrape, crawl or bulk-copy the listings; do not resell or
          redistribute our database; do not try to break, overload or get around
          the security of the site; do not upload anything unlawful, deceptive,
          hateful or harassing; and do not use {SITE_NAME} to contact players for
          anything other than the event they are interested in.
        </p>
        <p>
          We may suspend or close an account that does any of this.
        </p>
      </Clause>

      <Clause id="ours" heading="7. What belongs to us">
        <p>
          The {SITE_NAME} name, look, text and software are ours. You may link to
          any page and share listings with other players — that is the point of
          the site — but copying the design or the database wholesale is not.
        </p>
      </Clause>

      <Clause id="warranty" heading="8. No warranties">
        <p>
          {SITE_NAME} is provided as it is. We do not promise the site will
          always be available, that every listing is complete or accurate, or
          that it will suit your particular purpose. To the extent the law
          allows, we disclaim implied warranties of merchantability, fitness for
          a particular purpose and non-infringement.
        </p>
      </Clause>

      <Clause id="liability" heading="9. Limits on liability">
        <p>
          To the extent the law allows, {LEGAL_ENTITY} is not liable for indirect,
          incidental, special or consequential losses, or for lost profits, lost
          data, or injury sustained at an event. Our total liability to you for
          any claim relating to {SITE_NAME} is limited to the greater of the
          amount you paid us in the twelve months before the claim, or one hundred
          US dollars.
        </p>
        <p>
          Nothing here limits liability that cannot lawfully be limited.
        </p>
      </Clause>

      <Clause id="indemnity" heading="10. Indemnity">
        <p>
          If a claim is brought against us because of an event you listed, or
          because of something you posted or did on {SITE_NAME}, you agree to
          cover our reasonable costs of dealing with it.
        </p>
      </Clause>

      <Clause id="ending" heading="11. Ending it">
        <p>
          Close your account whenever you like, from your account page or by
          emailing {CONTACT_EMAIL}. We may suspend or close an account that
          breaks these terms, and we may stop offering the site — with notice if
          circumstances allow.
        </p>
      </Clause>

      <Clause id="changes" heading="12. Changes to these terms">
        <p>
          We may update these terms. If a change matters, we will update the
          effective date and tell account holders before it takes effect.
          Continuing to use the site afterwards means you accept the new version.
        </p>
      </Clause>

      <Clause id="law" heading="13. Governing law">
        <p>
          These terms are governed by the laws of the State of {GOVERNING_STATE},
          without regard to its conflict-of-laws rules. Disputes go to the state
          or federal courts located in {GOVERNING_STATE}, and both of us consent
          to those courts.
        </p>
      </Clause>

      <Clause id="contact" heading="14. Contact">
        <p>Email {CONTACT_EMAIL}.</p>
        <p className="pt-2">
          <Link href="/privacy" className="underline decoration-[color:var(--surf)]">
            Privacy policy →
          </Link>
        </p>
      </Clause>
    </LegalPage>
  );
}
