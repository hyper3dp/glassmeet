import React from 'react';
import { Link } from 'react-router-dom';
import LegalPage from '@/components/LegalPage.jsx';
import { LEGAL } from '@/lib/legal';

const { appName, operator, contactEmail, minimumAge } = LEGAL;
const mail = <a href={`mailto:${contactEmail}`}>{contactEmail}</a>;

const sections = [
  {
    id: 'who-we-are',
    title: 'Who we are',
    body: (
      <>
        <p>
          {appName} is a scheduling tool that lets people publish a booking page, take bookings and confirm
          meetings over WhatsApp. {appName} is operated by {operator} (&ldquo;we&rdquo;, &ldquo;us&rdquo;).
        </p>
        <p>
          This policy explains what personal information we handle, why, and the choices you have. If you have
          questions, contact us at {mail}.
        </p>
      </>
    ),
  },
  {
    id: 'hosts-and-guests',
    title: 'Hosts and guests',
    body: (
      <>
        <p>{appName} is used by two kinds of people:</p>
        <ul>
          <li><strong>Hosts</strong> create an account and share a booking page.</li>
          <li><strong>Guests</strong> open a host&rsquo;s booking page and book a time. Guests do not need an account.</li>
        </ul>
        <p>
          When a guest books a meeting, the host decides what to ask for and what to do with the answers. For that
          information we act on the host&rsquo;s behalf. If you are a guest and have a question about how a host uses
          your details, contact the host directly. You can also contact us and we will help where we can.
        </p>
      </>
    ),
  },
  {
    id: 'information-we-collect',
    title: 'Information we collect',
    body: (
      <>
        <p><strong>From hosts</strong></p>
        <ul>
          <li><strong>Account details:</strong> your email address and password. Passwords are handled by our authentication provider (Supabase) and stored only in hashed form. We never see them.</li>
          <li><strong>Profile:</strong> name, username, profile photo, bio, WhatsApp number, time zone and display preferences such as your accent colour.</li>
          <li><strong>Scheduling settings:</strong> event types (names, durations, descriptions, meeting links, custom questions), weekly availability and date overrides.</li>
          <li><strong>Bookings</strong> made with you, including the guest details below.</li>
        </ul>
        <p><strong>From guests</strong></p>
        <ul>
          <li>The name, email address and phone number you enter, any notes, and your answers to the host&rsquo;s questions.</li>
          <li>The time and time zone of the meeting you book.</li>
        </ul>
        <p><strong>If a host connects Google Calendar</strong></p>
        <ul>
          <li>The list of the host&rsquo;s calendars, busy / free times (so we don&rsquo;t offer times that are already taken), and the details of events we create for bookings. See <a href="#google-user-data">Google user data</a>.</li>
          <li>The authorisation tokens Google issues so we can do this without asking you to sign in each time.</li>
        </ul>
        <p><strong>Technical information</strong></p>
        <ul>
          <li>Your browser stores a sign-in session so you stay logged in. We do not use advertising cookies, analytics tools or tracking pixels.</li>
          <li>Our hosting and database providers keep standard server logs (such as IP address, browser type and time of request) for security and reliability.</li>
        </ul>
      </>
    ),
  },
  {
    id: 'how-we-use-information',
    title: 'How we use information',
    body: (
      <>
        <p>We use personal information only to run {appName}:</p>
        <ul>
          <li>to create and secure your account and send account emails such as sign-up confirmation and password resets;</li>
          <li>to show your booking page, work out which times are available and avoid double bookings;</li>
          <li>to record bookings and, if you turn it on, add them to your connected calendar;</li>
          <li>to prepare WhatsApp messages, calendar invites and calendar files for you to send or download;</li>
          <li>to keep the service secure, prevent abuse and fix problems; and</li>
          <li>to meet legal obligations.</li>
        </ul>
        <p>
          We do not sell personal information, we do not use it for advertising, and we do not build marketing
          profiles about hosts or guests.
        </p>
        <p>
          Where the law (such as the GDPR) requires a legal basis, we rely on performing our contract with hosts,
          our legitimate interest in providing a secure service, the host&rsquo;s legitimate interest in managing
          their bookings, and your consent when you choose to connect an integration.
        </p>
      </>
    ),
  },
  {
    id: 'google-user-data',
    title: 'Google user data',
    body: (
      <>
        <p>
          If you connect Google Calendar, {appName} asks Google for permission to view your list of calendars, check
          when you are busy, and create events for the bookings you receive. We use this access only to provide
          those features to you.
        </p>
        <p>
          {appName}&rsquo;s use and transfer of information received from Google APIs to any other app will adhere to
          the{' '}
          <a href="https://developers.google.com/terms/api-services-user-data-policy" target="_blank" rel="noreferrer">
            Google API Services User Data Policy
          </a>
          , including the Limited Use requirements. In particular, we do not use Google user data for advertising,
          we do not sell it, we do not transfer it to others except as needed to provide the service or as required
          by law, and no person reads it unless you ask us to (for support), it is needed for security, or the law
          requires it.
        </p>
        <p>
          You can disconnect Google Calendar at any time from the Calendars page in {appName}, or revoke access from
          your{' '}
          <a href="https://myaccount.google.com/permissions" target="_blank" rel="noreferrer">Google Account permissions</a>.
        </p>
      </>
    ),
  },
  {
    id: 'whatsapp-and-other-apps',
    title: 'WhatsApp, Outlook and Apple Calendar',
    body: (
      <>
        <p>
          {appName} does not connect to your WhatsApp, Microsoft Outlook or Apple accounts. When you choose to message
          someone on WhatsApp, add a meeting to Outlook or download a calendar file, {appName} opens that app or
          downloads a file with the details filled in, and <em>you</em> decide whether to send or save it.
        </p>
        <p>
          What happens after that is governed by the privacy policies of WhatsApp (Meta), Microsoft or Apple.
        </p>
      </>
    ),
  },
  {
    id: 'sharing',
    title: 'How information is shared',
    body: (
      <>
        <ul>
          <li><strong>Between hosts and guests:</strong> guests see the host&rsquo;s public booking page. Hosts see the details guests submit when booking.</li>
          <li>
            <strong>Service providers</strong> that run {appName} for us, under contracts that limit how they use data:
            Supabase (database, authentication and server functions), GitHub Pages (hosting the web app), and
            Google, but only if you connect Google Calendar.
          </li>
          <li><strong>Legal reasons:</strong> if required by law, or to protect the rights, safety or security of our users, the public or us.</li>
          <li><strong>Business changes:</strong> if {appName} is merged, acquired or transferred, information may move to the new owner under this policy.</li>
        </ul>
      </>
    ),
  },
  {
    id: 'public-information',
    title: 'Information on your booking page',
    body: (
      <p>
        Your booking page is public to anyone who has the link. It can show your name, photo, bio, event types and the
        times you are available. Don&rsquo;t put anything on it you don&rsquo;t want others to see.
      </p>
    ),
  },
  {
    id: 'retention',
    title: 'How long we keep information',
    body: (
      <>
        <p>
          We keep account and scheduling information while your account is active. Bookings are kept until the host
          deletes them or deletes their account.
        </p>
        <p>
          When an account is deleted we remove its data from our active systems within 30 days. Copies may remain in
          encrypted backups for a limited time before they are overwritten. We may keep limited information longer
          where the law requires it.
        </p>
      </>
    ),
  },
  {
    id: 'security',
    title: 'Security',
    body: (
      <p>
        Data is sent over encrypted connections (HTTPS). Access to stored data is restricted with database access
        rules so each host can reach only their own records, and passwords are stored only in hashed form. No system is
        perfectly secure. If we become aware of a breach that affects you, we will notify you as the law requires.
      </p>
    ),
  },
  {
    id: 'your-rights',
    title: 'Your choices and rights',
    body: (
      <>
        <p>
          You can view and update most of your information in Settings. Depending on where you live, you may also have
          the right to access, correct, export or delete your personal information, to object to or restrict certain
          uses, and to withdraw consent.
        </p>
        <p>
          To delete your account or make any other request, email {mail} from the address on your account. We respond
          within 30 days. Guests can ask the host, or contact us. If you are in the EU or UK, you can also complain to
          your local data protection authority.
        </p>
        <p>We do not sell or &ldquo;share&rdquo; personal information as those terms are used in California law.</p>
      </>
    ),
  },
  {
    id: 'international',
    title: 'International transfers',
    body: (
      <p>
        Our providers may store and process information in countries other than yours. Where the law requires it, we
        rely on appropriate safeguards, such as standard contractual clauses, for those transfers.
      </p>
    ),
  },
  {
    id: 'children',
    title: 'Children',
    body: (
      <p>
        {appName} is not intended for anyone under {minimumAge}. We do not knowingly collect information from children.
        If you believe a child has given us information, contact us and we will delete it.
      </p>
    ),
  },
  {
    id: 'changes',
    title: 'Changes to this policy',
    body: (
      <p>
        We may update this policy as {appName} changes. We will change the effective date above, and if a change is
        significant we will tell hosts by email or in the app before it takes effect. Please also read our{' '}
        <Link to="/terms">Terms of Service</Link>.
      </p>
    ),
  },
  {
    id: 'contact',
    title: 'Contact us',
    body: <p>{operator} &middot; {mail}</p>,
  },
];

export default function Privacy() {
  return (
    <LegalPage
      title="Privacy Policy"
      intro={`This policy explains how ${appName} collects, uses and protects personal information about hosts who use ${appName} and guests who book time with them.`}
      sections={sections}
      otherDoc={{ to: '/terms', label: 'Terms of Service' }}
    />
  );
}
