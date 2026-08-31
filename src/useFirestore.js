import { useState, useEffect, useCallback, useMemo } from 'react';
import {
  doc, setDoc, getDoc, deleteDoc, getDocs,
  collection, onSnapshot, addDoc, updateDoc, query, orderBy, arrayUnion, where, limit, runTransaction, writeBatch, startAfter,
  serverTimestamp, Timestamp
} from 'firebase/firestore';
import * as Sentry from '@sentry/react';
import { db, storage } from './firebase.js';
import { ref as stRef, deleteObject } from 'firebase/storage';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { generateRecurrenceDates } from './utils/date.js';
import { excludeTestAccounts } from './utils/testAccounts.js';
import { canSeeTask } from './utils/taskVisibility.js';

// ── Work model (unified Tasks + Maintenance) ─────────────────────────────────
// Tasks and maintenance tickets live in one `workItems` collection (a single
// doc per item, discriminated by a `type: 'task' | 'maintenance'` field). The
// hook still exposes separate `tasks` and `maintenanceTickets` arrays (split by
// `type`) so the pages are unchanged; the upcoming Work-area UI merge folds
// those two boards into one. Jobs/shifts stay their own `jobListings`
// collection (date-driven, not part of this model).
//
// The workItems doc id carries a `task_` / `mnt_` prefix, but the `_docId`
// surfaced to the app is the *bare* id with the prefix stripped — so every
// cross-collection link field (linkedTaskDocId, linkedTicketDocId,
// linkedJobDocId, …) speaks bare ids. CRUD re-applies the prefix when resolving
// a doc ref, and newly-created items get a fresh prefixed id whose bare form is
// what we surface/return for linking.
const stripWorkPrefix = (id) => id.replace(/^(?:task|mnt)_/, '');

// Activity-log writes use Firestore server timestamps so the rules can pin
// chronology to request.time. Keep the store's public shape as an ISO string so
// existing dashboards, exports, filters, and date formatting remain unchanged.
function activityDoc(d) {
  const data = d.data();
  const rawTimestamp = data.timestamp;
  return {
    _docId: d.id,
    ...data,
    timestamp: rawTimestamp?.toDate ? rawTimestamp.toDate().toISOString() : rawTimestamp,
    _timestampCursor: rawTimestamp,
  };
}

function taskDocRef(churchId, bareId) {
  return doc(db, 'churches', churchId, 'workItems', `task_${bareId}`);
}
function ticketDocRef(churchId, bareId) {
  return doc(db, 'churches', churchId, 'workItems', `mnt_${bareId}`);
}
// Mint a new doc ref, returning the ref to write and the bare id to surface.
function newTaskDocRef(churchId) {
  const id = doc(collection(db, 'churches', churchId, 'workItems')).id;
  return { ref: doc(db, 'churches', churchId, 'workItems', `task_${id}`), id };
}
function newTicketDocRef(churchId) {
  const id = doc(collection(db, 'churches', churchId, 'workItems')).id;
  return { ref: doc(db, 'churches', churchId, 'workItems', `mnt_${id}`), id };
}

export function useFirestore(churchId, userProfile) {
  const [settings, setSettings] = useState(null);
  const [config, setConfig] = useState(null);
  const [items, setItems] = useState([]);
  const [supplies, setSupplies] = useState([]);
  const [activityLog, setActivityLog] = useState([]);
  const [reservations, setReservations] = useState([]);
  const [users, setUsers] = useState([]);
  const [maintenanceTickets, setMaintenanceTickets] = useState([]);
  const [vendors, setVendors] = useState([]);
  const [bundles, setBundles] = useState([]);
  const [notificationConfig, setNotificationConfig] = useState(null);
  const [audits, setAudits] = useState([]);
  const [publicRequests, setPublicRequests] = useState([]);
  const [accessPeople, setAccessPeople] = useState([]);
  const [accessRecords, setAccessRecords] = useState([]);
  const [timeEntries, setTimeEntries] = useState([]);
  const [tasks, setTasks] = useState([]);
  const [rooms, setRooms] = useState([]);
  const [jobListings, setJobListings] = useState([]);
  const [jobAnnouncements, setJobAnnouncements] = useState([]);
  const [taskTemplates, setTaskTemplates] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const clearError = useCallback(() => setError(null), []);

  function handleErr(err, ctx = {}) {
    // Transient real-time-listener errors (2026-06-11): Firestore onSnapshot
    // subscriptions surface backend/transport blips — deadline-exceeded,
    // unavailable, cancelled, aborted, and the generic internal/unknown — when
    // a mobile tab is backgrounded (iOS Safari suspends its sockets) or the
    // network briefly drops. The SDK auto-reconnects the listener on its own and
    // re-delivers the snapshot, so there is no broken feature behind them; they
    // were paging Sentry overnight purely via captureConsole. For the listener
    // path (ctx.listener) log at warn — below captureConsole's 'error' threshold
    // — and skip captureException + setError. `internal`/`unknown` are treated
    // as transient ONLY here; on writes/callables they still report in full,
    // since there they can signal a real bug.
    const TRANSIENT_LISTENER_CODES = new Set([
      'deadline-exceeded', 'unavailable', 'cancelled', 'aborted', 'internal', 'unknown',
    ]);
    if (ctx.listener && TRANSIENT_LISTENER_CODES.has(err?.code)) {
      console.warn('[ChurchOpsHub] transient listener error (auto-recovers):', err?.code || err);
      return;
    }
    // Audit overnight 2026-05-12 / Error-resilience #1: this is the single
    // chokepoint for ~80 Firestore writes in this hook. Calling
    // captureException directly preserves the full error object so engineering
    // can see code (permission-denied / unavailable / etc.) and stack trace.
    // `ctx` is an optional `{ op, hub, silent }` — `op` names the operation
    // (e.g. 'logActivity', 'signUpForJob') so the Sentry tag is specific
    // instead of a generic 'firestore-write'; `silent: true` skips setError so
    // post-success audit-log failures don't surface a confusing toast over a
    // user action that actually succeeded.
    console.error('[ChurchOpsHub]', err);
    // Missing-index detection (2026-05-27): `firebase deploy` silently skips
    // COLLECTION-scope composite indexes declared in firestore.indexes.json,
    // so a query path can ship to prod without its index. Surface these
    // distinctly so they alert in Sentry instead of getting lost in the
    // generic firestore-write noise. The console URL Firestore embeds in the
    // message lets engineering one-click create the index.
    const isMissingIndex = err?.code === 'failed-precondition'
      && typeof err?.message === 'string'
      && err.message.includes('requires an index');
    const indexUrlMatch = isMissingIndex
      ? err.message.match(/https:\/\/console\.firebase\.google\.com\/[^\s)]+/)
      : null;
    try {
      Sentry.captureException(err, {
        level: isMissingIndex ? 'fatal' : undefined,
        tags: {
          area: 'firestore-write',
          op: ctx.op || 'unknown',
          ...(ctx.hub && { hub: ctx.hub }),
          ...(err?.code && { errorCode: err.code }),
          ...(isMissingIndex && { missingIndex: 'true' }),
        },
        extra: {
          ...(indexUrlMatch && { firestoreIndexUrl: indexUrlMatch[0] }),
        },
      });
    } catch { /* never let Sentry break the app */ }
    if (!ctx.silent) {
      setError(isMissingIndex
        ? 'This feature is temporarily unavailable while a database index finishes building. Engineering has been alerted — please try again in a few minutes.'
        : err.message);
    }
  }

  // Subscribe to all collections
  useEffect(() => {
    if (!churchId) return;
    const unsubs = [];
    let loaded = 0;
    // Tasks + maintenance come from one `workItems` subscription (split by type).
    // People Access and time-entry subscriptions are role-aware in the
    // dedicated effect below. They must not block the rest of app startup.
    const totalSubs = 17;
    const checkDone = () => { loaded++; if (loaded >= totalSubs) setLoading(false); };

    // Config
    unsubs.push(onSnapshot(doc(db, 'churches', churchId, 'config', 'main'), (snap) => {
      if (snap.exists()) setConfig(snap.data());
      checkDone();
    }, (err) => { handleErr(err, { listener: true }); checkDone(); }));

    // Settings
    unsubs.push(onSnapshot(doc(db, 'churches', churchId, 'config', 'settings'), (snap) => {
      if (snap.exists()) setSettings(snap.data());
      checkDone();
    }, (err) => { handleErr(err, { listener: true }); checkDone(); }));

    // Items
    unsubs.push(onSnapshot(collection(db, 'churches', churchId, 'items'), (snap) => {
      setItems(snap.docs.map(d => ({ _docId: d.id, ...d.data() })));
      checkDone();
    }, (err) => { handleErr(err, { listener: true }); checkDone(); }));

    // Supplies
    unsubs.push(onSnapshot(collection(db, 'churches', churchId, 'supplies'), (snap) => {
      setSupplies(snap.docs.map(d => ({ _docId: d.id, ...d.data() })));
      checkDone();
    }, (err) => { handleErr(err, { listener: true }); checkDone(); }));

    // Activity Log — capped at 100 most-recent entries to avoid unbounded
    // reads as churches age. Audit overnight 2026-05-12 / Perf #1:
    // unbounded subscription was costing ~14M reads/month for a 2-year-old
    // 100-user church on app-mount alone. The page's "Load older" button
    // calls loadOlderActivityLog() below for one-shot deeper fetches.
    unsubs.push(onSnapshot(
      query(collection(db, 'churches', churchId, 'activityLog'), orderBy('timestamp', 'desc'), limit(100)),
      (snap) => {
        const logs = snap.docs.map(activityDoc);
        setActivityLog(logs);
        checkDone();
      },
      (err) => { handleErr(err, { listener: true }); checkDone(); }
    ));

    // Reservations
    unsubs.push(onSnapshot(collection(db, 'churches', churchId, 'reservations'), (snap) => {
      setReservations(snap.docs.map(d => ({ _docId: d.id, ...d.data() })));
      checkDone();
    }, (err) => { handleErr(err, { listener: true }); checkDone(); }));

    // Vendors
    unsubs.push(onSnapshot(collection(db, 'churches', churchId, 'vendors'), (snap) => {
      setVendors(snap.docs.map(d => ({ _docId: d.id, ...d.data() })));
      checkDone();
    }, (err) => { handleErr(err, { listener: true }); checkDone(); }));

    // Users — scoped to this church via query (real-time)
    unsubs.push(onSnapshot(query(collection(db, 'users'), where('churchId', '==', churchId)), (snap) => {
      // Test/E2E accounts (@churchopshub.com) live in the prod church for the
      // E2E suite but must never surface in member lists, pickers, or seat
      // counts. Filtered at the single source so every consumer inherits it.
      setUsers(excludeTestAccounts(snap.docs.map(d => ({ id: d.id, ...d.data() }))));
      checkDone();
    }, (err) => { handleErr(err, { listener: true }); checkDone(); }));

    // Bundles
    unsubs.push(onSnapshot(collection(db, 'churches', churchId, 'bundles'), (snap) => {
      setBundles(snap.docs.map(d => ({ _docId: d.id, ...d.data() })));
      checkDone();
    }, (err) => { handleErr(err, { listener: true }); checkDone(); }));

    // Notification config
    unsubs.push(onSnapshot(doc(db, 'churches', churchId, 'config', 'notifications'), (snap) => {
      setNotificationConfig(snap.exists() ? snap.data() : {});
      checkDone();
    }, (err) => { handleErr(err, { listener: true }); checkDone(); }));

    // Audits
    unsubs.push(onSnapshot(collection(db, 'churches', churchId, 'audits'), (snap) => {
      setAudits(snap.docs.map(d => ({ _docId: d.id, ...d.data() })));
      checkDone();
    }, (err) => { handleErr(err, { listener: true }); checkDone(); }));

    // Public Requests
    unsubs.push(onSnapshot(query(collection(db, 'churches', churchId, 'publicRequests'), where('status', '==', 'pending')), (snap) => {
      const reqs = snap.docs.map(d => ({ _docId: d.id, ...d.data() }));
      reqs.sort((a, b) => (b.submittedAt || '').localeCompare(a.submittedAt || ''));
      setPublicRequests(reqs);
      checkDone();
    }, (err) => { handleErr(err, { listener: true }); checkDone(); }));

    // Work Items (unified Tasks + Maintenance). One subscription feeds both the
    // `tasks` and `maintenanceTickets` arrays, split by the `type` discriminator.
    // `_docId` is the bare id (prefix stripped) so downstream link fields and
    // CRUD calls speak bare ids.
    unsubs.push(onSnapshot(collection(db, 'churches', churchId, 'workItems'), (snap) => {
      const all = snap.docs.map(d => ({ _docId: stripWorkPrefix(d.id), ...d.data() }));
      const t = all.filter(w => w.type === 'task');
      const m = all.filter(w => w.type === 'maintenance');
      t.sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
      m.sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
      setTasks(t);
      setMaintenanceTickets(m);
      checkDone();
    }, (err) => { handleErr(err, { listener: true }); checkDone(); }));

    // Rooms/Spaces
    unsubs.push(onSnapshot(collection(db, 'churches', churchId, 'rooms'), (snap) => {
      const r = snap.docs.map(d => ({ _docId: d.id, ...d.data() }));
      r.sort((a, b) => (a.name || '').localeCompare(b.name || ''));
      setRooms(r);
      checkDone();
    }, (err) => { handleErr(err, { listener: true }); checkDone(); }));

    // Job Listings — capped at 500 most-recently-created to avoid unbounded
    // reads as churches age (audit 2026-05-23 perf H-3). Mirrors the
    // activityLog bound at line 89. Server-side orderBy replaces the prior
    // client-side sort. Known limitation: a church past 500 historical
    // listings will see its admin Reports tab leaderboard ("all"/"90d"
    // scopes) silently undercount signups whose parent job fell off the
    // window — same silent-drop behavior as deleted jobs. Real fix is a
    // lazy one-shot fetch in the Reports tab; queued as a follow-up.
    unsubs.push(onSnapshot(
      query(collection(db, 'churches', churchId, 'jobListings'), orderBy('createdAt', 'desc'), limit(500)),
      (snap) => {
        setJobListings(snap.docs.map(d => ({ _docId: d.id, ...d.data() })));
        checkDone();
      },
      (err) => { handleErr(err, { listener: true }); checkDone(); }
    ));

    // Job Announcements
    unsubs.push(onSnapshot(collection(db, 'churches', churchId, 'jobAnnouncements'), (snap) => {
      const ann = snap.docs.map(d => ({ _docId: d.id, ...d.data() }));
      ann.sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
      setJobAnnouncements(ann);
      checkDone();
    }, (err) => { handleErr(err, { listener: true }); checkDone(); }));

    // Task Templates
    unsubs.push(onSnapshot(query(collection(db, 'churches', churchId, 'taskTemplates'), orderBy('name')), (snap) => {
      setTaskTemplates(snap.docs.map(d => ({ _docId: d.id, ...d.data() })));
      checkDone();
    }, (err) => { handleErr(err, { listener: true }); checkDone(); }));

    return () => unsubs.forEach(u => u());
  }, [churchId]);

  // People Access is manager/admin-readable, while ordinary users receive only
  // their linked tracked-person document(s) and those people's compliance
  // records for Settings → My Compliance. This effect intentionally lives
  // outside the core subscription counter so a compliance listener cannot hold
  // the whole application on its loading screen.
  useEffect(() => {
    if (!churchId || !userProfile?.uid) {
      setAccessPeople([]);
      setAccessRecords([]);
      setTimeEntries([]);
      return undefined;
    }

    const elevated = userProfile.role === 'admin' || userProfile.role === 'manager';
    const unsubs = [];

    if (elevated) {
      unsubs.push(onSnapshot(
        query(collection(db, 'churches', churchId, 'accessPeople'), orderBy('name')),
        snap => setAccessPeople(snap.docs.map(d => ({ _docId: d.id, ...d.data() }))),
        err => handleErr(err, { listener: true, hub: 'people_access' }),
      ));
      unsubs.push(onSnapshot(
        query(collection(db, 'churches', churchId, 'accessRecords'), orderBy('createdAt', 'desc')),
        snap => setAccessRecords(snap.docs.map(d => ({ _docId: d.id, ...d.data() }))),
        err => handleErr(err, { listener: true, hub: 'people_access' }),
      ));
      unsubs.push(onSnapshot(
        query(collection(db, 'churches', churchId, 'timeEntries'), orderBy('date', 'desc')),
        snap => setTimeEntries(snap.docs.map(d => ({ _docId: d.id, ...d.data() }))),
        err => handleErr(err, { listener: true, hub: 'people_access' }),
      ));
    } else {
      setTimeEntries([]);
      let recordUnsubs = [];
      const recordsByPerson = new Map();
      const clearRecordSubscriptions = () => {
        recordUnsubs.forEach(unsub => unsub());
        recordUnsubs = [];
        recordsByPerson.clear();
      };
      unsubs.push(onSnapshot(
        query(collection(db, 'churches', churchId, 'accessPeople'), where('userId', '==', userProfile.uid)),
        snap => {
          clearRecordSubscriptions();
          const people = snap.docs.map(d => ({ _docId: d.id, ...d.data() }));
          setAccessPeople(people);
          if (people.length === 0) {
            setAccessRecords([]);
            return;
          }
          const publishRecords = () => {
            const all = [...recordsByPerson.values()].flat();
            all.sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
            setAccessRecords(all);
          };
          people.forEach(person => {
            recordUnsubs.push(onSnapshot(
              query(
                collection(db, 'churches', churchId, 'accessRecords'),
                where('personId', '==', person._docId),
                limit(100),
              ),
              recordSnap => {
                recordsByPerson.set(person._docId, recordSnap.docs.map(d => ({ _docId: d.id, ...d.data() })));
                publishRecords();
              },
              err => handleErr(err, { listener: true, hub: 'people_access' }),
            ));
          });
        },
        err => handleErr(err, { listener: true, hub: 'people_access' }),
      ));
      unsubs.push(clearRecordSubscriptions);
    }

    return () => unsubs.forEach(unsub => unsub());
  }, [churchId, userProfile?.role, userProfile?.uid]);

  // ── Settings ──
  const updateSettings = useCallback(async (updates) => {
    try {
      await setDoc(doc(db, 'churches', churchId, 'config', 'settings'), updates, { merge: true });
    } catch (err) { handleErr(err); }
  }, [churchId]);

  const updateConfig = useCallback(async (updates) => {
    try {
      await setDoc(doc(db, 'churches', churchId, 'config', 'main'), updates, { merge: true });
    } catch (err) { handleErr(err); }
  }, [churchId]);

  // ── Items ──
  const addItem = useCallback(async (item, userId, _userName) => {
    try {
      const ref = await addDoc(collection(db, 'churches', churchId, 'items'), {
        ...item,
        createdBy: userId,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      });
      await logActivity('add_item', item.itemId, userId, { description: item.description });
      return ref.id;
    } catch (err) { handleErr(err); }
  }, [churchId]);

  const updateItem = useCallback(async (docId, updates, userId, _userName) => {
    try {
      await updateDoc(doc(db, 'churches', churchId, 'items', docId), {
        ...updates,
        updatedAt: new Date().toISOString()
      });
      await logActivity('edit_item', updates.itemId || docId, userId, { description: updates.description });
    } catch (err) { handleErr(err); }
  }, [churchId]);

  const checkOutItem = useCallback(async (docId, data, userId, _userName) => {
    try {
      await updateDoc(doc(db, 'churches', churchId, 'items', docId), {
        status: 'Checked Out',
        assignedTo: data.person,
        checkOutDate: data.date,
        expectedReturn: data.returnDate,
        updatedAt: new Date().toISOString()
      });
      await logActivity('check_out', data.itemId, userId, {
        person: data.person,
        purpose: data.purpose,
        ministry: data.ministry,
        expectedReturn: data.returnDate
      });
    } catch (err) { handleErr(err); }
  }, [churchId]);

  const returnItem = useCallback(async (docId, data, userId, _userName) => {
    try {
      await updateDoc(doc(db, 'churches', churchId, 'items', docId), {
        status: 'Available',
        assignedTo: '',
        checkOutDate: '',
        expectedReturn: '',
        condition: data.condition,
        updatedAt: new Date().toISOString()
      });
      await logActivity('return', data.itemId, userId, {
        condition: data.condition,
        returnedBy: data.person
      });
    } catch (err) { handleErr(err); }
  }, [churchId]);

  const deleteItem = useCallback(async (docId, itemId, userId, _userName) => {
    try {
      await deleteDoc(doc(db, 'churches', churchId, 'items', docId));
      await logActivity('delete_item', itemId, userId);
    } catch (err) { handleErr(err); }
  }, [churchId]);

  const retireItem = useCallback(async (docId, data, userId, _userName) => {
    try {
      await updateDoc(doc(db, 'churches', churchId, 'items', docId), {
        status: 'Disposed',
        disposedReason: data.reason,
        disposedDate: data.date,
        disposedBy: userId,
        disposedNotes: data.notes,
        recoveryValue: data.recoveryValue || null,
        updatedAt: new Date().toISOString()
      });
      await logActivity('dispose', data.itemId, userId, {
        reason: data.reason,
        notes: data.notes
      });
    } catch (err) { handleErr(err); }
  }, [churchId]);

  const markRepair = useCallback(async (docId, data, userId, _userName) => {
    try {
      await updateDoc(doc(db, 'churches', churchId, 'items', docId), {
        status: 'Under Repair',
        repairIssue: data.issue,
        repairHandler: data.handler,
        repairExpectedDate: data.expectedDate,
        updatedAt: new Date().toISOString()
      });
      await logActivity('mark_repair', data.itemId, userId, {
        issue: data.issue,
        handler: data.handler
      });
    } catch (err) { handleErr(err); }
  }, [churchId]);

  const markRepaired = useCallback(async (docId, data, userId, _userName) => {
    try {
      await updateDoc(doc(db, 'churches', churchId, 'items', docId), {
        status: 'Available',
        repairIssue: '',
        repairHandler: '',
        repairExpectedDate: '',
        updatedAt: new Date().toISOString()
      });
      await logActivity('mark_repaired', data.itemId, userId, {});
    } catch (err) { handleErr(err); }
  }, [churchId]);

  // ── Supplies ──
  const addSupply = useCallback(async (supply, userId, _userName) => {
    try {
      await addDoc(collection(db, 'churches', churchId, 'supplies'), {
        ...supply,
        createdBy: userId,
        createdAt: new Date().toISOString()
      });
      await logActivity('add_supply', supply.supplyId, userId, { description: supply.description });
    } catch (err) { handleErr(err); }
  }, [churchId]);

  const useSupply = useCallback(async (docId, data, userId, _userName) => {
    try {
      const ref = doc(db, 'churches', churchId, 'supplies', docId);
      let current, newQty;
      await runTransaction(db, async (tx) => {
        const snap = await tx.get(ref);
        if (!snap.exists()) return;
        current = snap.data();
        newQty = Math.max(0, (current.quantity || 0) - Number(data.qty));
        tx.update(ref, { quantity: newQty });
      });
      if (!current) return;
      await logActivity('use_supply', current.supplyId, userId, {
        quantityUsed: Number(data.qty),
        purpose: data.purpose,
        remaining: newQty
      });
    } catch (err) { handleErr(err); }
  }, [churchId]);

  const restockSupply = useCallback(async (docId, data, userId, _userName) => {
    try {
      const ref = doc(db, 'churches', churchId, 'supplies', docId);
      let current, newQty;
      await runTransaction(db, async (tx) => {
        const snap = await tx.get(ref);
        if (!snap.exists()) return;
        current = snap.data();
        newQty = (current.quantity || 0) + Number(data.qty);
        tx.update(ref, { quantity: newQty, lastRestocked: new Date().toISOString() });
      });
      if (!current) return;
      await logActivity('restock', current.supplyId, userId, {
        quantityAdded: Number(data.qty),
        source: data.source,
        newTotal: newQty
      });
    } catch (err) { handleErr(err); }
  }, [churchId]);

  const updateSupply = useCallback(async (docId, updates, userId, _userName) => {
    try {
      await updateDoc(doc(db, 'churches', churchId, 'supplies', docId), updates);
      await logActivity('edit_supply', updates.supplyId || docId, userId, { description: updates.description });
    } catch (err) { handleErr(err); }
  }, [churchId]);

  const deleteSupply = useCallback(async (docId, supplyId, userId, _userName) => {
    try {
      await deleteDoc(doc(db, 'churches', churchId, 'supplies', docId));
      await logActivity('delete_supply', supplyId, userId);
    } catch (err) { handleErr(err); }
  }, [churchId]);

  // ── Activity Log ──
  // Actor display text has one source: the authenticated profile loaded by
  // useAuth. Callers cannot supply a divergent name that the rules would reject
  // (DEC-2026-005). Intentionally no fallback: a malformed name-less profile
  // fails closed instead of creating a misleading audit row.
  const logActivity = useCallback(async (action, itemId, userId, details = {}) => {
    try {
      await addDoc(collection(db, 'churches', churchId, 'activityLog'), {
        action,
        itemId,
        performedBy: userId,
        performedByName: userProfile?.name,
        timestamp: serverTimestamp(),
        details
      });
    } catch (err) {
      // Audit-log writes follow successful user actions. A failure here
      // means the action committed but the trail is missing — engineering
      // needs to see it in Sentry, but the user shouldn't see a confusing
      // toast over the operation they just successfully completed.
      handleErr(err, { op: 'logActivity', silent: true });
    }
  }, [churchId, userProfile?.name]);

  // ── Reservations ──
  const addReservation = useCallback(async (res, userId, userName) => {
    try {
      await addDoc(collection(db, 'churches', churchId, 'reservations'), {
        ...res,
        requestedBy: userId,
        requestedByName: userName,
        status: res.status || 'Pending', // auto-approve path passes 'Approved' (Phase 4)
        createdAt: new Date().toISOString()
      });
    } catch (err) { handleErr(err); }
  }, [churchId]);

  const updateReservation = useCallback(async (docId, updates) => {
    try {
      await updateDoc(doc(db, 'churches', churchId, 'reservations', docId), updates);
    } catch (err) { handleErr(err); }
  }, [churchId]);

  // ── User management ──
  const updateUser = useCallback(async (userId, updates) => {
    try {
      await updateDoc(doc(db, 'users', userId), updates);
    } catch (err) { handleErr(err); }
  }, []);

  const removeUser = useCallback(async (userId) => {
    try {
      await deleteDoc(doc(db, 'users', userId));
    } catch (err) { handleErr(err); }
  }, []);

  // ── Maintenance Tickets ──
  const addTicket = useCallback(async (ticket, userId, userName) => {
    try {
      // Atomic ticket numbering + doc create via one transaction on config/main.
      // The doc is minted in `workItems` (id `mnt_<bare>`, with a
      // `type: 'maintenance'` discriminator); the bare id is returned for linking.
      let ticketNumber;
      const configRef = doc(db, 'churches', churchId, 'config', 'main');
      const { ref, id: newId } = newTicketDocRef(churchId);
      await runTransaction(db, async (t) => {
        const configSnap = await t.get(configRef);
        const maxNum = (configSnap.data()?.maxTicketNumber || 0) + 1;
        ticketNumber = 'MNT-' + String(maxNum).padStart(3, '0');
        t.update(configRef, { maxTicketNumber: maxNum });
        t.set(ref, {
          ...ticket,
          type: 'maintenance',
          ticketNumber,
          createdBy: userId,
          createdByName: userName,
          status: ticket.status || 'Backlog',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          completedAt: null
        });
      });
      await logActivity('add_ticket', ticket.linkedItemId || ticketNumber, userId, { name: ticket.name, priority: ticket.priority });
      return newId;
    } catch (err) { handleErr(err); }
  }, [churchId]);

  const updateTicket = useCallback(async (docId, updates) => {
    try {
      const data = { ...updates, updatedAt: new Date().toISOString() };
      if (updates.status === 'Complete' && !updates.completedAt) {
        data.completedAt = new Date().toISOString();
      }
      await updateDoc(ticketDocRef(churchId, docId), data);
    } catch (err) { handleErr(err); }
  }, [churchId]);

  const addTicketComment = useCallback(async (ticketId, text, authorId, authorName) => {
    try {
      await addDoc(collection(ticketDocRef(churchId, ticketId), 'comments'), {
        text,
        authorId,
        authorName,
        createdAt: new Date().toISOString()
      });
    } catch (err) { handleErr(err); }
  }, [churchId]);

  const updateTicketComment = useCallback(async (ticketId, commentId, text) => {
    try {
      await updateDoc(doc(ticketDocRef(churchId, ticketId), 'comments', commentId), {
        text, updatedAt: new Date().toISOString()
      });
    } catch (err) { handleErr(err); }
  }, [churchId]);

  const deleteTicketComment = useCallback(async (ticketId, commentId) => {
    try {
      await deleteDoc(doc(ticketDocRef(churchId, ticketId), 'comments', commentId));
    } catch (err) { handleErr(err); }
  }, [churchId]);

  const deleteTicket = useCallback(async (docId) => {
    try {
      const ref = ticketDocRef(churchId, docId);
      const snap = await getDoc(ref);
      const linkedTaskDocId = snap.exists() ? snap.data()?.linkedTaskDocId : null;
      await deleteDoc(ref);
      if (linkedTaskDocId) {
        updateDoc(taskDocRef(churchId, linkedTaskDocId), { linkedTicketDocId: null }).catch(() => {});
      }
    } catch (err) { handleErr(err); }
  }, [churchId]);

  const addMaintenanceTags = useCallback(async (tags) => {
    if (!tags.length) return;
    try {
      await updateDoc(doc(db, 'churches', churchId, 'config', 'settings'), {
        maintenanceTags: arrayUnion(...tags)
      });
    } catch (err) { handleErr(err); }
  }, [churchId]);

  // ── Tasks ──
  const addTask = useCallback(async (task, userId, userName) => {
    try {
      // The doc is minted in `workItems` (id `task_<bare>`, with a
      // `type: 'task'` discriminator); the bare id is returned for linking.
      let taskNumber;
      const configRef = doc(db, 'churches', churchId, 'config', 'main');
      const { ref: newDocRef, id: newId } = newTaskDocRef(churchId);
      await runTransaction(db, async (t) => {
        const configSnap = await t.get(configRef);
        const maxNum = (configSnap.data()?.maxTaskNumber || 0) + 1;
        taskNumber = 'TSK-' + String(maxNum).padStart(3, '0');
        t.set(configRef, { maxTaskNumber: maxNum }, { merge: true });
        t.set(newDocRef, {
          ...task,
          type: 'task',
          taskNumber,
          createdBy: userId,
          createdByName: userName,
          status: task.status || 'Backlog',
          visibility: task.visibility || 'team',
          sharedWith: task.sharedWith || [],
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          completedAt: null
        });
      });
      const addLogDetails = { priority: task.priority };
      if (task.visibility !== 'private' && task.visibility !== 'shared') addLogDetails.name = task.name;
      await logActivity('add_task', taskNumber, userId, addLogDetails);
      return newId;
    } catch (err) { handleErr(err); throw err; }
  }, [churchId]);

  const updateTask = useCallback(async (docId, updates, userId, userName, taskNumber) => {
    try {
      const { taskNumber: _tn, createdBy: _cb, createdByName: _cbn, createdAt: _ca, _docId, ...safe } = updates;
      const data = { ...safe, updatedAt: new Date().toISOString() };
      if (updates.status === 'Complete' && !updates.completedAt) {
        data.completedAt = new Date().toISOString();
      }
      await updateDoc(taskDocRef(churchId, docId), data);
      if (userId) {
        const action = safe.status === 'Complete' ? 'complete_task' : 'update_task';
        const updateLogDetails = { ...(safe.status ? { status: safe.status } : {}) };
        if (safe.name && safe.visibility !== 'private' && safe.visibility !== 'shared') updateLogDetails.name = safe.name;
        await logActivity(action, taskNumber || docId, userId, updateLogDetails);
      }
    } catch (err) { handleErr(err); throw err; }
  }, [churchId]);

  const deleteTask = useCallback(async (docId, task, userId, _userName) => {
    try {
      const taskNumber = typeof task === 'string' ? task : (task?.taskNumber || docId);
      const photoUrls = typeof task === 'object' ? (task?.photos || []) : [];
      const linkedJobDocId = typeof task === 'object' ? task?.linkedJobDocId : null;
      const linkedTicketDocId = typeof task === 'object' ? task?.linkedTicketDocId : null;
      const linkedReservationDocId = typeof task === 'object' ? task?.linkedReservationDocId : null;
      const taskRef = taskDocRef(churchId, docId);
      const commentsSnap = await getDocs(collection(taskRef, 'comments'));
      const batch = writeBatch(db);
      commentsSnap.docs.forEach(d => batch.delete(d.ref));
      batch.delete(taskRef);
      await batch.commit();
      if (photoUrls.length > 0) {
        await Promise.allSettled(photoUrls.map(url => {
          try { return deleteObject(stRef(storage, url)); } catch { return Promise.resolve(); }
        }));
      }
      if (linkedJobDocId) {
        updateDoc(doc(db, 'churches', churchId, 'jobListings', linkedJobDocId), { linkedTaskDocId: null }).catch(() => {});
      }
      if (linkedTicketDocId) {
        updateDoc(ticketDocRef(churchId, linkedTicketDocId), { linkedTaskDocId: null }).catch(() => {});
      }
      if (linkedReservationDocId) {
        updateDoc(doc(db, 'churches', churchId, 'reservations', linkedReservationDocId), { linkedSetupTaskDocId: null }).catch(() => {});
      }
      if (userId) await logActivity('delete_task', taskNumber, userId, {});
    } catch (err) { handleErr(err); throw err; }
  }, [churchId]);

  const addTaskComment = useCallback(async (taskId, text, authorId, authorName, mentions) => {
    if (!text || !text.trim()) return;
    try {
      const data = { text, authorId, authorName, createdAt: new Date().toISOString() };
      if (mentions && mentions.length > 0) data.mentions = mentions;
      await addDoc(collection(taskDocRef(churchId, taskId), 'comments'), data);
    } catch (err) { handleErr(err); throw err; }
  }, [churchId]);

  const updateTaskComment = useCallback(async (taskId, commentId, text) => {
    try {
      await updateDoc(doc(taskDocRef(churchId, taskId), 'comments', commentId), {
        text, updatedAt: new Date().toISOString()
      });
    } catch (err) { handleErr(err); throw err; }
  }, [churchId]);

  const deleteTaskComment = useCallback(async (taskId, commentId) => {
    try {
      await deleteDoc(doc(taskDocRef(churchId, taskId), 'comments', commentId));
    } catch (err) { handleErr(err); throw err; }
  }, [churchId]);

  const addTaskTags = useCallback(async (tags) => {
    if (!tags.length) return;
    try {
      await updateDoc(doc(db, 'churches', churchId, 'config', 'settings'), {
        taskTags: arrayUnion(...tags)
      });
    } catch (err) { handleErr(err); }
  }, [churchId]);

  // ── Task Templates ──
  const addTaskTemplate = useCallback(async (template, userId, userName) => {
    try {
      const ref = await addDoc(collection(db, 'churches', churchId, 'taskTemplates'), {
        ...template,
        createdBy: userId,
        createdByName: userName,
        createdAt: new Date().toISOString(),
      });
      await logActivity('create_template', template.name || ref.id, userId, { recurrence: template.recurrence });
    } catch (err) { handleErr(err); throw err; }
  }, [churchId]);

  const deleteTaskTemplate = useCallback(async (docId, userId, _userName) => {
    try {
      await deleteDoc(doc(db, 'churches', churchId, 'taskTemplates', docId));
      if (userId) await logActivity('delete_template', docId, userId, {});
    } catch (err) { handleErr(err); throw err; }
  }, [churchId]);

  // ── Bundles ──
  const addBundle = useCallback(async (bundle, userId, userName) => {
    try {
      await addDoc(collection(db, 'churches', churchId, 'bundles'), {
        ...bundle,
        createdBy: userId,
        createdByName: userName,
        createdAt: new Date().toISOString()
      });
    } catch (err) { handleErr(err); }
  }, [churchId]);

  const updateBundle = useCallback(async (docId, updates) => {
    try {
      await updateDoc(doc(db, 'churches', churchId, 'bundles', docId), updates);
    } catch (err) { handleErr(err); }
  }, [churchId]);

  const deleteBundle = useCallback(async (docId) => {
    try {
      await deleteDoc(doc(db, 'churches', churchId, 'bundles', docId));
    } catch (err) { handleErr(err); }
  }, [churchId]);

  // ── Notification config ──
  const updateNotificationConfig = useCallback(async (updates) => {
    try {
      await setDoc(doc(db, 'churches', churchId, 'config', 'notifications'), updates, { merge: true });
    } catch (err) { handleErr(err); }
  }, [churchId]);

  // ── Audits ──
  const addAudit = useCallback(async (audit, userId, userName) => {
    try {
      await addDoc(collection(db, 'churches', churchId, 'audits'), {
        ...audit,
        conductedBy: userId,
        conductedByName: userName,
        createdAt: new Date().toISOString(),
      });
    } catch (err) { handleErr(err); }
  }, [churchId]);

  const updateAudit = useCallback(async (docId, updates) => {
    try {
      await updateDoc(doc(db, 'churches', churchId, 'audits', docId), updates);
    } catch (err) { handleErr(err); }
  }, [churchId]);

  // ── Suggestions ──
  const submitSuggestion = useCallback(async (text, category, userId, userName, churchName) => {
    try {
      await addDoc(collection(db, 'suggestions'), {
        text,
        category,
        submittedBy: userId,
        submittedByName: userName,
        churchId,
        churchName,
        submittedAt: new Date().toISOString()
      });
    } catch (err) { handleErr(err); }
  }, [churchId]);

  const loadSuggestions = useCallback(async () => {
    try {
      const snap = await getDocs(query(collection(db, 'suggestions'), orderBy('submittedAt', 'desc'), limit(100)));
      return snap.docs.map(d => ({ id: d.id, ...d.data() }));
    } catch (err) {
      handleErr(err);
      return [];
    }
  }, []);

  // ── Vendors ──
  const addVendor = useCallback(async (vendor) => {
    try {
      await addDoc(collection(db, 'churches', churchId, 'vendors'), {
        ...vendor,
        createdAt: new Date().toISOString()
      });
    } catch (err) { handleErr(err); }
  }, [churchId]);

  const updateVendor = useCallback(async (docId, updates) => {
    try {
      await updateDoc(doc(db, 'churches', churchId, 'vendors', docId), updates);
    } catch (err) { handleErr(err); }
  }, [churchId]);

  const deleteVendor = useCallback(async (docId) => {
    try {
      await deleteDoc(doc(db, 'churches', churchId, 'vendors', docId));
    } catch (err) { handleErr(err); }
  }, [churchId]);

  // ── Rooms/Spaces ──
  const addRoom = useCallback(async (room) => {
    try {
      const ref = await addDoc(collection(db, 'churches', churchId, 'rooms'), {
        ...room,
        active: true,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });
      return ref.id;
    } catch (err) { handleErr(err); }
  }, [churchId]);

  const updateRoom = useCallback(async (docId, updates) => {
    try {
      await updateDoc(doc(db, 'churches', churchId, 'rooms', docId), {
        ...updates,
        updatedAt: new Date().toISOString(),
      });
    } catch (err) { handleErr(err); }
  }, [churchId]);

  const deleteRoom = useCallback(async (docId) => {
    try {
      await deleteDoc(doc(db, 'churches', churchId, 'rooms', docId));
    } catch (err) { handleErr(err); }
  }, [churchId]);

  const dismissPublicRequest = useCallback(async (docId) => {
    try {
      await updateDoc(doc(db, 'churches', churchId, 'publicRequests', docId), { status: 'dismissed' });
    } catch (err) { handleErr(err); }
  }, [churchId]);

  // ── Access People ──
  const addAccessPerson = useCallback(async (person, userId) => {
    try {
      await addDoc(collection(db, 'churches', churchId, 'accessPeople'), {
        ...person,
        active: true,
        createdBy: userId,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      });
    } catch (err) { handleErr(err); }
  }, [churchId]);

  const updateAccessPerson = useCallback(async (docId, updates) => {
    try {
      await updateDoc(doc(db, 'churches', churchId, 'accessPeople', docId), {
        ...updates,
        updatedAt: new Date().toISOString()
      });
    } catch (err) { handleErr(err); }
  }, [churchId]);

  const archiveAccessPerson = useCallback(async (docId) => {
    try {
      await updateDoc(doc(db, 'churches', churchId, 'accessPeople', docId), {
        active: false,
        updatedAt: new Date().toISOString()
      });
    } catch (err) { handleErr(err); }
  }, [churchId]);

  // ── Time Entries (contractor / labor hours) ──
  const addTimeEntry = useCallback(async (entry) => {
    try {
      await addDoc(collection(db, 'churches', churchId, 'timeEntries'), {
        ...entry,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });
    } catch (err) { handleErr(err, { op: 'addTimeEntry', hub: 'people_access' }); }
  }, [churchId]);

  const updateTimeEntry = useCallback(async (docId, updates) => {
    try {
      await updateDoc(doc(db, 'churches', churchId, 'timeEntries', docId), {
        ...updates,
        updatedAt: new Date().toISOString(),
      });
    } catch (err) { handleErr(err, { op: 'updateTimeEntry', hub: 'people_access' }); }
  }, [churchId]);

  const deleteTimeEntry = useCallback(async (docId) => {
    try {
      await deleteDoc(doc(db, 'churches', churchId, 'timeEntries', docId));
    } catch (err) { handleErr(err, { op: 'deleteTimeEntry', hub: 'people_access' }); }
  }, [churchId]);

  // ── Access Records ──
  const addAccessRecord = useCallback(async (record) => {
    try {
      await addDoc(collection(db, 'churches', churchId, 'accessRecords'), {
        ...record,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      });
    } catch (err) { handleErr(err); }
  }, [churchId]);

  const updateAccessRecord = useCallback(async (docId, updates) => {
    try {
      await updateDoc(doc(db, 'churches', churchId, 'accessRecords', docId), {
        ...updates,
        updatedAt: new Date().toISOString()
      });
    } catch (err) { handleErr(err); }
  }, [churchId]);

  const deleteAccessRecord = useCallback(async (docId) => {
    try {
      await deleteDoc(doc(db, 'churches', churchId, 'accessRecords', docId));
    } catch (err) { handleErr(err); }
  }, [churchId]);

  const addPeopleAccessRequirement = useCallback(async (requirement) => {
    try {
      await updateDoc(doc(db, 'churches', churchId, 'config', 'settings'), {
        peopleAccessRequirements: arrayUnion(requirement)
      });
    } catch (err) { handleErr(err); }
  }, [churchId]);

  const linkAccessPerson = useCallback(async (docId, userId) => {
    try {
      await updateDoc(doc(db, 'churches', churchId, 'accessPeople', docId), { userId, updatedAt: new Date().toISOString() });
    } catch (err) { handleErr(err); }
  }, [churchId]);

  const unlinkAccessPerson = useCallback(async (docId) => {
    try {
      await updateDoc(doc(db, 'churches', churchId, 'accessPeople', docId), { userId: null, updatedAt: new Date().toISOString() });
    } catch (err) { handleErr(err); }
  }, [churchId]);

  const removePeopleAccessRequirement = useCallback(async (reqId) => {
    try {
      // F-RC-1 from the 2026-05-12 audit: previously this read the settings
      // doc, filtered the array client-side, and wrote the result back without
      // a transaction. Two admins removing two DIFFERENT requirements
      // concurrently would each read the original array, filter out their
      // chosen entry, and write — last write wins, resurrecting the first
      // removal. Now atomic via runTransaction.
      const settingsRef = doc(db, 'churches', churchId, 'config', 'settings');
      await runTransaction(db, async (t) => {
        const snap = await t.get(settingsRef);
        const reqs = (snap.data()?.peopleAccessRequirements || []).filter(r => r.id !== reqId);
        t.update(settingsRef, { peopleAccessRequirements: reqs });
      });
    } catch (err) { handleErr(err); }
  }, [churchId]);

  // ── Job Hub ──
  const addJobListingSeries = useCallback(async (job, recurrenceFreq, seriesEndDate, userId, userName) => {
    try {
      const dates = generateRecurrenceDates(job.scheduledDate, recurrenceFreq, seriesEndDate);
      if (dates.length === 0) throw new Error('No dates generated. Check recurrence end date.');

      const configRef = doc(db, 'churches', churchId, 'config', 'main');
      const refs = dates.map(() => doc(collection(db, 'churches', churchId, 'jobListings')));
      const seriesGroupId = refs[0].id;
      let firstJobNumber;
      await runTransaction(db, async (t) => {
        const configSnap = await t.get(configRef);
        const startNum = (configSnap.data()?.maxJobNumber || 0) + 1;
        t.update(configRef, { maxJobNumber: startNum + dates.length - 1 });
        refs.forEach((ref, i) => {
          const jobNumber = 'JOB-' + String(startNum + i).padStart(3, '0');
          if (i === 0) firstJobNumber = jobNumber;
          t.set(ref, {
            ...job,
            scheduledDate: dates[i],
            jobNumber,
            recurrenceGroupId: seriesGroupId,
            recurrenceFreq,
            seriesEndDate,
            // Roster lives in subcollections (audit H1); parent holds counters.
            signupCount: 0,
            waitlistCount: 0,
            createdBy: userId,
            createdByName: userName,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          });
        });
      });
      await logActivity('post_job', `${firstJobNumber} (series ×${dates.length})`, userId, { title: job.title, recurrenceFreq });
    } catch (err) { handleErr(err); throw err; }
  }, [churchId]);

  const addJobListing = useCallback(async (job, userId, userName) => {
    try {
      const configRef = doc(db, 'churches', churchId, 'config', 'main');
      const newDocRef = doc(collection(db, 'churches', churchId, 'jobListings'));
      let jobNumber;
      await runTransaction(db, async (t) => {
        const configSnap = await t.get(configRef);
        const maxNum = (configSnap.data()?.maxJobNumber || 0) + 1;
        jobNumber = 'JOB-' + String(maxNum).padStart(3, '0');
        t.update(configRef, { maxJobNumber: maxNum });
        t.set(newDocRef, {
          ...job,
          jobNumber,
          // Roster lives in subcollections (audit H1); parent holds counters.
          signupCount: 0,
          waitlistCount: 0,
          createdBy: userId,
          createdByName: userName,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        });
      });
      await logActivity('post_job', jobNumber, userId, { title: job.title });
      return newDocRef.id; // callers (e.g. task → Job convert) need the new id to write the backref
    } catch (err) { handleErr(err); throw err; }
  }, [churchId]);

  const updateJobListing = useCallback(async (docId, updates, userId, userName, jobNumber) => {
    try {
      // Capture jobNumber so the activity log shows JOB-### not a docId.
      // Prefer the explicit param; fall back to updates.jobNumber if a caller passes it.
      const jobNumberForLog = jobNumber || updates.jobNumber;
      // Strip server-managed and identity fields. A stale doc passed in as
      // `updates` would otherwise clobber waitlist state, dedupe stamps, or
      // recurrence metadata.
      const {
        createdBy: _cb, createdByName: _cbn, jobNumber: _jn,
        signups: _s, waitlist: _w, signupCount: _sc, waitlistCount: _wc,
        cancellationEmailSentAt: _ce, lastReminderSentDate: _lr, lastPosterNotifiedByActors: _lp,
        recurrenceGroupId: _rg, recurrenceFreq: _rf, seriesEndDate: _se, newJobsDigestSent: _nd,
        ...safeUpdates
      } = updates;

      // If spotsTotal is being reduced, run a transaction to verify it doesn't go below current signup count.
      if (safeUpdates.spotsTotal !== undefined) {
        const jobRef = doc(db, 'churches', churchId, 'jobListings', docId);
        await runTransaction(db, async (t) => {
          const snap = await t.get(jobRef);
          if (!snap.exists()) return;
          const currentSignups = (snap.data().signupCount || 0);
          if (safeUpdates.spotsTotal < currentSignups) {
            throw new Error(`Cannot reduce spots below current signup count (${currentSignups}).`);
          }
          t.update(jobRef, { ...safeUpdates, updatedAt: new Date().toISOString() });
        });
      } else {
        await updateDoc(doc(db, 'churches', churchId, 'jobListings', docId), {
          ...safeUpdates,
          updatedAt: new Date().toISOString()
        });
      }
      if (userId) await logActivity('update_job', jobNumberForLog || docId, userId, { title: updates.title, status: updates.status });
    } catch (err) { handleErr(err); throw err; }
  }, [churchId]);

  const deleteJobListing = useCallback(async (docId, userId, userName, jobNumber) => {
    try {
      const ref = doc(db, 'churches', churchId, 'jobListings', docId);
      const snap = await getDoc(ref);
      const linkedTaskDocId = snap.exists() ? snap.data()?.linkedTaskDocId : null;
      await deleteDoc(ref);
      if (linkedTaskDocId) {
        updateDoc(taskDocRef(churchId, linkedTaskDocId), { linkedJobDocId: null }).catch(() => {});
      }
      await clearJobSwapRequests([docId]);
      if (userId) await logActivity('delete_job', jobNumber || docId, userId, {});
    } catch (err) { handleErr(err); throw err; }
  }, [churchId]);

  // Updates all series jobs with scheduledDate >= fromDate atomically via runTransaction.
  // Returns { count, affected: [{docId, signupCount}] } so callers can fan out
  // per-job side effects (e.g. firing sendJobCancelledEmails on a series cancel).
  const updateJobListingSeries = useCallback(async (groupId, fromDate, updates, userId, _userName) => {
    try {
      const {
        createdBy: _cb, createdByName: _cbn, jobNumber: _jn,
        signups: _s, waitlist: _w, signupCount: _sc, waitlistCount: _wc, scheduledDate: _sd,
        cancellationEmailSentAt: _ce, lastReminderSentDate: _lr, lastPosterNotifiedByActors: _lp,
        recurrenceGroupId: _rg, recurrenceFreq: _rf, seriesEndDate: _se, newJobsDigestSent: _nd,
        ...safeUpdates
      } = updates;
      // Fetch refs first (outside transaction — query can't run inside a transaction)
      const snap = await getDocs(query(
        collection(db, 'churches', churchId, 'jobListings'),
        where('recurrenceGroupId', '==', groupId),
        where('scheduledDate', '>=', fromDate)
      ));
      if (snap.empty) return { count: 0, affected: [] };
      const refs = snap.docs.map(d => d.ref);
      const affected = [];
      await runTransaction(db, async (t) => {
        const docs = await Promise.all(refs.map(ref => t.get(ref)));
        if (safeUpdates.spotsTotal !== undefined) {
          for (const d of docs) {
            if (!d.exists()) continue;
            const cnt = (d.data().signupCount || 0);
            if (safeUpdates.spotsTotal < cnt) {
              throw new Error(`Cannot reduce spots — ${d.data().jobNumber || d.id} has ${cnt} signup(s) which would exceed the new limit.`);
            }
          }
        }
        const now = new Date().toISOString();
        affected.length = 0;
        docs.forEach(d => {
          if (!d.exists()) return;
          t.update(d.ref, { ...safeUpdates, updatedAt: now });
          affected.push({ docId: d.id, signupCount: (d.data().signupCount || 0) });
        });
      });
      await logActivity('update_job', `${updates.title || groupId} (series ×${refs.length})`, userId, { title: updates.title });
      return { count: refs.length, affected };
    } catch (err) { handleErr(err); throw err; }
  }, [churchId]);

  // Data #1 from the 2026-05-12 audit: previously these batch-deleted series
  // jobs without clearing linkedTaskDocId on any task that pointed back at
  // them. The corresponding Task kept a stale "Linked Job" chip pointing at
  // a doc that no longer exists. Single-job deleteJobListing already cleans
  // its back-ref (line ~960); mirror the same cleanup here for both series
  // delete paths.
  async function clearLinkedTaskBackRefs(docs) {
    const linkedTaskDocIds = docs
      .map(d => d.exists() ? d.data()?.linkedTaskDocId : null)
      .filter(Boolean);
    if (linkedTaskDocIds.length === 0) return;
    // Best-effort fire-and-forget. If a task was also deleted concurrently
    // we don't want the series delete to fail; just log + Sentry on errors.
    await Promise.allSettled(linkedTaskDocIds.map(taskId =>
      updateDoc(taskDocRef(churchId, taskId), { linkedJobDocId: null })
    ));
  }

  // Audit L4: jobSwapRequests would be orphaned (litter) when their job is
  // deleted. Best-effort cleanup keyed on jobDocId; a failure here must never
  // fail the job delete itself.
  async function clearJobSwapRequests(docIds) {
    if (!docIds || docIds.length === 0) return;
    try {
      const snaps = await Promise.all(docIds.map(id => getDocs(query(
        collection(db, 'churches', churchId, 'jobSwapRequests'),
        where('jobDocId', '==', id)
      ))));
      const refs = snaps.flatMap(s => s.docs.map(d => d.ref));
      if (refs.length === 0) return;
      const batch = writeBatch(db);
      refs.forEach(r => batch.delete(r));
      await batch.commit();
    } catch (err) {
      console.error('[ChurchOpsHub] clearJobSwapRequests failed', err);
    }
  }

  // Deletes all jobs in a recurring series from a given date onward.
  const deleteJobListingSeriesFrom = useCallback(async (groupId, fromDate, userId, _userName) => {
    try {
      const snap = await getDocs(query(
        collection(db, 'churches', churchId, 'jobListings'),
        where('recurrenceGroupId', '==', groupId),
        where('scheduledDate', '>=', fromDate)
      ));
      if (snap.empty) return;
      await clearLinkedTaskBackRefs(snap.docs);
      const batch = writeBatch(db);
      snap.docs.forEach(d => batch.delete(d.ref));
      await batch.commit();
      await clearJobSwapRequests(snap.docs.map(d => d.id));
      await logActivity('delete_job', `series from ${fromDate} ×${snap.size}`, userId, {});
    } catch (err) { handleErr(err); throw err; }
  }, [churchId]);

  // Deletes all jobs in a recurring series.
  const deleteJobListingSeries = useCallback(async (groupId, userId, _userName) => {
    try {
      const snap = await getDocs(query(
        collection(db, 'churches', churchId, 'jobListings'),
        where('recurrenceGroupId', '==', groupId)
      ));
      if (snap.empty) return;
      await clearLinkedTaskBackRefs(snap.docs);
      const batch = writeBatch(db);
      snap.docs.forEach(d => batch.delete(d.ref));
      await batch.commit();
      await clearJobSwapRequests(snap.docs.map(d => d.id));
      await logActivity('delete_job', `series ×${snap.size}`, userId, {});
    } catch (err) { handleErr(err); throw err; }
  }, [churchId]);

  // Roster mutations (audit H1/H2, 2026-05-22): signups/waitlist live in
  // protected per-uid subcollections written exclusively by Cloud Functions,
  // which enforce compliance/waiver/capacity server-side. These wrappers call
  // those functions; activity logging stays client-side as before.
  const signUpForJob = useCallback(async (docId, userId, _userName, waiverAccepted, jobNumber) => {
    try {
      const fn = httpsCallable(getFunctions(), 'jobSignUp');
      const { data } = await fn({ churchId, jobDocId: docId, waiverAccepted: !!waiverAccepted });
      // The server returns a structured `{ error, code }` for user-facing
      // signup blocks (job full waitlist-cap reached, already signed up,
      // compliance missing, waiver required, hub off). Surfaced verbatim
      // by the caller; `code` lets the UI route compliance vs. capacity
      // vs. waiver without regex-matching the message.
      if (data?.error) return { error: data.error, code: data.code || 'unknown' };
      if (data?.wasWaitlisted) {
        await logActivity('signup_job', jobNumber || docId, userId, { waitlisted: true });
        return { wasWaitlisted: true };
      }
      await logActivity('signup_job', jobNumber || docId, userId, {});
      return { success: true };
    } catch (err) {
      handleErr(err, { op: 'signUpForJob', hub: 'jobs' });
      return { error: 'Sign-up failed. Please try again.', code: 'thrown' };
    }
  }, [churchId]);

  const withdrawFromJob = useCallback(async (docId, uid, actorId, _actorName, jobNumber) => {
    try {
      const fn = httpsCallable(getFunctions(), 'jobWithdraw');
      const { data } = await fn({ churchId, jobDocId: docId, uid });
      const wasSignedUp = !!data?.wasSignedUp;
      const wasOnWaitlist = !!data?.wasOnWaitlist;
      if (wasSignedUp && actorId) {
        const action = actorId !== uid ? 'admin_remove_job' : 'withdraw_job';
        await logActivity(action, jobNumber || docId, actorId, { removedUid: uid });
      }
      return { wasSignedUp, wasOnWaitlist };
    } catch (err) { handleErr(err, { op: 'withdrawFromJob', hub: 'jobs' }); throw err; }
  }, [churchId]);

  const updateJobSignupAttendance = useCallback(async (docId, uid, attended) => {
    try {
      const fn = httpsCallable(getFunctions(), 'jobSetAttendance');
      const { data } = await fn({ churchId, jobDocId: docId, uid, attended });
      return { updated: !!data?.updated };
    } catch (err) { handleErr(err, { op: 'updateJobSignupAttendance', hub: 'jobs' }); throw err; }
  }, [churchId]);

  // ── Job Swap Requests ──
  const getJobSwapRequests = useCallback(async (jobDocId) => {
    try {
      const snap = await getDocs(query(
        collection(db, 'churches', churchId, 'jobSwapRequests'),
        where('jobDocId', '==', jobDocId)
      ));
      return snap.docs.map(d => ({ _docId: d.id, ...d.data() }));
    } catch (err) { handleErr(err); return []; }
  }, [churchId]);

  // Read-only fetch of the current member's pending swap request for a job
  // (returns the first match or null). Used by the "Withdraw Request" affordance
  // — Firestore rules let members read their own jobSwapRequest documents.
  const getMyJobSwapRequest = useCallback(async (jobDocId, uid) => {
    try {
      const snap = await getDocs(query(
        collection(db, 'churches', churchId, 'jobSwapRequests'),
        where('jobDocId', '==', jobDocId),
        where('uid', '==', uid)
      ));
      const docs = snap.docs.map(d => ({ _docId: d.id, ...d.data() }));
      return docs[0] || null;
    } catch (err) { handleErr(err); return null; }
  }, [churchId]);

  const addJobSwapRequest = useCallback(async (jobDocId, uid, name, note) => {
    try {
      // Audit L4: cap the free-text note (the firestore.rules create rule
      // enforces the same 1000-char bound server-side).
      const ref = await addDoc(collection(db, 'churches', churchId, 'jobSwapRequests'), {
        jobDocId, uid, name: name || '', note: (note || '').slice(0, 1000),
        createdAt: new Date().toISOString()
      });
      return ref.id;
    } catch (err) { handleErr(err); throw err; }
  }, [churchId]);

  const deleteJobSwapRequest = useCallback(async (docId) => {
    try {
      await deleteDoc(doc(db, 'churches', churchId, 'jobSwapRequests', docId));
    } catch (err) { handleErr(err); throw err; }
  }, [churchId]);

  const addJobAnnouncement = useCallback(async (ann, userId, userName) => {
    try {
      const ref = await addDoc(collection(db, 'churches', churchId, 'jobAnnouncements'), {
        ...ann,
        createdBy: userId,
        createdByName: userName,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      });
      await logActivity('post_announcement', ref.id, userId, { title: ann.title });
    } catch (err) { handleErr(err); throw err; }
  }, [churchId]);

  const updateJobAnnouncement = useCallback(async (docId, updates, userId, _userName) => {
    try {
      await updateDoc(doc(db, 'churches', churchId, 'jobAnnouncements', docId), {
        ...updates,
        updatedAt: new Date().toISOString()
      });
      if (userId) await logActivity('update_announcement', docId, userId, { title: updates.title });
    } catch (err) { handleErr(err); throw err; }
  }, [churchId]);

  const deleteJobAnnouncement = useCallback(async (docId, userId, _userName) => {
    try {
      await deleteDoc(doc(db, 'churches', churchId, 'jobAnnouncements', docId));
      if (userId) await logActivity('delete_announcement', docId, userId, {});
    } catch (err) { handleErr(err); throw err; }
  }, [churchId]);

  // Pair with the capped activityLog subscription. Returns the next N
  // entries strictly OLDER than the supplied raw cursor (legacy ISO string or
  // Firestore Timestamp) via a one-shot
  // getDocs (no live updates — those would re-introduce the unbounded-read
  // cost the cap exists to prevent).
  const loadOlderActivityLog = useCallback(async (beforeTimestamp, batchSize = 100) => {
    if (!churchId || !beforeTimestamp) return [];
    try {
      const q = query(
        collection(db, 'churches', churchId, 'activityLog'),
        orderBy('timestamp', 'desc'),
        startAfter(beforeTimestamp),
        limit(batchSize)
      );
      const snap = await getDocs(q);
      return snap.docs.map(activityDoc);
    } catch (err) { handleErr(err); return []; }
  }, [churchId]);

  // One-shot, date-bounded fetch of every activityLog entry at-or-after
  // `sinceTimestamp` (an ISO string). The live `activityLog` subscription is
  // capped at 100 to protect read cost, which silently truncated analytics on
  // older churches — Insights uses this instead to compute over a real window
  // (e.g. trailing 12 months). Pages with startAfter so a busy church doesn't
  // pull one giant snapshot; a hard `maxEntries` ceiling backstops runaway
  // reads. Returns oldest→newest.
  const loadActivityLogSince = useCallback(async (sinceTimestamp, { batchSize = 500, maxEntries = 5000 } = {}) => {
    if (!churchId || !sinceTimestamp) return [];
    try {
      // Historical rows store ISO strings; COH-002 rows store Firestore
      // Timestamps. Query both type lanes during the compatibility period and
      // merge them into the store's ISO-string shape.
      async function fetchLane(startValue, upperExclusive = null) {
        const lane = [];
        let cursor = null;
        for (;;) {
          const clauses = [
            collection(db, 'churches', churchId, 'activityLog'),
            where('timestamp', '>=', startValue),
            ...(upperExclusive ? [where('timestamp', '<', upperExclusive)] : []),
            orderBy('timestamp', 'asc'),
            limit(batchSize),
          ];
          if (cursor) clauses.splice(clauses.length - 1, 0, startAfter(cursor));
          const snap = await getDocs(query(...clauses));
          if (snap.empty) break;
          lane.push(...snap.docs.map(activityDoc));
          if (snap.size < batchSize || lane.length >= maxEntries) break;
          cursor = snap.docs[snap.docs.length - 1].data().timestamp;
        }
        return lane;
      }

      const [legacy, current] = await Promise.all([
        // Firestore orders strings before Timestamps. The upper bound keeps the
        // legacy lane from also returning every Timestamp regardless of date.
        fetchLane(sinceTimestamp, Timestamp.fromMillis(0)),
        fetchLane(Timestamp.fromDate(new Date(sinceTimestamp))),
      ]);
      return [...legacy, ...current]
        .sort((a, b) => (a.timestamp || '').localeCompare(b.timestamp || ''))
        .slice(0, maxEntries);
    } catch (err) { handleErr(err); return []; }
  }, [churchId]);

  // ── Interim task-visibility filter (DEC-2026-010) ───────────────────────────
  // The `workItems` listener above is unconstrained, and production delivers
  // other members' private tasks over it (DEC-2026-009). Until COH-006 replaces
  // it with constrained queries, filter at this single point every consumer
  // reads, so private/shared tasks stay out of Global Search, Event Day, exports,
  // and the attention panel — not just the Work board, which filtered its own
  // list already. This is NOT authorization: the documents still reach the
  // browser. Remove at COH-006's reader cutover so there is one enforcement path.
  const visibleTasks = useMemo(
    () => tasks.filter(t => canSeeTask(t, userProfile?.uid)),
    [tasks, userProfile?.uid]
  );

  return {
    config, settings, items, supplies, activityLog, reservations, users,
    maintenanceTickets, vendors, bundles, notificationConfig, audits,
    tasks: visibleTasks,
    loading, error,
    loadOlderActivityLog, loadActivityLogSince,
    updateSettings, updateConfig,
    addItem, updateItem, checkOutItem, returnItem, retireItem, markRepair, markRepaired, deleteItem,
    addSupply, updateSupply, useSupply, restockSupply, deleteSupply,
    logActivity,
    addReservation, updateReservation,
    updateUser, removeUser,
    addTicket, updateTicket, addTicketComment, updateTicketComment, deleteTicketComment, deleteTicket, addMaintenanceTags,
    addVendor, updateVendor, deleteVendor,
    rooms, addRoom, updateRoom, deleteRoom,
    addBundle, updateBundle, deleteBundle,
    updateNotificationConfig,
    addAudit, updateAudit,
    submitSuggestion, loadSuggestions,
    publicRequests, dismissPublicRequest,
    accessPeople, accessRecords, timeEntries,
    addAccessPerson, updateAccessPerson, archiveAccessPerson,
    addTimeEntry, updateTimeEntry, deleteTimeEntry,
    linkAccessPerson, unlinkAccessPerson,
    addAccessRecord, updateAccessRecord, deleteAccessRecord,
    addPeopleAccessRequirement, removePeopleAccessRequirement,
    addTask, updateTask, deleteTask, addTaskComment, updateTaskComment, deleteTaskComment, addTaskTags,
    taskTemplates, addTaskTemplate, deleteTaskTemplate,
    jobListings, jobAnnouncements,
    addJobListing, addJobListingSeries, updateJobListing, deleteJobListing, updateJobListingSeries, deleteJobListingSeries, deleteJobListingSeriesFrom,
    signUpForJob, withdrawFromJob, updateJobSignupAttendance,
    addJobAnnouncement, updateJobAnnouncement, deleteJobAnnouncement,
    getJobSwapRequests, getMyJobSwapRequest, addJobSwapRequest, deleteJobSwapRequest,
    clearError
  };
}
