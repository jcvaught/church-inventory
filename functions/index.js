const { onCall, onRequest, HttpsError } = require('firebase-functions/v2/https');
const { onSchedule } = require('firebase-functions/v2/scheduler');
const { onDocumentCreated, onDocumentUpdated } = require('firebase-functions/v2/firestore');
const { defineSecret } = require('firebase-functions/params');
const { initializeApp } = require('firebase-admin/app');
const { getFirestore, FieldValue } = require('firebase-admin/firestore');
const { getAuth } = require('firebase-admin/auth');
const Sentry = require('@sentry/node');

Sentry.init({
  dsn: 'https://92a9eb2a55b9544dd9e673291f57eff8@o4511040580091904.ingest.us.sentry.io/4511040584089600',
  tracesSampleRate: 0.1,
  environment: process.env.FUNCTIONS_EMULATOR ? 'development' : 'production',
});

let sgMail;
try { sgMail = require('@sendgrid/mail'); } catch { sgMail = null; }

let twilioClient;
try { twilioClient = require('twilio'); } catch { twilioClient = null; }

initializeApp();

// Allowed origins for Stripe redirect URLs (successUrl, cancelUrl, returnUrl)
const ALLOWED_REDIRECT_ORIGINS = [
  'https://churchopshub.com',
  'https://www.churchopshub.com',
  'http://localhost:5173',
  'http://localhost:4173',
];

function validateRedirectUrl(url) {
  try {
    const origin = new URL(url).origin;
    if (ALLOWED_REDIRECT_ORIGINS.includes(origin)) return url;
  } catch (_) { /* fall through */ }
  return 'https://churchopshub.com';
}

const STRIPE_SECRET_KEY     = defineSecret('STRIPE_SECRET_KEY');
const STRIPE_WEBHOOK_SECRET = defineSecret('STRIPE_WEBHOOK_SECRET');
const ANTHROPIC_API_KEY     = defineSecret('ANTHROPIC_API_KEY');

// ── Fill these in after creating products in the Stripe dashboard ──────────
// Run: firebase functions:config:set is no longer used in v2.
// Instead set secrets: firebase functions:secrets:set STRIPE_SECRET_KEY
// And put price IDs directly here (they are not sensitive).
const PRICE_IDS = {
  maintenance:    'price_1TB2E2F12bDL8YA7Tw4VreQc',
  insights:       'price_1TB2E6F12bDL8YA734z4Q64M',
  coordination:   'price_1TB2E2F12bDL8YA7a0VFGB6C',
  accountability: 'price_1TB2E3F12bDL8YA7hGRIALZb',
  tasks:          'price_1TM9kcF12bDL8YA7m3otofk2',
  jobs:           'price_1TMteeF12bDL8YA7W6XzNHq0',
  team_25:        'price_1TB2E4F12bDL8YA7LLFr3xnL',
  team_unlimited: 'price_1TB2E3F12bDL8YA7P3a9xTVV',
  all_in:         'price_1TB2E7F12bDL8YA782etfOOQ',
};
// ──────────────────────────────────────────────────────────────────────────

function getPriceConfig(priceId) {
  const map = {
    [PRICE_IDS.maintenance]:    { type: 'hub',    hub: 'maintenance' },
    [PRICE_IDS.insights]:       { type: 'hub',    hub: 'insights' },
    [PRICE_IDS.coordination]:   { type: 'hub',    hub: 'coordination' },
    [PRICE_IDS.accountability]: { type: 'hub',    hub: 'accountability' },
    [PRICE_IDS.tasks]:          { type: 'hub',    hub: 'tasks' },
    [PRICE_IDS.jobs]:           { type: 'hub',    hub: 'jobs' },
    [PRICE_IDS.team_25]:        { type: 'team',   plan: 'team_25',        maxUsers: 25 },
    [PRICE_IDS.team_unlimited]: { type: 'team',   plan: 'team_unlimited', maxUsers: 9999 },
    [PRICE_IDS.all_in]:         { type: 'all_in', plan: 'all_in',         maxUsers: 9999,
                                  hubs: ['maintenance', 'insights', 'coordination', 'accountability', 'tasks', 'people_access', 'jobs'] },
  };
  return map[priceId] || null;
}

// ── identifyItem ──────────────────────────────────────────────────────────
// Called from the frontend with { imageBase64, mediaType }.
// Returns { description } — a concise inventory-ready item description.
exports.identifyItem = onCall(
  { secrets: [ANTHROPIC_API_KEY], cors: true },
  async (req) => {
    if (!req.auth) throw new HttpsError('unauthenticated', 'Must be signed in.');

    // Task 1: validate caller has a church profile to prevent unauthorized API credit usage
    const db = getFirestore();
    const callerSnap = await db.doc(`users/${req.auth.uid}`).get();
    if (!callerSnap.exists || !callerSnap.data().churchId) {
      throw new HttpsError('permission-denied', 'No church profile found.');
    }

    const { imageBase64, mediaType } = req.data;
    if (!imageBase64) throw new HttpsError('invalid-argument', 'imageBase64 is required.');

    const Anthropic = require('@anthropic-ai/sdk');
    const client = new Anthropic({ apiKey: ANTHROPIC_API_KEY.value() });

    const message = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 100,
      messages: [{
        role: 'user',
        content: [
          {
            type: 'image',
            source: { type: 'base64', media_type: mediaType || 'image/jpeg', data: imageBase64 },
          },
          {
            type: 'text',
            text: 'You are helping a church identify inventory items from photos. Look at this image and provide a brief, accurate description suitable for an inventory system. Include brand and model number if clearly visible. Be concise (under 80 characters). Return ONLY the description, nothing else.',
          },
        ],
      }],
    });

    const description = message.content[0]?.text?.trim() || '';
    return { description };
  }
);

// ── getChurchStats ────────────────────────────────────────────────────────
// Owner-only. Returns all churches with item + user counts.
// NOTE: OWNER_EMAILS is also hardcoded in firestore.rules (suggestions/errors read rules)
// and in SettingsPage.jsx (isOwner check). Keep all three in sync.
const OWNER_EMAILS = ['jcvaught@gmail.com', 'jvaught@fxcc.org'];

exports.getChurchStats = onCall(
  { cors: true },
  async (req) => {
    if (!req.auth) throw new HttpsError('unauthenticated', 'Must be signed in.');

    const userRecord = await getAuth().getUser(req.auth.uid);
    if (!OWNER_EMAILS.includes(userRecord.email)) {
      throw new HttpsError('permission-denied', 'Not authorized.');
    }

    const db = getFirestore();
    const churchesSnap = await db.collection('churches').orderBy('createdAt', 'desc').get();

    const churches = await Promise.all(churchesSnap.docs.map(async (doc) => {
      const data = doc.data();
      const churchId = doc.id;
      const [itemsSnap, usersSnap] = await Promise.all([
        db.collection('churches').doc(churchId).collection('items').count().get(),
        db.collection('users').where('churchId', '==', churchId).count().get(),
      ]);
      return {
        id: churchId,
        churchName: data.churchName || '—',
        churchCode: data.churchCode || '—',
        createdAt: data.createdAt?.toDate?.()?.toISOString() || data.createdAt || null,
        itemCount: itemsSnap.data().count,
        userCount: usersSnap.data().count,
      };
    }));

    return { churches };
  }
);

// ── lookupChurchByCode ────────────────────────────────────────────────────
// Phase D / H-02 from the 2026-05-12 audit. Replaces the client-side
// `getDocs(collection('churches'), where('churchCode','==',code))` query that
// required `allow list: if request.auth != null` on `churches/{churchId}`,
// which let any authenticated user dump every church code and join any church.
// Returns only { found, churchId } for an exact-match code. Requires auth so
// random crawlers can't probe; rate-limiting is left to App Check / Cloud Run
// quotas (not configured today — flagged for follow-up).
exports.lookupChurchByCode = onCall({ cors: true }, async (req) => {
  if (!req.auth) throw new HttpsError('unauthenticated', 'Must be signed in.');
  const code = (req.data?.code || '').toString().trim().toUpperCase();
  if (!code) throw new HttpsError('invalid-argument', 'Code required.');
  const db = getFirestore();
  const snap = await db.collection('churches').where('churchCode', '==', code).limit(1).get();
  if (snap.empty) return { found: false };
  return { found: true, churchId: snap.docs[0].id };
});

// ── getPublicJobs ─────────────────────────────────────────────────────────
// Public, unauthenticated read for the shareable PublicJobsPage. Strips
// signups[], waitlist[], attendance, and any other PII before returning so
// teen names are never exposed to anyone with the share link. Replaces the
// previous direct-Firestore listener path that leaked names to anyone with
// raw SDK access (Jobs Hub audit, 2026-05-06).
exports.getPublicJobs = onCall(
  { cors: true },
  async (req) => {
    const churchId = (req.data && req.data.churchId) || '';
    if (!churchId || typeof churchId !== 'string') {
      throw new HttpsError('invalid-argument', 'churchId is required.');
    }

    const db = getFirestore();
    const churchSnap = await db.collection('churches').doc(churchId).get();
    if (!churchSnap.exists) {
      throw new HttpsError('not-found', 'Church not found.');
    }

    const subSnap = await db.collection('churches').doc(churchId).collection('config').doc('subscription').get();
    if (!subHasHub(subSnap.data() || {}, 'jobs')) {
      // Hub inactive — return empty list rather than leak that the church exists.
      return { jobs: [] };
    }

    const jobsSnap = await db
      .collection('churches').doc(churchId).collection('jobListings')
      .where('status', '==', 'open')
      .orderBy('scheduledDate')
      .get();

    const jobs = jobsSnap.docs.map((doc) => {
      const x = doc.data();
      return {
        _docId: doc.id,
        jobNumber: x.jobNumber || null,
        title: x.title || '',
        description: x.description || '',
        scheduledDate: x.scheduledDate || null,
        scheduledTime: x.scheduledTime || null,
        location: x.location || '',
        pay: x.pay ?? null,
        spotsTotal: x.spotsTotal || 1,
        signupCount: Array.isArray(x.signups) ? x.signups.length : 0,
        status: x.status || 'open',
      };
    });

    return { jobs };
  }
);

// ── createCheckoutSession ─────────────────────────────────────────────────
// Called from the frontend with { item: 'maintenance'|'insights'|...|'all_in' }
// Returns { url } — redirect the browser to this URL.
exports.createCheckoutSession = onCall(
  { secrets: [STRIPE_SECRET_KEY], cors: true },
  async (req) => {
    if (!req.auth) throw new HttpsError('unauthenticated', 'Must be signed in.');

    const { item, successUrl, cancelUrl } = req.data;
    const priceId = PRICE_IDS[item];
    if (!priceId || priceId === 'price_REPLACE_ME' || priceId.startsWith('price_REPLACE_')) {
      throw new HttpsError('failed-precondition', `The ${item} price is not configured yet. Please contact support.`);
    }

    const db = getFirestore();
    const userSnap = await db.doc(`users/${req.auth.uid}`).get();
    if (!userSnap.exists) throw new HttpsError('not-found', 'User profile not found.');
    const userData = userSnap.data();
    // C-02 from overnight audit: gate Stripe checkout to admin only.
    // Previously any user could initiate a checkout against the church's
    // stripeCustomerId.
    if (userData.role !== 'admin') {
      throw new HttpsError('permission-denied', 'Only admins can manage billing.');
    }
    const { churchId } = userData;

    const subSnap = await db.doc(`churches/${churchId}/config/subscription`).get();
    const existingCustomerId = subSnap.data()?.stripeCustomerId || null;

    const stripe = require('stripe')(STRIPE_SECRET_KEY.value());

    const sessionParams = {
      mode: 'subscription',
      line_items: [{ price: priceId, quantity: 1 }],
      metadata: { churchId },
      subscription_data: { metadata: { churchId } },
      success_url: validateRedirectUrl(successUrl),
      cancel_url: validateRedirectUrl(cancelUrl),
    };
    if (existingCustomerId) sessionParams.customer = existingCustomerId;

    const session = await stripe.checkout.sessions.create(sessionParams);
    return { url: session.url };
  }
);

// ── createPortalSession ───────────────────────────────────────────────────
// Called from the frontend with { returnUrl }.
// Returns { url } — redirect the browser to the Stripe billing portal.
exports.createPortalSession = onCall(
  { secrets: [STRIPE_SECRET_KEY], cors: true },
  async (req) => {
    if (!req.auth) throw new HttpsError('unauthenticated', 'Must be signed in.');

    const { returnUrl } = req.data;

    const db = getFirestore();
    const userSnap = await db.doc(`users/${req.auth.uid}`).get();
    if (!userSnap.exists) throw new HttpsError('not-found', 'User profile not found.');
    const userData = userSnap.data();
    // C-02: gate Stripe billing portal to admin only.
    // Previously any user could open the portal and cancel the subscription.
    if (userData.role !== 'admin') {
      throw new HttpsError('permission-denied', 'Only admins can manage billing.');
    }
    const { churchId } = userData;

    const subSnap = await db.doc(`churches/${churchId}/config/subscription`).get();
    const stripeCustomerId = subSnap.data()?.stripeCustomerId;
    if (!stripeCustomerId) {
      throw new HttpsError('failed-precondition', 'No billing account found. Please subscribe first.');
    }

    const stripe = require('stripe')(STRIPE_SECRET_KEY.value());
    const session = await stripe.billingPortal.sessions.create({
      customer: stripeCustomerId,
      return_url: validateRedirectUrl(returnUrl),
    });
    return { url: session.url };
  }
);

// ── stripeWebhook ─────────────────────────────────────────────────────────
// Registered in the Stripe dashboard as an HTTP endpoint.
// Handles: checkout.session.completed, customer.subscription.updated,
//          customer.subscription.deleted
exports.stripeWebhook = onRequest(
  { secrets: [STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET] },
  async (req, res) => {
    const stripe = require('stripe')(STRIPE_SECRET_KEY.value());
    const sig = req.headers['stripe-signature'];

    let event;
    try {
      event = stripe.webhooks.constructEvent(
        req.rawBody,
        sig,
        STRIPE_WEBHOOK_SECRET.value()
      );
    } catch (err) {
      console.error('Webhook signature verification failed:', err.message);
      Sentry.captureException(err);
      res.status(400).send('Invalid webhook signature');
      return;
    }

    const db = getFirestore();

    try {
      // ── New purchase completed ──────────────────────────────────────────
      if (event.type === 'checkout.session.completed') {
        const session = event.data.object;
        const churchId = session.metadata?.churchId;
        if (!churchId) { res.sendStatus(200); return; }

        // Task 4: verify the church still exists before writing subscription data
        const churchSnap = await db.doc(`churches/${churchId}`).get();
        if (!churchSnap.exists) {
          console.warn(`Webhook: church ${churchId} not found, skipping.`);
          res.sendStatus(200); return;
        }

        const subscription = await stripe.subscriptions.retrieve(session.subscription);
        const priceId = subscription.items.data[0]?.price.id;
        const config = getPriceConfig(priceId);
        if (!config) { res.sendStatus(200); return; }

        const update = {
          stripeCustomerId: session.customer,
          stripeSubscriptionId: session.subscription,
          status: 'active',
        };

        if (config.type === 'hub') {
          update.hubs = FieldValue.arrayUnion(config.hub);
        } else if (config.type === 'team') {
          update.plan = config.plan;
          update.maxUsers = config.maxUsers;
        } else if (config.type === 'all_in') {
          update.plan = config.plan;
          update.maxUsers = config.maxUsers;
          update.hubs = config.hubs;
        }

        await db.doc(`churches/${churchId}/config/subscription`).set(update, { merge: true });
      }

      // ── Subscription status changed (payment failure, renewal, etc.) ───
      if (event.type === 'customer.subscription.updated') {
        const sub = event.data.object;
        const churchId = sub.metadata?.churchId;
        if (!churchId) { res.sendStatus(200); return; }

        await db.doc(`churches/${churchId}/config/subscription`).set(
          { status: sub.status },
          { merge: true }
        );
      }

      // ── Subscription canceled ──────────────────────────────────────────
      if (event.type === 'customer.subscription.deleted') {
        const sub = event.data.object;
        const churchId = sub.metadata?.churchId;
        if (!churchId) { res.sendStatus(200); return; }

        const priceId = sub.items.data[0]?.price.id;
        const config = getPriceConfig(priceId);

        const update = { status: 'canceled' };

        if (config?.type === 'hub') {
          update.hubs = FieldValue.arrayRemove(config.hub);
        } else if (config?.type === 'team') {
          update.plan = 'free';
          update.maxUsers = 10;
        } else if (config?.type === 'all_in') {
          update.plan = 'free';
          update.maxUsers = 10;
          update.hubs = [];
        }

        await db.doc(`churches/${churchId}/config/subscription`).set(update, { merge: true });
      }
    } catch (err) {
      console.error('Webhook handler error:', err);
      Sentry.captureException(err);
      res.status(500).send('Internal error');
      return;
    }

    res.sendStatus(200);
  }
);

// ── Email helpers ─────────────────────────────────────────────────────────
function escapeHtml(str) {
  return String(str || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function initSendGrid() {
  const apiKey = process.env.SENDGRID_API_KEY;
  if (!apiKey || !sgMail) return false;
  sgMail.setApiKey(apiKey);
  return true;
}

function getTwilioClient() {
  const sid = process.env.TWILIO_ACCOUNT_SID;
  const token = process.env.TWILIO_AUTH_TOKEN;
  if (!sid || !token || !twilioClient) return null;
  return twilioClient(sid, token);
}
const TWILIO_FROM = process.env.TWILIO_FROM_NUMBER || '';

// F-24 from the 2026-05-12 overnight audit: moved sender from the Gmail-as-
// sender pattern (churchopshub@gmail.com, which Gmail's DMARC p=reject blocks
// from third-party DKIM alignment) to the SendGrid-authenticated custom domain
// churchopshub.com. Verified 2026-05-12 with SPF + DKIM + DMARC (p=none) records
// on Vercel DNS. The previous Gmail Single Sender Verification is intentionally
// left active in SendGrid as an emergency fallback for ~24h after this deploy.
const FROM = { email: 'noreply@churchopshub.com', name: 'ChurchOpsHub' };

// Shared hub-access check used by all hub-gating Cloud Functions.
// Mirrors the client-side hasHub() logic in useSubscription.js.
function subHasHub(sub, hubName) {
  if (!sub) return false;
  if (sub.grandfathered) return true;
  if (sub.plan === 'all_in') return true;
  // Active trial: freeHubsSelected is null while trial is running
  if (sub.freeHubsSelected === null && sub.trialEndsAt && new Date(sub.trialEndsAt) > new Date()) {
    return (sub.trialHubs || []).includes(hubName);
  }
  // Post-trial auto-selected free hubs
  if (Array.isArray(sub.freeHubsSelected) && sub.freeHubsSelected.includes(hubName)) return true;
  return (sub.hubs || []).includes(hubName);
}

// F-21: unified per-user hub access check.
// - Admins always have access regardless of allowedHubs (matches client UI default).
// - Non-admins with missing/undefined allowedHubs default to access (legacy users).
// - Non-admins with an array (including empty) must list the hub explicitly.
function effectiveHasHub(user, hubName) {
  if (!user) return false;
  if (user.role === 'admin') return true;
  if (!Array.isArray(user.allowedHubs)) return true;
  return user.allowedHubs.includes(hubName);
}

// ── sendWelcomeEmail ──────────────────────────────────────────────────────
// Firestore onCreate trigger: fires when a new church document is created.
// Sends a personal welcome email to the church admin.
exports.sendWelcomeEmail = onDocumentCreated('churches/{churchId}', async (event) => {
  const db = getFirestore();
  const churchData = event.data?.data();
  if (!churchData) return;

  const churchRef = event.data.ref;

  // Idempotency: skip if we already sent the welcome email for this church
  if (churchData.welcomeEmailSentAt) return;

  // Fetch admin email from Firebase Auth (avoids race condition with Firestore user doc write)
  const creatorUid = churchData.createdBy;
  if (!creatorUid) return;

  let adminEmail, adminName;
  try {
    const authUser = await getAuth().getUser(creatorUid);
    adminEmail = authUser.email;
    adminName = authUser.displayName || null;
  } catch (err) {
    console.error('sendWelcomeEmail: could not fetch auth user', err);
    Sentry.captureException(err);
    return;
  }
  if (!adminEmail) return;

  if (!initSendGrid()) { console.warn('sendWelcomeEmail: SendGrid not configured, skipping.'); return; }

  const churchName = escapeHtml(churchData.churchName || 'Your Church');
  const churchCode = escapeHtml(churchData.churchCode || '');
  const firstName = adminName ? escapeHtml(adminName.split(' ')[0]) : 'there';

  // Calculate trial end date for display
  const trialEnd = new Date(Date.now() + 90 * 24 * 60 * 60 * 1000);
  const trialEndStr = trialEnd.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });

  const subject = `Welcome to ChurchOpsHub, ${churchData.churchName || 'your church'}!`;
  const html = `<p>Hi ${firstName},</p>
<p>Welcome to <strong>ChurchOpsHub</strong>! Your church <strong>${churchName}</strong> is set up and ready to go.</p>

<div style="background:#F0FDF4;border-left:4px solid #0D9488;padding:12px 16px;margin:16px 0;border-radius:4px">
  <p style="font-weight:700;margin:0 0 6px;font-size:15px">Your 90-day free trial is active</p>
  <p style="margin:0;font-size:14px;color:#166534">All paid hubs are unlocked through <strong>${trialEndStr}</strong>. No credit card needed.</p>
</div>

<p style="font-weight:600;margin:16px 0 8px">A few things to get you started:</p>
<ul style="padding-left:20px;margin:0 0 16px;font-size:14px;line-height:1.8">
  <li>Add your first items in the <strong>Inventory</strong> tab</li>
  <li>Invite your team with church code: <strong>${churchCode}</strong></li>
  <li>Explore the Hubs tab — Maintenance, Tasks, Job Hub, and more</li>
  <li>Set up your locations and ministries in <strong>Settings</strong></li>
</ul>

<p><a href="https://churchopshub.com/?help" style="color:#0D9488;font-weight:600">Browse the Help Center</a> if you have any questions — it covers every feature in detail.</p>

<p>I'm also happy to answer questions directly. Just reply to this email.</p>

<p>— John Vaught<br><span style="font-size:13px;color:#666">ChurchOpsHub</span></p>`;

  const text = `Hi ${firstName},\n\nWelcome to ChurchOpsHub! Your church "${churchData.churchName}" is set up and ready to go.\n\nYour 90-day free trial is active — all paid hubs are unlocked through ${trialEndStr}. No credit card needed.\n\nA few things to get started:\n- Add your first items in the Inventory tab\n- Invite your team with church code: ${churchData.churchCode || ''}\n- Explore the Hubs tab — Maintenance, Tasks, Job Hub, and more\n- Set up your locations and ministries in Settings\n\nHelp Center: https://churchopshub.com/?help\n\nFeel free to reply with any questions.\n\n— John Vaught\nChurchOpsHub`;

  // Set sentinel BEFORE send so a CF retry between send-success and update can't dual-send.
  try {
    await churchRef.update({ welcomeEmailSentAt: 'sending' });
  } catch (err) {
    console.error('sendWelcomeEmail: failed to set sending sentinel', err?.message);
    Sentry.captureException(err);
    return;
  }

  try {
    await sgMail.send({ to: adminEmail, from: FROM, replyTo: 'jcvaught@gmail.com', subject, html, text });
    await churchRef.update({ welcomeEmailSentAt: new Date().toISOString() });
  } catch (err) {
    console.error('sendWelcomeEmail: send failed', err?.response?.body || err);
    Sentry.captureException(err);
  }
});

// ── processTrialExpirations ───────────────────────────────────────────────
// Runs daily at 2:00 AM Central time.
// Finds churches whose trial just expired, auto-selects their 2 most-used hubs
// from the activity log, writes freeHubsSelected, and emails the admin.
const TRIAL_HUBS = ['maintenance', 'insights', 'coordination', 'accountability', 'people_access', 'tasks', 'jobs'];
const HUB_ACTIONS = {
  maintenance: ['add_ticket','update_ticket','complete_ticket','delete_ticket','assign_ticket','reopen_ticket'],
  coordination: ['create_bundle','checkout_bundle','return_bundle','delete_bundle'],
  accountability: ['start_audit','complete_audit','delete_audit'],
  people_access: ['add_person','update_person','add_record','update_record','delete_record'],
  tasks: ['add_task','update_task','complete_task','delete_task','create_template','delete_template'],
  jobs: ['post_job','signup_job','withdraw_job','update_job','delete_job','post_announcement','update_announcement','delete_announcement'],
};

exports.processTrialExpirations = onSchedule({ schedule: '0 2 * * *', timeZone: 'America/Chicago' }, async () => {
  const db = getFirestore();
  const now = new Date();
  const nowStr = now.toISOString();

  // Find all subscription docs where trial ended and free hubs haven't been selected yet.
  // We query for status='trialing' as a proxy — CF will validate trialEndsAt precisely.
  const subSnaps = await db.collectionGroup('config')
    .where('status', '==', 'trialing')
    .get();

  if (subSnaps.empty) return;

  for (const subDoc of subSnaps.docs) {
    // Only process 'subscription' config docs
    if (subDoc.id !== 'subscription') continue;

    const sub = subDoc.data();
    if (!sub.trialEndsAt) continue;
    if (new Date(sub.trialEndsAt) > now) continue; // trial still active
    if (sub.freeHubsSelected !== null && sub.freeHubsSelected !== undefined) continue; // already processed

    const churchId = subDoc.ref.parent.parent.id;

    // Count activity log entries per hub during the trial window
    let activitySnap;
    try {
      activitySnap = await db.collection(`churches/${churchId}/activityLog`)
        .where('timestamp', '>=', sub.trialStartedAt || '')
        .get();
    } catch (err) {
      console.error('processTrialExpirations: activity log read failed', { churchId, err: err.message });
      Sentry.captureException(err);
      continue;
    }

    const hubCounts = {};
    for (const hubName of TRIAL_HUBS) hubCounts[hubName] = 0;
    // insights has no activity log entries; it starts at 0 (lower priority in auto-selection)

    for (const entry of activitySnap.docs) {
      const action = entry.data().action || '';
      for (const [hub, actions] of Object.entries(HUB_ACTIONS)) {
        if (actions.includes(action)) { hubCounts[hub]++; break; }
      }
    }

    // Pick top 2 hubs by usage count; break ties alphabetically for determinism
    const sorted = TRIAL_HUBS
      .slice()
      .sort((a, b) => hubCounts[b] - hubCounts[a] || a.localeCompare(b));
    const freeHubsSelected = sorted.slice(0, 2);

    // F-RC-4 from the 2026-05-12 audit: do the read-validate-write inside a
    // transaction so a concurrent Stripe webhook (e.g. customer.subscription
    // .updated arriving at trial expiry from a same-day paid upgrade) can't
    // race with this cron. If the webhook already flipped status/freeHubsSelected
    // between the prefetch above and this point, the txn re-check aborts.
    try {
      await db.runTransaction(async (t) => {
        const fresh = await t.get(subDoc.ref);
        if (!fresh.exists) return;
        const freshData = fresh.data();
        if (freshData.status !== 'trialing') return; // webhook already moved it on
        if (freshData.freeHubsSelected !== null && freshData.freeHubsSelected !== undefined) return;
        if (!freshData.trialEndsAt || new Date(freshData.trialEndsAt) > now) return;
        t.update(subDoc.ref, { freeHubsSelected, status: 'active' });
      });
    } catch (err) {
      console.error('processTrialExpirations: update failed', { churchId, err: err.message });
      Sentry.captureException(err);
      continue;
    }

    // Find admin user to email
    if (!initSendGrid()) continue;
    let adminEmail, adminName;
    try {
      const churchDoc = await db.doc(`churches/${churchId}`).get();
      const creatorUid = churchDoc.data()?.createdBy;
      if (creatorUid) {
        const authUser = await getAuth().getUser(creatorUid);
        adminEmail = authUser.email;
        adminName = authUser.displayName || null;
      }
    } catch (err) {
      console.error('processTrialExpirations: could not fetch admin', { churchId, err: err.message });
      Sentry.captureException(err);
    }
    if (!adminEmail) continue;

    const hubLabel = h => ({ maintenance:'Maintenance', insights:'Insights', coordination:'Coordination', accountability:'Accountability', people_access:'People Access', tasks:'Tasks', jobs:'Job Hub' }[h] || h);
    const freeNames = freeHubsSelected.map(hubLabel).join(' and ');
    const firstName = adminName ? adminName.split(' ')[0] : 'there';

    const subject = 'Your ChurchOpsHub trial has ended — here\'s what\'s free';
    const html = `<p>Hi ${escapeHtml(firstName)},</p>
<p>Your 90-day free trial has ended. Based on how your team used ChurchOpsHub, we've automatically kept your two most-used hubs active for free:</p>
<div style="background:#F0FDF4;border-left:4px solid #0D9488;padding:12px 16px;margin:16px 0;border-radius:4px">
  <p style="font-weight:700;margin:0;font-size:15px">${escapeHtml(freeNames)} — free forever</p>
</div>
<p>The Inventory Hub remains free as always. To unlock additional hubs, you can upgrade anytime from <strong>Settings → Subscription</strong>.</p>
<p>All your data is still there — nothing was deleted.</p>
<p>Thank you for trying ChurchOpsHub. Reply to this email with any questions.</p>
<p>— John Vaught<br><span style="font-size:13px;color:#666">ChurchOpsHub</span></p>`;
    const text = `Hi ${firstName},\n\nYour 90-day free trial has ended. Based on your team's usage, we've kept your two most-used hubs active for free:\n\n${freeNames}\n\nThe Inventory Hub remains free as always. To unlock additional hubs, go to Settings → Subscription.\n\nAll your data is still there — nothing was deleted.\n\nThank you for trying ChurchOpsHub.\n\n— John Vaught\nChurchOpsHub`;

    try {
      await sgMail.send({ to: adminEmail, from: FROM, replyTo: 'jcvaught@gmail.com', subject, html, text });
    } catch (err) {
      console.error('processTrialExpirations: trial-end email failed', { churchId, err: err?.response?.body || err });
      Sentry.captureException(err);
    }

    // 7-day warning email (separate pass — send when 7 days remain)
    // Handled by the daily run: if trialEndsAt is exactly 7 days from now, send warning.
    // This is checked separately below in the same scheduled run.
    console.log('processTrialExpirations: processed', { churchId, freeHubsSelected, nowStr });
  }

  // Second pass: send 7-day warning emails
  const sevenDaysFromNow = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
  const sevenDaysStr = sevenDaysFromNow.toISOString().slice(0, 10);

  const warnSnaps = await db.collectionGroup('config')
    .where('status', '==', 'trialing')
    .get();

  for (const subDoc of warnSnaps.docs) {
    if (subDoc.id !== 'subscription') continue;
    const sub = subDoc.data();
    if (!sub.trialEndsAt) continue;
    if (sub.trialWarningEmailSentAt) continue; // already sent
    const trialEndDay = sub.trialEndsAt.slice(0, 10);
    if (trialEndDay !== sevenDaysStr) continue; // not the right church

    const churchId = subDoc.ref.parent.parent.id;
    if (!initSendGrid()) continue;

    let adminEmail, adminName;
    try {
      const churchDoc = await db.doc(`churches/${churchId}`).get();
      const creatorUid = churchDoc.data()?.createdBy;
      if (creatorUid) {
        const authUser = await getAuth().getUser(creatorUid);
        adminEmail = authUser.email;
        adminName = authUser.displayName || null;
      }
    } catch { continue; }
    if (!adminEmail) continue;

    const firstName = adminName ? adminName.split(' ')[0] : 'there';
    const trialEndDisplay = new Date(sub.trialEndsAt).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });

    const warnSubject = 'Your ChurchOpsHub trial ends in 7 days';
    const warnHtml = `<p>Hi ${escapeHtml(firstName)},</p>
<p>Your 90-day free trial of all ChurchOpsHub hubs ends on <strong>${escapeHtml(trialEndDisplay)}</strong> — just 7 days away.</p>
<p>After the trial, we'll automatically keep your two most-used hubs active for free. To keep all hubs, upgrade to the <strong>All-In plan ($29/mo)</strong> from Settings → Subscription.</p>
<p><a href="https://churchopshub.com" style="color:#0D9488;font-weight:600">Log in to ChurchOpsHub</a> to review your hubs before the trial ends.</p>
<p>— John Vaught<br><span style="font-size:13px;color:#666">ChurchOpsHub</span></p>`;
    const warnText = `Hi ${firstName},\n\nYour 90-day free trial ends on ${trialEndDisplay} — just 7 days away.\n\nAfter the trial, we'll automatically keep your two most-used hubs active for free. To keep all hubs, upgrade to the All-In plan ($29/mo) from Settings → Subscription.\n\nLog in at churchopshub.com to review your hubs.\n\n— John Vaught\nChurchOpsHub`;

    try {
      await sgMail.send({ to: adminEmail, from: FROM, replyTo: 'jcvaught@gmail.com', subject: warnSubject, html: warnHtml, text: warnText });
      await subDoc.ref.update({ trialWarningEmailSentAt: nowStr });
    } catch (err) {
      console.error('processTrialExpirations: warning email failed', { churchId, err: err?.response?.body || err });
      Sentry.captureException(err);
    }
  }
});

// ── sendReservationEmail ──────────────────────────────────────────────────
// Called from client when a reservation is approved or denied.
// data: { toEmail, toName, churchName, eventName, resourceDesc, eventDate, actionBy, status }
exports.sendReservationEmail = onCall({ cors: true }, async (req) => {
  if (!req.auth) throw new HttpsError('unauthenticated', 'Must be signed in.');
  if (!initSendGrid()) return { sent: false };

  const { toEmail, toName, churchName, eventName, resourceDesc, eventDate, actionBy, status } = req.data;
  if (!toEmail) return { sent: false };

  const approved = status === 'approved';
  const safeName = escapeHtml(toName);
  const safeEvent = escapeHtml(eventName);
  const safeResource = escapeHtml(resourceDesc);
  const safeChurch = escapeHtml(churchName);
  const safeActionBy = escapeHtml(actionBy);

  const subject = approved
    ? `Reservation Approved — ${eventName}`
    : `Reservation Denied — ${eventName}`;

  const html = `<p>Hi ${safeName},</p>
<p>Your reservation request has been <strong>${approved ? 'approved ✅' : 'denied ❌'}</strong>.</p>
<table style="border-collapse:collapse;margin:12px 0">
  <tr><td style="padding:4px 12px 4px 0;color:#666;font-size:14px">Event</td><td style="font-size:14px"><strong>${safeEvent}</strong></td></tr>
  <tr><td style="padding:4px 12px 4px 0;color:#666;font-size:14px">Resource</td><td style="font-size:14px">${safeResource}</td></tr>
  <tr><td style="padding:4px 12px 4px 0;color:#666;font-size:14px">Date</td><td style="font-size:14px">${escapeHtml(eventDate)}</td></tr>
  <tr><td style="padding:4px 12px 4px 0;color:#666;font-size:14px">${approved ? 'Approved' : 'Denied'} by</td><td style="font-size:14px">${safeActionBy}</td></tr>
</table>
<p style="font-size:13px;color:#666">— ${safeChurch} via ChurchOpsHub</p>`;

  const text = `Hi ${toName},\n\nYour reservation for "${eventName}" (${resourceDesc}) on ${eventDate} has been ${status} by ${actionBy}.\n\n— ${churchName}`;

  await sgMail.send({ to: toEmail, from: FROM, subject, html, text });
  return { sent: true };
});

// ── sendTicketAssignedEmail ───────────────────────────────────────────────
// Called from client when a maintenance ticket is assigned to someone.
// data: { toEmail, toName, churchName, ticketNumber, ticketName, assignedBy }
exports.sendTicketAssignedEmail = onCall({ cors: true }, async (req) => {
  if (!req.auth) throw new HttpsError('unauthenticated', 'Must be signed in.');
  if (!initSendGrid()) return { sent: false };

  // F-39 from the 2026-05-12 audit: this CF is reused by Tasks Hub for task
  // assignments but the subject/body always said "Maintenance Ticket". Accept
  // an optional `kind` field (defaults to 'ticket' for back-compat) so the
  // copy is accurate from each caller.
  const { toEmail, toName, churchName, ticketNumber, ticketName, assignedBy, kind } = req.data;
  if (!toEmail) return { sent: false };
  const isTask = kind === 'task';
  const label = isTask ? 'Task' : 'Maintenance Ticket';
  const labelLower = isTask ? 'task' : 'maintenance ticket';

  const safeName = escapeHtml(toName);
  const safeTicket = escapeHtml(ticketName);
  const safeNumber = escapeHtml(ticketNumber);
  const safeChurch = escapeHtml(churchName);
  const safeAssignedBy = escapeHtml(assignedBy);

  const subject = `${label} Assigned — ${ticketNumber}`;
  const html = `<p>Hi ${safeName},</p>
<p>You've been assigned a ${labelLower} by <strong>${safeAssignedBy}</strong>.</p>
<table style="border-collapse:collapse;margin:12px 0">
  <tr><td style="padding:4px 12px 4px 0;color:#666;font-size:14px">${label}</td><td style="font-size:14px"><strong>${safeNumber}</strong></td></tr>
  <tr><td style="padding:4px 12px 4px 0;color:#666;font-size:14px">Description</td><td style="font-size:14px">${safeTicket}</td></tr>
</table>
<p><a href="https://churchopshub.com">Log in to ChurchOpsHub</a> to view and update the ${labelLower}.</p>
<p style="font-size:13px;color:#666">— ${safeChurch} via ChurchOpsHub</p>`;

  const text = `Hi ${toName},\n\nYou've been assigned ${labelLower} ${ticketNumber}: "${ticketName}" by ${assignedBy}.\n\nLog in at churchopshub.com to view it.\n\n— ${churchName}`;

  await sgMail.send({ to: toEmail, from: FROM, subject, html, text });
  return { sent: true };
});

// ── sendJobAnnouncementEmails ─────────────────────────────────────────────
// Called from client when a Job Hub announcement is posted.
// data: { churchId, title, body, postedBy }
// Fetches all active users with job hub access server-side and emails them.
exports.sendJobAnnouncementEmails = onCall({ cors: true }, async (req) => {
  if (!req.auth) throw new HttpsError('unauthenticated', 'Must be signed in.');
  if (!initSendGrid()) { console.warn('sendJobAnnouncementEmails: SendGrid not configured, skipping.'); return { sent: 0 }; }

  const { churchId, title, body } = req.data;
  if (!churchId || !title) return { sent: 0 };

  const db = getFirestore();

  // Verify caller is a member of the target church and has admin/manager role
  const callerSnap = await db.doc(`users/${req.auth.uid}`).get();
  if (!callerSnap.exists || callerSnap.data().churchId !== churchId) {
    throw new HttpsError('permission-denied', 'Not a member of this church.');
  }
  const callerRole = callerSnap.data().role;
  if (callerRole !== 'admin' && callerRole !== 'manager') {
    throw new HttpsError('permission-denied', 'Only admin or manager can send announcements.');
  }

  // Verify church has an active Jobs hub subscription and notifications enabled
  const [churchSnap, subSnap, notifSnap2, usersSnap] = await Promise.all([
    db.doc(`churches/${churchId}/config/main`).get(),
    db.doc(`churches/${churchId}/config/subscription`).get(),
    db.doc(`churches/${churchId}/config/notifications`).get(),
    // Use plain churchId filter — 'active != false' silently excludes docs where field is missing
    db.collection('users').where('churchId', '==', churchId).get(),
  ]);
  const sub = subSnap.data() || {};
  if (!subHasHub(sub, 'jobs')) return { sent: 0 };
  // F-14: treat missing/unset doc as enabled (default-on); only explicit
  // false disables. Fresh churches that haven't opened the Notifications
  // settings page still receive emails.
  if (notifSnap2.exists && notifSnap2.data()?.enabled === false) return { sent: 0 };

  // Use server-derived poster name (not client-supplied) to prevent impersonation in email body
  const postedBy = callerSnap.data().name || 'Your church';

  const churchName = churchSnap.data()?.churchName || 'Your Church';
  const recipients = usersSnap.docs
    .map(d => ({ ...d.data(), uid: d.id }))
    .filter(u => u.email && u.active !== false && effectiveHasHub(u, 'jobs'));

  if (recipients.length === 0) return { sent: 0 };

  const safeTitle = escapeHtml(title);
  // F-28 from the 2026-05-12 audit: cap body length. Previously unbounded — an
  // admin pasting 200KB of text fans out 200KB × N recipients. Gmail also
  // clip-renders bodies > ~102KB. Truncate to 5000 chars (mirrors the cap
  // already used in sendTaskMentionEmail at line ~1565).
  const truncatedBody = (body || '').substring(0, 5000);
  const safeBody = escapeHtml(truncatedBody).replace(/\n/g, '<br>');
  const safePostedBy = escapeHtml(postedBy);
  const safeChurch = escapeHtml(churchName);
  const subject = `📢 ${title} — ${churchName}`;

  const results = await Promise.allSettled(recipients.map(u =>
    sgMail.send({
      to: u.email,
      from: FROM,
      subject,
      html: `<p>Hi ${escapeHtml(u.name || 'there')},</p>
<p><strong>${safePostedBy}</strong> posted a new Job Hub announcement:</p>
<div style="background:#f5f5f5;border-left:4px solid #0D9488;padding:12px 16px;margin:12px 0;border-radius:4px">
  <p style="font-weight:700;margin:0 0 8px;font-size:15px">${safeTitle}</p>
  <p style="margin:0;font-size:14px;line-height:1.6">${safeBody}</p>
</div>
<p><a href="https://churchopshub.com">Open ChurchOpsHub</a> to view all announcements.</p>
<p style="font-size:13px;color:#666">— ${safeChurch} via ChurchOpsHub</p>`,
      text: `Hi ${u.name || 'there'},\n\n${postedBy} posted a new announcement:\n\n${title}\n\n${body}\n\n— ${churchName}`,
    })
  ));

  results.forEach((r, i) => { if (r.status === 'rejected') { console.error('sendJobAnnouncementEmails: email failed', { index: i, reason: r.reason?.message }); Sentry.captureException(r.reason); } });
  const sent = results.filter(r => r.status === 'fulfilled').length;
  return { sent };
});

// ── sendJobCancelledEmails ────────────────────────────────────────────────
// Called when a job is cancelled. Fetches signups server-side and notifies each person.
// data: { churchId, jobDocId }
exports.sendJobCancelledEmails = onCall({ cors: true }, async (req) => {
  if (!req.auth) throw new HttpsError('unauthenticated', 'Must be signed in.');
  if (!initSendGrid()) { console.warn('sendJobCancelledEmails: SendGrid not configured, skipping.'); return { sent: 0 }; }

  const { churchId, jobDocId } = req.data;
  if (!churchId || !jobDocId) return { sent: 0 };

  const db = getFirestore();

  // Verify caller is admin/manager of the church
  const callerSnap = await db.doc(`users/${req.auth.uid}`).get();
  if (!callerSnap.exists || callerSnap.data().churchId !== churchId) {
    throw new HttpsError('permission-denied', 'Not a member of this church.');
  }
  if (!['admin', 'manager'].includes(callerSnap.data().role)) {
    throw new HttpsError('permission-denied', 'Only admin or manager can send cancellation notices.');
  }

  const [jobSnap, churchSnap, subSnap] = await Promise.all([
    db.doc(`churches/${churchId}/jobListings/${jobDocId}`).get(),
    db.doc(`churches/${churchId}/config/main`).get(),
    db.doc(`churches/${churchId}/config/subscription`).get(),
  ]);
  if (!jobSnap.exists) return { sent: 0 };
  if (!subHasHub(subSnap.data() || {}, 'jobs')) return { sent: 0 };

  const job = jobSnap.data();
  const signups = job.signups || [];
  const waitlist = job.waitlist || [];
  // F-32 from the 2026-05-12 audit: include waitlist users in cancellation
  // notifications. Previously waitlisted teens sat on a dead waitlist forever
  // because they were excluded from cancellation broadcasts.
  if (signups.length === 0 && waitlist.length === 0) return { sent: 0 };

  // Re-trigger guard: prevent spamming cancellation emails within a 1-hour window
  const lastSent = job.cancellationEmailSentAt;
  if (lastSent) {
    const msSinceLast = Date.now() - new Date(lastSent).getTime();
    if (msSinceLast < 60 * 60 * 1000) return { sent: 0, skipped: true };
  }

  const churchName = churchSnap.data()?.churchName || 'Your Church';
  const safeTitle = escapeHtml(job.title || 'Job');
  const safeChurch = escapeHtml(churchName);
  const dateStr = job.scheduledDate || '';
  const timeStr = job.scheduledTime ? ` at ${job.scheduledTime}` : '';
  const signupSubject = `Job Cancelled: ${job.title || 'Job'}`;
  const waitlistSubject = `Job You Were Waitlisted For Was Cancelled: ${job.title || 'Job'}`;

  // Build (entry, kind) pairs so we can render waitlist vs signup variants.
  // Dedupe by uid in case someone is on both (shouldn't happen, but defensive).
  const seenUids = new Set();
  const recipients = [];
  for (const s of signups) {
    if (s.uid && !seenUids.has(s.uid)) { seenUids.add(s.uid); recipients.push({ uid: s.uid, kind: 'signup' }); }
  }
  for (const w of waitlist) {
    if (w.uid && !seenUids.has(w.uid)) { seenUids.add(w.uid); recipients.push({ uid: w.uid, kind: 'waitlist' }); }
  }

  const userSnaps = await Promise.all(recipients.map(r => db.doc(`users/${r.uid}`).get()));

  const results = await Promise.allSettled(userSnaps.map((snap, i) => {
    if (!snap.exists) return Promise.resolve();
    const user = snap.data();
    if (!user.email || user.active === false || user.churchId !== churchId) return Promise.resolve();
    // Respect per-user hub access; F-21 helper treats admin/missing-array as access.
    if (!effectiveHasHub(user, 'jobs')) return Promise.resolve();
    const safeName = escapeHtml(user.name || 'there');
    const isWaitlist = recipients[i].kind === 'waitlist';
    const subject = isWaitlist ? waitlistSubject : signupSubject;
    const bodyLine = isWaitlist
      ? 'A job you were on the waitlist for has been <strong>cancelled</strong>, so no spot was needed:'
      : 'A job you signed up for has been <strong>cancelled</strong>:';
    const bodyTextLine = isWaitlist
      ? 'A job you were waitlisted for has been cancelled — no spot was needed.'
      : 'The following job you signed up for has been cancelled:';
    const html = `<p>Hi ${safeName},</p>
<p>${bodyLine}</p>
<table style="border-collapse:collapse;margin:12px 0">
  <tr><td style="padding:4px 12px 4px 0;color:#666;font-size:14px">Job</td><td style="font-size:14px"><strong>${safeTitle}</strong></td></tr>
  ${dateStr ? `<tr><td style="padding:4px 12px 4px 0;color:#666;font-size:14px">Date</td><td style="font-size:14px">${escapeHtml(dateStr)}${escapeHtml(timeStr)}</td></tr>` : ''}
</table>
<p>No action is needed on your part.</p>
<p><a href="https://churchopshub.com">Open ChurchOpsHub</a> to see other available jobs.</p>
<p style="font-size:13px;color:#666">— ${safeChurch} via ChurchOpsHub</p>`;
    const text = `Hi ${user.name || 'there'},\n\n${bodyTextLine}\n\n${job.title || 'Job'}${dateStr ? '\nDate: ' + dateStr + timeStr : ''}\n\nNo action is needed.\n\n— ${churchName}`;
    return sgMail.send({ to: user.email, from: FROM, subject, html, text });
  }));

  results.forEach((r, i) => { if (r.status === 'rejected') { console.error('sendJobCancelledEmails: email failed', { index: i, reason: r.reason?.message }); Sentry.captureException(r.reason); } });
  const sent = results.filter(r => r.status === 'fulfilled').length;

  // Record send timestamp to prevent re-triggers within 1 hour
  if (sent > 0) {
    await db.doc(`churches/${churchId}/jobListings/${jobDocId}`).update({ cancellationEmailSentAt: new Date().toISOString() }).catch(() => {});
  }

  return { sent };
});

// ── clearCancellationStampOnReopen ────────────────────────────────────────
// F-23/agent from the 2026-05-12 audit. The sendJobCancelledEmails CF stamps
// cancellationEmailSentAt and skips re-sends for 1 hour. If an admin
// cancels → reopens → re-cancels within that window, the stale stamp
// suppresses notifications to NEW signups added in between.
// This trigger clears the stamp whenever a job's status leaves cancelled
// or closed, so the next cancellation pass fires emails for the current
// (possibly different) roster. Bypasses firestore.rules because Admin SDK.
exports.clearCancellationStampOnReopen = onDocumentUpdated('churches/{churchId}/jobListings/{jobId}', async (event) => {
  const before = event.data?.before?.data();
  const after = event.data?.after?.data();
  if (!before || !after) return;
  const wasTerminal = before.status === 'cancelled' || before.status === 'closed';
  const isTerminalNow = after.status === 'cancelled' || after.status === 'closed';
  if (wasTerminal && !isTerminalNow && after.cancellationEmailSentAt) {
    await event.data.after.ref.update({ cancellationEmailSentAt: FieldValue.delete() }).catch((err) => {
      console.error('clearCancellationStampOnReopen: clear failed', err);
      Sentry.captureException(err);
    });
  }
});

// ── sendTaskDueReminders ──────────────────────────────────────────────────
// Runs every morning at 8:00 AM Central time.
// Finds all tasks due today or tomorrow (not Complete/Cancelled) that have assignees,
// and emails each assignee. Respects per-church notification settings.
exports.sendTaskDueReminders = onSchedule({ schedule: '0 8 * * *', timeZone: 'America/Chicago' }, async () => {
  if (!initSendGrid()) { console.warn('sendTaskDueReminders: SendGrid not configured, skipping.'); return; }

  const db = getFirestore();
  const now = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/Chicago' }));
  const pad = n => String(n).padStart(2, '0');
  const todayStr = `${now.getFullYear()}-${pad(now.getMonth()+1)}-${pad(now.getDate())}`;
  const tomorrow = new Date(now); tomorrow.setDate(now.getDate() + 1);
  const tomorrowStr = `${tomorrow.getFullYear()}-${pad(tomorrow.getMonth()+1)}-${pad(tomorrow.getDate())}`;

  // Query all tasks with a dueDate on or before tomorrow (captures overdue + due today + due tomorrow).
  // No lower bound so overdue tasks are included; status check below excludes Complete/Cancelled.
  const snap = await db.collectionGroup('tasks')
    .where('dueDate', '<=', tomorrowStr)
    .get();

  if (snap.empty) return;

  // Filter to active tasks with assignees; group by assignee uid → [taskInfo + taskRef]
  const tasksByAssignee = {}; // uid → [{ taskNumber, name, dueDate, priority, status, churchId, _ref }]
  for (const taskDoc of snap.docs) {
    const task = taskDoc.data();
    if (!task.dueDate) continue;
    if (task.status === 'Complete' || task.status === 'Cancelled') continue;
    if (!task.assignees || task.assignees.length === 0) continue;
    // Idempotency: skip if reminder already sent today
    if (task.lastReminderSentDate === todayStr) continue;
    const churchId = taskDoc.ref.parent.parent.id;
    for (const assignee of task.assignees) {
      if (!assignee.uid) continue;
      if (!tasksByAssignee[assignee.uid]) tasksByAssignee[assignee.uid] = [];
      tasksByAssignee[assignee.uid].push({
        taskNumber: task.taskNumber || '',
        name: task.name || 'Task',
        dueDate: task.dueDate,
        priority: task.priority || 'Medium',
        status: task.status || 'Backlog',
        churchId,
        _ref: taskDoc.ref,
      });
    }
  }

  if (Object.keys(tasksByAssignee).length === 0) return;

  // Fetch user profiles and church notification settings
  const uids = Object.keys(tasksByAssignee);
  const userSnaps = await Promise.all(uids.map(uid => db.doc(`users/${uid}`).get()));

  // Cache notification configs and subscription docs per churchId
  const notifCache = {};
  const subCache2 = {};
  async function notifEnabled(churchId) {
    if (notifCache[churchId] !== undefined) return notifCache[churchId];
    try {
      const s = await db.doc(`churches/${churchId}/config/notifications`).get();
      // F-14: default-on. Treat missing doc as enabled; only explicit false disables.
      notifCache[churchId] = !s.exists || s.data()?.enabled !== false;
    } catch { notifCache[churchId] = true; }
    return notifCache[churchId];
  }
  async function churchHasTasksHub(churchId) {
    if (subCache2[churchId] !== undefined) return subCache2[churchId];
    try {
      const s = await db.doc(`churches/${churchId}/config/subscription`).get();
      subCache2[churchId] = subHasHub(s.data() || {}, 'tasks');
    } catch { subCache2[churchId] = false; }
    return subCache2[churchId];
  }

  const emailTasks = [];
  const emailTaskRefs = []; // parallel to emailTasks: task refs included in each send
  for (const userSnap of userSnaps) {
    if (!userSnap.exists) continue;
    const user = userSnap.data();
    if (!user.email || user.active === false) continue;
    // Respect per-user hub access; F-21 helper treats admin/missing-array as access.
    if (!effectiveHasHub(user, 'tasks')) continue;

    // Only send tasks belonging to the user's own church
    const tasks = (tasksByAssignee[userSnap.id] || []).filter(t => t.churchId === user.churchId);
    if (tasks.length === 0) continue;
    if (!(await churchHasTasksHub(user.churchId))) continue;
    if (!(await notifEnabled(user.churchId))) continue;

    const safeName = escapeHtml(user.name || 'there');
    const dueToday = tasks.filter(t => t.dueDate === todayStr);
    const dueTomorrow = tasks.filter(t => t.dueDate === tomorrowStr);

    const subject = tasks.length === 1
      ? `Task Reminder: "${tasks[0].name}" due ${tasks[0].dueDate === todayStr ? 'today' : 'tomorrow'}`
      : `Task Reminder: ${tasks.length} tasks due soon`;

    const taskRow = t => {
      const when = t.dueDate === todayStr ? '<strong style="color:#DC2626">Today</strong>' : 'Tomorrow';
      return `<li style="margin-bottom:8px">${when} — <strong>${escapeHtml(t.name)}</strong> <span style="font-size:12px;color:#888">(${escapeHtml(t.taskNumber)} · ${escapeHtml(t.priority)} · ${escapeHtml(t.status)})</span></li>`;
    };

    const allRows = [...dueToday, ...dueTomorrow].map(taskRow).join('');
    const html = `<p>Hi ${safeName},</p>
<p>You have task${tasks.length !== 1 ? 's' : ''} coming due:</p>
<ul style="padding-left:20px;margin:12px 0">${allRows}</ul>
<p><a href="https://churchopshub.com">Open ChurchOpsHub</a> to view and update your tasks.</p>`;

    const textRows = [...dueToday, ...dueTomorrow].map(t =>
      `• ${t.dueDate === todayStr ? 'TODAY' : 'Tomorrow'} — ${t.name} (${t.taskNumber}, ${t.priority})`
    ).join('\n');
    const text = `Hi ${user.name || 'there'},\n\nYou have tasks coming due:\n\n${textRows}\n\nLog in at churchopshub.com to view your tasks.\n`;

    emailTasks.push(sgMail.send({ to: user.email, from: FROM, subject, html, text }));
    emailTaskRefs.push(tasks.map(t => t._ref));
  }

  const results = await Promise.allSettled(emailTasks);
  results.forEach((r, i) => {
    if (r.status === 'rejected') { console.error('sendTaskDueReminders: email failed', { index: i, reason: r.reason?.message }); Sentry.captureException(r.reason); }
  });

  // Only stamp tasks for which at least one email was successfully sent
  const refsToStamp = new Set();
  results.forEach((r, i) => {
    if (r.status === 'fulfilled') emailTaskRefs[i].forEach(ref => refsToStamp.add(ref));
  });
  if (refsToStamp.size > 0) {
    const markBatch = db.batch();
    refsToStamp.forEach(ref => markBatch.update(ref, { lastReminderSentDate: todayStr }));
    await markBatch.commit();
  }
});

// ── closePastJobs ─────────────────────────────────────────────────────────
// Runs daily at 2:00 AM Central time. Flips any `open` job whose
// scheduledDate is strictly before today to `completed`. Without this,
// past-but-unfinished jobs stay in the "Open" filter forever and members
// can still attempt to sign up (Jobs Hub audit, 2026-05-06 #7).
exports.closePastJobs = onSchedule({ schedule: '0 2 * * *', timeZone: 'America/Chicago' }, async () => {
  const db = getFirestore();
  const today = (() => {
    const d = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/Chicago' }));
    return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
  })();

  let total = 0;
  const cgSnap = await db.collectionGroup('jobListings')
    .where('status', '==', 'open')
    .where('scheduledDate', '<', today)
    .get();
  if (cgSnap.empty) {
    console.log('closePastJobs: nothing to close.');
    return;
  }

  // Batch in chunks of 400 to stay under the 500-write limit.
  const docs = cgSnap.docs;
  for (let i = 0; i < docs.length; i += 400) {
    const chunk = docs.slice(i, i + 400);
    const batch = db.batch();
    chunk.forEach((d) => {
      batch.update(d.ref, { status: 'completed', updatedAt: new Date().toISOString() });
    });
    await batch.commit();
    total += chunk.length;
  }
  console.log(`closePastJobs: closed ${total} past jobs.`);
});

// ── sendJobReminders ──────────────────────────────────────────────────────
// Runs every morning at 8:00 AM Central time.
// Finds all jobs scheduled for today across all churches and emails each signup.
exports.sendJobReminders = onSchedule({ schedule: '0 8 * * *', timeZone: 'America/Chicago' }, async () => {
  if (!initSendGrid()) { console.warn('sendJobReminders: SendGrid not configured, skipping.'); return; }

  const db = getFirestore();
  const today = (() => {
    const d = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/Chicago' }));
    return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
  })();

  // Collection group query across all churches (requires composite index in firestore.indexes.json)
  const snap = await db.collectionGroup('jobListings')
    .where('scheduledDate', '==', today)
    .where('status', '==', 'open')
    .get();

  if (snap.empty) return;

  // Cache subscription and notification docs per churchId to avoid N+1 reads
  const subCache = {};
  const notifCache2 = {};
  async function churchHasJobsHub(churchId) {
    if (subCache[churchId] !== undefined) return subCache[churchId];
    try {
      const s = await db.doc(`churches/${churchId}/config/subscription`).get();
      const sub = s.data() || {};
      subCache[churchId] = subHasHub(sub, 'jobs');
    } catch { subCache[churchId] = false; }
    return subCache[churchId];
  }
  async function jobNotifEnabled(churchId) {
    if (notifCache2[churchId] !== undefined) return notifCache2[churchId];
    try {
      const s = await db.doc(`churches/${churchId}/config/notifications`).get();
      // F-14: default-on. Treat missing doc as enabled; only explicit false disables.
      notifCache2[churchId] = !s.exists || s.data()?.enabled !== false;
    } catch { notifCache2[churchId] = true; }
    return notifCache2[churchId];
  }

  // Gather all unique user UIDs that need reminders, skipping churches without the Jobs hub
  // and skipping jobs where a reminder was already sent today (idempotency)
  const remindersByUid = {}; // uid → [{ jobTitle, scheduledTime, location, pay, churchId }]
  const jobsToMark = []; // [{ ref }] — jobs to stamp lastReminderSentDate after successful sends
  for (const jobDoc of snap.docs) {
    const job = jobDoc.data();
    const churchId = jobDoc.ref.parent.parent.id;

    // Skip if this church doesn't have the Jobs hub active
    if (!(await churchHasJobsHub(churchId))) continue;
    // F-04: skip if church has disabled notifications
    if (!(await jobNotifEnabled(churchId))) continue;

    // Idempotency: skip if reminder already sent today (guards against cron retry / redeploy)
    if (job.lastReminderSentDate === today) continue;

    jobsToMark.push(jobDoc.ref);

    for (const signup of (job.signups || [])) {
      if (!signup.uid) continue;
      if (!remindersByUid[signup.uid]) remindersByUid[signup.uid] = [];
      remindersByUid[signup.uid].push({
        title: job.title || 'Job',
        scheduledTime: job.scheduledTime || '',
        location: job.location || '',
        pay: job.pay != null ? `$${Number(job.pay).toFixed(2)} per person` : null,
        churchId,
        _ref: jobDoc.ref,
      });
    }
  }

  if (Object.keys(remindersByUid).length === 0) return;

  // Fetch user profiles for all UIDs
  const userSnaps = await Promise.all(
    Object.keys(remindersByUid).map(uid => db.doc(`users/${uid}`).get())
  );

  // Track per-job send results so we only stamp jobs where at least one email succeeded (F-07)
  const jobsWithSuccesses = new Set(); // job refs that had at least one fulfilled send
  const emailTasks = [];
  const emailJobRefs = []; // parallel to emailTasks: the job ref for each send
  for (const userSnap of userSnaps) {
    if (!userSnap.exists) continue;
    const user = userSnap.data();
    if (!user.email || user.active === false) continue;
    // Respect per-user hub access; F-21 helper treats admin/missing-array as access.
    if (!effectiveHasHub(user, 'jobs')) continue;
    // Only send jobs that belong to the user's own church
    const jobs = (remindersByUid[userSnap.id] || []).filter(j => j.churchId === user.churchId);
    if (jobs.length === 0) continue;
    const safeName = escapeHtml(user.name || 'there');

    const jobRows = jobs.map(j => {
      const timeStr = j.scheduledTime ? ` at ${escapeHtml(j.scheduledTime)}` : '';
      const locStr = j.location ? `<br><span style="font-size:13px;color:#666">📍 ${escapeHtml(j.location)}</span>` : '';
      const payStr = j.pay ? `<br><span style="font-size:13px;color:#16A34A">💵 ${escapeHtml(j.pay)}</span>` : '';
      return `<li style="margin-bottom:8px"><strong>${escapeHtml(j.title)}</strong>${timeStr}${locStr}${payStr}</li>`;
    }).join('');

    const subject = jobs.length === 1
      ? `Reminder: "${jobs[0].title}" is today`
      : `Reminder: You have ${jobs.length} jobs scheduled today`;

    const html = `<p>Hi ${safeName},</p>
<p>Just a reminder — you're signed up for the following job${jobs.length !== 1 ? 's' : ''} today:</p>
<ul style="padding-left:20px;margin:12px 0">${jobRows}</ul>
<p><a href="https://churchopshub.com">Open ChurchOpsHub</a> to view details or withdraw.</p>`;

    const text = `Hi ${user.name || 'there'},\n\nReminder — you're signed up for the following job${jobs.length !== 1 ? 's' : ''} today:\n\n${jobs.map(j => `• ${j.title}${j.scheduledTime ? ' at ' + j.scheduledTime : ''}${j.location ? ' — ' + j.location : ''}`).join('\n')}\n\nLog in at churchopshub.com to view details.\n`;

    emailTasks.push(sgMail.send({ to: user.email, from: FROM, subject, html, text }));
    // Each user's jobs come from multiple job refs — record all their refs for this send
    emailJobRefs.push(jobs.map(j => j._ref));
  }

  const results = await Promise.allSettled(emailTasks);
  results.forEach((r, i) => {
    if (r.status === 'rejected') {
      console.error('sendJobReminders: email failed', { index: i, reason: r.reason?.message });
      Sentry.captureException(r.reason);
    } else {
      // At least one email succeeded for these jobs — mark them for stamping
      emailJobRefs[i].forEach(ref => jobsWithSuccesses.add(ref));
    }
  });

  // SMS reminders — sent to opted-in users alongside email (independent channel)
  const tw = getTwilioClient();
  if (tw && TWILIO_FROM) {
    const smsTasks = [];
    for (const userSnap of userSnaps) {
      if (!userSnap.exists) continue;
      const user = userSnap.data();
      if (!user.phone || !user.smsRemindersEnabled || user.active === false) continue;
      // F-21 helper treats admin/missing-array as access.
      if (!effectiveHasHub(user, 'jobs')) continue;
      const jobs = (remindersByUid[userSnap.id] || []).filter(j => j.churchId === user.churchId);
      if (jobs.length === 0) continue;
      const jobLines = jobs.map(j => `- ${j.title}${j.scheduledTime ? ' at ' + j.scheduledTime : ''}${j.location ? ' - ' + j.location : ''}`).join('\n');
      const body = jobs.length === 1
        ? `ChurchOpsHub: Reminder - you're signed up for "${jobs[0].title}" today${jobs[0].scheduledTime ? ' at ' + jobs[0].scheduledTime : ''}${jobs[0].location ? ' @ ' + jobs[0].location : ''}. Reply STOP to opt out.`
        : `ChurchOpsHub: Reminder - you have ${jobs.length} jobs today:\n${jobLines}\n\nReply STOP to opt out.`;
      smsTasks.push(
        tw.messages.create({ to: user.phone, from: TWILIO_FROM, body })
          .catch(err => { console.error('sendJobReminders: SMS failed', { uid: userSnap.id, err: err?.message }); Sentry.captureException(err); })
      );
    }
    if (smsTasks.length > 0) await Promise.allSettled(smsTasks);
  }

  // Only stamp jobs where at least one email was successfully sent (F-07)
  await Promise.allSettled([...jobsWithSuccesses].map(ref => ref.update({ lastReminderSentDate: today })));
});

// ── sendJobPosterNotification ─────────────────────────────────────────────
// Called on member withdrawal, admin removal, or co-admin cancellation. Emails the job poster + delegates.
// data: { churchId, jobDocId, event: 'withdrawal'|'admin_removal'|'cancellation', actorUid, actorName, removedName? }
exports.sendJobPosterNotification = onCall({ cors: true }, async (req) => {
  if (!req.auth) throw new HttpsError('unauthenticated', 'Must be signed in.');
  if (!initSendGrid()) return { sent: 0 };

  const { churchId, jobDocId, event, actorUid, actorName, removedName } = req.data;
  if (!churchId || !jobDocId || !event) return { sent: 0 };

  const db = getFirestore();

  const callerSnap = await db.doc(`users/${req.auth.uid}`).get();
  if (!callerSnap.exists || callerSnap.data().churchId !== churchId) {
    throw new HttpsError('permission-denied', 'Not a member of this church.');
  }

  const [notifSnap, subSnap] = await Promise.all([
    db.doc(`churches/${churchId}/config/notifications`).get(),
    db.doc(`churches/${churchId}/config/subscription`).get(),
  ]);
  // F-14: default-on. Treat missing doc as enabled; only explicit false disables.
  if (notifSnap.exists && notifSnap.data()?.enabled === false) return { sent: 0 };
  if (!subHasHub(subSnap.data() || {}, 'jobs')) return { sent: 0 };

  // F-15: read the 30-second double-fire guard AND stamp the timestamp inside
  // the same transaction so two near-simultaneous calls can't both pass the
  // guard. Trade-off: if the function crashes between the stamp and the
  // SendGrid calls, the next 30 seconds of legit retries are suppressed — a
  // single dropped notification window is preferable to double-emailing.
  const actorKey = actorUid || 'unknown';
  const jobRef = db.doc(`churches/${churchId}/jobListings/${jobDocId}`);
  let job = null;
  let guardSkipped = false;
  try {
    await db.runTransaction(async (t) => {
      const snap = await t.get(jobRef);
      if (!snap.exists) return;
      const data = snap.data();
      // Skip self-notification (poster is also the actor)
      if (actorUid === data.createdBy) { job = null; return; }
      const lastNotif = (data.lastPosterNotifiedByActors || {})[actorKey];
      if (lastNotif && Date.now() - new Date(lastNotif).getTime() < 30 * 1000) {
        guardSkipped = true;
        return;
      }
      // Stamp now, before send. If sends fail, the next retry within 30s
      // will be suppressed by this stamp; that's the F-15 trade-off.
      t.update(snap.ref, { [`lastPosterNotifiedByActors.${actorKey}`]: new Date().toISOString() });
      job = data;
    });
  } catch (err) {
    console.error('sendJobPosterNotification: guard transaction failed', err);
    Sentry.captureException(err);
    return { sent: 0, error: 'guard-failed' };
  }
  if (guardSkipped) return { sent: 0, skipped: true };
  if (!job) return { sent: 0 };

  const posterSnap = await db.doc(`users/${job.createdBy}`).get();
  if (!posterSnap.exists) return { sent: 0 };
  const poster = posterSnap.data();
  if (!poster.email || poster.active === false) return { sent: 0 };

  // Load and validate delegates from the poster's profile at send-time
  const delegateEntries = poster.jobPosterDelegates || [];
  const delegateSnaps = delegateEntries.length > 0
    ? await Promise.all(delegateEntries.map(d => db.doc(`users/${d.uid}`).get()))
    : [];
  const delegateUsers = delegateSnaps
    .filter(s => s.exists)
    .map(s => s.data())
    .filter(u => u.email && u.active !== false && ['admin', 'manager'].includes(u.role) && u.churchId === churchId);

  // Per-job lead override: also notify the designated job lead if different from poster/actor
  let jobLeadUser = null;
  const jobLeadUid = job.jobLead?.uid;
  if (jobLeadUid && jobLeadUid !== job.createdBy && jobLeadUid !== actorUid) {
    const jobLeadSnap = await db.doc(`users/${jobLeadUid}`).get();
    if (jobLeadSnap.exists) {
      const jld = jobLeadSnap.data();
      if (jld.email && jld.active !== false && jld.churchId === churchId) {
        jobLeadUser = jld;
      }
    }
  }

  const churchSnap = await db.doc(`churches/${churchId}/config/main`).get();
  const churchName = churchSnap.data()?.churchName || 'Your Church';
  const safeChurch = escapeHtml(churchName);
  const safeJobTitle = escapeHtml(job.title || 'Job');
  const safeActor = escapeHtml(actorName || 'Someone');
  const safeRemoved = escapeHtml(removedName || 'Someone');
  const dateStr = job.scheduledDate ? escapeHtml(job.scheduledDate) : '';
  const timeStr = job.scheduledTime ? ` at ${escapeHtml(job.scheduledTime)}` : '';
  const filled = (job.signups || []).length;
  const total = job.spotsTotal || 1;

  let subject, bodyHtml, bodyText;
  if (event === 'withdrawal') {
    subject = `[Job Hub] ${actorName || 'Someone'} withdrew from "${job.title || 'Job'}"`;
    bodyHtml = `<p>Hi,</p>
<p><strong>${safeActor}</strong> has withdrawn from a job you posted:</p>
<div style="background:#f5f5f5;border-left:4px solid #0D9488;padding:12px 16px;margin:12px 0;border-radius:4px">
  <p style="font-weight:700;margin:0 0 6px;font-size:15px">${safeJobTitle}</p>
  ${dateStr ? `<p style="margin:0 0 4px;font-size:14px;color:#666">${dateStr}${timeStr}</p>` : ''}
  <p style="margin:0;font-size:14px">Spots filled: <strong>${filled}/${total}</strong></p>
</div>
<p><a href="https://churchopshub.com">Open ChurchOpsHub</a> to manage signups.</p>
<p style="font-size:13px;color:#666">— ${safeChurch} via ChurchOpsHub</p>`;
    bodyText = `${actorName || 'Someone'} withdrew from "${job.title || 'Job'}".\n\nSpots filled: ${filled}/${total}\n\nOpen ChurchOpsHub to manage signups.\n\n— ${churchName}`;
  } else if (event === 'admin_removal') {
    subject = `[Job Hub] ${actorName || 'An admin'} removed a signup from "${job.title || 'Job'}"`;
    bodyHtml = `<p>Hi,</p>
<p><strong>${safeActor}</strong> has removed <strong>${safeRemoved}</strong> from a job you posted:</p>
<div style="background:#f5f5f5;border-left:4px solid #F59E42;padding:12px 16px;margin:12px 0;border-radius:4px">
  <p style="font-weight:700;margin:0 0 6px;font-size:15px">${safeJobTitle}</p>
  ${dateStr ? `<p style="margin:0 0 4px;font-size:14px;color:#666">${dateStr}${timeStr}</p>` : ''}
  <p style="margin:0;font-size:14px">Spots filled: <strong>${filled}/${total}</strong></p>
</div>
<p><a href="https://churchopshub.com">Open ChurchOpsHub</a> to manage signups.</p>
<p style="font-size:13px;color:#666">— ${safeChurch} via ChurchOpsHub</p>`;
    bodyText = `${actorName || 'An admin'} removed ${removedName || 'someone'} from "${job.title || 'Job'}".\n\nSpots filled: ${filled}/${total}\n\nOpen ChurchOpsHub to manage signups.\n\n— ${churchName}`;
  } else {
    subject = `[Job Hub] Your job "${job.title || 'Job'}" was cancelled`;
    bodyHtml = `<p>Hi,</p>
<p>A job you posted has been <strong>cancelled</strong> by <strong>${safeActor}</strong>:</p>
<div style="background:#f5f5f5;border-left:4px solid #EF4444;padding:12px 16px;margin:12px 0;border-radius:4px">
  <p style="font-weight:700;margin:0 0 6px;font-size:15px">${safeJobTitle}</p>
  ${dateStr ? `<p style="margin:0;font-size:14px;color:#666">${dateStr}${timeStr}</p>` : ''}
</div>
<p><a href="https://churchopshub.com">Open ChurchOpsHub</a> for details.</p>
<p style="font-size:13px;color:#666">— ${safeChurch} via ChurchOpsHub</p>`;
    bodyText = `Your job "${job.title || 'Job'}" was cancelled by ${actorName || 'someone'}.\n\nOpen ChurchOpsHub for details.\n\n— ${churchName}`;
  }

  const seenEmails = new Set();
  const allNotifyRecipients = [poster, ...delegateUsers, ...(jobLeadUser ? [jobLeadUser] : [])];
  const recipients = allNotifyRecipients.filter(u => { if (seenEmails.has(u.email)) return false; seenEmails.add(u.email); return true; });
  const results = await Promise.allSettled(
    recipients.map(u => sgMail.send({ to: u.email, from: FROM, subject, html: bodyHtml, text: bodyText }))
  );
  results.forEach((r, i) => { if (r.status === 'rejected') { console.error('sendJobPosterNotification: failed', { index: i, reason: r.reason?.message }); Sentry.captureException(r.reason); } });
  // Timestamp already stamped pre-send inside the F-15 transaction.
  return { sent: results.filter(r => r.status === 'fulfilled').length };
});

// ── promoteFromWaitlist ───────────────────────────────────────────────────
// Called after a signup withdrawal. Atomically promotes the first waitlist
// entry to signups, then sends that person a promotion email.
// data: { churchId, jobDocId }
exports.promoteFromWaitlist = onCall({ cors: true }, async (req) => {
  if (!req.auth) throw new HttpsError('unauthenticated', 'Must be signed in.');
  const { churchId, jobDocId } = req.data;
  if (!churchId || !jobDocId) return { promoted: false };

  const db = getFirestore();

  const callerSnap = await db.doc(`users/${req.auth.uid}`).get();
  if (!callerSnap.exists || callerSnap.data().churchId !== churchId) {
    throw new HttpsError('permission-denied', 'Not a member of this church.');
  }

  // F-17: gate on subscription BEFORE running the promotion transaction.
  // Previously we promoted, then bailed silently if the sub had lapsed —
  // moving the volunteer to signups[] without any email. If the hub is
  // gone, the volunteer can't even see the job, so don't promote at all.
  const subSnapEarly = await db.doc(`churches/${churchId}/config/subscription`).get();
  if (!subHasHub(subSnapEarly.data() || {}, 'jobs')) return { promoted: false, reason: 'hub-inactive' };

  const jobRef = db.doc(`churches/${churchId}/jobListings/${jobDocId}`);
  let promotedUser = null;
  let jobData = null;

  // Pre-read job once to know if compliance pre-fetch is needed.
  const preSnap = await jobRef.get();
  if (!preSnap.exists) return { promoted: false };
  const preData = preSnap.data();
  if (preData.status !== 'open') return { promoted: false };
  const requiredTypes = preData.requiredAccessTypes || [];

  // If compliance gating is on, fetch the church's accessPeople + accessRecords
  // once so we can re-validate each waitlisted user before promotion.
  let accessPeople = [];
  let accessRecords = [];
  if (requiredTypes.length > 0) {
    const [peopleSnap, recordsSnap] = await Promise.all([
      db.collection(`churches/${churchId}/accessPeople`).get(),
      db.collection(`churches/${churchId}/accessRecords`).get(),
    ]);
    accessPeople = peopleSnap.docs.map(d => ({ _docId: d.id, ...d.data() }));
    accessRecords = recordsSnap.docs.map(d => ({ _docId: d.id, ...d.data() }));
  }
  const todayS = new Date().toISOString().slice(0, 10);
  const isEligible = (uid) => {
    if (requiredTypes.length === 0) return true;
    const linkedIds = new Set(accessPeople.filter(p => p.userId === uid).map(p => p._docId));
    if (linkedIds.size === 0) return false;
    const myRecords = accessRecords.filter(r => linkedIds.has(r.personId));
    return requiredTypes.every(reqType =>
      myRecords.some(r => r.type === reqType && (!r.expiryDate || r.expiryDate >= todayS))
    );
  };

  await db.runTransaction(async (t) => {
    const snap = await t.get(jobRef);
    if (!snap.exists) return;
    const data = snap.data();
    if (data.status !== 'open') return;
    const waitlist = data.waitlist || [];
    const signups = data.signups || [];
    if (waitlist.length === 0) return;
    if (signups.length >= (data.spotsTotal || 1)) return;
    const idx = waitlist.findIndex(w => isEligible(w.uid));
    if (idx === -1) return;
    const promoted = waitlist[idx];
    const newWaitlist = waitlist.filter((_, i) => i !== idx);
    promotedUser = promoted;
    jobData = data;
    const promotedSignup = {
      uid: promoted.uid,
      name: promoted.name,
      signedUpAt: promoted.addedAt || new Date().toISOString(),
    };
    // Carry waiver acknowledgement forward from the waitlist entry so the
    // audit trail survives promotion (Jobs Hub audit, 2026-05-06 #6).
    if (promoted.acknowledgedWaiverAt) promotedSignup.acknowledgedWaiverAt = promoted.acknowledgedWaiverAt;
    t.update(jobRef, {
      signups: [...signups, promotedSignup],
      waitlist: newWaitlist,
      updatedAt: new Date().toISOString()
    });
  });

  if (!promotedUser) return { promoted: false };
  if (!initSendGrid()) return { promoted: true, promotedName: promotedUser.name };

  // Sub already verified pre-transaction (F-17). Skip the redundant re-check.
  const [churchSnap, userSnap] = await Promise.all([
    db.doc(`churches/${churchId}/config/main`).get(),
    db.doc(`users/${promotedUser.uid}`).get(),
  ]);

  // The promotion email is transactional ("you're now signed up"), not a
  // marketing notification. Don't gate it on the church-wide notifications
  // toggle — recipients need to know they took a confirmed spot.
  const user = userSnap.data();
  if (!user?.email || user.active === false || user.churchId !== churchId) return { promoted: true };
  // F-21 helper treats admin/missing-array as access.
  if (!effectiveHasHub(user, 'jobs')) return { promoted: true };

  const churchName = churchSnap.data()?.churchName || 'Your Church';
  const safeTitle = escapeHtml(jobData?.title || 'Job');
  const safeName = escapeHtml(user.name || 'there');
  const safeChurch = escapeHtml(churchName);
  const dateStr = jobData?.scheduledDate || '';
  const timeStr = jobData?.scheduledTime ? ` at ${jobData.scheduledTime}` : '';
  const subject = `You're off the waitlist: ${jobData?.title || 'Job'}`;
  const html = `<p>Hi ${safeName},</p>
<p>Great news! A spot has opened up and you've been moved off the waitlist for:</p>
<table style="border-collapse:collapse;margin:12px 0">
  <tr><td style="padding:4px 12px 4px 0;color:#666;font-size:14px">Job</td><td style="font-size:14px"><strong>${safeTitle}</strong></td></tr>
  ${dateStr ? `<tr><td style="padding:4px 12px 4px 0;color:#666;font-size:14px">Date</td><td style="font-size:14px">${escapeHtml(dateStr)}${escapeHtml(timeStr)}</td></tr>` : ''}
</table>
<p>You're now officially signed up! <a href="https://churchopshub.com">Open ChurchOpsHub</a> to view the details.</p>
<p style="font-size:13px;color:#666">— ${safeChurch} via ChurchOpsHub</p>`;
  const text = `Hi ${user.name || 'there'},\n\nGreat news! A spot opened up for:\n\n${jobData?.title || 'Job'}${dateStr ? '\nDate: ' + dateStr + timeStr : ''}\n\nYou're now signed up.\n\n— ${churchName}`;

  try {
    await sgMail.send({ to: user.email, from: FROM, subject, html, text });
  } catch (err) {
    console.error('promoteFromWaitlist: email failed', err?.message);
    Sentry.captureException(err);
  }
  return { promoted: true, promotedName: promotedUser.name };
});

// ── sendTaskMentionEmail ──────────────────────────────────────────────────
// Called when a comment with @-mentions is posted on a task.
exports.sendTaskMentionEmail = onCall({ cors: true }, async (req) => {
  const { churchId, taskNumber, taskName, commentText, mentionedUids, commentAuthorName } = req.data;
  const uid = req.auth?.uid;
  if (!uid || !churchId) throw new HttpsError('invalid-argument', 'Auth and churchId required');
  if (!initSendGrid()) return { sent: 0 };

  const db = getFirestore();
  // C-03 from overnight audit: verify caller is actually a member of the
  // churchId they're acting on. Previously any authenticated user could
  // call this CF with any churchId, enabling cross-tenant spam under the
  // ChurchOpsHub sender brand. Pattern matches sendJobCancelledEmails:844.
  const callerSnap = await db.doc(`users/${uid}`).get();
  if (!callerSnap.exists || callerSnap.data().churchId !== churchId) {
    throw new HttpsError('permission-denied', 'Not a member of this church.');
  }

  const [notifSnap, subSnap, churchSnap] = await Promise.all([
    db.doc(`churches/${churchId}/config/notifications`).get(),
    db.doc(`churches/${churchId}/config/subscription`).get(),
    db.doc(`churches/${churchId}/config/main`).get(),
  ]);
  // F-14: default-on. Treat missing doc as enabled; only explicit false disables.
  if (notifSnap.exists && notifSnap.data()?.enabled === false) return { sent: 0 };
  if (!subHasHub(subSnap.data(), 'tasks')) return { sent: 0 };

  const churchName = escapeHtml(churchSnap.data()?.churchName || 'Your Church');
  const safeAuthor = escapeHtml(commentAuthorName || 'Someone');
  const safeTaskNum = escapeHtml(taskNumber || '');
  const safeTaskName = escapeHtml(taskName || '');
  const safeComment = escapeHtml((commentText || '').substring(0, 500));

  let sent = 0;
  for (const mentionedUid of (mentionedUids || [])) {
    if (mentionedUid === uid) continue;
    try {
      const userSnap = await db.doc(`users/${mentionedUid}`).get();
      const user = userSnap.data();
      if (!user?.email || user.active === false) continue;
      // C-03: only mention users who are members of THIS church.
      if (user.churchId !== churchId) continue;
      // F-21 helper treats admin/missing-array as access.
      if (!effectiveHasHub(user, 'tasks')) continue;

      const safeName = escapeHtml(user.name || 'there');
      const subject = `${commentAuthorName || 'Someone'} mentioned you in ${taskNumber || 'a task'}`;
      const html = `<p>Hi ${safeName},</p>
<p><strong>${safeAuthor}</strong> mentioned you in a comment on task <strong>${safeTaskNum} — ${safeTaskName}</strong>:</p>
<blockquote style="border-left:3px solid #2A7D6E;margin:12px 0;padding:8px 12px;background:#f8f8f8;font-size:14px">${safeComment}</blockquote>
<p><a href="https://churchopshub.com">Open ChurchOpsHub</a> to view and reply.</p>
<p style="font-size:13px;color:#666">— ${churchName} via ChurchOpsHub</p>`;
      // F-30 from the 2026-05-12 audit: include a plain-text MIME part.
      // HTML-only emails get a spam-score penalty from Gmail/Outlook.
      const text = `Hi ${user.name || 'there'},\n\n${commentAuthorName || 'Someone'} mentioned you in a comment on task ${taskNumber || ''} — ${taskName || ''}:\n\n${(commentText || '').substring(0, 500)}\n\nOpen churchopshub.com to view and reply.\n\n— ${churchName}`;
      await sgMail.send({ to: user.email, from: FROM, subject, html, text });
      sent++;
    } catch (err) {
      console.error('sendTaskMentionEmail: failed for', mentionedUid, err?.message);
      Sentry.captureException(err);
    }
  }
  return { sent };
});

// ── generateRecurringTemplateTasks ────────────────────────────────────────
// Runs daily at 8am Central. Creates tasks from templates with autoGenerate enabled.
exports.generateRecurringTemplateTasks = onSchedule({ schedule: '0 8 * * *', timeZone: 'America/Chicago' }, async () => {
  const db = getFirestore();
  const now = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/Chicago' }));
  const pad = n => String(n).padStart(2, '0');
  const todayStr = `${now.getFullYear()}-${pad(now.getMonth()+1)}-${pad(now.getDate())}`;

  // Single-field query; date filter applied in code to avoid composite index requirement
  const snap = await db.collectionGroup('taskTemplates').where('autoGenerate', '==', true).get();
  if (snap.empty) return;

  const due = snap.docs.filter(d => {
    const t = d.data();
    return t.autoGenerateNextAt && t.autoGenerateNextAt <= todayStr;
  });
  if (!due.length) return;

  const subCache = {};
  async function churchHasTasksHub(churchId) {
    if (subCache[churchId] !== undefined) return subCache[churchId];
    try {
      const s = await db.doc(`churches/${churchId}/config/subscription`).get();
      subCache[churchId] = subHasHub(s.data() || {}, 'tasks');
    } catch { subCache[churchId] = false; }
    return subCache[churchId];
  }

  function advanceDate(dateStr, freq) {
    const base = new Date(dateStr + 'T12:00:00');
    if (freq === 'weekly') { base.setDate(base.getDate() + 7); }
    else if (freq === 'biweekly') { base.setDate(base.getDate() + 14); }
    else if (freq === 'monthly') { const d = base.getDate(); base.setDate(1); base.setMonth(base.getMonth() + 1); base.setDate(Math.min(d, new Date(base.getFullYear(), base.getMonth() + 1, 0).getDate())); }
    else if (freq === 'quarterly') { const d = base.getDate(); base.setDate(1); base.setMonth(base.getMonth() + 3); base.setDate(Math.min(d, new Date(base.getFullYear(), base.getMonth() + 1, 0).getDate())); }
    else if (freq === 'annually') { const d = base.getDate(); base.setDate(1); base.setFullYear(base.getFullYear() + 1); base.setDate(Math.min(d, new Date(base.getFullYear(), base.getMonth() + 1, 0).getDate())); }
    return `${base.getFullYear()}-${pad(base.getMonth()+1)}-${pad(base.getDate())}`;
  }

  for (const templateDoc of due) {
    const template = templateDoc.data();
    const churchId = templateDoc.ref.parent.parent.id;
    if (!await churchHasTasksHub(churchId)) continue;

    try {
      const configRef = db.doc(`churches/${churchId}/config/main`);
      const newTaskRef = db.collection(`churches/${churchId}/tasks`).doc();
      let taskNumber;
      const nextDate = template.autoGenerateFrequency ? advanceDate(todayStr, template.autoGenerateFrequency) : todayStr;

      // F-RC-6 from the 2026-05-12 audit: the template's autoGenerateNextAt
      // advance used to happen AFTER the task-creation transaction committed.
      // A cron retry between the commit and the template update would re-fire
      // the function, find the template still "due", and create a duplicate
      // task. Move both writes into one transaction so the next-due cursor
      // advances atomically with task creation.
      await db.runTransaction(async (t) => {
        const configSnap = await t.get(configRef);
        const maxNum = (configSnap.data()?.maxTaskNumber || 0) + 1;
        taskNumber = 'TSK-' + String(maxNum).padStart(3, '0');
        t.set(configRef, { maxTaskNumber: maxNum }, { merge: true });
        t.set(newTaskRef, {
          name: template.name || 'Recurring Task',
          description: template.description || '',
          priority: template.priority || 'Medium',
          status: 'Backlog',
          tags: template.tags || [],
          dueDate: todayStr,
          recurrence: template.autoGenerateFrequency || null,
          assignees: template.assignees || [],
          checklist: (template.checklist || []).map(i => ({ ...i, done: false })),
          notes: template.notes || null,
          photos: [],
          visibility: template.visibility || 'team',
          sharedWith: template.sharedWith || [],
          completedAt: null,
          linkedItemDocId: null,
          linkedTicketDocId: null,
          ministry: template.ministry || null,
          sourceTemplateId: templateDoc.id,
          taskNumber,
          createdBy: 'system',
          createdByName: 'Auto-generated',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        });
        t.update(templateDoc.ref, { autoGenerateNextAt: nextDate, lastGeneratedAt: todayStr });
      });

      console.log(`generateRecurringTemplateTasks: created ${taskNumber} for church ${churchId}`);
    } catch (err) {
      console.error(`generateRecurringTemplateTasks: failed for church ${churchId} template ${templateDoc.id}`, err?.message);
      Sentry.captureException(err);
    }
  }

  // Auto-advance weekly announcements whose expiresAt has passed
  try {
    const annSnap = await db.collectionGroup('jobAnnouncements').where('repeatWeekly', '==', true).get();
    const jobsSubCache = {};
    async function churchHasJobsHub(churchId) {
      if (jobsSubCache[churchId] !== undefined) return jobsSubCache[churchId];
      try {
        const s = await db.doc(`churches/${churchId}/config/subscription`).get();
        jobsSubCache[churchId] = subHasHub(s.data() || {}, 'jobs');
      } catch { jobsSubCache[churchId] = false; }
      return jobsSubCache[churchId];
    }
    for (const annDoc of annSnap.docs) {
      const ann = annDoc.data();
      if (!ann.expiresAt || ann.expiresAt <= todayStr) {
        const churchId = annDoc.ref.parent.parent.id;
        if (!await churchHasJobsHub(churchId)) continue;
        await annDoc.ref.update({ expiresAt: advanceDate(todayStr, 'weekly') });
      }
    }
  } catch (err) {
    console.error('generateRecurringTemplateTasks: announcement sweep failed', err?.message);
    Sentry.captureException(err);
  }
});

// ── twilioInbound ─────────────────────────────────────────────────────────
// Twilio inbound SMS webhook. Syncs users.smsRemindersEnabled when users reply
// STOP / START keywords so our UI matches the carrier-level opt-out state.
// Carrier confirmation messages and HELP responses are handled by Twilio
// Messaging Service Advanced Opt-Out (configured in Twilio Console).
exports.twilioInbound = onRequest({ cors: false }, async (req, res) => {
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  if (!authToken || !twilioClient) {
    res.status(503).type('text/xml').send('<Response/>');
    return;
  }

  const signature = req.headers['x-twilio-signature'];
  // Cloud Run hostname (*.run.app) differs from the cloudfunctions.net URL Twilio called,
  // so the request's host header doesn't match what Twilio signed against. Use the
  // configured public URL directly.
  // F-37 from the 2026-05-12 audit: previously hardcoded; if the function
  // ever moves region or project, signature validation breaks silently.
  // Fall back to the hardcoded prod URL if the env var is missing so this
  // change is non-breaking.
  const url = process.env.TWILIO_INBOUND_URL
    || 'https://us-central1-church-inventory-9615c.cloudfunctions.net/twilioInbound';
  const params = req.body || {};

  let valid = false;
  try {
    valid = twilioClient.validateRequest(authToken, signature, url, params);
  } catch { valid = false; }

  if (!valid) {
    console.warn('twilioInbound: invalid signature', { from: params.From, host: req.headers.host });
    res.status(403).send('Forbidden');
    return;
  }

  const from = String(params.From || '').trim();
  const body = String(params.Body || '').trim().toUpperCase();

  if (!from) {
    res.status(200).type('text/xml').send('<Response/>');
    return;
  }

  const STOP_KEYWORDS = ['STOP', 'STOPALL', 'UNSUBSCRIBE', 'CANCEL', 'END', 'QUIT'];
  const START_KEYWORDS = ['START', 'YES', 'UNSTOP'];
  const isStop = STOP_KEYWORDS.includes(body);
  const isStart = START_KEYWORDS.includes(body);

  if (!isStop && !isStart) {
    res.status(200).type('text/xml').send('<Response/>');
    return;
  }

  try {
    const db = getFirestore();
    const userSnaps = await db.collection('users').where('phone', '==', from).get();
    const updates = userSnaps.docs.map(doc => doc.ref.update({
      smsRemindersEnabled: isStart ? true : false,
    }));
    const results = await Promise.allSettled(updates);
    const failed = results.filter(r => r.status === 'rejected').length;

    await db.collection('smsOptOuts').add({
      phone: from,
      action: isStop ? 'opt_out' : 'opt_in',
      keyword: body,
      matchedUsers: userSnaps.size,
      failedUpdates: failed,
      timestamp: FieldValue.serverTimestamp(),
      source: 'twilio_inbound',
    });

    console.log('twilioInbound', { action: isStop ? 'opt_out' : 'opt_in', matched: userSnaps.size, failed });
  } catch (err) {
    console.error('twilioInbound: failed to sync', err?.message);
    Sentry.captureException(err);
    // Still return 200 so Twilio doesn't retry — opt-out at carrier level is what counts for compliance.
  }

  res.status(200).type('text/xml').send('<Response/>');
});
