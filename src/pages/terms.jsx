import React from 'react';
import { Link } from 'react-router-dom';
import LegalPage, { ContactEmails } from '@/components/LegalPage.jsx';
import { LEGAL } from '@/lib/legal';

const { appName, operator, operatorDescription, jurisdiction, minimumAge } = LEGAL;
const mail = <ContactEmails />;

const sections = [
  {
    id: 'agreement',
    title: 'Agreement',
    body: (
      <>
        <p>
          These Terms of Service (&ldquo;Terms&rdquo;) are an agreement between you and {operator},{' '}
          {operatorDescription} (&ldquo;we&rdquo;, &ldquo;us&rdquo;), for the use of {appName}. By creating an account, or by booking a meeting through a{' '}
          {appName} booking page, you agree to these Terms. If you don&rsquo;t agree, don&rsquo;t use {appName}.
        </p>
        <p>
          Our <Link to="/privacy">Privacy Policy</Link> explains how we handle personal information and forms part of
          these Terms.
        </p>
      </>
    ),
  },
  {
    id: 'the-service',
    title: 'The service',
    body: (
      <p>
        {appName} lets hosts publish booking pages, set their availability, accept bookings from guests, connect a
        calendar, and prepare WhatsApp messages and calendar invites about those bookings. Features may change over
        time.
      </p>
    ),
  },
  {
    id: 'eligibility',
    title: 'Eligibility',
    body: (
      <p>
        You must be at least {minimumAge} years old and able to enter into a binding contract to use {appName}. If you
        use {appName} on behalf of an organisation, you confirm you are authorised to accept these Terms for it.
      </p>
    ),
  },
  {
    id: 'accounts',
    title: 'Your account',
    body: (
      <ul>
        <li>Give accurate information and keep it up to date.</li>
        <li>Keep your password secure. You are responsible for everything that happens under your account.</li>
        <li>Tell us promptly at {mail} if you think someone has accessed your account without permission.</li>
      </ul>
    ),
  },
  {
    id: 'content-and-guest-data',
    title: 'Your content and your guests',
    body: (
      <>
        <p>
          You keep ownership of the content you add to {appName}, such as your profile, event types and questions. You
          give us permission to store, display and process it only as needed to run {appName} for you, for example to
          show your booking page to the people you share it with.
        </p>
        <p>As a host, you are responsible for how you use information your guests give you. In particular:</p>
        <ul>
          <li>only ask guests for information you actually need for the meeting;</li>
          <li>don&rsquo;t ask for sensitive information such as health, financial or government ID details;</li>
          <li>have a lawful basis to contact guests, including on WhatsApp, and follow the law where you are and where they are.</li>
        </ul>
      </>
    ),
  },
  {
    id: 'acceptable-use',
    title: 'Acceptable use',
    body: (
      <>
        <p>You agree not to use {appName} to:</p>
        <ul>
          <li>break the law or anyone&rsquo;s rights, including privacy and intellectual property rights;</li>
          <li>send spam or unsolicited messages, or break WhatsApp&rsquo;s terms and policies;</li>
          <li>harass, deceive or impersonate anyone, or publish harmful or misleading booking pages;</li>
          <li>upload malware, or try to access accounts or data that aren&rsquo;t yours;</li>
          <li>get around security or usage limits, or scrape, overload or disrupt the service; or</li>
          <li>copy, resell or reverse-engineer {appName}, except where the law allows it.</li>
        </ul>
      </>
    ),
  },
  {
    id: 'third-party-services',
    title: 'Third-party services',
    body: (
      <>
        <p>
          {appName} works with services we don&rsquo;t control, including Google Calendar, WhatsApp, Microsoft Outlook
          and Apple Calendar. Your use of them is governed by their own terms and privacy policies. We aren&rsquo;t
          responsible for them, and features that depend on them may stop working if they change or withdraw access.
        </p>
        <p>
          When you connect Google Calendar, you allow {appName} to access it as described in our{' '}
          <Link to="/privacy">Privacy Policy</Link>. You can disconnect at any time.
        </p>
      </>
    ),
  },
  {
    id: 'bookings',
    title: 'Bookings between hosts and guests',
    body: (
      <p>
        {appName} is a tool that helps hosts and guests arrange meetings. We are not a party to those meetings. We
        aren&rsquo;t responsible for whether a meeting happens, what is agreed in it, or the conduct of hosts or
        guests. We work to show accurate availability and prevent double bookings, but we can&rsquo;t guarantee it.
        Please check important appointments yourself.
      </p>
    ),
  },
  {
    id: 'fees',
    title: 'Fees',
    body: (
      <p>
        {appName} is currently free. If we introduce paid features, we will tell you the price and terms in advance,
        and you won&rsquo;t be charged unless you choose to sign up for them.
      </p>
    ),
  },
  {
    id: 'our-rights',
    title: 'Our intellectual property',
    body: (
      <p>
        {appName}, including its software, design and branding, belongs to us and our licensors. These Terms
        don&rsquo;t give you any rights in it except the right to use {appName} as described here. If you send us
        feedback or ideas, we may use them without any obligation to you.
      </p>
    ),
  },
  {
    id: 'availability',
    title: 'Changes and availability',
    body: (
      <p>
        We may add, change or remove features, and we may suspend or stop {appName}. We will try to give reasonable
        notice of significant changes. We don&rsquo;t promise that {appName} will always be available or free of
        errors.
      </p>
    ),
  },
  {
    id: 'termination',
    title: 'Ending your use',
    body: (
      <>
        <p>
          You can stop using {appName} at any time and ask us to delete your account by emailing {mail}.
        </p>
        <p>
          We may suspend or close an account that breaks these Terms or puts others at risk, or if we must for legal
          reasons. Where reasonable, we will tell you first and give you the chance to fix the problem. Sections that
          by their nature should survive (such as disclaimers, limits of liability and governing law) continue after
          your use ends.
        </p>
      </>
    ),
  },
  {
    id: 'disclaimers',
    title: 'Disclaimers',
    body: (
      <p>
        {appName} is provided &ldquo;as is&rdquo; and &ldquo;as available&rdquo;. To the extent the law allows, we
        disclaim all warranties, express or implied, including warranties of merchantability, fitness for a particular
        purpose and non-infringement.
      </p>
    ),
  },
  {
    id: 'liability',
    title: 'Limitation of liability',
    body: (
      <>
        <p>
          To the extent the law allows, we will not be liable for indirect, incidental, special, consequential or
          punitive damages, or for lost profits, revenue, data or opportunities, including those caused by missed or
          double-booked meetings or by third-party services.
        </p>
        <p>
          Our total liability for any claim relating to {appName} is limited to the greater of the amount you paid us
          in the 12 months before the claim, or USD 50.
        </p>
        <p>
          Nothing in these Terms limits liability that cannot be limited by law, such as liability for fraud, or for
          death or personal injury caused by negligence.
        </p>
      </>
    ),
  },
  {
    id: 'indemnity',
    title: 'Indemnity',
    body: (
      <p>
        If you use {appName} for business purposes, you agree to cover our reasonable losses and costs arising from
        claims by others that relate to your content, your use of guest information, or your breach of these Terms.
      </p>
    ),
  },
  {
    id: 'governing-law',
    title: 'Governing law',
    body: (
      <p>
        These Terms are governed by the laws of {jurisdiction}, and disputes will be handled by the courts there. If you
        are a consumer, you keep any protections given to you by the law of the country where you live.
      </p>
    ),
  },
  {
    id: 'changes',
    title: 'Changes to these Terms',
    body: (
      <p>
        We may update these Terms. We will change the effective date above, and if a change is significant we will tell
        hosts by email or in the app before it takes effect. If you keep using {appName} after the change, you accept
        the updated Terms.
      </p>
    ),
  },
  {
    id: 'general',
    title: 'General',
    body: (
      <p>
        These Terms are the whole agreement between you and us about {appName}. If any part is found unenforceable, the
        rest still applies. If we don&rsquo;t enforce a right straight away, we haven&rsquo;t given it up. You may not
        transfer these Terms without our consent. We may transfer them as part of a merger, acquisition or sale of{' '}
        {appName}.
      </p>
    ),
  },
  {
    id: 'contact',
    title: 'Contact us',
    body: <p>{operator} &middot; {mail}</p>,
  },
];

export default function Terms() {
  return (
    <LegalPage
      title="Terms of Service"
      intro={`These Terms explain the rules for using ${appName}, as a host who runs a booking page or as a guest who books time.`}
      sections={sections}
      otherDoc={{ to: '/privacy', label: 'Privacy Policy' }}
    />
  );
}
