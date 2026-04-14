import { useState, useEffect, useCallback } from 'react';
import {
  doc, setDoc, getDoc, deleteDoc, getDocs,
  collection, onSnapshot, addDoc, updateDoc, query, orderBy, arrayUnion, where, limit, runTransaction
} from 'firebase/firestore';
import { db } from './firebase.js';

export function useFirestore(churchId) {
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
  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const clearError = useCallback(() => setError(null), []);

  function handleErr(err) {
    console.error('[ChurchOpsHub]', err);
    setError(err.message);
    addDoc(collection(db, 'errors'), {
      message: err.message,
      stack: err.stack?.split('\n').slice(0, 4).join('\n') || '',
      churchId: churchId || 'unknown',
      timestamp: new Date().toISOString()
    }).catch(() => {});
  }

  // Subscribe to all collections
  useEffect(() => {
    if (!churchId) return;
    const unsubs = [];
    let loaded = 0;
    const totalSubs = 16;
    const checkDone = () => { loaded++; if (loaded >= totalSubs) setLoading(false); };

    // Config
    unsubs.push(onSnapshot(doc(db, 'churches', churchId, 'config', 'main'), (snap) => {
      if (snap.exists()) setConfig(snap.data());
      checkDone();
    }, (err) => { handleErr(err); checkDone(); }));

    // Settings
    unsubs.push(onSnapshot(doc(db, 'churches', churchId, 'config', 'settings'), (snap) => {
      if (snap.exists()) setSettings(snap.data());
      checkDone();
    }, (err) => { handleErr(err); checkDone(); }));

    // Items
    unsubs.push(onSnapshot(collection(db, 'churches', churchId, 'items'), (snap) => {
      setItems(snap.docs.map(d => ({ _docId: d.id, ...d.data() })));
      checkDone();
    }, (err) => { handleErr(err); checkDone(); }));

    // Supplies
    unsubs.push(onSnapshot(collection(db, 'churches', churchId, 'supplies'), (snap) => {
      setSupplies(snap.docs.map(d => ({ _docId: d.id, ...d.data() })));
      checkDone();
    }, (err) => { handleErr(err); checkDone(); }));

    // Activity Log
    unsubs.push(onSnapshot(collection(db, 'churches', churchId, 'activityLog'), (snap) => {
      const logs = snap.docs.map(d => ({ _docId: d.id, ...d.data() }));
      logs.sort((a, b) => (b.timestamp || '').localeCompare(a.timestamp || ''));
      setActivityLog(logs);
      checkDone();
    }, (err) => { handleErr(err); checkDone(); }));

    // Reservations
    unsubs.push(onSnapshot(collection(db, 'churches', churchId, 'reservations'), (snap) => {
      setReservations(snap.docs.map(d => ({ _docId: d.id, ...d.data() })));
      checkDone();
    }, (err) => { handleErr(err); checkDone(); }));

    // Maintenance Tickets
    unsubs.push(onSnapshot(collection(db, 'churches', churchId, 'maintenanceTickets'), (snap) => {
      const tickets = snap.docs.map(d => ({ _docId: d.id, ...d.data() }));
      tickets.sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
      setMaintenanceTickets(tickets);
      checkDone();
    }, (err) => { handleErr(err); checkDone(); }));

    // Vendors
    unsubs.push(onSnapshot(collection(db, 'churches', churchId, 'vendors'), (snap) => {
      setVendors(snap.docs.map(d => ({ _docId: d.id, ...d.data() })));
      checkDone();
    }, (err) => { handleErr(err); checkDone(); }));

    // Users — scoped to this church via query (real-time)
    unsubs.push(onSnapshot(query(collection(db, 'users'), where('churchId', '==', churchId)), (snap) => {
      setUsers(snap.docs.map(d => ({ id: d.id, ...d.data() })));
      checkDone();
    }, (err) => { handleErr(err); checkDone(); }));

    // Bundles
    unsubs.push(onSnapshot(collection(db, 'churches', churchId, 'bundles'), (snap) => {
      setBundles(snap.docs.map(d => ({ _docId: d.id, ...d.data() })));
      checkDone();
    }, (err) => { handleErr(err); checkDone(); }));

    // Notification config
    unsubs.push(onSnapshot(doc(db, 'churches', churchId, 'config', 'notifications'), (snap) => {
      setNotificationConfig(snap.exists() ? snap.data() : {});
      checkDone();
    }, (err) => { handleErr(err); checkDone(); }));

    // Audits
    unsubs.push(onSnapshot(collection(db, 'churches', churchId, 'audits'), (snap) => {
      setAudits(snap.docs.map(d => ({ _docId: d.id, ...d.data() })));
      checkDone();
    }, (err) => { handleErr(err); checkDone(); }));

    // Public Requests
    unsubs.push(onSnapshot(query(collection(db, 'churches', churchId, 'publicRequests'), where('status', '==', 'pending')), (snap) => {
      const reqs = snap.docs.map(d => ({ _docId: d.id, ...d.data() }));
      reqs.sort((a, b) => (b.submittedAt || '').localeCompare(a.submittedAt || ''));
      setPublicRequests(reqs);
      checkDone();
    }, (err) => { handleErr(err); checkDone(); }));

    // Access People
    unsubs.push(onSnapshot(query(collection(db, 'churches', churchId, 'accessPeople'), orderBy('name')), (snap) => {
      setAccessPeople(snap.docs.map(d => ({ _docId: d.id, ...d.data() })));
      checkDone();
    }, (err) => { handleErr(err); checkDone(); }));

    // Access Records
    unsubs.push(onSnapshot(query(collection(db, 'churches', churchId, 'accessRecords'), orderBy('createdAt', 'desc')), (snap) => {
      setAccessRecords(snap.docs.map(d => ({ _docId: d.id, ...d.data() })));
      checkDone();
    }, (err) => { handleErr(err); checkDone(); }));

    // Tasks
    unsubs.push(onSnapshot(collection(db, 'churches', churchId, 'tasks'), (snap) => {
      const t = snap.docs.map(d => ({ _docId: d.id, ...d.data() }));
      t.sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
      setTasks(t);
      checkDone();
    }, (err) => { handleErr(err); checkDone(); }));

    return () => unsubs.forEach(u => u());
  }, [churchId]);

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
  const addItem = useCallback(async (item, userId, userName) => {
    try {
      const ref = await addDoc(collection(db, 'churches', churchId, 'items'), {
        ...item,
        createdBy: userId,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      });
      await logActivity('add_item', item.itemId, userId, userName, { description: item.description });
      return ref.id;
    } catch (err) { handleErr(err); }
  }, [churchId]);

  const updateItem = useCallback(async (docId, updates, userId, userName) => {
    try {
      await updateDoc(doc(db, 'churches', churchId, 'items', docId), {
        ...updates,
        updatedAt: new Date().toISOString()
      });
      await logActivity('edit_item', updates.itemId || docId, userId, userName, { description: updates.description });
    } catch (err) { handleErr(err); }
  }, [churchId]);

  const checkOutItem = useCallback(async (docId, data, userId, userName) => {
    try {
      await updateDoc(doc(db, 'churches', churchId, 'items', docId), {
        status: 'Checked Out',
        assignedTo: data.person,
        checkOutDate: data.date,
        expectedReturn: data.returnDate,
        updatedAt: new Date().toISOString()
      });
      await logActivity('check_out', data.itemId, userId, userName, {
        person: data.person,
        purpose: data.purpose,
        ministry: data.ministry,
        expectedReturn: data.returnDate
      });
    } catch (err) { handleErr(err); }
  }, [churchId]);

  const returnItem = useCallback(async (docId, data, userId, userName) => {
    try {
      await updateDoc(doc(db, 'churches', churchId, 'items', docId), {
        status: 'Available',
        assignedTo: '',
        checkOutDate: '',
        expectedReturn: '',
        condition: data.condition,
        updatedAt: new Date().toISOString()
      });
      await logActivity('return', data.itemId, userId, userName, {
        condition: data.condition,
        returnedBy: data.person
      });
    } catch (err) { handleErr(err); }
  }, [churchId]);

  const deleteItem = useCallback(async (docId, itemId, userId, userName) => {
    try {
      await deleteDoc(doc(db, 'churches', churchId, 'items', docId));
      await logActivity('delete_item', itemId, userId, userName);
    } catch (err) { handleErr(err); }
  }, [churchId]);

  const retireItem = useCallback(async (docId, data, userId, userName) => {
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
      await logActivity('dispose', data.itemId, userId, userName, {
        reason: data.reason,
        notes: data.notes
      });
    } catch (err) { handleErr(err); }
  }, [churchId]);

  const markRepair = useCallback(async (docId, data, userId, userName) => {
    try {
      await updateDoc(doc(db, 'churches', churchId, 'items', docId), {
        status: 'Under Repair',
        repairIssue: data.issue,
        repairHandler: data.handler,
        repairExpectedDate: data.expectedDate,
        updatedAt: new Date().toISOString()
      });
      await logActivity('mark_repair', data.itemId, userId, userName, {
        issue: data.issue,
        handler: data.handler
      });
    } catch (err) { handleErr(err); }
  }, [churchId]);

  const markRepaired = useCallback(async (docId, data, userId, userName) => {
    try {
      await updateDoc(doc(db, 'churches', churchId, 'items', docId), {
        status: 'Available',
        repairIssue: '',
        repairHandler: '',
        repairExpectedDate: '',
        updatedAt: new Date().toISOString()
      });
      await logActivity('mark_repaired', data.itemId, userId, userName, {});
    } catch (err) { handleErr(err); }
  }, [churchId]);

  // ── Supplies ──
  const addSupply = useCallback(async (supply, userId, userName) => {
    try {
      await addDoc(collection(db, 'churches', churchId, 'supplies'), {
        ...supply,
        createdBy: userId,
        createdAt: new Date().toISOString()
      });
      await logActivity('add_supply', supply.supplyId, userId, userName, { description: supply.description });
    } catch (err) { handleErr(err); }
  }, [churchId]);

  const useSupply = useCallback(async (docId, data, userId, userName) => {
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
      await logActivity('use_supply', current.supplyId, userId, userName, {
        quantityUsed: Number(data.qty),
        purpose: data.purpose,
        remaining: newQty
      });
    } catch (err) { handleErr(err); }
  }, [churchId]);

  const restockSupply = useCallback(async (docId, data, userId, userName) => {
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
      await logActivity('restock', current.supplyId, userId, userName, {
        quantityAdded: Number(data.qty),
        source: data.source,
        newTotal: newQty
      });
    } catch (err) { handleErr(err); }
  }, [churchId]);

  const updateSupply = useCallback(async (docId, updates, userId, userName) => {
    try {
      await updateDoc(doc(db, 'churches', churchId, 'supplies', docId), updates);
      await logActivity('edit_supply', updates.supplyId || docId, userId, userName, { description: updates.description });
    } catch (err) { handleErr(err); }
  }, [churchId]);

  const deleteSupply = useCallback(async (docId, supplyId, userId, userName) => {
    try {
      await deleteDoc(doc(db, 'churches', churchId, 'supplies', docId));
      await logActivity('delete_supply', supplyId, userId, userName);
    } catch (err) { handleErr(err); }
  }, [churchId]);

  // ── Activity Log ──
  const logActivity = useCallback(async (action, itemId, userId, userName, details = {}) => {
    try {
      await addDoc(collection(db, 'churches', churchId, 'activityLog'), {
        action,
        itemId,
        performedBy: userId,
        performedByName: userName,
        timestamp: new Date().toISOString(),
        details
      });
    } catch (err) { handleErr(err); }
  }, [churchId]);

  // ── Reservations ──
  const addReservation = useCallback(async (res, userId, userName) => {
    try {
      await addDoc(collection(db, 'churches', churchId, 'reservations'), {
        ...res,
        requestedBy: userId,
        requestedByName: userName,
        status: 'Pending',
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
      // Atomic ticket numbering via transaction on config/main
      let ticketNumber;
      const configRef = doc(db, 'churches', churchId, 'config', 'main');
      await runTransaction(db, async (t) => {
        const configSnap = await t.get(configRef);
        const maxNum = (configSnap.data()?.maxTicketNumber || 0) + 1;
        ticketNumber = 'MNT-' + String(maxNum).padStart(3, '0');
        t.update(configRef, { maxTicketNumber: maxNum });
      });
      const ref = await addDoc(collection(db, 'churches', churchId, 'maintenanceTickets'), {
        ...ticket,
        ticketNumber,
        createdBy: userId,
        createdByName: userName,
        status: ticket.status || 'Backlog',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        completedAt: null
      });
      await logActivity('add_ticket', ticket.linkedItemId || ticketNumber, userId, userName, { name: ticket.name, priority: ticket.priority });
      return ref.id;
    } catch (err) { handleErr(err); }
  }, [churchId]);

  const updateTicket = useCallback(async (docId, updates) => {
    try {
      const data = { ...updates, updatedAt: new Date().toISOString() };
      if (updates.status === 'Complete' && !updates.completedAt) {
        data.completedAt = new Date().toISOString();
      }
      await updateDoc(doc(db, 'churches', churchId, 'maintenanceTickets', docId), data);
    } catch (err) { handleErr(err); }
  }, [churchId]);

  const addTicketComment = useCallback(async (ticketId, text, authorId, authorName) => {
    try {
      await addDoc(collection(db, 'churches', churchId, 'maintenanceTickets', ticketId, 'comments'), {
        text,
        authorId,
        authorName,
        createdAt: new Date().toISOString()
      });
    } catch (err) { handleErr(err); }
  }, [churchId]);

  const updateTicketComment = useCallback(async (ticketId, commentId, text) => {
    try {
      await updateDoc(doc(db, 'churches', churchId, 'maintenanceTickets', ticketId, 'comments', commentId), {
        text, updatedAt: new Date().toISOString()
      });
    } catch (err) { handleErr(err); }
  }, [churchId]);

  const deleteTicketComment = useCallback(async (ticketId, commentId) => {
    try {
      await deleteDoc(doc(db, 'churches', churchId, 'maintenanceTickets', ticketId, 'comments', commentId));
    } catch (err) { handleErr(err); }
  }, [churchId]);

  const deleteTicket = useCallback(async (docId) => {
    try {
      await deleteDoc(doc(db, 'churches', churchId, 'maintenanceTickets', docId));
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
      let taskNumber;
      const configRef = doc(db, 'churches', churchId, 'config', 'main');
      await runTransaction(db, async (t) => {
        const configSnap = await t.get(configRef);
        const maxNum = (configSnap.data()?.maxTaskNumber || 0) + 1;
        taskNumber = 'TSK-' + String(maxNum).padStart(3, '0');
        t.update(configRef, { maxTaskNumber: maxNum });
      });
      const ref = await addDoc(collection(db, 'churches', churchId, 'tasks'), {
        ...task,
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
      await logActivity('add_task', taskNumber, userId, userName, { name: task.name, priority: task.priority });
      return ref.id;
    } catch (err) { handleErr(err); }
  }, [churchId]);

  const updateTask = useCallback(async (docId, updates) => {
    try {
      const data = { ...updates, updatedAt: new Date().toISOString() };
      if (updates.status === 'Complete' && !updates.completedAt) {
        data.completedAt = new Date().toISOString();
      }
      await updateDoc(doc(db, 'churches', churchId, 'tasks', docId), data);
    } catch (err) { handleErr(err); }
  }, [churchId]);

  const deleteTask = useCallback(async (docId) => {
    try {
      await deleteDoc(doc(db, 'churches', churchId, 'tasks', docId));
    } catch (err) { handleErr(err); }
  }, [churchId]);

  const addTaskComment = useCallback(async (taskId, text, authorId, authorName) => {
    try {
      await addDoc(collection(db, 'churches', churchId, 'tasks', taskId, 'comments'), {
        text, authorId, authorName, createdAt: new Date().toISOString()
      });
    } catch (err) { handleErr(err); }
  }, [churchId]);

  const updateTaskComment = useCallback(async (taskId, commentId, text) => {
    try {
      await updateDoc(doc(db, 'churches', churchId, 'tasks', taskId, 'comments', commentId), {
        text, updatedAt: new Date().toISOString()
      });
    } catch (err) { handleErr(err); }
  }, [churchId]);

  const deleteTaskComment = useCallback(async (taskId, commentId) => {
    try {
      await deleteDoc(doc(db, 'churches', churchId, 'tasks', taskId, 'comments', commentId));
    } catch (err) { handleErr(err); }
  }, [churchId]);

  const addTaskTags = useCallback(async (tags) => {
    if (!tags.length) return;
    try {
      await updateDoc(doc(db, 'churches', churchId, 'config', 'settings'), {
        taskTags: arrayUnion(...tags)
      });
    } catch (err) { handleErr(err); }
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

  const loadErrors = useCallback(async () => {
    try {
      const snap = await getDocs(query(collection(db, 'errors'), orderBy('timestamp', 'desc'), limit(200)));
      return snap.docs.map(d => ({ id: d.id, ...d.data() }));
    } catch (err) {
      // Use console.error + setError only here (not handleErr) to avoid writing to the errors collection while loading it
      console.error('[ChurchOpsHub] loadErrors failed', err);
      setError(err.message);
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
      const snap = await getDoc(doc(db, 'churches', churchId, 'config', 'settings'));
      const reqs = (snap.data()?.peopleAccessRequirements || []).filter(r => r.id !== reqId);
      await updateDoc(doc(db, 'churches', churchId, 'config', 'settings'), {
        peopleAccessRequirements: reqs
      });
    } catch (err) { handleErr(err); }
  }, [churchId]);

  return {
    config, settings, items, supplies, activityLog, reservations, users,
    maintenanceTickets, vendors, bundles, notificationConfig, audits, tasks,
    loading, error,
    updateSettings, updateConfig,
    addItem, updateItem, checkOutItem, returnItem, retireItem, markRepair, markRepaired, deleteItem,
    addSupply, updateSupply, useSupply, restockSupply, deleteSupply,
    logActivity,
    addReservation, updateReservation,
    updateUser, removeUser,
    addTicket, updateTicket, addTicketComment, updateTicketComment, deleteTicketComment, deleteTicket, addMaintenanceTags,
    addVendor, updateVendor, deleteVendor,
    addBundle, updateBundle, deleteBundle,
    updateNotificationConfig,
    addAudit, updateAudit,
    submitSuggestion, loadSuggestions, loadErrors,
    publicRequests, dismissPublicRequest,
    accessPeople, accessRecords,
    addAccessPerson, updateAccessPerson, archiveAccessPerson,
    linkAccessPerson, unlinkAccessPerson,
    addAccessRecord, updateAccessRecord, deleteAccessRecord,
    addPeopleAccessRequirement, removePeopleAccessRequirement,
    addTask, updateTask, deleteTask, addTaskComment, updateTaskComment, deleteTaskComment, addTaskTags,
    clearError
  };
}
