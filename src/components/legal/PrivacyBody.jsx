import { B, f1, f2 } from '../brand/tokens.js';

function H2({ children }) {
  return <h2 style={{ fontFamily: f1, color: B.navy, marginTop: 28, marginBottom: 6, fontSize: 16, fontWeight: 700 }}>{children}</h2>;
}

function P({ children }) {
  return <p style={{ fontFamily: f2, fontSize: 15, color: B.textMid, lineHeight: 1.7, margin: '0 0 12px' }}>{children}</p>;
}

export function PrivacyBody() {
  return (
    <>
      <p style={{ fontFamily: f2, fontSize: 14, color: B.textLight, margin: '0 0 24px' }}>Last updated: April 26, 2026</p>

      <H2>1. Who We Are</H2>
      <P>ChurchOpsHub ("we," "us," or "our") is a software service for churches and religious organizations. This Privacy Policy explains how we collect, use, and protect information when you use our Service at churchopshub.com. By using the Service, you agree to the practices described here.</P>

      <H2>2. Information We Collect</H2>
      <P><strong>Information you provide:</strong> Name, email address, and password when you register. Church name and church code when creating an organization. Inventory records, equipment details, supply quantities, reservations, maintenance notes, and other operational data you enter. Profile information you choose to add, including an optional phone number for SMS reminders.</P>
      <P><strong>Information collected automatically:</strong> Error reports and crash data (collected via Sentry) when the application encounters a problem. Basic usage information such as which features are used. We do not use analytics services that track you across other websites.</P>
      <P><strong>Payment information:</strong> If you subscribe to a paid plan, payment is processed by Stripe. We do not store your credit card number or full payment details — Stripe handles this directly and provides us only with a subscription status and customer identifier.</P>

      <H2>3. How We Use Your Information</H2>
      <P>We use your information to: provide and operate the Service; authenticate your identity and maintain your session; send transactional emails (account confirmation, password reset, reservation notifications); send SMS shift reminders and new-shift alerts to users who have explicitly opted in; diagnose errors and improve reliability; communicate with you about your account or changes to the Service; and comply with legal obligations. We do not use your data for advertising, and we do not sell or rent your information to third parties.</P>

      <H2>4. Data Ownership & Isolation</H2>
      <P>You retain full ownership of all data you enter. Each church's data is strictly isolated in our database — enforced at the security rule level, not just by application logic. Members of one church organization cannot access another church's data. We access your data only as necessary to provide the Service or respond to a support request you initiate.</P>

      <H2>5. Third-Party Service Providers</H2>
      <P>We use the following sub-processors who may handle your data as part of delivering the Service:</P>
      <ul style={{ paddingLeft: 20, margin: '8px 0 14px', fontFamily: f2, fontSize: 15, color: B.textMid, lineHeight: 1.7 }}>
        <li style={{ marginBottom: 8 }}><strong>Google Firebase</strong> — database (Firestore), authentication, and file storage. Data is stored in US-based Google Cloud regions. <a href="https://firebase.google.com/support/privacy" target="_blank" rel="noopener noreferrer" style={{ color: B.teal }}>Firebase Privacy</a></li>
        <li style={{ marginBottom: 8 }}><strong>Stripe</strong> — payment processing. Only contacted when you subscribe to a paid plan. <a href="https://stripe.com/privacy" target="_blank" rel="noopener noreferrer" style={{ color: B.teal }}>Stripe Privacy</a></li>
        <li style={{ marginBottom: 8 }}><strong>Sentry</strong> — error monitoring. Receives error messages and stack traces when the app crashes. We configure Sentry to avoid including sensitive inventory content in error reports. <a href="https://sentry.io/privacy/" target="_blank" rel="noopener noreferrer" style={{ color: B.teal }}>Sentry Privacy</a></li>
        <li style={{ marginBottom: 8 }}><strong>SendGrid</strong> (a Twilio company) — email notifications for reservation decisions, ticket assignments, job announcements, and task reminders. Only used if your church administrator enables this feature. <a href="https://www.twilio.com/en-us/legal/privacy" target="_blank" rel="noopener noreferrer" style={{ color: B.teal }}>Twilio Privacy</a></li>
        <li style={{ marginBottom: 8 }}><strong>Twilio Programmable Messaging</strong> — optional SMS reminders sent only to users who have explicitly opted in via Settings. Phone numbers are stored in your profile and transmitted to Twilio solely to deliver opted-in messages. Users may opt out at any time by replying STOP or disabling SMS in Settings. No mobile information is shared with Twilio or any other third party for marketing or promotional purposes. <a href="https://www.twilio.com/en-us/legal/privacy" target="_blank" rel="noopener noreferrer" style={{ color: B.teal }}>Twilio Privacy</a></li>
        <li style={{ marginBottom: 8 }}><strong>Google Fonts</strong> — font files loaded from Google's servers on page load. Google may collect basic request data per their standard CDN policies.</li>
      </ul>
      <P>We do not share your data with any other third parties except as required by law. <strong>No mobile information will be shared with third parties or affiliates for marketing or promotional purposes. All SMS opt-in data and consent records will not be shared with any third parties.</strong></P>

      <H2>6. SMS Communications</H2>
      <P>If you provide a phone number and enable one or both SMS options, you consent to receive automated text messages from ChurchOpsHub (sent from +1 571-540-7100): shift reminders for jobs you are signed up for, and/or a once-daily summary of newly posted shifts at your church. Each is a separate, unchecked-by-default opt-in. Message frequency varies; typically 1–7 messages per week depending on which options you enable and your church's activity. <strong>Message and data rates may apply.</strong> To opt out, reply <strong>STOP</strong> to any message or disable SMS in Settings → My Profile. For help, reply <strong>HELP</strong>. Opting out will not affect your access to any other features of the Service. Phone numbers are used solely for this SMS program; we do not share, rent, or sell them. Full program disclosure (sample messages, frequency, consent flow) is at <a href="/sms-program" style={{ color: B.teal }}>churchopshub.com/sms-program</a>.</P>

      <H2>7. Data Storage & Security</H2>
      <P>Your data is stored in Google Firebase's US-based infrastructure. All data is encrypted in transit (TLS) and at rest (AES-256) by Google. We enforce database-level security rules that prevent cross-church data access. Uploaded photos are stored in Firebase Storage with the same access controls. While we take security seriously, no system is perfectly secure — please use a strong, unique password and contact us immediately if you suspect a breach.</P>

      <H2>8. Data Retention</H2>
      <P>We retain your data for as long as your account is active. If you cancel your account, we retain your data for 30 days to allow for export, after which it is permanently deleted. SMS opt-out records are retained indefinitely to honor opt-out requests. Error logs are retained for up to 90 days. Stripe retains payment records as required by financial regulations (typically 7 years).</P>

      <H2>9. Your Rights & Choices</H2>
      <P>You have the right to: access the personal information we hold about you; correct inaccurate information (editable in-app or by contacting us); request deletion of your account and associated data; export your inventory and organizational data (available via CSV export in the app); and opt out of non-essential communications including SMS. To exercise these rights, contact us at <a href="mailto:churchopshub@gmail.com" style={{ color: B.teal }}>churchopshub@gmail.com</a>. We will respond within 30 days.</P>

      <H2>10. California Residents (CCPA)</H2>
      <P>If you are a California resident, you have additional rights under the California Consumer Privacy Act: the right to know what personal information we collect and how it is used; the right to delete your personal information; the right to opt out of the sale of personal information (we do not sell personal information); and the right to non-discrimination for exercising your privacy rights. To submit a request, contact us at <a href="mailto:churchopshub@gmail.com" style={{ color: B.teal }}>churchopshub@gmail.com</a> with the subject line "CCPA Request."</P>

      <H2>11. Children's Privacy</H2>
      <P>The Service is not directed to children under 13. We do not knowingly collect personal information from children under 13. If you believe a child has provided us with personal information, contact us and we will delete it promptly.</P>

      <H2>12. Cookies & Local Storage</H2>
      <P>We use Firebase Authentication, which stores a session token in your browser's local storage to keep you signed in. We use your browser's localStorage to remember your in-app preferences (such as filter settings). We do not use advertising cookies or third-party tracking cookies. You can clear local storage through your browser settings, which will sign you out.</P>

      <H2>13. Changes to This Policy</H2>
      <P>We may update this Privacy Policy from time to time. We will notify you of material changes via email or a prominent notice in the app before the change takes effect. The date at the top of this page indicates when the policy was last revised. Continued use of the Service after the effective date constitutes acceptance of the revised policy.</P>

      <H2>14. Contact</H2>
      <P>Privacy questions or data requests? Contact us at <a href="mailto:churchopshub@gmail.com" style={{ color: B.teal }}>churchopshub@gmail.com</a>. We aim to respond within 30 days.</P>
    </>
  );
}
