import { useState, useEffect, useCallback } from 'react';
import {
  doc, setDoc, getDoc, deleteDoc, getDocs,
  collection, onSnapshot, addDoc, updateDoc, query, orderBy
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
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Subscribe to all collections
  useEffect(() => {
    if (!churchId) return;
    const unsubs = [];
    let loaded = 0;
    const totalSubs = 8;
    const checkDone = () => { loaded++; if (loaded >= totalSubs) setLoading(false); };

    // Config
    unsubs.push(onSnapshot(doc(db, 'churches', churchId, 'config', 'main'), (snap) => {
      if (snap.exists()) setConfig(snap.data());
      checkDone();
    }, (err) => { setError(err.message); checkDone(); }));

    // Settings
    unsubs.push(onSnapshot(doc(db, 'churches', churchId, 'config', 'settings'), (snap) => {
      if (snap.exists()) setSettings(snap.data());
      checkDone();
    }, (err) => { setError(err.message); checkDone(); }));

    // Items
    unsubs.push(onSnapshot(collection(db, 'churches', churchId, 'items'), (snap) => {
      setItems(snap.docs.map(d => ({ _docId: d.id, ...d.data() })));
      checkDone();
    }, (err) => { setError(err.message); checkDone(); }));

    // Supplies
    unsubs.push(onSnapshot(collection(db, 'churches', churchId, 'supplies'), (snap) => {
      setSupplies(snap.docs.map(d => ({ _docId: d.id, ...d.data() })));
      checkDone();
    }, (err) => { setError(err.message); checkDone(); }));

    // Activity Log
    unsubs.push(onSnapshot(collection(db, 'churches', churchId, 'activityLog'), (snap) => {
      const logs = snap.docs.map(d => ({ _docId: d.id, ...d.data() }));
      logs.sort((a, b) => (b.timestamp || '').localeCompare(a.timestamp || ''));
      setActivityLog(logs);
      checkDone();
    }, (err) => { setError(err.message); checkDone(); }));

    // Reservations
    unsubs.push(onSnapshot(collection(db, 'churches', churchId, 'reservations'), (snap) => {
      setReservations(snap.docs.map(d => ({ _docId: d.id, ...d.data() })));
      checkDone();
    }, (err) => { setError(err.message); checkDone(); }));

    // Maintenance Tickets
    unsubs.push(onSnapshot(collection(db, 'churches', churchId, 'maintenanceTickets'), (snap) => {
      const tickets = snap.docs.map(d => ({ _docId: d.id, ...d.data() }));
      tickets.sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
      setMaintenanceTickets(tickets);
      checkDone();
    }, (err) => { setError(err.message); checkDone(); }));

    // Vendors
    unsubs.push(onSnapshot(collection(db, 'churches', churchId, 'vendors'), (snap) => {
      setVendors(snap.docs.map(d => ({ _docId: d.id, ...d.data() })));
      checkDone();
    }, (err) => { setError(err.message); checkDone(); }));

    return () => unsubs.forEach(u => u());
  }, [churchId]);

  // Load users for this church (not real-time, refresh on demand)
  const loadUsers = useCallback(async () => {
    if (!churchId) return;
    try {
      const snap = await getDocs(collection(db, 'users'));
      const churchUsers = snap.docs
        .map(d => ({ id: d.id, ...d.data() }))
        .filter(u => u.churchId === churchId);
      setUsers(churchUsers);
    } catch (err) {
      console.error('Error loading users:', err);
    }
  }, [churchId]);

  useEffect(() => { loadUsers(); }, [loadUsers]);

  // ── Settings ──
  const updateSettings = useCallback(async (updates) => {
    try {
      await setDoc(doc(db, 'churches', churchId, 'config', 'settings'), updates, { merge: true });
    } catch (err) { setError(err.message); }
  }, [churchId]);

  const updateConfig = useCallback(async (updates) => {
    try {
      await setDoc(doc(db, 'churches', churchId, 'config', 'main'), updates, { merge: true });
    } catch (err) { setError(err.message); }
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
    } catch (err) { setError(err.message); }
  }, [churchId]);

  const updateItem = useCallback(async (docId, updates, userId, userName) => {
    try {
      await updateDoc(doc(db, 'churches', churchId, 'items', docId), {
        ...updates,
        updatedAt: new Date().toISOString()
      });
    } catch (err) { setError(err.message); }
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
    } catch (err) { setError(err.message); }
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
    } catch (err) { setError(err.message); }
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
    } catch (err) { setError(err.message); }
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
    } catch (err) { setError(err.message); }
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
    } catch (err) { setError(err.message); }
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
    } catch (err) { setError(err.message); }
  }, [churchId]);

  const useSupply = useCallback(async (docId, data, userId, userName) => {
    try {
      const ref = doc(db, 'churches', churchId, 'supplies', docId);
      const snap = await getDoc(ref);
      if (!snap.exists()) return;
      const current = snap.data();
      const newQty = Math.max(0, (current.quantity || 0) - Number(data.qty));
      await updateDoc(ref, { quantity: newQty });
      await logActivity('use_supply', current.supplyId, userId, userName, {
        quantityUsed: Number(data.qty),
        purpose: data.purpose,
        remaining: newQty
      });
    } catch (err) { setError(err.message); }
  }, [churchId]);

  const restockSupply = useCallback(async (docId, data, userId, userName) => {
    try {
      const ref = doc(db, 'churches', churchId, 'supplies', docId);
      const snap = await getDoc(ref);
      if (!snap.exists()) return;
      const current = snap.data();
      const newQty = (current.quantity || 0) + Number(data.qty);
      await updateDoc(ref, {
        quantity: newQty,
        lastRestocked: new Date().toISOString()
      });
      await logActivity('restock', current.supplyId, userId, userName, {
        quantityAdded: Number(data.qty),
        source: data.source,
        newTotal: newQty
      });
    } catch (err) { setError(err.message); }
  }, [churchId]);

  const updateSupply = useCallback(async (docId, updates) => {
    try {
      await updateDoc(doc(db, 'churches', churchId, 'supplies', docId), updates);
    } catch (err) { setError(err.message); }
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
    } catch (err) { console.error('Log error:', err); }
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
    } catch (err) { setError(err.message); }
  }, [churchId]);

  const updateReservation = useCallback(async (docId, updates) => {
    try {
      await updateDoc(doc(db, 'churches', churchId, 'reservations', docId), updates);
    } catch (err) { setError(err.message); }
  }, [churchId]);

  // ── User management ──
  const updateUser = useCallback(async (userId, updates) => {
    try {
      await updateDoc(doc(db, 'users', userId), updates);
      await loadUsers();
    } catch (err) { setError(err.message); }
  }, [loadUsers]);

  const removeUser = useCallback(async (userId) => {
    try {
      await deleteDoc(doc(db, 'users', userId));
      await loadUsers();
    } catch (err) { setError(err.message); }
  }, [loadUsers]);

  // ── Maintenance Tickets ──
  const addTicket = useCallback(async (ticket, userId, userName) => {
    try {
      // Auto-generate ticket number
      const ticketCount = (await getDocs(collection(db, 'churches', churchId, 'maintenanceTickets'))).size;
      const ticketNumber = 'MNT-' + String(ticketCount + 1).padStart(3, '0');
      const ref = await addDoc(collection(db, 'churches', churchId, 'maintenanceTickets'), {
        ...ticket,
        ticketNumber,
        reportedBy: userId,
        reportedByName: userName,
        status: ticket.status || 'Open',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        resolvedAt: null
      });
      await logActivity('add_ticket', ticket.itemId || ticketNumber, userId, userName, { description: ticket.issue, priority: ticket.priority });
      return ref.id;
    } catch (err) { setError(err.message); }
  }, [churchId]);

  const updateTicket = useCallback(async (docId, updates) => {
    try {
      const data = { ...updates, updatedAt: new Date().toISOString() };
      if (updates.status === 'Resolved' && !updates.resolvedAt) {
        data.resolvedAt = new Date().toISOString();
      }
      await updateDoc(doc(db, 'churches', churchId, 'maintenanceTickets', docId), data);
    } catch (err) { setError(err.message); }
  }, [churchId]);

  // ── Vendors ──
  const addVendor = useCallback(async (vendor) => {
    try {
      await addDoc(collection(db, 'churches', churchId, 'vendors'), {
        ...vendor,
        createdAt: new Date().toISOString()
      });
    } catch (err) { setError(err.message); }
  }, [churchId]);

  const updateVendor = useCallback(async (docId, updates) => {
    try {
      await updateDoc(doc(db, 'churches', churchId, 'vendors', docId), updates);
    } catch (err) { setError(err.message); }
  }, [churchId]);

  return {
    config, settings, items, supplies, activityLog, reservations, users,
    maintenanceTickets, vendors,
    loading, error,
    updateSettings, updateConfig, loadUsers,
    addItem, updateItem, checkOutItem, returnItem, retireItem, markRepair, markRepaired,
    addSupply, updateSupply, useSupply, restockSupply,
    logActivity,
    addReservation, updateReservation,
    updateUser, removeUser,
    addTicket, updateTicket,
    addVendor, updateVendor
  };
}
