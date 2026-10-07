import Link from 'next/link';
import { Clause, LegalPage } from '@/components/LegalPage';
import {
  CONTACT_EMAIL,
  LEGAL_ENTITY,
  MINIMUM_AGE,
  PRIVACY_EFFECTIVE,
  SITE_DOMAIN,
  SITE_NAME,
} from '@/lib/legal';

export const metadata = {
  title: 'Privacy policy',
  description:
    'What COMPETE collects, why, and what we will never ask for. Written to match what the software actually does.',
  alternates: { canonical: '/privacy' },
};

export default function PrivacyPage() {
  return (
    <LegalPage
      kicker="Privacy"
      title="What we collect, and what we don't"
      effective={PRIVACY_EFFECTIVE}
      intro={
        <>
          <p>
            {LEGAL_ENTITY} runs {SITE_NAME} at {SITE_DOMAIN}. This policy
            describes what we collect, why we collect it, who sees it, and how
            to get it back or get rid of it.
          </p>
          <p className="mt-3">
            The short version: almost everything is optional, we do not ask for
            your date of birth, we do not sell your phone number, and you can
            delete your account whenever you like.
          </p>
        </>
      }
    >
      <Clause id="what-we-collect" heading="1. What we collect">
        <p>
          <strong className="text-[color:var(--ink)]">To create an account</strong>{' '}
          we need your name, your email address and a password, which is stored
          only as a one-way hash — we cannot read it, and neither can anyone who
          obtains our database. If you sign in with Google, we receive your
          Google account identifier, email address and name instead of a
          password.
        </p>
        <p>
          <strong className="text-[color:var(--ink)]">You choose whether to give us</strong>{' '}
          your home ZIP code, how far you are willing to travel, an age range, a
          gender, a mobile phone number, and the sports, surfaces, formats and
          divisions you play. Every one of these is optional and the site works
          without them. The ZIP code is the only one that changes what you see:
          it is how we show events near you.
        </p>
        <p>
          <strong className="text-[color:var(--ink)]">As you use the site</strong>{' '}
          we record the events you save, mark yourself registered for, or mark as
          attended, so those lists are there when you return. Our hosting
          provider keeps standard server logs, including IP addresses, for
          security and troubleshooting.
        </p>
        <p>
          <strong className="text-[color:var(--ink)]">If you list events</strong>{' '}
          as an organizer, we collect your organization name, contact email,
          contact phone, website and a description. This information is public by
          design — it is how players reach you.
        </p>
      </Clause>

      <Clause id="what-we-never-collect" heading="2. What we never collect">
        <p>
          We do not ask for or store your date of birth. Age is recorded as a
          range and nothing finer, which means there is no birth date here to
          lose.
        </p>
        <p>
          We do not collect your home address, your payment card details, a
          government identification number, or health information.
        </p>
        <p>
          We do not run advertising trackers, we do not sell personal
          information, and we do not share your phone number with anyone for
          their own marketing.
        </p>
      </Clause>

      <Clause id="age" heading={`3. Age — ${MINIMUM_AGE} and up`}>
        <p>
          {SITE_NAME} accounts are for people aged {MINIMUM_AGE} and over. We do
          not knowingly collect personal information from children under{' '}
          {MINIMUM_AGE}. If we learn that we have, we delete the account and its
          data.
        </p>
        <p>
          If you tell us you are under 18, we will not store a phone number on
          your account and we will not send you text messages. That is enforced
          by the software, not just by policy.
        </p>
        <p>
          {SITE_NAME} lists adult recreational events. Whether a player under 18
          may enter a particular event is decided by that event&apos;s organizer,
          not by us. If you are a parent or guardian and want your child&apos;s
          account and data deleted, email {CONTACT_EMAIL} and we will do it.
        </p>
      </Clause>

      <Clause id="why" heading="4. Why we use it">
        <p>
          To show you events near you and in the sports you play; to keep
          your saved, upcoming and past event lists; to send you the messages you
          asked for; to answer you when you contact us; to keep the site working
          and to stop abuse; and to understand, in aggregate, which sports and
          regions to build out next.
        </p>
        <p>
          We do not make decisions about you automatically in any way that has a
          legal effect.
        </p>
      </Clause>

      <Clause id="sms" heading="5. Text messages">
        <p>
          A phone number is optional. If you give us one, you choose separately
          whether to receive (a) messages about events you have saved or
          registered for, and (b) alerts when a new event matches your
          saved filters. Neither is a condition of having an account or using
          any part of the site.
        </p>
        <p>
          When you agree, we record the exact wording you were shown, the date
          and time, and your IP address. That record exists so we can prove what
          you agreed to — including to you, if you ever ask.
        </p>
        <p>
          Reply <strong className="text-[color:var(--ink)]">STOP</strong> to any
          message to stop all of them,{' '}
          <strong className="text-[color:var(--ink)]">SNOOZE</strong> to pause
          them for a while, or{' '}
          <strong className="text-[color:var(--ink)]">HELP</strong> for help. You
          can also change either setting on your profile at any time. Message and
          data rates may apply, and message frequency varies.
        </p>
        <p>
          We share your number with the messaging provider that delivers the
          texts, and with nobody else. Mobile information will not be shared with
          third parties for their own marketing purposes.
        </p>
      </Clause>

      <Clause id="sharing" heading="6. Who else sees it">
        <p>
          <strong className="text-[color:var(--ink)]">Service providers</strong>{' '}
          that run parts of the site on our behalf: our hosting and database
          providers, our mapping and geocoding provider, our email sender, and
          our text-message provider. They may only use what we send them to
          provide that service to us.
        </p>
        <p>
          <strong className="text-[color:var(--ink)]">Event organizers</strong>{' '}
          do not receive your personal information from us. When you register for
          an event you do that on the organizer&apos;s own site, under their
          privacy policy — {SITE_NAME} sends you there and does not take your
          entry.
        </p>
        <p>
          <strong className="text-[color:var(--ink)]">Nobody else</strong>, except
          where the law requires it, where we need to protect someone&apos;s
          safety or our rights, or if the business is sold — in which case this
          policy continues to apply to information collected before the sale
          until you are told otherwise.
        </p>
      </Clause>

      <Clause id="retention" heading="7. How long we keep it">
        <p>
          Your account data stays until you delete your account. When you delete
          it, we remove your profile, your preferences and your event lists.
        </p>
        <p>
          Two things outlive the account. Records of text-message consent are
          kept for four years after your last message, because that is what
          demonstrates we had permission to contact you. Aggregate, de-identified
          counts — how many events are listed in a state, how many accounts a
          sport has — are kept indefinitely and cannot be traced back to you.
        </p>
      </Clause>

      <Clause id="rights" heading="8. Your choices and rights">
        <p>
          You can see and change everything on your profile at any time, and you
          can delete your account from your account page or by emailing{' '}
          {CONTACT_EMAIL}. We will confirm within 30 days.
        </p>
        <p>
          Depending on where you live, you may also have the right to a copy of
          your information, to correct it, to ask us to delete it, to limit how
          we use it, and not to be discriminated against for exercising those
          rights. Residents of California, Colorado, Connecticut, Virginia and
          other states with comprehensive privacy laws have these rights by
          statute; we extend them to everyone, because maintaining two standards
          would be sillier than maintaining one. Email {CONTACT_EMAIL} and say
          what you want.
        </p>
        <p>
          We do not sell personal information and we do not share it for
          cross-context behavioural advertising, so there is nothing to opt out
          of on that front.
        </p>
      </Clause>

      <Clause id="cookies" heading="9. Cookies">
        <p>
          {SITE_NAME} sets two cookies and no more. One keeps you signed in. The
          other remembers the ZIP code you last searched, so the site can show
          local events before you have an account. Neither is used for
          advertising, and we do not embed third-party tracking scripts.
        </p>
      </Clause>

      <Clause id="security" heading="10. Security">
        <p>
          Everything travels over HTTPS. Passwords are stored as salted one-way
          hashes. Sign-in sessions can be revoked. Personal data sits in a
          database with row-level security enabled and no public read access.
        </p>
        <p>
          No system is perfectly secure, and we will not pretend otherwise. If a
          breach affects you, we will tell you.
        </p>
      </Clause>

      <Clause id="changes" heading="11. Changes">
        <p>
          If we change this policy in a way that matters, we will update the
          effective date at the top and, for account holders, say so by email or
          on the site before it takes effect.
        </p>
      </Clause>

      <Clause id="contact" heading="12. Contact">
        <p>
          Email {CONTACT_EMAIL}. A real person reads it.
        </p>
        <p className="pt-2">
          <Link href="/terms" className="underline decoration-[color:var(--surf)]">
            Terms of use →
          </Link>
        </p>
      </Clause>
    </LegalPage>
  );
}
