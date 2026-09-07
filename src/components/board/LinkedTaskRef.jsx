// COH-007 — how a reservation or job describes the task it points at.
//
// Before archiving, "not in the active store" meant one thing: deleted. From the
// reader gate on it means one of three, and they are not interchangeable —
// "that task was deleted" is a false statement about an archived task, and it is
// the statement a user acts on.
//
// The fourth case is the one that must stay silent. A task the current user is
// not authorized to read is undisclosed: no name, no number, no confirmation
// that it exists. The rules already deny the read; this only makes sure the UI
// does not narrate the denial into an existence proof.
import { useState, useEffect } from 'react';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '../../firebase.js';
import { B, f1 } from '../brand/tokens.js';

// 'active' | 'archived' | 'missing' | 'undisclosed' | 'loading'
//
// The synchronous answers — no link, or a task the active store already holds —
// are derived during render rather than pushed through state, so the effect only
// ever runs for the case that genuinely needs a server round trip. The resolved
// value is keyed by its target: a detail modal switched to another reservation
// reads as loading again instead of briefly showing the previous task's state.
export function useLinkedTaskState(churchId, bareId, activeTask) {
  const [remote, setRemote] = useState({ key: null, status: 'loading', task: null });
  const key = churchId && bareId ? `${churchId}/${bareId}` : null;
  const inActiveStore = !!activeTask;
  useEffect(() => {
    if (!key || inActiveStore) return undefined;
    let cancelled = false;
    const [cid, id] = key.split('/');
    getDoc(doc(db, 'churches', cid, 'workItems', `task_${id}`))
      .then(snap => {
        if (cancelled) return;
        if (!snap.exists()) { setRemote({ key, status: 'missing', task: null }); return; }
        const data = { _docId: id, ...snap.data() };
        setRemote({ key, status: data.archived === true ? 'archived' : 'active', task: data });
      })
      // permission-denied, and anything else we cannot tell apart from it.
      .catch(() => { if (!cancelled) setRemote({ key, status: 'undisclosed', task: null }); });
    return () => { cancelled = true; };
  }, [key, inActiveStore]);

  if (!key) return { status: 'missing', task: null };
  if (activeTask) return { status: 'active', task: activeTask };
  if (remote.key !== key) return { status: 'loading', task: null };
  return remote;
}

export function LinkedTaskRef({ churchId, bareId, activeTask, style }) {
  const { status, task } = useLinkedTaskState(churchId, bareId, activeTask);
  const base = { fontSize: 13, fontFamily: f1, ...style };
  if (status === 'loading') return <div style={{ ...base, color: B.textLight }}>Loading linked task...</div>;
  if (status === 'undisclosed') return <div style={{ ...base, color: B.textLight }}>Linked to a task you do not have access to.</div>;
  if (status === 'missing') return <div style={{ ...base, color: B.textLight }}>The linked task no longer exists.</div>;
  return (
    <div style={{ ...base, color: B.textDark }}>
      {task?.taskNumber && <span style={{ fontFamily: 'monospace', color: B.textMid, marginRight: 8 }}>{task.taskNumber}</span>}
      {task?.name}
      {status === 'archived'
        ? <span style={{ color: B.textLight }}> — archived. Open Tasks → Archived to view or reopen it.</span>
        : (task?.status ? <span style={{ color: B.textLight }}> — {task.status}</span> : null)}
    </div>
  );
}
