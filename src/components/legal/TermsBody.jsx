import { B, f1, f2 } from '../brand/tokens.js';

function H2({ children }) {
  return <h2 style={{ fontFamily: f1, color: B.navy, marginTop: 28, marginBottom: 6, fontSize: 16, fontWeight: 700 }}>{children}</h2>;
}

function P({ children }) {
  return <p style={{ fontFamily: f2, fontSize: 15, color: B.textMid, lineHeight: 1.7, margin: '0 0 12px' }}>{children}</p>;
}

export function TermsBody() {
  return (
    <>
      <p style={{ fontFamily: f2, fontSize: 14, color: B.textLight, margin: '0 0 24px' }}>Last updated: April 26, 2026</p>

      <H2>1. Acceptance of Terms</H2>
      <P>By creating an account or using ChurchOpsHub ("the Service," "we," "us," or "our"), you ("you" or "User") agree to be bound by these Terms of Service ("Terms"). If you are accepting on behalf of a church or organization, you represent that you have authority to bind that organization. If you do not agree, do not use the Service.</P>

      <H2>2. Description of Service</H2>
      <P>ChurchOpsHub is a cloud-based inventory and operations management platform designed for churches and religious organizations. Features include equipment tracking, supply management, reservations, maintenance ticketing, team management, and reporting. The Service is provided on a subscription basis with a free tier and optional paid hubs.</P>

      <H2>3. Eligibility</H2>
      <P>You must be at least 18 years old and capable of entering a binding contract to use the Service. The Service is intended for use by churches, religious nonprofits, and their authorized staff. By registering, you confirm that you meet these requirements.</P>

      <H2>4. Account Registration & Security</H2>
      <P>You agree to provide accurate, current, and complete information during registration. Each church organization may create one account. You are responsible for maintaining the confidentiality of your login credentials and for all activity under your account. Notify us immediately at <a href="mailto:churchopshub@gmail.com" style={{ color: B.teal }}>churchopshub@gmail.com</a> if you suspect unauthorized access. We are not liable for losses resulting from unauthorized use of your account.</P>

      <H2>5. Subscriptions & Payment</H2>
      <P>The Service offers a free base tier and optional paid hubs billed on a monthly subscription basis. Paid subscriptions are processed through Stripe. By subscribing, you authorize us to charge your payment method on a recurring basis. Subscriptions renew automatically unless cancelled before the renewal date. We reserve the right to change pricing with at least 30 days' notice to active subscribers. Refunds are not provided for partial billing periods, but we will work with you in good faith if exceptional circumstances arise. Contact us at <a href="mailto:churchopshub@gmail.com" style={{ color: B.teal }}>churchopshub@gmail.com</a> with billing questions.</P>

      <H2>6. Your Data & License</H2>
      <P>You retain full ownership of all data, content, and information you submit to the Service ("Your Data"). By using the Service, you grant us a limited, non-exclusive license to store, process, and display Your Data solely to provide the Service to you. We do not claim any other rights to Your Data. We do not sell, rent, or use Your Data for advertising or marketing purposes.</P>

      <H2>7. SMS Communications</H2>
      <P><strong>Program name:</strong> ChurchOpsHub Job Texts. <strong>Description:</strong> Automated SMS to church volunteers who have opted in via the app, in two separate, unchecked-by-default categories: (1) shift reminders sent the morning of a shift the volunteer signed up for, and (2) optional new-shift alerts — a once-daily summary of newly posted shifts at the volunteer's church. No marketing or promotional messages. <strong>Sending number:</strong> +1 571-540-7100. <strong>Message frequency:</strong> Typically 1–7 messages per week; exact frequency depends on which options you enable and your church's activity. <strong>Message and data rates may apply.</strong> To get help, reply <strong>HELP</strong> to any message. To stop receiving messages, reply <strong>STOP</strong> to any message or disable SMS in Settings → My Profile. Opt-out requests are honored immediately and will not affect your access to any other Service features. For support, contact <a href="mailto:churchopshub@gmail.com" style={{ color: B.teal }}>churchopshub@gmail.com</a>. Full program disclosure, sample messages, and the in-app consent flow are documented at <a href="/sms-program" style={{ color: B.teal }}>churchopshub.com/sms-program</a>.</P>

      <H2>8. Acceptable Use</H2>
      <P>You agree not to: (a) use the Service for any unlawful purpose; (b) attempt to gain unauthorized access to other accounts or systems; (c) upload malicious code, viruses, or harmful content; (d) interfere with the Service's operation or other users' access; (e) reverse engineer, decompile, or attempt to extract source code from the Service; (f) resell or sublicense the Service without written permission. We reserve the right to investigate suspected violations and suspend accounts accordingly.</P>

      <H2>9. Intellectual Property</H2>
      <P>The Service, including its design, software, brand, and content (excluding Your Data), is owned by or licensed to ChurchOpsHub and protected by applicable intellectual property laws. These Terms do not grant you any rights to our trademarks, logos, or proprietary technology. All rights not expressly granted are reserved.</P>

      <H2>10. Third-Party Services</H2>
      <P>The Service relies on third-party providers including Google Firebase (data storage and authentication), Stripe (payment processing), Sentry (error monitoring), SendGrid (email notifications), and Twilio Programmable Messaging (optional SMS reminders). Your use of the Service is subject to those providers' terms and privacy policies. We are not responsible for the acts or omissions of third-party providers.</P>

      <H2>11. Disclaimers</H2>
      <P>THE SERVICE IS PROVIDED "AS IS" AND "AS AVAILABLE" WITHOUT WARRANTIES OF ANY KIND, EITHER EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE, OR NON-INFRINGEMENT. We do not warrant that the Service will be uninterrupted, error-free, or completely secure. Use of the Service is at your own risk.</P>

      <H2>12. Limitation of Liability</H2>
      <P>TO THE FULLEST EXTENT PERMITTED BY APPLICABLE LAW, CHURCHOPSHUB AND ITS OPERATORS SHALL NOT BE LIABLE FOR ANY INDIRECT, INCIDENTAL, SPECIAL, CONSEQUENTIAL, OR PUNITIVE DAMAGES, INCLUDING LOSS OF DATA, LOSS OF PROFITS, OR BUSINESS INTERRUPTION, ARISING OUT OF OR RELATED TO YOUR USE OF THE SERVICE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGES. OUR TOTAL LIABILITY TO YOU SHALL NOT EXCEED THE GREATER OF (A) THE AMOUNTS YOU PAID TO US IN THE 12 MONTHS PRECEDING THE CLAIM OR (B) $100.</P>

      <H2>13. Indemnification</H2>
      <P>You agree to indemnify, defend, and hold harmless ChurchOpsHub and its operators from and against any claims, damages, losses, or expenses (including reasonable attorneys' fees) arising out of or related to: (a) your use of the Service; (b) Your Data; (c) your violation of these Terms; or (d) your violation of any third party's rights.</P>

      <H2>14. Termination</H2>
      <P>We may suspend or terminate your account at any time for violation of these Terms, non-payment, or for any other reason with reasonable notice. Upon termination, your right to use the Service ceases immediately. You may cancel your account at any time by contacting us. We will retain Your Data for 30 days after termination to allow for export, then delete it permanently. SMS opt-out records are retained indefinitely to honor prior opt-out requests. Provisions that by their nature should survive termination (including Sections 6, 7, 9, 11, 12, 13, and 16) shall survive.</P>

      <H2>15. Changes to These Terms</H2>
      <P>We may update these Terms from time to time. We will notify active users of material changes via email at least 14 days before the new terms take effect. Continued use of the Service after the effective date constitutes acceptance of the revised Terms. If you do not agree to the changes, you may cancel your account before the effective date.</P>

      <H2>16. Governing Law & Disputes</H2>
      <P>These Terms are governed by the laws of the Commonwealth of Virginia, without regard to conflict of law principles. Any dispute arising from these Terms or your use of the Service shall first be addressed through good-faith negotiation. If unresolved, disputes shall be submitted to binding arbitration under the rules of the American Arbitration Association, conducted in Fairfax County, Virginia. Notwithstanding the foregoing, either party may seek injunctive or equitable relief in a court of competent jurisdiction. YOU WAIVE ANY RIGHT TO A JURY TRIAL OR CLASS ACTION PROCEEDING.</P>

      <H2>17. Contact</H2>
      <P>Questions about these Terms? Contact us at <a href="mailto:churchopshub@gmail.com" style={{ color: B.teal }}>churchopshub@gmail.com</a>.</P>
    </>
  );
}
