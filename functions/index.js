const { onCall, onRequest, HttpsError } = require('firebase-functions/v2/https');
const { onSchedule } = require('firebase-functions/v2/scheduler');
const { defineSecret } = require('firebase-functions/params');
const { initializeApp } = require('firebase-admin/app');
const { getFirestore, FieldValue } = require('firebase-admin/firestore');
const { getAuth } = require('firebase-admin/auth');

let sgMail;
try { sgMail = require('@sendgrid/mail'); } catch { sgMail = null; }

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
  jobs:           'price_REPLACE_WITH_STRIPE_PRICE_ID',
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

// ── createCheckoutSession ─────────────────────────────────────────────────
// Called from the frontend with { item: 'maintenance'|'insights'|...|'all_in' }
// Returns { url } — redirect the browser to this URL.
exports.createCheckoutSession = onCall(
  { secrets: [STRIPE_SECRET_KEY], cors: true },
  async (req) => {
    if (!req.auth) throw new HttpsError('unauthenticated', 'Must be signed in.');

    const { item, successUrl, cancelUrl } = req.data;
    const priceId = PRICE_IDS[item];
    if (!priceId || priceId === 'price_REPLACE_ME') {
      throw new HttpsError('invalid-argument', `Unknown or unconfigured item: ${item}`);
    }

    const db = getFirestore();
    const userSnap = await db.doc(`users/${req.auth.uid}`).get();
    if (!userSnap.exists) throw new HttpsError('not-found', 'User profile not found.');
    const { churchId } = userSnap.data();

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
    const { churchId } = userSnap.data();

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

const FROM = { email: 'churchopshub@gmail.com', name: 'ChurchOpsHub' };

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

  const { toEmail, toName, churchName, ticketNumber, ticketName, assignedBy } = req.data;
  if (!toEmail) return { sent: false };

  const safeName = escapeHtml(toName);
  const safeTicket = escapeHtml(ticketName);
  const safeNumber = escapeHtml(ticketNumber);
  const safeChurch = escapeHtml(churchName);
  const safeAssignedBy = escapeHtml(assignedBy);

  const subject = `Maintenance Ticket Assigned — ${ticketNumber}`;
  const html = `<p>Hi ${safeName},</p>
<p>You've been assigned a maintenance ticket by <strong>${safeAssignedBy}</strong>.</p>
<table style="border-collapse:collapse;margin:12px 0">
  <tr><td style="padding:4px 12px 4px 0;color:#666;font-size:14px">Ticket</td><td style="font-size:14px"><strong>${safeNumber}</strong></td></tr>
  <tr><td style="padding:4px 12px 4px 0;color:#666;font-size:14px">Description</td><td style="font-size:14px">${safeTicket}</td></tr>
</table>
<p><a href="https://churchopshub.com">Log in to ChurchOpsHub</a> to view and update the ticket.</p>
<p style="font-size:13px;color:#666">— ${safeChurch} via ChurchOpsHub</p>`;

  const text = `Hi ${toName},\n\nYou've been assigned maintenance ticket ${ticketNumber}: "${ticketName}" by ${assignedBy}.\n\nLog in at churchopshub.com to view it.\n\n— ${churchName}`;

  await sgMail.send({ to: toEmail, from: FROM, subject, html, text });
  return { sent: true };
});

// ── sendJobAnnouncementEmails ─────────────────────────────────────────────
// Called from client when a Job Hub announcement is posted.
// data: { churchId, title, body, postedBy }
// Fetches all active users with job hub access server-side and emails them.
exports.sendJobAnnouncementEmails = onCall({ cors: true }, async (req) => {
  if (!req.auth) throw new HttpsError('unauthenticated', 'Must be signed in.');
  if (!initSendGrid()) return { sent: 0 };

  const { churchId, title, body, postedBy } = req.data;
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
  const [churchSnap, usersSnap] = await Promise.all([
    db.doc(`churches/${churchId}/config/main`).get(),
    db.collection('users').where('churchId', '==', churchId).where('active', '!=', false).get(),
  ]);

  const churchName = churchSnap.data()?.churchName || 'Your Church';
  const recipients = usersSnap.docs
    .map(d => ({ ...d.data(), uid: d.id }))
    .filter(u => u.email && (!u.allowedHubs || u.allowedHubs.includes('jobs')));

  if (recipients.length === 0) return { sent: 0 };

  const safeTitle = escapeHtml(title);
  const safeBody = escapeHtml(body).replace(/\n/g, '<br>');
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

  const sent = results.filter(r => r.status === 'fulfilled').length;
  return { sent };
});

// ── sendJobCancelledEmails ────────────────────────────────────────────────
// Called when a job is cancelled. Fetches signups server-side and notifies each person.
// data: { churchId, jobDocId }
exports.sendJobCancelledEmails = onCall({ cors: true }, async (req) => {
  if (!req.auth) throw new HttpsError('unauthenticated', 'Must be signed in.');
  if (!initSendGrid()) return { sent: 0 };

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

  const [jobSnap, churchSnap] = await Promise.all([
    db.doc(`churches/${churchId}/jobListings/${jobDocId}`).get(),
    db.doc(`churches/${churchId}/config/main`).get(),
  ]);
  if (!jobSnap.exists) return { sent: 0 };

  const job = jobSnap.data();
  const signups = job.signups || [];
  if (signups.length === 0) return { sent: 0 };

  const churchName = churchSnap.data()?.churchName || 'Your Church';
  const safeTitle = escapeHtml(job.title || 'Job');
  const safeChurch = escapeHtml(churchName);
  const dateStr = job.scheduledDate || '';
  const timeStr = job.scheduledTime ? ` at ${job.scheduledTime}` : '';
  const subject = `Job Cancelled: ${job.title || 'Job'}`;

  const userSnaps = await Promise.all(signups.map(s => db.doc(`users/${s.uid}`).get()));

  const results = await Promise.allSettled(userSnaps.map(snap => {
    if (!snap.exists) return Promise.resolve();
    const user = snap.data();
    if (!user.email || user.churchId !== churchId) return Promise.resolve();
    const safeName = escapeHtml(user.name || 'there');
    const html = `<p>Hi ${safeName},</p>
<p>We wanted to let you know that a job you signed up for has been <strong>cancelled</strong>:</p>
<table style="border-collapse:collapse;margin:12px 0">
  <tr><td style="padding:4px 12px 4px 0;color:#666;font-size:14px">Job</td><td style="font-size:14px"><strong>${safeTitle}</strong></td></tr>
  ${dateStr ? `<tr><td style="padding:4px 12px 4px 0;color:#666;font-size:14px">Date</td><td style="font-size:14px">${escapeHtml(dateStr)}${escapeHtml(timeStr)}</td></tr>` : ''}
</table>
<p>No action is needed on your part.</p>
<p><a href="https://churchopshub.com">Open ChurchOpsHub</a> to see other available jobs.</p>
<p style="font-size:13px;color:#666">— ${safeChurch} via ChurchOpsHub</p>`;
    const text = `Hi ${user.name || 'there'},\n\nThe following job you signed up for has been cancelled:\n\n${job.title || 'Job'}${dateStr ? '\nDate: ' + dateStr + timeStr : ''}\n\nNo action is needed.\n\n— ${churchName}`;
    return sgMail.send({ to: user.email, from: FROM, subject, html, text });
  }));

  const sent = results.filter(r => r.status === 'fulfilled').length;
  return { sent };
});

// ── sendTaskDueReminders ──────────────────────────────────────────────────
// Runs every morning at 8:00 AM Central time.
// Finds all tasks due today or tomorrow (not Complete/Cancelled) that have assignees,
// and emails each assignee. Respects per-church notification settings.
exports.sendTaskDueReminders = onSchedule({ schedule: '0 8 * * *', timeZone: 'America/Chicago' }, async () => {
  if (!initSendGrid()) return;

  const db = getFirestore();
  const now = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/Chicago' }));
  const pad = n => String(n).padStart(2, '0');
  const todayStr = `${now.getFullYear()}-${pad(now.getMonth()+1)}-${pad(now.getDate())}`;
  const tomorrow = new Date(now); tomorrow.setDate(now.getDate() + 1);
  const tomorrowStr = `${tomorrow.getFullYear()}-${pad(tomorrow.getMonth()+1)}-${pad(tomorrow.getDate())}`;

  // Query all tasks with a dueDate on or before tomorrow (captures overdue + due today + due tomorrow)
  const snap = await db.collectionGroup('tasks')
    .where('dueDate', '>=', todayStr)
    .where('dueDate', '<=', tomorrowStr)
    .get();

  if (snap.empty) return;

  // Filter to active tasks with assignees; group by assignee uid → [taskInfo]
  const tasksByAssignee = {}; // uid → [{ taskNumber, name, dueDate, priority, status, churchId }]
  for (const taskDoc of snap.docs) {
    const task = taskDoc.data();
    if (!task.dueDate) continue;
    if (task.status === 'Complete' || task.status === 'Cancelled') continue;
    if (!task.assignees || task.assignees.length === 0) continue;
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
      });
    }
  }

  if (Object.keys(tasksByAssignee).length === 0) return;

  // Fetch user profiles and church notification settings
  const uids = Object.keys(tasksByAssignee);
  const userSnaps = await Promise.all(uids.map(uid => db.doc(`users/${uid}`).get()));

  // Cache notification configs per churchId to avoid redundant reads
  const notifCache = {};
  async function notifEnabled(churchId) {
    if (notifCache[churchId] !== undefined) return notifCache[churchId];
    try {
      const s = await db.doc(`churches/${churchId}/config/notifications`).get();
      notifCache[churchId] = !!(s.exists && s.data().enabled);
    } catch { notifCache[churchId] = false; }
    return notifCache[churchId];
  }

  const emailTasks = [];
  for (const userSnap of userSnaps) {
    if (!userSnap.exists) continue;
    const user = userSnap.data();
    if (!user.email) continue;

    // Only send tasks belonging to the user's own church
    const tasks = (tasksByAssignee[userSnap.id] || []).filter(t => t.churchId === user.churchId);
    if (tasks.length === 0) continue;
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
  }

  await Promise.allSettled(emailTasks);
});

// ── sendJobReminders ──────────────────────────────────────────────────────
// Runs every morning at 8:00 AM Central time.
// Finds all jobs scheduled for today across all churches and emails each signup.
exports.sendJobReminders = onSchedule({ schedule: '0 8 * * *', timeZone: 'America/Chicago' }, async () => {
  if (!initSendGrid()) return;

  const db = getFirestore();
  const today = (() => {
    const d = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/Chicago' }));
    return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
  })();

  // Collection group query across all churches
  const snap = await db.collectionGroup('jobListings')
    .where('scheduledDate', '==', today)
    .where('status', '==', 'open')
    .get();

  if (snap.empty) return;

  // Gather all unique user UIDs that need reminders
  const remindersByUid = {}; // uid → [{ jobTitle, scheduledTime, location, pay, churchId }]
  for (const doc of snap.docs) {
    const job = doc.data();
    const churchId = doc.ref.parent.parent.id;
    for (const signup of (job.signups || [])) {
      if (!signup.uid) continue;
      if (!remindersByUid[signup.uid]) remindersByUid[signup.uid] = [];
      remindersByUid[signup.uid].push({
        title: job.title || 'Job',
        scheduledTime: job.scheduledTime || '',
        location: job.location || '',
        pay: job.pay != null ? `$${Number(job.pay).toFixed(2)} per person` : null,
        churchId,
      });
    }
  }

  if (Object.keys(remindersByUid).length === 0) return;

  // Fetch user profiles for all UIDs
  const userSnaps = await Promise.all(
    Object.keys(remindersByUid).map(uid => db.doc(`users/${uid}`).get())
  );

  const emailTasks = [];
  for (const userSnap of userSnaps) {
    if (!userSnap.exists) continue;
    const user = userSnap.data();
    if (!user.email) continue;
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
  }

  await Promise.allSettled(emailTasks);
});
