// COH-007 — the Archived Tasks view.
//
// On-demand, never a subscription. The point of archiving is to keep old
// completed work OUT of the always-live listeners, so a permanent archive
// listener would undo the task while appearing to implement it.
//
// The states below are deliberately distinguishable. "The shared arm was
// denied", "the index is missing", "nothing matched your search", and "you have
// no archived tasks" all render as an empty list if you let them, and an archive
// that quietly reports nothing is worse than one that reports an error: the user
// concludes the history is gone. Every one of them gets its own message here.
import { useState, useEffect, useMemo, useCallback, useContext } from 'react';
import { collection, onSnapshot, query as fsQuery, orderBy } from 'firebase/firestore';
import { db } from '../../firebase.js';
import { B, f1, inp, btnP, btnS } from '../brand/tokens.js';
import { Modal } from '../primitives/Modal.jsx';
import { Spinner } from '../primitives/Spinner.jsx';
import { EmojiIcon } from '../primitives/EmojiIcon.jsx';
import { useConfirm } from '../primitives/ConfirmDialog.jsx';
import { CommentThread } from '../comments/CommentThread.jsx';
import { MobileCtx } from '../../hooks/useMobile.js';
import { exportTasksCSV } from '../../utils/csv.js';
import { localDateStr } from '../../utils/date.js';
import { PriorityBadge, initials, assigneeColor } from './boardUI.jsx';

// DEC-2026-018: twelve months by default, with an explicit control to search
// further back. A promise decision as much as a cost one — "search your whole
// archive" cannot later be narrowed without a visible downgrade, and silent
// pagination under unchanged copy would make a fruitless search untrustworthy.
const DEFAULT_WINDOW_MONTHS = 12;

// Flip to true at the AUTOMATION gate, when the daily archiver is deployed and
// enabled. Until then this view is real, reachable and correct — and always
// empty — so the empty state must not promise archiving that is not yet running.
// A user told "tasks move here automatically" by a screen that will never fill
// has been told something false.
const ARCHIVING_ENABLED = false;

function windowStartISO(months) {
  if (!months) return null;
  const d = new Date();
  d.setMonth(d.getMonth() - months);
  // Start of the boundary DATE, not the exact instant (A19): a completion
  // earlier in the day on the boundary date is inside the advertised window and
  // must not be cut off by the query.
  return `${localDateStr(d)}T00:00:00.000Z`;
}

const fmtDate = (iso) => (iso ? new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '—');

export function ArchivedTasks({ churchId, userId, users = [], canOperate, loadArchivedTasks, reopenTask, onMessage }) {
  const isMobile = useContext(MobileCtx);
  const { confirm, ConfirmHost } = useConfirm();
  const [months, setMonths] = useState(DEFAULT_WINDOW_MONTHS);
  const [state, setState] = useState({ status: 'loading', result: null });
  const [search, setSearch] = useState('');
  const [detail, setDetail] = useState(null);
  const [comments, setComments] = useState([]);
  const [commentsLoading, setCommentsLoading] = useState(false);
  const [reopening, setReopening] = useState(false);

  const load = useCallback(async (forMonths) => {
    setState({ status: 'loading', result: null });
    const result = await loadArchivedTasks({ since: windowStartISO(forMonths) });
    setState({ status: 'ready', result });
  }, [loadArchivedTasks]);

  useEffect(() => { load(months); }, [load, months]);

  // Comments under an archived task: readable, and frozen by the rules. Read
  // through the same live subscription the board uses, so a task reopened in
  // another tab stops looking frozen here too.
  useEffect(() => {
    if (!detail?._docId || !churchId) { setComments([]); return; }
    setCommentsLoading(true);
    setComments([]);
    const q = fsQuery(
      collection(db, 'churches', churchId, 'workItems', `task_${detail._docId}`, 'comments'),
      orderBy('createdAt', 'asc')
    );
    return onSnapshot(q, snap => {
      setComments(snap.docs.map(d => ({ id: d.id, ...d.data() })));
      setCommentsLoading(false);
    }, () => { setComments([]); setCommentsLoading(false); });
  }, [detail?._docId, churchId]);

  const items = useMemo(() => state.result?.items || [], [state.result]);
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return items;
    return items.filter(t =>
      (t.name || '').toLowerCase().includes(q)
      || (t.description || '').toLowerCase().includes(q)
      || (t.taskNumber || '').toLowerCase().includes(q)
      || (t.tags || []).some(tag => String(tag).toLowerCase().includes(q))
    );
  }, [items, search]);

  const since = state.result?.since;
  const windowCopy = since
    ? `Showing tasks completed between ${fmtDate(since)} and ${fmtDate(new Date().toISOString())}. Search covers this window only.`
    : 'Showing the complete archive. Search covers every archived task you can see.';

  async function handleReopen(task) {
    const ok = await confirm({
      title: 'Reopen this task?',
      message: `${task.taskNumber ? task.taskNumber + ' — ' : ''}${task.name} returns to the active board in Backlog, and its completion date is cleared.`,
      confirmLabel: 'Reopen',
    });
    if (!ok) return;
    setReopening(true);
    try {
      await reopenTask(task._docId, userId, task.taskNumber);
      setDetail(null);
      onMessage?.({ text: `${task.taskNumber || 'Task'} reopened — it is back on the board in Backlog.` });
      await load(months);
    } catch {
      onMessage?.({ text: 'Could not reopen that task. Please try again.', isError: true });
    } finally {
      setReopening(false);
    }
  }

  const card = { background: B.white, borderRadius: 14, border: '1px solid ' + B.sand };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <ConfirmHost />

      <div style={{ ...card, padding: '14px 18px', display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
        <input
          style={{ ...inp, flex: 1, minWidth: 180, maxWidth: 320 }}
          placeholder="Search archived tasks..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          disabled={state.status === 'loading'}
        />
        {months
          ? <button type="button" onClick={() => setMonths(null)} style={{ ...btnS, padding: '9px 14px', fontSize: 13 }}>Search further back</button>
          : <button type="button" onClick={() => setMonths(DEFAULT_WINDOW_MONTHS)} style={{ ...btnS, padding: '9px 14px', fontSize: 13 }}>Back to last 12 months</button>}
        <button type="button" onClick={() => load(months)} style={{ ...btnS, padding: '9px 14px', fontSize: 13 }}>Refresh</button>
        <button
          type="button"
          onClick={() => exportTasksCSV(filtered, { filename: `archived-tasks-${localDateStr(new Date())}.csv` })}
          disabled={filtered.length === 0}
          title="Export the archived tasks currently listed"
          style={{ ...btnS, padding: '9px 14px', fontSize: 13, opacity: filtered.length ? 1 : 0.5 }}
        >
          Export CSV
        </button>
        <span style={{ color: B.textLight, fontSize: 13, marginLeft: 'auto' }}>
          {state.status === 'ready' && `${filtered.length}${filtered.length !== items.length ? ` of ${items.length}` : ''} archived task${items.length === 1 ? '' : 's'}`}
        </span>
      </div>

      <div style={{ fontSize: 12, color: B.textLight, fontFamily: f1, padding: '0 4px' }}>{windowCopy}</div>

      {state.status === 'loading' && (
        <div style={{ ...card, padding: '48px 32px', textAlign: 'center' }}><Spinner /></div>
      )}

      {/* A partial answer is never presented as the answer. Naming the arm that
          failed is what separates "denied" from "you have no archived tasks". */}
      {state.status === 'ready' && !state.result.complete && (
        <div style={{ ...card, padding: '24px', borderColor: '#FECACA', background: B.redPale }}>
          <div style={{ fontWeight: 700, color: B.red, fontFamily: f1, marginBottom: 6 }}>This archive is incomplete</div>
          <div style={{ fontSize: 13, color: B.textDark, lineHeight: 1.5 }}>
            {state.result.failures.length} of the queries behind this view did not return
            ({state.result.failures.map(f => `${f.arm}: ${f.code}`).join(', ')}).
            Anything listed below is real, but tasks are missing — do not read this as an empty archive.
          </div>
          <button type="button" onClick={() => load(months)} style={{ ...btnP, marginTop: 12, padding: '8px 16px', fontSize: 13 }}>Try again</button>
        </div>
      )}

      {state.status === 'ready' && state.result.complete && items.length === 0 && (
        <div style={{ ...card, padding: '48px 32px', textAlign: 'center' }}>
          <EmojiIcon emoji="🗂️" decorative style={{ fontSize: 44, marginBottom: 14, display: 'block' }} />
          <h3 style={{ fontFamily: f1, color: B.navy, margin: '0 0 8px', fontSize: 18 }}>Nothing archived yet</h3>
          <p style={{ color: B.textLight, fontSize: 14, margin: 0 }}>
            {ARCHIVING_ENABLED
              ? 'Tasks move here automatically once they have been complete for more than six weeks. Nothing is deleted — an archived task keeps its comments, photos, links and history, and can be reopened.'
              : 'Automatic archiving is not switched on yet. When it is, tasks that have been complete for more than six weeks will move here — keeping their comments, photos, links and history, and ready to be reopened. Nothing is deleted, and nothing is missing from your board today.'}
          </p>
        </div>
      )}

      {state.status === 'ready' && items.length > 0 && filtered.length === 0 && (
        <div style={{ ...card, padding: '36px 32px', textAlign: 'center' }}>
          <div style={{ fontFamily: f1, color: B.navy, fontWeight: 700, marginBottom: 6 }}>No archived task matches “{search}”</div>
          <p style={{ color: B.textLight, fontSize: 13, margin: 0 }}>{windowCopy}</p>
        </div>
      )}

      {state.status === 'ready' && filtered.length > 0 && (
        <div style={{ ...card, overflow: 'hidden' }}>
          {filtered.map((t, i) => (
            <button
              key={t._docId}
              type="button"
              onClick={() => setDetail(t)}
              style={{
                display: 'flex', width: '100%', textAlign: 'left', gap: 12, alignItems: isMobile ? 'flex-start' : 'center',
                flexDirection: isMobile ? 'column' : 'row', padding: '14px 18px', background: 'none', cursor: 'pointer',
                border: 'none', borderTop: i === 0 ? 'none' : '1px solid ' + B.sand, fontFamily: f1,
              }}
            >
              <span style={{ fontSize: 12, color: B.textLight, fontWeight: 700, minWidth: 64 }}>{t.taskNumber || '—'}</span>
              <span style={{ flex: 1, fontSize: 14, color: B.navy, fontWeight: 600 }}>{t.name}</span>
              {t.priority && <PriorityBadge priority={t.priority} />}
              <span style={{ display: 'flex' }}>
                {(t.assignees || []).slice(0, 3).map(a => (
                  <span key={a.uid || a.name} title={a.name} style={{ width: 24, height: 24, borderRadius: '50%', background: assigneeColor(a.name), color: '#fff', fontSize: 10, fontWeight: 700, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', marginLeft: 2 }}>{initials(a.name)}</span>
                ))}
              </span>
              <span style={{ fontSize: 12, color: B.textMid, minWidth: 130 }}>Completed {fmtDate(t.completedAt)}</span>
            </button>
          ))}
        </div>
      )}

      <Modal open={!!detail} onClose={() => setDetail(null)} title={detail ? `${detail.taskNumber ? detail.taskNumber + ' · ' : ''}${detail.name}` : ''} wide>
        {detail && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div style={{ background: B.warmGray, border: '1px solid ' + B.sand, borderRadius: 10, padding: '12px 16px', fontSize: 13, color: B.textDark, fontFamily: f1 }}>
              <strong>Archived.</strong> This task is read-only, including its comments. Reopen it to edit, comment, or delete it. Nothing was removed when it was archived.
            </div>

            <Field label="Status">{detail.status}</Field>
            <Field label="Completed">{fmtDate(detail.completedAt)}</Field>
            <Field label="Priority">{detail.priority || '—'}</Field>
            {detail.ministry && <Field label="Ministry">{detail.ministry}</Field>}
            <Field label="Visibility">{detail.visibility || 'team'}</Field>
            <Field label="Created by">{detail.createdByName || '—'} · {fmtDate(detail.createdAt)}</Field>
            {(detail.assignees || []).length > 0 && <Field label="Assignees">{detail.assignees.map(a => a.name).join(', ')}</Field>}
            {(detail.tags || []).length > 0 && <Field label="Tags">{detail.tags.join(', ')}</Field>}
            {detail.description && <Field label="Description"><span style={{ whiteSpace: 'pre-wrap' }}>{detail.description}</span></Field>}
            {detail.notes && <Field label="Notes"><span style={{ whiteSpace: 'pre-wrap' }}>{detail.notes}</span></Field>}
            {(detail.checklist || []).length > 0 && (
              <Field label="Checklist">
                <ul style={{ margin: 0, paddingLeft: 18 }}>
                  {detail.checklist.map((c, i) => <li key={i} style={{ fontSize: 13, color: B.textDark }}>{c.done ? '☑' : '☐'} {c.text}</li>)}
                </ul>
              </Field>
            )}
            {(detail.photos || []).length > 0 && (
              <Field label="Photos">
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  {detail.photos.map((url, i) => (
                    <a key={i} href={url} target="_blank" rel="noreferrer">
                      <img src={url} alt="" style={{ width: 84, height: 84, objectFit: 'cover', borderRadius: 8, border: '1px solid ' + B.sand }} />
                    </a>
                  ))}
                </div>
              </Field>
            )}

            <div>
              <div style={{ fontSize: 11, color: B.textLight, fontWeight: 700, textTransform: 'uppercase', letterSpacing: .6, fontFamily: f1, marginBottom: 8 }}>Comments</div>
              <CommentThread
                comments={comments} loading={commentsLoading} newComment="" onChange={() => {}} onPost={() => {}}
                posting={false} userId={userId} canOperate={canOperate} onEdit={() => {}} onDelete={() => {}}
                users={users} readOnly
              />
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, borderTop: '1px solid ' + B.sand, paddingTop: 14 }}>
              <button type="button" onClick={() => setDetail(null)} style={{ ...btnS }}>Close</button>
              <button type="button" onClick={() => handleReopen(detail)} disabled={reopening} style={{ ...btnP, opacity: reopening ? .6 : 1 }}>
                {reopening ? 'Reopening...' : 'Reopen'}
              </button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}

function Field({ label, children }) {
  return (
    <div>
      <div style={{ fontSize: 11, color: B.textLight, fontWeight: 700, textTransform: 'uppercase', letterSpacing: .6, fontFamily: f1, marginBottom: 3 }}>{label}</div>
      <div style={{ fontSize: 14, color: B.textDark, fontFamily: f1 }}>{children}</div>
    </div>
  );
}
