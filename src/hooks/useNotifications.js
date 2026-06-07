import { useState, useEffect } from 'react';
import { collection, query, where, orderBy, limit, onSnapshot, doc, updateDoc, writeBatch } from 'firebase/firestore';
import { db } from '../firebase.js';

// Subscribes to the current user's in-app notification inbox (most recent 30).
// Query is recipientUid== + orderBy createdAt desc → needs the composite index
// notifications (recipientUid ASC, createdAt DESC). Returns items + unread count
// + mark-read helpers. Write path for creating notifications is server-only
// (deliverNotification / notify CF); the client only reads + marks read.
export function useNotifications(churchId, uid) {
  const [items, setItems] = useState([]);

  useEffect(() => {
    if (!churchId || !uid) return;
    const q = query(
      collection(db, 'churches', churchId, 'notifications'),
      where('recipientUid', '==', uid),
      orderBy('createdAt', 'desc'),
      limit(30),
    );
    const unsub = onSnapshot(
      q,
      (snap) => setItems(snap.docs.map((d) => ({ _docId: d.id, ...d.data() }))),
      () => setItems([]),
    );
    // Reset on teardown / dep change (clears items when churchId/uid go missing
    // too — avoids a synchronous setState in the effect body).
    return () => { unsub(); setItems([]); };
  }, [churchId, uid]);

  const unread = items.filter((n) => !n.read).length;

  const markRead = (id) =>
    updateDoc(doc(db, 'churches', churchId, 'notifications', id), { read: true }).catch(() => {});

  const markAllRead = () => {
    const un = items.filter((n) => !n.read);
    if (!un.length) return;
    const batch = writeBatch(db);
    un.forEach((n) => batch.update(doc(db, 'churches', churchId, 'notifications', n._docId), { read: true }));
    batch.commit().catch(() => {});
  };

  return { items, unread, markRead, markAllRead };
}
