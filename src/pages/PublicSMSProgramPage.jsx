import { B, f1, f2 } from '../components/brand/tokens.js';
import { FullLogo } from '../components/brand/Logo.jsx';
import { SEO } from '../components/SEO.jsx';

function H2({ children }) {
  return <h2 style={{ fontFamily: f1, color: B.navy, marginTop: 32, marginBottom: 8, fontSize: 18, fontWeight: 700 }}>{children}</h2>;
}
function P({ children }) {
  return <p style={{ fontFamily: f2, fontSize: 15, color: B.textMid, lineHeight: 1.7, margin: '0 0 12px' }}>{children}</p>;
}
function SampleBox({ children }) {
  return <div style={{ background: '#F5F7FA', border: `1px solid ${B.sand}`, borderRadius: 8, padding: '14px 18px', fontFamily: f2, fontSize: 14, color: B.textDark, margin: '8px 0 14px', lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>{children}</div>;
}

// Public-facing SMS program disclosure page. Exists so TCR (The Campaign
// Registry) reviewers can verify the A2P 10DLC consent flow without needing
// an account. Linked from the privacy + terms pages and from the campaign's
// opt-in description.
export function PublicSMSProgramPage() {
  return (
    <>
      <SEO
        title="SMS Program — ChurchOpsHub"
        description="ChurchOpsHub SMS reminder program: messages, frequency, consent, opt-out, and program terms."
        canonical="https://churchopshub.com/sms-program"
      />

      {/* Nav */}
      <div style={{ background: B.navy, padding: '14px 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <a href="/" style={{ textDecoration: 'none' }}><FullLogo /></a>
        <a href="/" style={{ fontFamily: f1, fontSize: 13, color: 'rgba(255,255,255,0.7)', textDecoration: 'none' }}>← Home</a>
      </div>

      {/* Content */}
      <div style={{ maxWidth: 760, margin: '0 auto', padding: '48px 24px 80px' }}>
        <h1 style={{ fontFamily: f1, fontSize: 32, fontWeight: 800, color: B.navy, margin: '0 0 6px' }}>SMS Program</h1>
        <p style={{ fontFamily: f2, fontSize: 14, color: B.textLight, margin: '0 0 36px' }}>Last updated: May 12, 2026</p>

        <H2>What is the ChurchOpsHub SMS program?</H2>
        <P>ChurchOpsHub is a cloud-based platform that helps churches manage volunteer job shifts. The ChurchOpsHub SMS program sends each volunteer a reminder text message on the morning of any volunteer shift they have signed up for through the app. The goal is simple: reduce no-shows by giving volunteers a same-day heads-up about their commitment.</P>

        <H2>Program name &amp; sending number</H2>
        <P><strong>Program name:</strong> ChurchOpsHub Job Reminders<br/>
        <strong>Sending number:</strong> +1&nbsp;571-540-7100<br/>
        <strong>Operator:</strong> ChurchOpsHub (operated by Fairfax Church of Christ, jcvaught@gmail.com)</P>

        <H2>What messages will I receive?</H2>
        <P>You will only receive reminder messages for the volunteer shifts you have personally signed up for. You will not receive marketing messages, promotional content, or messages for shifts you did not opt into. Example messages we send:</P>

        <SampleBox>{`ChurchOpsHub: Reminder — you're signed up for "Sunday Service Setup" today at 7:30 AM @ Main Sanctuary. Reply STOP to opt out.`}</SampleBox>

        <SampleBox>{`ChurchOpsHub: Reminder — you have 2 jobs today:
• Sunday Service Setup at 7:30 AM — Main Sanctuary
• Coffee Hour Cleanup at 11:00 AM — Fellowship Hall

Reply STOP to opt out.`}</SampleBox>

        <H2>How often will I be messaged?</H2>
        <P>Message frequency depends entirely on the number of job shifts you sign up for. A typical volunteer receives <strong>1–5 messages per week</strong>. Volunteers who are not signed up for any shifts in a given week receive no messages that week.</P>

        <H2>Are there charges?</H2>
        <P>ChurchOpsHub does not charge you to receive SMS reminders. Standard <strong>message and data rates may apply</strong> from your mobile carrier. Contact your carrier for details.</P>

        <H2>How do I opt in?</H2>
        <P>The only way to opt in to ChurchOpsHub SMS reminders is to:</P>
        <ol style={{ fontFamily: f2, fontSize: 15, color: B.textMid, lineHeight: 1.7, paddingLeft: 24, margin: '0 0 14px' }}>
          <li>Create or sign in to your ChurchOpsHub account at <a href="https://churchopshub.com" style={{ color: B.teal }}>churchopshub.com</a>.</li>
          <li>Navigate to <strong>Settings → My Profile → SMS Reminders</strong>.</li>
          <li>Enter your mobile phone number.</li>
          <li>Read the consent disclosure shown beside the checkbox (full text below).</li>
          <li>Check the box labeled <strong>"Enable SMS reminders."</strong></li>
          <li>Click <strong>Save</strong>.</li>
        </ol>
        <P>Messages are not sent to any phone number that has not completed this in-app consent flow. You can also revoke consent at any time by clearing your phone number in Settings, unchecking "Enable SMS reminders," or replying <strong>STOP</strong> to any message.</P>

        <H2>Consent disclosure (exact text shown in the app)</H2>
        <P>Before the "Enable SMS reminders" checkbox can be enabled in Settings, the following disclosure is displayed:</P>
        <SampleBox>{`By providing your phone number and enabling SMS reminders, you consent to receive automated text messages from ChurchOpsHub for job-shift reminders. US and Canada numbers only. Message and data rates may apply. Message frequency varies (typically 1-5 messages per week). Reply STOP to unsubscribe or HELP for help.`}</SampleBox>

        <H2>How do I get help?</H2>
        <P>Reply <strong>HELP</strong> to any message and you will receive a reply with our support contact. You can also email <a href="mailto:churchopshub@gmail.com" style={{ color: B.teal }}>churchopshub@gmail.com</a> at any time.</P>

        <H2>How do I stop receiving messages?</H2>
        <P>You can stop receiving SMS reminders at any time by any of the following methods, all of which take effect immediately:</P>
        <ul style={{ fontFamily: f2, fontSize: 15, color: B.textMid, lineHeight: 1.7, paddingLeft: 24, margin: '0 0 14px' }}>
          <li>Reply <strong>STOP</strong>, <strong>STOPALL</strong>, <strong>UNSUBSCRIBE</strong>, <strong>CANCEL</strong>, <strong>END</strong>, or <strong>QUIT</strong> to any ChurchOpsHub SMS.</li>
          <li>In the app, go to <strong>Settings → My Profile</strong> and uncheck "Enable SMS reminders."</li>
          <li>In the app, clear your phone number entirely.</li>
        </ul>
        <P>To re-subscribe after a STOP, reply <strong>START</strong> to the same number, or re-enable SMS reminders in Settings.</P>

        <H2>Privacy and terms</H2>
        <P>We do not share or sell your phone number with third parties. We do not use your phone number for marketing or advertising. The phone number is used solely for the SMS reminder program described on this page. For full details, see our <a href="/privacy" style={{ color: B.teal }}>Privacy Policy</a> and <a href="/terms" style={{ color: B.teal }}>Terms of Service</a> (Section 7 in both documents covers SMS).</P>

        <H2>Contact</H2>
        <P>Operator: ChurchOpsHub<br/>
        Email: <a href="mailto:churchopshub@gmail.com" style={{ color: B.teal }}>churchopshub@gmail.com</a><br/>
        Mailing address: 1110 W Pacific Boulevard, Inwood, WV 25428</P>

        <p style={{ fontFamily: f2, fontSize: 13, color: B.textLight, marginTop: 40, padding: '14px 0 0', borderTop: `1px solid ${B.sand}` }}>
          This page exists to provide a publicly accessible disclosure of the ChurchOpsHub SMS reminder program in compliance with US A2P 10DLC and TCR (The Campaign Registry) verification requirements.
        </p>
      </div>
    </>
  );
}
