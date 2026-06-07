// Seed the LOCAL Firebase Emulator Suite with a self-contained test church so
// the sandbox has something to click through. Safe by construction: it points
// firebase-admin at the emulator host env vars and refuses to run against
// anything that isn't localhost — it can never touch production.
//
// Usage (with `npm run emulators` already running in another terminal):
//   npm run seed:emulator
//
// Then start the app against the sandbox:  npm run dev:emulator
// Sign in with:  admin@test.local  /  Test1234!

process.env.FIRESTORE_EMULATOR_HOST ||= '127.0.0.1:8080';
process.env.FIREBASE_AUTH_EMULATOR_HOST ||= '127.0.0.1:9099';
process.env.FIREBASE_STORAGE_EMULATOR_HOST ||= '127.0.0.1:9199';

// ── Safety guard: never run against a real backend ──
for (const [k, v] of Object.entries({
  FIRESTORE_EMULATOR_HOST: process.env.FIRESTORE_EMULATOR_HOST,
  FIREBASE_AUTH_EMULATOR_HOST: process.env.FIREBASE_AUTH_EMULATOR_HOST,
})) {
  if (!/^(127\.0\.0\.1|localhost):\d+$/.test(v || '')) {
    console.error(`Refusing to seed: ${k}="${v}" is not a localhost emulator.`);
    process.exit(1);
  }
}

import admin from 'firebase-admin';

admin.initializeApp({ projectId: 'church-inventory-9615c' });
const auth = admin.auth();
const db = admin.firestore();

const EMAIL = 'admin@test.local';
const PASSWORD = 'Test1234!';

const iso = (d) => d.toISOString();
const ymd = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const addDays = (n) => { const d = new Date(); d.setDate(d.getDate() + n); return d; };
const NOW = iso(new Date());

async function main() {
  // 1. Auth user (idempotent)
  let user;
  try { user = await auth.getUserByEmail(EMAIL); }
  catch { user = await auth.createUser({ email: EMAIL, password: PASSWORD, displayName: 'Test Admin', emailVerified: true }); }
  const uid = user.uid;
  const churchId = `${uid}-church`;

  // 2. User profile (no allowedHubs field = full hub access)
  await db.doc(`users/${uid}`).set({
    name: 'Test Admin', email: EMAIL, role: 'admin', churchId, active: true, createdAt: NOW,
  });

  // 3. Church + config (grandfathered → every hub unlocked, no Stripe)
  await db.doc(`churches/${churchId}`).set({ churchName: 'Sandbox Community Church', churchCode: 'SANDBOX', createdBy: uid, createdAt: NOW });
  await db.doc(`churches/${churchId}/config/main`).set({
    churchName: 'Sandbox Community Church', churchCode: 'SANDBOX', createdBy: uid, createdAt: NOW,
    maxTaskNumber: 4, maxTicketNumber: 3, maxJobNumber: 2,
  });
  await db.doc(`churches/${churchId}/config/settings`).set({
    locations: ['Sanctuary', 'Fellowship Hall', 'Kids Wing', 'Storage'],
    ministries: ['Worship', 'Youth', 'Facilities', 'Hospitality'],
    tags: ['urgent', 'recurring', 'volunteer'],
    timeZone: 'America/Chicago',
    jobsRosterVisibility: 'signups',
  });
  await db.doc(`churches/${churchId}/config/subscription`).set({
    plan: 'all_in', grandfathered: true, status: 'active', hubs: [], freeHubsSelected: null,
  });

  const me = [{ uid, name: 'Test Admin' }];
  const C = (path) => db.collection(`churches/${churchId}/${path}`);

  // 4. Tasks — varied statuses (fills the Kanban) + one recurring (recurrence util)
  const tasks = [
    { taskNumber: 'TSK-001', name: 'Print Sunday bulletins', status: 'Backlog', priority: 'Medium', dueDate: ymd(addDays(2)) },
    { taskNumber: 'TSK-002', name: 'Weekly newsletter', status: 'In Progress', priority: 'High', dueDate: ymd(addDays(-1)), recurrence: 'weekly' },
    { taskNumber: 'TSK-003', name: 'Restock coffee bar', status: 'Planning', priority: 'Low', dueDate: ymd(addDays(5)) },
    { taskNumber: 'TSK-004', name: 'Quarterly board report', status: 'On Hold', priority: 'Medium', dueDate: ymd(addDays(20)), recurrence: 'quarterly' },
  ];
  for (const t of tasks) await C('tasks').add({ ...t, description: '', assignees: me, visibility: 'team', tags: [], checklist: [], createdBy: uid, createdByName: 'Test Admin', createdAt: NOW, sortOrder: 0 });

  // 5. Maintenance tickets — incl. recurring
  const tickets = [
    { ticketNumber: 'MNT-001', name: 'HVAC filter change', status: 'Backlog', priority: 'Medium', dueDate: ymd(addDays(7)), recurrence: 'monthly' },
    { ticketNumber: 'MNT-002', name: 'Fix leaking faucet (Kids Wing)', status: 'In Progress', priority: 'High', dueDate: ymd(addDays(-2)) },
    { ticketNumber: 'MNT-003', name: 'Annual fire-extinguisher inspection', status: 'Planning', priority: 'High', dueDate: ymd(addDays(45)), recurrence: 'annually' },
  ];
  for (const t of tickets) await C('maintenanceTickets').add({ ...t, description: '', assignees: me, tags: [], createdBy: uid, createdByName: 'Test Admin', createdAt: NOW });

  // 6. Jobs / shifts — incl. a recurring series + one with open spots
  const jobs = [
    { jobNumber: 'JOB-001', title: 'Sunday setup crew', scheduledDate: ymd(addDays(4)), scheduledTime: '07:30', scheduledEndTime: '09:00', status: 'open', spotsTotal: 5, signupCount: 2 },
    { jobNumber: 'JOB-002', title: 'Wednesday teardown', scheduledDate: ymd(addDays(7)), scheduledTime: '20:00', status: 'open', spotsTotal: 3, signupCount: 0, recurrenceFreq: 'weekly' },
  ];
  for (const j of jobs) await C('jobListings').add({ ...j, description: '', location: 'Sanctuary', createdBy: uid, createdByName: 'Test Admin', createdAt: NOW, requiredAccessTypes: [] });

  // 7. Reservations — incl. recurring
  const reservations = [
    { eventName: 'Youth group', eventDate: ymd(addDays(3)), returnDate: ymd(addDays(3)), status: 'approved', resourceType: 'room', roomName: 'Fellowship Hall', ministry: 'Youth', recurrenceFreq: 'weekly' },
    { eventName: 'Elders meeting', eventDate: ymd(addDays(10)), returnDate: ymd(addDays(10)), status: 'pending', resourceType: 'room', roomName: 'Kids Wing', ministry: 'Worship' },
  ];
  for (const r of reservations) await C('reservations').add({ ...r, purpose: r.eventName, createdBy: uid, createdByName: 'Test Admin', createdAt: NOW });

  // 8. Inventory + supplies (low stock) + warranty item — feeds the Insights digest
  await C('items').add({ itemId: 'ITM-001', description: 'Projector', status: 'Available', location: 'Sanctuary', ministry: 'Worship', warrantyExpiry: ymd(addDays(20)), purchasePrice: 1200, purchaseDate: '2024-01-15', createdAt: NOW });
  await C('supplies').add({ supplyId: 'SUP-001', description: 'Communion cups', quantity: 2, minQuantity: 10, unit: 'boxes', location: 'Storage', ministry: 'Hospitality', createdAt: NOW });

  // 9. Contractor + timesheet entries (scheduled / approved-unpaid) — feeds the attention digest
  const personRef = await C('accessPeople').add({ name: 'Bob the Plumber', personType: 'contractor', hourlyRate: 65, active: true, ministries: ['Facilities'], createdBy: uid, createdAt: NOW, updatedAt: NOW });
  await C('timeEntries').add({ personId: personRef.id, personName: 'Bob the Plumber', date: ymd(addDays(6)), estHours: 3, hours: 0, cost: 0, status: 'scheduled', rate: 65, description: 'MNT-002: Fix leaking faucet (Kids Wing)', createdBy: uid, createdAt: NOW, updatedAt: NOW });
  await C('timeEntries').add({ personId: personRef.id, personName: 'Bob the Plumber', date: ymd(addDays(-5)), hours: 4, cost: 260, status: 'approved', rate: 65, description: 'Boiler repair', createdBy: uid, createdAt: NOW, updatedAt: NOW });

  // 10. A compliance record expiring soon — feeds the readiness/compliance views
  await C('accessRecords').add({ personId: personRef.id, personName: 'Bob the Plumber', type: 'certification', certType: 'OSHA', completedDate: '2024-06-01', expiryDate: ymd(addDays(14)), recordedBy: uid, recordedByName: 'Test Admin', createdAt: NOW, updatedAt: NOW });

  // Read back through the same connection to prove the writes landed where we
  // think (the emulator, never prod — the host guard above already enforced that).
  const backChurch = await db.doc(`churches/${churchId}`).get();
  const backTasks = await db.collection(`churches/${churchId}/tasks`).get();
  console.log(`  verify : churches/${churchId} exists=${backChurch.exists}, tasks=${backTasks.size}, FIRESTORE_EMULATOR_HOST=${process.env.FIRESTORE_EMULATOR_HOST}`);
  if (!backChurch.exists || backTasks.size === 0) { console.error('  ✗ read-back found nothing — aborting.'); process.exit(1); }

  console.log('✓ Seeded sandbox church:');
  console.log(`  church : ${churchId}`);
  console.log(`  login  : ${EMAIL} / ${PASSWORD}`);
  console.log('  data   : 4 tasks · 3 maintenance · 2 jobs · 2 reservations · 1 item · 1 low supply · 1 contractor (+2 time entries) · 1 expiring cert');
  console.log('  (3 recurring items across tasks/maintenance/jobs/reservations to exercise the recurrence util)');
}

main().then(() => process.exit(0)).catch((err) => { console.error(err); process.exit(1); });
