import { useState, useEffect, useCallback } from 'react';
import {
  doc, setDoc, getDoc, deleteDoc, getDocs,
  collection, onSnapshot, addDoc, updateDoc, query, orderBy, arrayUnion, where, limit, runTransaction, writeBatch
} from 'firebase/firestore';
import { db, storage } from './firebase.js';
import { ref as stRef, deleteObject } from 'firebase/storage';
import { generateRecurrenceDates } from './utils/date.js';

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
  const [rooms, setRooms] = useState([]);
  const [jobListings, setJobListings] = useState([]);
  const [jobAnnouncements, setJobAnnouncements] = useState([]);
  const [taskTemplates, setTaskTemplates] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const clearError = useCallback(() => setError(null), []);

  function handleErr(err) {
    console.error('[ChurchOpsHub]', err);
    setError(err.message);
  }

  // Subscribe to all collections
  useEffect(() => {
    if (!churchId) return;
    const unsubs = [];
    let loaded = 0;
    const totalSubs = 20;
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

    // Rooms/Spaces
    unsubs.push(onSnapshot(collection(db, 'churches', churchId, 'rooms'), (snap) => {
      const r = snap.docs.map(d => ({ _docId: d.id, ...d.data() }));
      r.sort((a, b) => (a.name || '').localeCompare(b.name || ''));
      setRooms(r);
      checkDone();
    }, (err) => { handleErr(err); checkDone(); }));

    // Job Listings
    unsubs.push(onSnapshot(collection(db, 'churches', churchId, 'jobListings'), (snap) => {
      const jobs = snap.docs.map(d => ({ _docId: d.id, ...d.data() }));
      jobs.sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
      setJobListings(jobs);
      checkDone();
    }, (err) => { handleErr(err); checkDone(); }));

    // Job Announcements
    unsubs.push(onSnapshot(collection(db, 'churches', churchId, 'jobAnnouncements'), (snap) => {
      const ann = snap.docs.map(d => ({ _docId: d.id, ...d.data() }));
      ann.sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
      setJobAnnouncements(ann);
      checkDone();
    }, (err) => { handleErr(err); checkDone(); }));

    // Task Templates
    unsubs.push(onSnapshot(query(collection(db, 'churches', churchId, 'taskTemplates'), orderBy('name')), (snap) => {
      setTaskTemplates(snap.docs.map(d => ({ _docId: d.id, ...d.data() })));
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
      const ref = doc(db, 'churches', churchId, 'maintenanceTickets', docId);
      const snap = await getDoc(ref);
      const linkedTaskDocId = snap.exists() ? snap.data()?.linkedTaskDocId : null;
      await deleteDoc(ref);
      if (linkedTaskDocId) {
        updateDoc(doc(db, 'churches', churchId, 'tasks', linkedTaskDocId), { linkedTicketDocId: null }).catch(() => {});
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
      let taskNumber;
      const configRef = doc(db, 'churches', churchId, 'config', 'main');
      const newDocRef = doc(collection(db, 'churches', churchId, 'tasks'));
      await runTransaction(db, async (t) => {
        const configSnap = await t.get(configRef);
        const maxNum = (configSnap.data()?.maxTaskNumber || 0) + 1;
        taskNumber = 'TSK-' + String(maxNum).padStart(3, '0');
        t.set(configRef, { maxTaskNumber: maxNum }, { merge: true });
        t.set(newDocRef, {
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
      });
      const addLogDetails = { priority: task.priority };
      if (task.visibility !== 'private' && task.visibility !== 'shared') addLogDetails.name = task.name;
      await logActivity('add_task', taskNumber, userId, userName, addLogDetails);
      return newDocRef.id;
    } catch (err) { handleErr(err); throw err; }
  }, [churchId]);

  const updateTask = useCallback(async (docId, updates, userId, userName, taskNumber) => {
    try {
      const { taskNumber: _tn, createdBy: _cb, createdByName: _cbn, createdAt: _ca, _docId, ...safe } = updates;
      const data = { ...safe, updatedAt: new Date().toISOString() };
      if (updates.status === 'Complete' && !updates.completedAt) {
        data.completedAt = new Date().toISOString();
      }
      await updateDoc(doc(db, 'churches', churchId, 'tasks', docId), data);
      if (userId) {
        const action = safe.status === 'Complete' ? 'complete_task' : 'update_task';
        const updateLogDetails = { ...(safe.status ? { status: safe.status } : {}) };
        if (safe.name && safe.visibility !== 'private' && safe.visibility !== 'shared') updateLogDetails.name = safe.name;
        await logActivity(action, taskNumber || docId, userId, userName, updateLogDetails);
      }
    } catch (err) { handleErr(err); throw err; }
  }, [churchId]);

  const deleteTask = useCallback(async (docId, task, userId, userName) => {
    try {
      const taskNumber = typeof task === 'string' ? task : (task?.taskNumber || docId);
      const photoUrls = typeof task === 'object' ? (task?.photos || []) : [];
      const linkedJobDocId = typeof task === 'object' ? task?.linkedJobDocId : null;
      const linkedTicketDocId = typeof task === 'object' ? task?.linkedTicketDocId : null;
      const commentsSnap = await getDocs(collection(db, 'churches', churchId, 'tasks', docId, 'comments'));
      const batch = writeBatch(db);
      commentsSnap.docs.forEach(d => batch.delete(d.ref));
      batch.delete(doc(db, 'churches', churchId, 'tasks', docId));
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
        updateDoc(doc(db, 'churches', churchId, 'maintenanceTickets', linkedTicketDocId), { linkedTaskDocId: null }).catch(() => {});
      }
      if (userId) await logActivity('delete_task', taskNumber, userId, userName, {});
    } catch (err) { handleErr(err); throw err; }
  }, [churchId]);

  const addTaskComment = useCallback(async (taskId, text, authorId, authorName, mentions) => {
    if (!text || !text.trim()) return;
    try {
      const data = { text, authorId, authorName, createdAt: new Date().toISOString() };
      if (mentions && mentions.length > 0) data.mentions = mentions;
      await addDoc(collection(db, 'churches', churchId, 'tasks', taskId, 'comments'), data);
    } catch (err) { handleErr(err); throw err; }
  }, [churchId]);

  const updateTaskComment = useCallback(async (taskId, commentId, text) => {
    try {
      await updateDoc(doc(db, 'churches', churchId, 'tasks', taskId, 'comments', commentId), {
        text, updatedAt: new Date().toISOString()
      });
    } catch (err) { handleErr(err); throw err; }
  }, [churchId]);

  const deleteTaskComment = useCallback(async (taskId, commentId) => {
    try {
      await deleteDoc(doc(db, 'churches', churchId, 'tasks', taskId, 'comments', commentId));
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
      await logActivity('create_template', template.name || ref.id, userId, userName, { recurrence: template.recurrence });
    } catch (err) { handleErr(err); throw err; }
  }, [churchId]);

  const deleteTaskTemplate = useCallback(async (docId, userId, userName) => {
    try {
      await deleteDoc(doc(db, 'churches', churchId, 'taskTemplates', docId));
      if (userId) await logActivity('delete_template', docId, userId, userName, {});
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
            signups: [],
            waitlist: [],
            createdBy: userId,
            createdByName: userName,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          });
        });
      });
      await logActivity('post_job', `${firstJobNumber} (series ×${dates.length})`, userId, userName, { title: job.title, recurrenceFreq });
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
          signups: [],
          waitlist: [],
          createdBy: userId,
          createdByName: userName,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        });
      });
      await logActivity('post_job', jobNumber, userId, userName, { title: job.title });
    } catch (err) { handleErr(err); throw err; }
  }, [churchId]);

  const updateJobListing = useCallback(async (docId, updates, userId, userName) => {
    try {
      // Capture jobNumber before stripping so the activity log shows JOB-### not a docId.
      const jobNumberForLog = updates.jobNumber;
      // Strip server-managed and identity fields. A stale doc passed in as
      // `updates` would otherwise clobber waitlist state, dedupe stamps, or
      // recurrence metadata.
      const {
        createdBy: _cb, createdByName: _cbn, jobNumber: _jn,
        signups: _s, waitlist: _w,
        cancellationEmailSentAt: _ce, lastReminderSentDate: _lr, lastPosterNotifiedByActors: _lp,
        recurrenceGroupId: _rg, recurrenceFreq: _rf, seriesEndDate: _se,
        ...safeUpdates
      } = updates;

      // If spotsTotal is being reduced, run a transaction to verify it doesn't go below current signup count.
      if (safeUpdates.spotsTotal !== undefined) {
        const jobRef = doc(db, 'churches', churchId, 'jobListings', docId);
        await runTransaction(db, async (t) => {
          const snap = await t.get(jobRef);
          if (!snap.exists()) return;
          const currentSignups = (snap.data().signups || []).length;
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
      if (userId) await logActivity('update_job', jobNumberForLog || docId, userId, userName, { title: updates.title, status: updates.status });
    } catch (err) { handleErr(err); throw err; }
  }, [churchId]);

  const deleteJobListing = useCallback(async (docId, userId, userName, jobNumber) => {
    try {
      const ref = doc(db, 'churches', churchId, 'jobListings', docId);
      const snap = await getDoc(ref);
      const linkedTaskDocId = snap.exists() ? snap.data()?.linkedTaskDocId : null;
      await deleteDoc(ref);
      if (linkedTaskDocId) {
        updateDoc(doc(db, 'churches', churchId, 'tasks', linkedTaskDocId), { linkedJobDocId: null }).catch(() => {});
      }
      if (userId) await logActivity('delete_job', jobNumber || docId, userId, userName, {});
    } catch (err) { handleErr(err); throw err; }
  }, [churchId]);

  // Updates all series jobs with scheduledDate >= fromDate atomically via runTransaction.
  // Returns { count, affected: [{docId, signupCount}] } so callers can fan out
  // per-job side effects (e.g. firing sendJobCancelledEmails on a series cancel).
  const updateJobListingSeries = useCallback(async (groupId, fromDate, updates, userId, userName) => {
    try {
      const {
        createdBy: _cb, createdByName: _cbn, jobNumber: _jn,
        signups: _s, waitlist: _w, scheduledDate: _sd,
        cancellationEmailSentAt: _ce, lastReminderSentDate: _lr, lastPosterNotifiedByActors: _lp,
        recurrenceGroupId: _rg, recurrenceFreq: _rf, seriesEndDate: _se,
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
            const cnt = (d.data().signups || []).length;
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
          affected.push({ docId: d.id, signupCount: (d.data().signups || []).length });
        });
      });
      await logActivity('update_job', `${updates.title || groupId} (series ×${refs.length})`, userId, userName, { title: updates.title });
      return { count: refs.length, affected };
    } catch (err) { handleErr(err); throw err; }
  }, [churchId]);

  // Deletes all jobs in a recurring series from a given date onward.
  const deleteJobListingSeriesFrom = useCallback(async (groupId, fromDate, userId, userName) => {
    try {
      const snap = await getDocs(query(
        collection(db, 'churches', churchId, 'jobListings'),
        where('recurrenceGroupId', '==', groupId),
        where('scheduledDate', '>=', fromDate)
      ));
      if (snap.empty) return;
      const batch = writeBatch(db);
      snap.docs.forEach(d => batch.delete(d.ref));
      await batch.commit();
      await logActivity('delete_job', `series from ${fromDate} ×${snap.size}`, userId, userName, {});
    } catch (err) { handleErr(err); throw err; }
  }, [churchId]);

  // Deletes all jobs in a recurring series.
  const deleteJobListingSeries = useCallback(async (groupId, userId, userName) => {
    try {
      const snap = await getDocs(query(
        collection(db, 'churches', churchId, 'jobListings'),
        where('recurrenceGroupId', '==', groupId)
      ));
      if (snap.empty) return;
      const batch = writeBatch(db);
      snap.docs.forEach(d => batch.delete(d.ref));
      await batch.commit();
      await logActivity('delete_job', `series ×${snap.size}`, userId, userName, {});
    } catch (err) { handleErr(err); throw err; }
  }, [churchId]);

  const signUpForJob = useCallback(async (docId, userId, userName) => {
    try {
      const jobRef = doc(db, 'churches', churchId, 'jobListings', docId);
      let errorMsg = null;
      let jobTitle = '';
      let jobNumber = '';
      let wasWaitlisted = false;
      await runTransaction(db, async (t) => {
        const snap = await t.get(jobRef);
        if (!snap.exists()) { errorMsg = 'Job not found.'; return; }
        const data = snap.data();
        if (data.status !== 'open') { errorMsg = 'This job is no longer open.'; return; }
        const signups = data.signups || [];
        const waitlist = data.waitlist || [];
        if (signups.some(s => s.uid === userId)) { errorMsg = 'You are already signed up.'; return; }
        if (waitlist.some(w => w.uid === userId)) { errorMsg = 'You are already on the waitlist.'; return; }
        jobTitle = data.title || '';
        jobNumber = data.jobNumber || docId;
        if (signups.length >= (data.spotsTotal || 1)) {
          const waitlistEntry = { uid: userId, name: userName, addedAt: new Date().toISOString() };
          // Capture waiver acknowledgement at waitlist join so the audit trail
          // survives the eventual promotion to signups.
          if (data.requiresWaiver) waitlistEntry.acknowledgedWaiverAt = new Date().toISOString();
          t.update(jobRef, {
            waitlist: [...waitlist, waitlistEntry],
            updatedAt: new Date().toISOString()
          });
          wasWaitlisted = true;
          return;
        }
        const signupEntry = { uid: userId, name: userName, signedUpAt: new Date().toISOString() };
        if (data.requiresWaiver) signupEntry.acknowledgedWaiverAt = new Date().toISOString();
        t.update(jobRef, { signups: [...signups, signupEntry], updatedAt: new Date().toISOString() });
      });
      if (errorMsg) return { error: errorMsg };
      if (wasWaitlisted) {
        await logActivity('signup_job', jobNumber, userId, userName, { title: jobTitle, waitlisted: true });
        return { wasWaitlisted: true };
      }
      await logActivity('signup_job', jobNumber, userId, userName, { title: jobTitle });
      return { success: true };
    } catch (err) { handleErr(err); return { error: 'Sign-up failed. Please try again.' }; }
  }, [churchId]);

  const withdrawFromJob = useCallback(async (docId, uid, actorId, actorName) => {
    try {
      const jobRef = doc(db, 'churches', churchId, 'jobListings', docId);
      let jobNumber = '';
      let wasSignedUp = false;
      let wasOnWaitlist = false;
      await runTransaction(db, async (t) => {
        const snap = await t.get(jobRef);
        if (!snap.exists()) return;
        jobNumber = snap.data().jobNumber || docId;
        const existing = snap.data().signups || [];
        const signups = existing.filter(s => s.uid !== uid);
        if (signups.length < existing.length) {
          wasSignedUp = true;
          t.update(jobRef, { signups, updatedAt: new Date().toISOString() });
          return;
        }
        const existingWL = snap.data().waitlist || [];
        const waitlist = existingWL.filter(w => w.uid !== uid);
        if (waitlist.length < existingWL.length) {
          wasOnWaitlist = true;
          t.update(jobRef, { waitlist, updatedAt: new Date().toISOString() });
        }
      });
      if (wasSignedUp && actorId) {
        const action = actorId !== uid ? 'admin_remove_job' : 'withdraw_job';
        await logActivity(action, jobNumber, actorId, actorName, { removedUid: uid });
      }
      return { wasSignedUp, wasOnWaitlist };
    } catch (err) { handleErr(err); throw err; }
  }, [churchId]);

  const updateJobSignupAttendance = useCallback(async (docId, uid, attended) => {
    try {
      const jobRef = doc(db, 'churches', churchId, 'jobListings', docId);
      await runTransaction(db, async (t) => {
        const snap = await t.get(jobRef);
        if (!snap.exists()) return;
        const signups = (snap.data().signups || []).map(s =>
          s.uid === uid ? { ...s, attended } : s
        );
        t.update(jobRef, { signups, updatedAt: new Date().toISOString() });
      });
    } catch (err) { handleErr(err); throw err; }
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

  const addJobSwapRequest = useCallback(async (jobDocId, uid, name, note) => {
    try {
      const ref = await addDoc(collection(db, 'churches', churchId, 'jobSwapRequests'), {
        jobDocId, uid, name: name || '', note: note || '',
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
      await logActivity('post_announcement', ref.id, userId, userName, { title: ann.title });
    } catch (err) { handleErr(err); throw err; }
  }, [churchId]);

  const updateJobAnnouncement = useCallback(async (docId, updates, userId, userName) => {
    try {
      await updateDoc(doc(db, 'churches', churchId, 'jobAnnouncements', docId), {
        ...updates,
        updatedAt: new Date().toISOString()
      });
      if (userId) await logActivity('update_announcement', docId, userId, userName, { title: updates.title });
    } catch (err) { handleErr(err); throw err; }
  }, [churchId]);

  const deleteJobAnnouncement = useCallback(async (docId, userId, userName) => {
    try {
      await deleteDoc(doc(db, 'churches', churchId, 'jobAnnouncements', docId));
      if (userId) await logActivity('delete_announcement', docId, userId, userName, {});
    } catch (err) { handleErr(err); throw err; }
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
    rooms, addRoom, updateRoom, deleteRoom,
    addBundle, updateBundle, deleteBundle,
    updateNotificationConfig,
    addAudit, updateAudit,
    submitSuggestion, loadSuggestions,
    publicRequests, dismissPublicRequest,
    accessPeople, accessRecords,
    addAccessPerson, updateAccessPerson, archiveAccessPerson,
    linkAccessPerson, unlinkAccessPerson,
    addAccessRecord, updateAccessRecord, deleteAccessRecord,
    addPeopleAccessRequirement, removePeopleAccessRequirement,
    addTask, updateTask, deleteTask, addTaskComment, updateTaskComment, deleteTaskComment, addTaskTags,
    taskTemplates, addTaskTemplate, deleteTaskTemplate,
    jobListings, jobAnnouncements,
    addJobListing, addJobListingSeries, updateJobListing, deleteJobListing, updateJobListingSeries, deleteJobListingSeries, deleteJobListingSeriesFrom,
    signUpForJob, withdrawFromJob, updateJobSignupAttendance,
    addJobAnnouncement, updateJobAnnouncement, deleteJobAnnouncement,
    getJobSwapRequests, addJobSwapRequest, deleteJobSwapRequest,
    clearError
  };
}
