import { useState, useEffect, useContext, useRef, useMemo, memo } from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { collection, doc, onSnapshot, query as fsQuery, orderBy, runTransaction, updateDoc, deleteField } from 'firebase/firestore';
import { ref as storageRef, uploadBytes, getDownloadURL, deleteObject } from 'firebase/storage';
import { db, storage } from '../../firebase.js';
import { notify } from '../../utils/notify.js';
import { canSeeTask } from '../../utils/taskVisibility.js';
import { MobileCtx } from '../../hooks/useMobile.js';
import { B, f1, f2, inp, btnP, btnS, btnD } from '../../components/brand/tokens.js';
import { Modal } from '../../components/primitives/Modal.jsx';
import { FF } from '../../components/primitives/FF.jsx';
import { Spinner } from '../../components/primitives/Spinner.jsx';
import { RichTextarea } from '../../components/primitives/RichTextarea.jsx';
import { useConfirm } from '../../components/primitives/ConfirmDialog.jsx';
import { EmojiIcon } from '../../components/primitives/EmojiIcon.jsx';
import { resizeImageForUpload } from '../../utils/imageResize.js';
import { exportTasksCSV } from '../../utils/csv.js';
import { exportTasksICS } from '../../utils/ical.js';
import { localDateStr, calculateNextDue } from '../../utils/date.js';
import { formatPhone } from '../../utils/phone.js';
import { STATUSES, PRIORITIES, RECURRENCE_OPTIONS, RECURRENCE_LABELS, priorityColors, statusColors, initials, assigneeColor, PriorityBadge } from '../../components/board/boardUI.jsx';
import { BoardCalendar } from '../../components/board/BoardCalendar.jsx';
import { CommentThread } from '../../components/comments/CommentThread.jsx';
import { ArchivedTasks } from '../../components/board/ArchivedTasks.jsx';
import { mergeInsightTasks, insightHistoryStale, createInsightHistoryLoad } from '../../utils/workQueries.js';

// ── Bulk paste-import parsing ──
// Per-import cap. Above this, hint that the user split into batches.
const PASTE_MAX_ROWS = 200;
const PASTE_TSV_HEADER_KEYS = {
  'name':'name', 'task':'name', 'task name':'name', 'title':'name',
  'description':'description', 'desc':'description', 'notes':'description',
  'priority':'priority',
  'status':'status',
  'due':'dueDate', 'due date':'dueDate', 'duedate':'dueDate', 'date':'dueDate',
  'assignee':'assignee', 'assigned':'assignee', 'assigned to':'assignee', 'owner':'assignee',
};
const PASTE_PRIORITY_MAP = {
  'high':'High', 'urgent':'High', 'h':'High', '1':'High',
  'medium':'Medium', 'med':'Medium', 'normal':'Medium', 'm':'Medium', '2':'Medium',
  'low':'Low', 'l':'Low', '3':'Low',
};
const PASTE_STATUS_MAP = {
  'backlog':'Backlog', 'todo':'Backlog', 'to do':'Backlog', 'open':'Backlog', 'new':'Backlog', 'not started':'Backlog',
  'planning':'Planning', 'planned':'Planning',
  'in progress':'In Progress', 'in-progress':'In Progress', 'doing':'In Progress', 'progress':'In Progress', 'active':'In Progress', 'wip':'In Progress',
  'on hold':'On Hold', 'hold':'On Hold', 'paused':'On Hold', 'blocked':'On Hold',
  'complete':'Complete', 'completed':'Complete', 'done':'Complete', 'closed':'Complete', 'finished':'Complete',
  'cancelled':'Cancelled', 'canceled':'Cancelled',
};
function parsePasteDate(s) {
  const t = String(s || '').trim();
  if (!t) return null;
  const iso = t.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (iso) return `${iso[1]}-${iso[2].padStart(2,'0')}-${iso[3].padStart(2,'0')}`;
  const us = t.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})$/);
  if (us) {
    let [, m, d, y] = us;
    if (y.length === 2) y = '20' + y;
    return `${y}-${m.padStart(2,'0')}-${d.padStart(2,'0')}`;
  }
  const dt = new Date(t);
  if (!isNaN(dt.getTime())) return localDateStr(dt);
  return null;
}
function parsePasteText(text, taskHubUsers) {
  const lines = String(text || '').split(/\r?\n/).map(l => l.replace(/\s+$/, '')).filter(l => l.trim().length > 0);
  if (lines.length === 0) return { mode: 'lines', rows: [] };
  const userByName = new Map();
  for (const u of (taskHubUsers || [])) {
    if (u?.name) userByName.set(u.name.trim().toLowerCase(), u);
  }
  const firstHasTab = lines[0].includes('\t');
  if (firstHasTab) {
    const header = lines[0].split('\t').map(c => c.trim().toLowerCase());
    const mapped = header.map(h => PASTE_TSV_HEADER_KEYS[h] || null);
    if (mapped.some(k => k !== null)) {
      const rows = [];
      for (let i = 1; i < lines.length; i++) {
        const cells = lines[i].split('\t');
        const row = { warnings: [] };
        mapped.forEach((key, idx) => {
          if (!key) return;
          const raw = (cells[idx] || '').trim();
          if (!raw) return;
          if (key === 'priority') {
            const p = PASTE_PRIORITY_MAP[raw.toLowerCase()];
            if (p) row.priority = p; else row.warnings.push(`unknown priority "${raw}" → Medium`);
          } else if (key === 'status') {
            const s = PASTE_STATUS_MAP[raw.toLowerCase()];
            if (s) row.status = s; else row.warnings.push(`unknown status "${raw}" → Backlog`);
          } else if (key === 'dueDate') {
            const d = parsePasteDate(raw);
            if (d) row.dueDate = d; else row.warnings.push(`unparseable date "${raw}"`);
          } else if (key === 'assignee') {
            const u = userByName.get(raw.toLowerCase());
            if (u) row.assignees = [{ uid: u.id, name: u.name }];
            else row.warnings.push(`unknown assignee "${raw}" — left unassigned`);
          } else {
            row[key] = raw;
          }
        });
        if (row.name) rows.push(row);
      }
      return { mode: 'tsv', rows };
    }
    // Tabs present but no recognized header — treat first column as name
    return {
      mode: 'lines',
      rows: lines.map(l => ({ name: l.split('\t')[0].trim(), warnings: [] })).filter(r => r.name),
    };
  }
  return {
    mode: 'lines',
    rows: lines.map(l => ({ name: l.trim(), warnings: [] })).filter(r => r.name),
  };
}


const TaskCard = memo(function TaskCard({ task, onClick, onDragStart, onStatusChange, isMobile }) {
  const sc = statusColors[task.status] || statusColors['Backlog'];
  const isOverdue = task.dueDate && task.dueDate < localDateStr(new Date()) && task.status !== 'Complete' && task.status !== 'Cancelled';
  const visIcon = task.visibility === 'private' ? '🔒' : task.visibility === 'shared' ? '👥' : null;
  return (
    <div
      role="button"
      tabIndex={0}
      draggable={!isMobile && !!onDragStart}
      onDragStart={!isMobile && onDragStart ? e => { e.dataTransfer.setData('taskDocId', task._docId); e.dataTransfer.effectAllowed = 'move'; } : undefined}
      onClick={() => onClick(task)}
      onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onClick(task); } }}
      aria-label={`${(task.taskNumber || task.ticketNumber) ? (task.taskNumber || task.ticketNumber) + ': ' : ''}${task.name}${isOverdue ? ' (overdue)' : ''}`}
      style={{ background:B.white, borderRadius:12, padding:'14px 16px', border:'1px solid '+B.sand, cursor: !isMobile && onDragStart ? 'grab' : 'pointer', borderLeft:'4px solid '+sc.dot, boxShadow:'0 1px 3px rgba(27,42,74,0.06)', marginBottom:8, transition:'box-shadow 0.15s' }}
      onMouseEnter={e => e.currentTarget.style.boxShadow='0 4px 16px rgba(27,42,74,0.12)'}
      onMouseLeave={e => e.currentTarget.style.boxShadow='0 1px 3px rgba(27,42,74,0.06)'}
    >
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:6 }}>
        <div style={{ display:'flex', gap:4, alignItems:'center' }}>
          {task.assignees?.length > 0
            ? task.assignees.slice(0,3).map((a, i) => (
                <div key={a.uid || i} title={a.name} style={{ width:22, height:22, borderRadius:'50%', background:assigneeColor(a.uid), color:B.white, fontSize:9, fontWeight:700, display:'flex', alignItems:'center', justifyContent:'center', fontFamily:f1 }}>
                  {initials(a.name)}
                </div>
              ))
            : <span style={{ fontSize:11, color:B.textLight, fontFamily:f1 }}>Unassigned</span>
          }
        </div>
        <div style={{ display:'flex', alignItems:'center', gap:6 }}>
          {visIcon && <span title={task.visibility === 'private' ? 'Private' : 'Shared with specific people'} style={{ fontSize:12 }}>{visIcon}</span>}
          <PriorityBadge priority={task.priority}/>
        </div>
      </div>
      <div style={{ fontWeight:600, fontSize:14, color:B.navy, marginBottom:4, lineHeight:1.3 }}>{task.name}</div>
      {task.description && (
        <div style={{ fontSize:12, color:B.textMid, lineHeight:1.4, marginBottom:6, overflow:'hidden', display:'-webkit-box', WebkitLineClamp:2, WebkitBoxOrient:'vertical', whiteSpace:'pre-wrap' }}>
          {task.description}
        </div>
      )}
      {(task.ministry || task.tags?.length > 0) && (
        <div style={{ display:'flex', gap:4, flexWrap:'wrap', marginBottom:6 }}>
          {task.ministry && <span style={{ padding:'2px 8px', borderRadius:12, background:'#E8EBF8', color:'#3D4E9E', fontSize:10, fontFamily:f1, fontWeight:700 }}>{task.ministry}</span>}
          {task.tags?.slice(0,3).map(tag => (
            <span key={tag} style={{ padding:'2px 8px', borderRadius:12, background:B.warmGray, color:B.textMid, fontSize:10, fontFamily:f1 }}>{tag}</span>
          ))}
        </div>
      )}
      {(task.recurrence || task.checklist?.length > 0) && (
        <div style={{ display:'flex', gap:8, alignItems:'center', marginBottom:4 }}>
          {task.recurrence && <span style={{ fontSize:12, color:B.teal, fontFamily:f1 }}><EmojiIcon emoji="🔁" decorative /> {RECURRENCE_LABELS[task.recurrence]}</span>}
          {task.checklist?.length > 0 && (
            <span style={{ fontSize:12, color:task.checklist.filter(c=>c.done).length===task.checklist.length ? B.teal : B.textMid, fontFamily:f1 }}>
              ✓ {task.checklist.filter(c=>c.done).length}/{task.checklist.length}
            </span>
          )}
        </div>
      )}
      {(task.photos?.length > 0 || task.dueDate || task.estimatedHours != null || task.actualHours != null) && (
        <div style={{ display:'flex', justifyContent:'flex-end', gap:8, alignItems:'center', flexWrap:'wrap' }}>
          {task.photos?.length > 0 && <span style={{ fontSize:11, color:B.textLight }}><EmojiIcon emoji="📷" label="Photos" /> {task.photos.length}</span>}
          {(task.estimatedHours != null || task.actualHours != null) && (
            <span style={{ fontSize:11, color:B.textLight }}>⏱ {task.actualHours != null ? task.actualHours : '—'}/{task.estimatedHours != null ? task.estimatedHours : '—'}h</span>
          )}
          {task.dueDate && <span style={{ fontSize:11, color: isOverdue ? B.red : B.textLight }}><EmojiIcon emoji="📅" label="Due date" /> {task.dueDate}</span>}
        </div>
      )}
      {isMobile && onStatusChange && (
        <div onClick={e => e.stopPropagation()} style={{ marginTop:10, borderTop:'1px solid '+B.sand, paddingTop:8, display:'flex', alignItems:'center', gap:8 }}>
          <span style={{ fontSize:11, color:B.textLight, fontFamily:f1, fontWeight:600, flexShrink:0 }}>Move to:</span>
          <select
            aria-label={`Move "${task.name}" to status`}
            value={task.status}
            onChange={e => onStatusChange(task, e.target.value)}
            style={{ flex:1, fontSize:12, borderRadius:8, border:'1px solid '+B.sand, padding:'4px 8px', fontFamily:f1, color:B.navy, background:B.white }}
          >
            {STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>
      )}
    </div>
  );
});

function TagInput({ tags = [], onChange, suggestions = [] }) {
  const [inputVal, setInputVal] = useState('');
  const [showDrop, setShowDrop] = useState(false);
  const [highlightIdx, setHighlightIdx] = useState(-1);
  const blurTimerRef = useRef(null);
  // Enter handled in keydown sets this so the keyup mobile-fallback skips it on
  // desktop, where both events fire from the same keypress and would double-add.
  const enterHandledRef = useRef(false);
  useEffect(() => () => { if (blurTimerRef.current) clearTimeout(blurTimerRef.current); }, []);
  const filtered = suggestions.filter(s => !tags.includes(s) && s.toLowerCase().includes(inputVal.toLowerCase()));
  // Clamp at render time rather than effect-resetting on every filter change.
  const safeIdx = highlightIdx >= 0 && highlightIdx < filtered.length ? highlightIdx : -1;

  function addTag(t) {
    const tag = t.trim().toLowerCase();
    if (tag && !tags.includes(tag)) onChange([...tags, tag]);
    setInputVal('');
    setShowDrop(false);
    setHighlightIdx(-1);
  }
  function onKey(e) {
    if (showDrop && filtered.length > 0) {
      if (e.key === 'ArrowDown') { e.preventDefault(); setHighlightIdx(i => (i + 1) % filtered.length); return; }
      if (e.key === 'ArrowUp')   { e.preventDefault(); setHighlightIdx(i => i <= 0 ? filtered.length - 1 : i - 1); return; }
      if (e.key === 'Escape')    { e.preventDefault(); setShowDrop(false); return; }
      if (e.key === 'Enter' && safeIdx >= 0) {
        e.preventDefault(); e.stopPropagation();
        enterHandledRef.current = true;
        addTag(filtered[safeIdx]);
        return;
      }
    }
    if ((e.key === 'Enter' || e.key === ',') && inputVal.trim()) {
      e.preventDefault(); e.stopPropagation();
      if (e.key === 'Enter') enterHandledRef.current = true;
      addTag(inputVal);
    }
    else if (e.key === 'Backspace' && !inputVal && tags.length) onChange(tags.slice(0, -1));
  }
  // onKeyUp is a fallback for mobile virtual keyboards where onKeyDown may not fire for Enter
  function onKeyUp(e) {
    if (e.key !== 'Enter') return;
    if (enterHandledRef.current) { enterHandledRef.current = false; return; }
    if (inputVal.trim()) { e.preventDefault(); e.stopPropagation(); addTag(inputVal); }
  }
  return (
    <div style={{ position:'relative' }}>
      <div style={{ display:'flex', flexWrap:'wrap', gap:6, padding:'7px 10px', borderRadius:10, border:'1px solid '+B.sand, background:B.white, minHeight:42, alignItems:'center' }}>
        {tags.map(t => (
          <span key={t} style={{ display:'inline-flex', alignItems:'center', gap:4, padding:'2px 8px', borderRadius:12, background:B.tealPale, color:B.teal, fontSize:12, fontFamily:f1 }}>
            {t}
            <button onMouseDown={e => { e.preventDefault(); onChange(tags.filter(x => x !== t)); }} aria-label={`Remove tag ${t}`} style={{ border:'none', background:'none', color:B.teal, cursor:'pointer', padding:'0 0 0 2px', fontSize:14, lineHeight:1 }}>×</button>
          </span>
        ))}
        <input
          value={inputVal}
          onChange={e => { setInputVal(e.target.value); setShowDrop(true); }}
          onKeyDown={onKey}
          onKeyUp={onKeyUp}
          onFocus={() => setShowDrop(true)}
          onBlur={() => { blurTimerRef.current = setTimeout(() => setShowDrop(false), 150); }}
          placeholder={tags.length ? '' : 'Type tag, press Enter...'}
          enterKeyHint="done"
          style={{ border:'none', outline:'none', fontSize:13, flex:1, minWidth:80, fontFamily:f2, color:B.textDark, background:'transparent' }}
        />
      </div>
      {showDrop && filtered.length > 0 && (
        <div role="listbox" style={{ position:'absolute', top:'100%', left:0, right:0, zIndex:200, background:B.white, border:'1px solid '+B.sand, borderRadius:10, boxShadow:'0 4px 16px rgba(27,42,74,0.1)', maxHeight:130, overflowY:'auto', marginTop:2 }}>
          {filtered.map((s, idx) => (
            <div key={s} role="option" aria-selected={idx === safeIdx} onMouseDown={() => addTag(s)} style={{ padding:'8px 14px', cursor:'pointer', fontSize:13, fontFamily:f2, color:B.textDark, background: idx === safeIdx ? B.warmGray : '' }}
              onMouseEnter={() => setHighlightIdx(idx)}
            >{s}</div>
          ))}
        </div>
      )}
    </div>
  );
}

function AssigneeSelect({ assignees = [], onChange, users = [], currentUserId, currentUserName }) {
  const isSelf = assignees.some(a => a.uid === currentUserId);
  function toggle(user) {
    const ex = assignees.find(a => a.uid === user.id);
    if (ex) onChange(assignees.filter(a => a.uid !== user.id));
    else onChange([...assignees, { uid: user.id, name: user.name }]);
  }
  function toggleSelf() {
    if (isSelf) onChange(assignees.filter(a => a.uid !== currentUserId));
    else onChange([...assignees, { uid: currentUserId, name: currentUserName }]);
  }
  function pill(selected, label, onClick) {
    return (
      <button key={label} type="button" onClick={onClick} aria-pressed={selected} style={{ padding:'5px 12px', borderRadius:20, border:'1px solid '+(selected ? B.teal : B.sand), background:selected ? B.tealPale : B.white, color:selected ? B.teal : B.textMid, fontSize:12, fontFamily:f1, cursor:'pointer', fontWeight:600 }}>
        {selected ? '✓ ' : ''}{label}
      </button>
    );
  }
  return (
    <div style={{ display:'flex', flexWrap:'wrap', gap:6 }}>
      {pill(isSelf, 'Me', toggleSelf)}
      {users.filter(u => u.active !== false && u.id !== currentUserId).map(u =>
        pill(assignees.some(a => a.uid === u.id), u.name, () => toggle(u))
      )}
    </div>
  );
}

function SharedWithSelect({ sharedWith = [], onChange, users = [], assignees = [], currentUserId }) {
  const assigneeUids = new Set((assignees || []).map(a => a.uid));
  function toggle(user) {
    const ex = sharedWith.find(s => s.uid === user.id);
    if (ex) onChange(sharedWith.filter(s => s.uid !== user.id));
    else onChange([...sharedWith, { uid: user.id, name: user.name }]);
  }
  const visibleUsers = users.filter(u => u.active !== false && u.id !== currentUserId);
  if (visibleUsers.length === 0) return <p style={{ color:B.textLight, fontSize:13, margin:0 }}>No other team members to share with.</p>;
  return (
    <div style={{ display:'flex', flexWrap:'wrap', gap:6 }}>
      {visibleUsers.map(u => {
        const isAssignee = assigneeUids.has(u.id);
        const isSelected = sharedWith.some(s => s.uid === u.id) || isAssignee;
        return (
          <button
            key={u.id}
            type="button"
            onClick={() => !isAssignee && toggle(u)}
            aria-pressed={isSelected}
            aria-disabled={isAssignee || undefined}
            title={isAssignee ? 'Assignees always have access' : undefined}
            style={{ padding:'5px 12px', borderRadius:20, border:'1px solid '+(isSelected ? B.teal : B.sand), background:isSelected ? B.tealPale : B.white, color:isSelected ? B.teal : B.textMid, fontSize:12, fontFamily:f1, cursor:isAssignee ? 'default' : 'pointer', fontWeight:600, opacity:isAssignee ? 0.7 : 1 }}
          >
            {isSelected ? '✓ ' : ''}{u.name}{isAssignee ? ' (assignee)' : ''}
          </button>
        );
      })}
    </div>
  );
}

function VisibilitySelect({ visibility, onChange, canEdit }) {
  const options = [
    { value: 'team',    label: 'Team',    desc: 'Everyone with hub access' },
    { value: 'private', label: 'Private', desc: 'Only you' },
    { value: 'shared',  label: 'Shared',  desc: 'Choose specific people' },
  ];
  if (!canEdit) {
    const opt = options.find(o => o.value === visibility) || options[0];
    return <span style={{ fontSize:13, color:B.textMid, fontFamily:f2 }}>{opt.label} — {opt.desc}</span>;
  }
  return (
    <div style={{ display:'flex', gap:6, flexWrap:'wrap' }}>
      {options.map(o => (
        <button
          key={o.value}
          type="button"
          onClick={() => onChange(o.value)}
          aria-pressed={visibility === o.value}
          title={o.desc}
          style={{ padding:'5px 14px', borderRadius:20, border:'1px solid '+(visibility === o.value ? B.teal : B.sand), background:visibility === o.value ? B.tealPale : B.white, color:visibility === o.value ? B.teal : B.textMid, fontSize:12, fontFamily:f1, cursor:'pointer', fontWeight:600 }}
        >
          {visibility === o.value ? '✓ ' : ''}{o.label}
        </button>
      ))}
    </div>
  );
}

function PhotoGrid({ photos = [], onAdd, onRemove, uploading }) {
  const [lightboxIdx, setLightboxIdx] = useState(null);
  const fileRef = useRef();

  useEffect(() => {
    if (lightboxIdx === null) return;
    function handleKey(e) {
      if (e.key === 'Escape') setLightboxIdx(null);
      if (e.key === 'ArrowLeft') setLightboxIdx(i => Math.max(0, i - 1));
      if (e.key === 'ArrowRight') setLightboxIdx(i => Math.min(photos.length - 1, i + 1));
    }
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [lightboxIdx, photos]);

  return (
    <div>
      {lightboxIdx !== null && (
        <div onClick={() => setLightboxIdx(null)} style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.92)', zIndex:9999, display:'flex', alignItems:'center', justifyContent:'center' }}>
          <img src={photos[lightboxIdx]} alt="" onClick={e => e.stopPropagation()} style={{ maxWidth:'90vw', maxHeight:'90vh', objectFit:'contain', borderRadius:6 }}/>
          <button onClick={() => setLightboxIdx(null)} aria-label="Close lightbox" style={{ position:'absolute', top:16, right:20, background:'none', border:'none', color:'#fff', fontSize:32, cursor:'pointer', lineHeight:1, padding:4 }}>×</button>
          {photos.length > 1 && lightboxIdx > 0 && (
            <button onClick={e => { e.stopPropagation(); setLightboxIdx(i => i - 1); }} aria-label="Previous photo" style={{ position:'absolute', left:16, background:'rgba(255,255,255,0.18)', border:'none', color:'#fff', fontSize:28, cursor:'pointer', borderRadius:8, padding:'6px 14px', lineHeight:1 }}>‹</button>
          )}
          {photos.length > 1 && lightboxIdx < photos.length - 1 && (
            <button onClick={e => { e.stopPropagation(); setLightboxIdx(i => i + 1); }} aria-label="Next photo" style={{ position:'absolute', right:16, background:'rgba(255,255,255,0.18)', border:'none', color:'#fff', fontSize:28, cursor:'pointer', borderRadius:8, padding:'6px 14px', lineHeight:1 }}>›</button>
          )}
          {photos.length > 1 && (
            <div style={{ position:'absolute', bottom:16, color:'rgba(255,255,255,0.65)', fontSize:13 }}>{lightboxIdx + 1} / {photos.length}</div>
          )}
        </div>
      )}
      <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill, minmax(90px, 1fr))', gap:8 }}>
        {photos.map((url, i) => (
          <div key={i} role="button" tabIndex={0} aria-label={`View photo ${i+1}`} onClick={() => setLightboxIdx(i)} onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setLightboxIdx(i); }}} style={{ position:'relative', borderRadius:8, overflow:'hidden', aspectRatio:'1', background:B.warmGray, cursor:'zoom-in' }}>
            <img src={url} alt="" style={{ width:'100%', height:'100%', objectFit:'cover' }}/>
            {onRemove && (
              <button onClick={e => { e.stopPropagation(); onRemove(i); }} style={{ position:'absolute', top:3, right:3, width:20, height:20, borderRadius:'50%', background:'rgba(0,0,0,0.55)', border:'none', color:B.white, cursor:'pointer', fontSize:13, display:'flex', alignItems:'center', justifyContent:'center', padding:0 }}>×</button>
            )}
          </div>
        ))}
        {onAdd && (
          <div
            role="button"
            tabIndex={0}
            aria-label="Add photo"
            onClick={() => !uploading && fileRef.current?.click()}
            onKeyDown={e => { if ((e.key === 'Enter' || e.key === ' ') && !uploading) { e.preventDefault(); fileRef.current?.click(); }}}
            style={{ borderRadius:8, border:'2px dashed '+B.sand, aspectRatio:'1', display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', cursor:uploading ? 'wait' : 'pointer', background:B.warmGray, color:B.textLight, fontSize:11, gap:2 }}
          >
            {uploading ? '⏳' : <><span style={{ fontSize:22, lineHeight:1 }}>+</span>Photo</>}
          </div>
        )}
      </div>
      {onAdd && <input ref={fileRef} type="file" accept="image/*" multiple style={{ display:'none' }} onChange={e => { if (e.target.files?.length) onAdd(Array.from(e.target.files)); e.target.value = ''; }}/>}
    </div>
  );
}

const KanbanColumn = memo(function KanbanColumn({ status, tasks, onTaskClick, onDrop, onReorder, onStatusChange, isMobile, onQuickAdd }) {
  const sc = statusColors[status] || statusColors['Backlog'];
  const [dragOver, setDragOver] = useState(false);
  const [quickAddName, setQuickAddName] = useState('');
  return (
    <div
      onDragOver={!isMobile && onDrop ? e => { e.preventDefault(); setDragOver(true); } : undefined}
      onDragLeave={!isMobile && onDrop ? () => setDragOver(false) : undefined}
      onDrop={!isMobile && onDrop ? e => { e.preventDefault(); setDragOver(false); const docId = e.dataTransfer.getData('taskDocId'); if (docId) onDrop(docId); } : undefined}
      style={{ minWidth:isMobile ? '100%' : 260, maxWidth:isMobile ? '100%' : 280, flexShrink:0, background:dragOver ? B.tealPale : B.warmGray, borderRadius:14, padding:'12px 10px', border:'2px solid '+(dragOver ? B.teal : 'transparent'), transition:'background 0.15s, border-color 0.15s' }}
    >
      <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:10, paddingLeft:4 }}>
        <span style={{ width:10, height:10, borderRadius:'50%', background:sc.dot, flexShrink:0 }}/>
        <span style={{ fontWeight:700, fontSize:13, color:B.navy, fontFamily:f1 }}>{status}</span>
        <span style={{ marginLeft:'auto', background:B.white, borderRadius:20, padding:'2px 8px', fontSize:11, fontWeight:700, color:B.textMid, fontFamily:f1 }}>{tasks.length}</span>
      </div>
      <div style={{ overflowY:'auto', maxHeight:isMobile ? 'none' : 'calc(100vh - 380px)', minHeight:80 }}>
        {tasks.length === 0
          ? <div style={{ textAlign:'center', color:B.textLight, fontSize:12, padding:'16px 0', fontStyle:'italic' }}>Empty</div>
          : tasks.map(t => {
              return (
                <div
                  key={t._docId}
                  onDragOver={!isMobile && (onDrop || onReorder) ? e => e.preventDefault() : undefined}
                  onDrop={!isMobile && (onDrop || onReorder) ? e => {
                    e.preventDefault();
                    e.stopPropagation();
                    setDragOver(false);
                    const fromDocId = e.dataTransfer.getData('taskDocId');
                    if (!fromDocId || fromDocId === t._docId) return;
                    if (tasks.some(x => x._docId === fromDocId) && onReorder) {
                      onReorder(fromDocId, t._docId);
                    } else if (onDrop) {
                      onDrop(fromDocId);
                    }
                  } : undefined}
                >
                  <TaskCard task={t} onClick={onTaskClick} onDragStart={onDrop || onReorder || undefined} onStatusChange={onStatusChange} isMobile={isMobile}/>
                </div>
              );
            })
        }
      </div>
      {onQuickAdd && (
        <div style={{ marginTop:8, display:'flex', gap:4 }}>
          <input
            value={quickAddName}
            onChange={e => setQuickAddName(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && quickAddName.trim()) { onQuickAdd(quickAddName); setQuickAddName(''); } }}
            placeholder="Quick add..."
            style={{ ...inp, flex:1, fontSize:12, padding:'6px 8px' }}
          />
          <button type="button" onClick={() => { if (quickAddName.trim()) { onQuickAdd(quickAddName); setQuickAddName(''); } }} style={{ ...btnS, padding:'6px 10px', fontSize:12 }}>+</button>
        </div>
      )}
    </div>
  );
});

function PastePanel({ pasteText, setPasteText, taskHubUsers, pasteSaving, pasteProgress, onCancel, onSubmit }) {
  const parsed = useMemo(() => parsePasteText(pasteText, taskHubUsers), [pasteText, taskHubUsers]);
  const rows = parsed.rows;
  const tooMany = rows.length > PASTE_MAX_ROWS;
  const submittableRows = tooMany ? rows.slice(0, PASTE_MAX_ROWS) : rows;
  const warningCount = rows.reduce((n, r) => n + (r.warnings?.length || 0), 0);
  const isMobile = useContext(MobileCtx);

  return (
    <div style={{ display:'flex', flexDirection: isMobile ? 'column' : 'row', gap:16 }}>
      {/* Input column */}
      <div style={{ flex:'1 1 0', minWidth:0 }}>
        <p style={{ fontSize:13, color:B.textMid, margin:'0 0 10px' }}>
          Paste a task per line, or tab-separated columns with a header row.
          <br/>
          <span style={{ color:B.textLight, fontSize:12 }}>
            Recognized columns: <strong>Name</strong>, Description, Priority, Status, Due Date, Assignee
          </span>
        </p>
        <textarea
          value={pasteText}
          onChange={e => setPasteText(e.target.value)}
          disabled={pasteSaving}
          placeholder={"Order new robes\nSend volunteer thank-yous\nPrep Easter bulletin\n\n— or —\n\nName\\tPriority\\tDue Date\\tAssignee\nOrder new robes\\tHigh\\t2026-06-01\\tJane Doe"}
          rows={12}
          spellCheck={false}
          style={{ ...inp, width:'100%', minHeight:240, fontFamily:'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace', fontSize:13, lineHeight:1.5, resize:'vertical', whiteSpace:'pre', overflow:'auto' }}
        />
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginTop:8, fontSize:12, color:B.textLight }}>
          <span>{parsed.mode === 'tsv' ? 'TSV with header detected' : 'Plain-line mode'}</span>
          <span>{rows.length} task{rows.length !== 1 ? 's' : ''} found{warningCount > 0 ? ` · ${warningCount} warning${warningCount !== 1 ? 's' : ''}` : ''}</span>
        </div>
      </div>

      {/* Preview column */}
      <div style={{ flex:'1 1 0', minWidth:0, display:'flex', flexDirection:'column' }}>
        <div style={{ display:'flex', alignItems:'baseline', justifyContent:'space-between', marginBottom:8 }}>
          <strong style={{ fontFamily:f1, fontSize:13, color:B.navy }}>Preview</strong>
          {tooMany && <span style={{ fontSize:12, color:B.red }}>Showing first {PASTE_MAX_ROWS} of {rows.length}</span>}
        </div>
        <div style={{ flex:1, minHeight:240, maxHeight:360, overflowY:'auto', border:'1px solid '+B.sand, borderRadius:8, background:B.white, padding: rows.length ? 6 : 0 }}>
          {rows.length === 0 && (
            <div style={{ height:'100%', minHeight:200, display:'flex', alignItems:'center', justifyContent:'center', color:B.textLight, fontSize:13, padding:16, textAlign:'center' }}>
              Paste some lines on the left to preview them here.
            </div>
          )}
          {submittableRows.map((r, i) => (
            <div key={i} style={{ padding:'8px 10px', borderBottom: i < submittableRows.length - 1 ? '1px solid '+B.sand : 'none' }}>
              <div style={{ display:'flex', gap:6, alignItems:'baseline' }}>
                <span style={{ fontSize:11, color:B.textLight, fontFamily:f1, minWidth:24 }}>{i + 1}.</span>
                <span style={{ fontSize:13, color:B.textDark, fontFamily:f2, fontWeight:600, wordBreak:'break-word' }}>{r.name}</span>
              </div>
              {(r.priority || r.status || r.dueDate || r.assignees?.length || r.description) && (
                <div style={{ display:'flex', flexWrap:'wrap', gap:4, marginTop:4, marginLeft:30 }}>
                  {r.priority && <span style={{ fontSize:10, padding:'2px 6px', borderRadius:4, background:(priorityColors[r.priority]?.bg || B.warmGray), color:(priorityColors[r.priority]?.tx || B.textMid), fontFamily:f1, fontWeight:600 }}>{r.priority}</span>}
                  {r.status && <span style={{ fontSize:10, padding:'2px 6px', borderRadius:4, background:(statusColors[r.status]?.bg || B.warmGray), color:(statusColors[r.status]?.tx || B.textMid), fontFamily:f1, fontWeight:600 }}>{r.status}</span>}
                  {r.dueDate && <span style={{ fontSize:10, padding:'2px 6px', borderRadius:4, background:B.warmGray, color:B.textMid, fontFamily:f1 }}>Due {r.dueDate}</span>}
                  {r.assignees?.length > 0 && <span style={{ fontSize:10, padding:'2px 6px', borderRadius:4, background:B.tealPale, color:B.teal, fontFamily:f1, fontWeight:600 }}>→ {r.assignees[0].name}</span>}
                  {r.description && <span style={{ fontSize:10, padding:'2px 6px', borderRadius:4, background:B.warmGray, color:B.textLight, fontFamily:f1, fontStyle:'italic', maxWidth:280, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }} title={r.description}>“{r.description}”</span>}
                </div>
              )}
              {r.warnings?.length > 0 && (
                <div style={{ marginTop:4, marginLeft:30, fontSize:11, color:'#9A5E10', fontFamily:f2 }}>
                  ⚠ {r.warnings.join('; ')}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Footer (spans both columns) */}
      <div style={{ flex:'0 0 100%', display:'flex', flexDirection:'column', gap:8, marginTop:8 }}>
        {pasteSaving && pasteProgress && (
          <div style={{ fontSize:13, color:B.textMid, textAlign:'center' }}>
            Creating task {pasteProgress.done + 1} of {pasteProgress.total}…
            <div style={{ height:6, background:B.warmGray, borderRadius:3, marginTop:6, overflow:'hidden' }}>
              <div style={{ height:'100%', width: pasteProgress.total ? `${Math.round((pasteProgress.done / pasteProgress.total) * 100)}%` : '0%', background:B.teal, transition:'width 0.15s' }} />
            </div>
          </div>
        )}
        <div style={{ display:'flex', justifyContent:'flex-end', gap:8 }}>
          <button type="button" onClick={onCancel} disabled={pasteSaving} style={{ ...btnS, opacity: pasteSaving ? .5 : 1, cursor: pasteSaving ? 'not-allowed' : 'pointer' }}>Cancel</button>
          <button
            type="button"
            onClick={() => onSubmit(submittableRows)}
            disabled={pasteSaving || submittableRows.length === 0}
            style={{ ...btnP, opacity:(pasteSaving || submittableRows.length === 0) ? .5 : 1, cursor:(pasteSaving || submittableRows.length === 0) ? 'not-allowed' : 'pointer' }}
          >
            {pasteSaving ? 'Creating…' : `Create ${submittableRows.length} task${submittableRows.length !== 1 ? 's' : ''}`}
          </button>
        </div>
      </div>
    </div>
  );
}

const getEmptyTask = () => ({ name:'', description:'', priority:'Medium', status:'Backlog', tags:[], dueDate:'', recurrence:'', assignees:[], visibility:'private', sharedWith:[], notes:'', checklist:[], linkedItemDocId:null, linkedTicketDocId:null, estimatedHours:null, actualHours:null, ministry:'', vendorId:'', estimatedCost:'' });
const getEmptyVendor = () => ({ name:'', phone:'', email:'', specialty:'', notes:'' });

// One board engine, two categories. `type` selects tasks vs maintenance: the
// shared scaffold (views, cards, filters, comments, photos, checklist) is
// identical; only the type-specific data surfaces differ (tasks: visibility/
// sharing/ministry/templates/→Job; maintenance: vendors/linked-equipment/cost/
// contractor). This replaced the old standalone MaintenancePage — see
// docs/WORK-MERGE-TASKS-MAINTENANCE-PLAN-2026-06-23.md §4.
export function WorkBoard({ store, userProfile, type = 'task' }) {
  const isMaint = type === 'maintenance';
  const {
    tasks, items, maintenanceTickets, users, settings, config, notificationConfig, loading,
    addTask, updateTask, deleteTask, addTaskComment, updateTaskComment, deleteTaskComment, addTaskTags,
    loadArchivedTasks, reopenTask,
    updateUser, taskTemplates, addTaskTemplate, deleteTaskTemplate, addJobListing, deleteJobListing,
    addTicket, updateTicket, deleteTicket, addTicketComment, updateTicketComment, deleteTicketComment, addMaintenanceTags,
    vendors = [], addVendor, updateVendor, deleteVendor, accessPeople = [], timeEntries = [], addTimeEntry,
  } = store;
  const isMobile = useContext(MobileCtx);

  const userId = userProfile?.id || userProfile?.uid;
  const userName = userProfile?.name ?? '';
  const churchId = userProfile?.churchId;
  const isAdmin = userProfile?.role === 'admin';
  const isManager = userProfile?.role === 'manager';
  const canOperate = isAdmin || isManager;
  // Maintenance is admin/manager-create-only; tasks are any-member-create.
  const canCreate = isMaint ? canOperate : true;

  // ── Type-driven engine config (the only places the two categories diverge) ──
  const hubKey = isMaint ? 'maintenance' : 'tasks';
  const numberField = isMaint ? 'ticketNumber' : 'taskNumber';
  const docPrefix = isMaint ? 'mnt_' : 'task_';
  const noun = isMaint ? 'ticket' : 'task';
  const Noun = isMaint ? 'Ticket' : 'Task';
  const notifyType = isMaint ? 'ticket_assigned' : 'task_assigned';
  const tagSuggestions = isMaint ? (settings?.maintenanceTags || []) : (settings?.taskTags || []);
  // Store-fn adapters. The maintenance fns harmlessly ignore the extra trailing
  // args (uid/name/number) that the task fns consume, so one call shape serves both.
  const addItem = isMaint ? addTicket : addTask;
  const updateItem = isMaint ? updateTicket : updateTask;
  const deleteItem = isMaint ? deleteTicket : deleteTask;
  const addItemComment = isMaint ? addTicketComment : addTaskComment;
  const updateItemComment = isMaint ? updateTicketComment : updateTaskComment;
  const deleteItemComment = isMaint ? deleteTicketComment : deleteTaskComment;
  const addItemTags = isMaint ? addMaintenanceTags : addTaskTags;

  const taskTags = tagSuggestions;
  const activeItems = (items || []).filter(i => i.status !== 'Disposed');

  // ── Filter users to those with this category's hub access ──
  const taskHubUsers = useMemo(() =>
    (users || []).filter(u => {
      if (u.active === false) return false;
      if (u.role === 'admin') return true;
      const allowed = u.allowedHubs;
      if (allowed == null) return true;
      return allowed.includes(hubKey);
    }),
  [users, hubKey]);

  // Assignees for the filter dropdown: active users with Tasks Hub access, plus deactivated users
  // who appear on existing tasks (so tasks assigned to them remain filterable).
  // The category's source list (tasks or maintenance tickets).
  const rawItems = useMemo(() => isMaint ? (maintenanceTickets || []) : (tasks || []), [isMaint, maintenanceTickets, tasks]);

  const filterableAssignees = useMemo(() => {
    const fromItems = rawItems.flatMap(t => t.assignees || []);
    const seen = new Set(taskHubUsers.map(u => u.id));
    const extra = fromItems.filter(a => a.uid && !seen.has(a.uid)).map(a => ({ id: a.uid, name: a.name }));
    return [...taskHubUsers, ...extra];
  }, [taskHubUsers, rawItems]);

  // ── Visibility filter — applied before any rendering ──
  // Tasks can be private/shared; maintenance tickets have no visibility model, so
  // every maintenance-hub user sees them all. The predicate lives in
  // utils/taskVisibility.js because useFirestore applies the same one to the store
  // (DEC-2026-010) — this call is now belt-and-braces over an already-filtered
  // array, and is kept so the board stays correct if the store filter is removed
  // at COH-006's reader cutover. Neither filter is authorization: until COH-006
  // deploys, private tasks still reach every member's browser (DEC-2026-009).
  const visibleTasks = useMemo(() => {
    if (isMaint) return rawItems;
    return rawItems.filter(t => canSeeTask(t, userId));
  }, [rawItems, isMaint, userId]);

  // Declared early — referenced in the pruning useEffect below (TDZ guard per CLAUDE.md Known Pitfalls)
  const tasksByDocId = useMemo(() => {
    const map = {};
    visibleTasks.forEach(t => { map[t._docId] = t; });
    return map;
  }, [visibleTasks]);

  // ── State ──
  const [viewMode, setViewMode] = useState(() => {
    // The stored key is shared with the maintenance board, which has no archive.
    const saved = localStorage.getItem('tasks_viewMode') || 'kanban';
    return (isMaint && saved === 'archive') ? 'kanban' : saved;
  });
  const isArchiveView = !isMaint && viewMode === 'archive';
  const [filterSearch, setFilterSearch] = useState('');
  const [filterPriority, setFilterPriority] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [filterMyTasks, setFilterMyTasks] = useState(false);
  const [filterAssignee, setFilterAssignee] = useState('');
  const [filterMinistry, setFilterMinistry] = useState('');
  const [showAdd, setShowAdd] = useState(false);
  const [showDetail, setShowDetail] = useState(null);
  const [saving, setSaving] = useState(false);
  const [selectedTaskIds, setSelectedTaskIds] = useState(new Set());
  const [bulkStatus, setBulkStatus] = useState('');
  const [bulkSaving, setBulkSaving] = useState(false);
  const [bulkAssigneeId, setBulkAssigneeId] = useState('');
  const [msg, setMsg] = useState(null);
  const { confirm, ConfirmHost } = useConfirm();
  const [collapsedStatuses, setCollapsedStatuses] = useState(new Set());
  const [uploadingPhotos, setUploadingPhotos] = useState(false);

  // ── Paste-import (bulk task creation from textarea) ──
  const [showPaste, setShowPaste] = useState(false);
  const [pasteText, setPasteText] = useState('');
  const [pasteSaving, setPasteSaving] = useState(false);
  const [pasteProgress, setPasteProgress] = useState(null); // { done, total } | null

  // ── Task defaults (per-user, persisted to users/{uid}) ──
  const [taskDefaults, setTaskDefaults] = useState(() => ({
    visibility: userProfile?.taskDefaultVisibility || 'private',
    sharedWith: userProfile?.taskDefaultSharedWith || [],
  }));
  const [showDefaultsModal, setShowDefaultsModal] = useState(false);
  const [defaultsForm, setDefaultsForm] = useState(() => ({
    visibility: userProfile?.taskDefaultVisibility || 'private',
    sharedWith: userProfile?.taskDefaultSharedWith || [],
  }));
  const [savingDefaults, setSavingDefaults] = useState(false);

  // The state above is seeded once; re-sync if the profile arrives (or changes)
  // after mount, so a user who saved 'team' isn't left on the built-in 'private'.
  const profileDefaultVisibility = userProfile?.taskDefaultVisibility;
  const profileDefaultSharedJson = JSON.stringify(userProfile?.taskDefaultSharedWith || []);
  useEffect(() => {
    setTaskDefaults({ visibility: profileDefaultVisibility || 'private', sharedWith: JSON.parse(profileDefaultSharedJson) });
  }, [profileDefaultVisibility, profileDefaultSharedJson]);

  const [showTemplates, setShowTemplates] = useState(false);
  const [showSaveTemplate, setShowSaveTemplate] = useState(false);
  const [saveTemplateForm, setSaveTemplateForm] = useState({ name: '', autoGenerate: false, autoGenerateFrequency: 'weekly', autoGenerateNextAt: '' });
  const [taskForm, setTaskForm] = useState(getEmptyTask);
  const [photoFiles, setPhotoFiles] = useState([]);
  const [photoPreviews, setPhotoPreviews] = useState([]);
  const [detailEdits, setDetailEdits] = useState({});
  const [detailSnapshot, setDetailSnapshot] = useState({});
  const [remoteUpdate, setRemoteUpdate] = useState(null);
  const [sortBy, setSortBy] = useState(() => localStorage.getItem('tasks_sortBy') || 'createdDesc');
  const [detailChecklistInput, setDetailChecklistInput] = useState('');
  const checklistInputRef = useRef();
  const dragChecklistIdx = useRef(null);
  const isDirtyRef = useRef(false);

  // Convert / cross-hub (tasks → Job; Jobs stays a separate hub)
  const [showConvertToJobModal, setShowConvertToJobModal] = useState(false);
  const [convertJobForm, setConvertJobForm] = useState({ title:'', scheduledDate:'', location:'', spotsTotal:1 });
  const [convertJobSaving, setConvertJobSaving] = useState(false);

  // ── Maintenance-only state (vendors + contractor scheduling) ──
  const [showVendors, setShowVendors] = useState(false);
  const [showAddVendor, setShowAddVendor] = useState(false);
  const [showEditVendor, setShowEditVendor] = useState(null); // vendor object being edited
  const [vendorForm, setVendorForm] = useState(getEmptyVendor);
  const [contractorModal, setContractorModal] = useState(false);
  const [contractorForm, setContractorForm] = useState({ personId: '', date: '', hours: '' });

  // Comments
  const [comments, setComments] = useState([]);
  const [commentsLoading, setCommentsLoading] = useState(false);
  const [newComment, setNewComment] = useState('');
  const [postingComment, setPostingComment] = useState(false);

  // Comments subscription — fires whenever a task detail is opened
  useEffect(() => {
    if (!showDetail?._docId || !churchId) { setComments([]); return; }
    setCommentsLoading(true);
    setComments([]);
    const q = fsQuery(
      collection(db, 'churches', churchId, 'workItems', `${docPrefix}${showDetail._docId}`, 'comments'),
      orderBy('createdAt', 'asc')
    );
    const unsub = onSnapshot(q, snap => {
      setComments(snap.docs.map(d => ({ id:d.id, ...d.data() })));
      setCommentsLoading(false);
    }, () => {
      // Clear rather than keep showing comments this listener can no longer
      // confirm — gate 4 gates comments on the parent's visibility, so a denial
      // here becomes a real case (gate-3 review M-1).
      setComments([]);
      setCommentsLoading(false);
    });
    return unsub;
  }, [showDetail?._docId, churchId]);

  // Task document real-time subscription — keeps detail modal in sync with concurrent edits
  useEffect(() => {
    if (!showDetail?._docId || !churchId) { setRemoteUpdate(null); return; }
    setRemoteUpdate(null);
    const initialRef = { current: true };
    const unsub = onSnapshot(
      doc(db, 'churches', churchId, 'workItems', `${docPrefix}${showDetail._docId}`),
      snap => {
        if (!snap.exists()) {
          if (initialRef.current) { initialRef.current = false; return; }
          setShowDetail(null);
          flash(`This ${noun} was deleted by another user.`, true);
          return;
        }
        if (initialRef.current) { initialRef.current = false; return; } // skip first fire
        const remote = { _docId: snap.id, ...snap.data() };
        if (isDirtyRef.current) {
          // User has unsaved edits — surface conflict banner
          setRemoteUpdate(remote);
        } else {
          // No unsaved edits — silently apply remote state
          setShowDetail(remote);
          const edits = taskToEdits(remote);
          setDetailEdits(edits);
          setDetailSnapshot(edits);
        }
      },
      // COH-006 gate 3 (review M-1): losing read access is not a delete, and the
      // `!snap.exists()` branch above never fires for it. When the creator drops
      // your last assignment on a private task, the collection listeners stop
      // returning it and this document listener is denied — previously leaving the
      // modal open on data you can no longer read, with no explanation. Close it
      // and say why. Any other listener failure closes too rather than silently
      // freezing on a stale document.
      err => {
        setShowDetail(null);
        setRemoteUpdate(null);
        flash(err?.code === 'permission-denied'
          ? `Your access to this ${noun} was removed.`
          : `This ${noun} stopped syncing and was closed.`, true);
      }
    );
    return () => { unsub(); setRemoteUpdate(null); };
  }, [showDetail?._docId, churchId]);

  // ── Dirty-state tracking ──
  const isDetailDirtyNow = useMemo(() => {
    const fields = ['name', 'description', 'status', 'priority', 'dueDate', 'recurrence', 'visibility', 'notes'];
    if (fields.some(f => (detailEdits[f] ?? '') !== (detailSnapshot[f] ?? ''))) return true;
    if (JSON.stringify(detailEdits.tags) !== JSON.stringify(detailSnapshot.tags)) return true;
    if (JSON.stringify(detailEdits.assignees) !== JSON.stringify(detailSnapshot.assignees)) return true;
    if (JSON.stringify(detailEdits.sharedWith) !== JSON.stringify(detailSnapshot.sharedWith)) return true;
    if (JSON.stringify(detailEdits.checklist) !== JSON.stringify(detailSnapshot.checklist)) return true;
    if ((detailEdits.linkedItemDocId ?? null) !== (detailSnapshot.linkedItemDocId ?? null)) return true;
    if ((detailEdits.linkedTicketDocId ?? null) !== (detailSnapshot.linkedTicketDocId ?? null)) return true;
    if ((detailEdits.estimatedHours ?? null) !== (detailSnapshot.estimatedHours ?? null)) return true;
    if ((detailEdits.actualHours ?? null) !== (detailSnapshot.actualHours ?? null)) return true;
    if ((detailEdits.ministry ?? '') !== (detailSnapshot.ministry ?? '')) return true;
    return false;
  }, [detailEdits, detailSnapshot]);

  // Keep isDirtyRef current so async snapshot callbacks can read it without stale closures
  useEffect(() => { isDirtyRef.current = isDetailDirtyNow; }, [isDetailDirtyNow]);

  // Cleanup blob URLs on unmount (M11)
  useEffect(() => () => { photoPreviews.forEach(u => URL.revokeObjectURL(u)); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Prune selectedTaskIds when tasks are deleted remotely (M12)
  useEffect(() => {
    setSelectedTaskIds(prev => new Set([...prev].filter(id => tasksByDocId[id])));
  }, [tasksByDocId]);

  // ── Helpers ──
  function flash(text, isError = false) { setMsg({ text, isError }); setTimeout(() => setMsg(null), 5000); }

  // New tasks start assigned to their creator (tasks only — tickets have no
  // assignee default). Returned fresh each call so callers can't share an array.
  function selfAssignee() { return userId ? [{ uid: userId, name: userName }] : []; }

  async function handleSaveDefaults() {
    setSavingDefaults(true);
    try {
      await updateUser(userId, {
        taskDefaultVisibility: defaultsForm.visibility,
        taskDefaultSharedWith: defaultsForm.sharedWith,
      });
      setTaskDefaults({ ...defaultsForm });
      setShowDefaultsModal(false);
      flash('Task defaults saved.');
    } catch {
      flash('Failed to save defaults.', true);
    } finally {
      setSavingDefaults(false);
    }
  }

  function switchViewMode(mode) {
    setViewMode(mode);
    localStorage.setItem('tasks_viewMode', mode);
    setSelectedTaskIds(new Set());
    setBulkStatus('');
  }

  // Auto-switch to list view on mobile (calendar handles its own mobile layout; only kanban is problematic)
  const preMobileMode = useRef(null);
  useEffect(() => {
    if (isMobile && viewMode === 'kanban') {
      preMobileMode.current = viewMode;
      setViewMode('list');
    } else if (!isMobile && preMobileMode.current && viewMode !== 'calendar') {
      setViewMode(preMobileMode.current);
      preMobileMode.current = null;
    }
  }, [isMobile]); // eslint-disable-line react-hooks/exhaustive-deps

  function taskToEdits(task) {
    return {
      name: task.name || '',
      description: task.description || '',
      status: task.status || 'Backlog',
      priority: task.priority || 'Medium',
      tags: task.tags || [],
      dueDate: task.dueDate || '',
      recurrence: task.recurrence || '',
      assignees: task.assignees || [],
      visibility: task.visibility || 'team',
      sharedWith: task.sharedWith || [],
      notes: task.notes || '',
      checklist: task.checklist || [],
      linkedItemDocId: task.linkedItemDocId || (isMaint ? '' : null),
      linkedTicketDocId: task.linkedTicketDocId || null,
      estimatedHours: task.estimatedHours ?? null,
      actualHours: task.actualHours ?? null,
      ministry: task.ministry || '',
      // Maintenance-only fields
      vendorId: task.vendorId || '',
      estimatedCost: task.estimatedCost != null ? String(task.estimatedCost) : '',
      actualCost: task.actualCost != null ? String(task.actualCost) : '',
    };
  }

  function openDetail(task) {
    const edits = taskToEdits(task);
    setShowDetail(task);
    setDetailEdits(edits);
    setDetailSnapshot(edits);
    setRemoteUpdate(null);
    setNewComment('');
    setDetailChecklistInput('');
  }

  async function closeDetail() {
    if (isDetailDirtyNow) {
      const ok = await confirm({
        title: 'Discard changes?',
        message: 'You have unsaved changes. Close without saving?',
        confirmLabel: 'Discard',
        danger: true,
      });
      if (!ok) return;
    }
    setShowDetail(null);
    setDetailEdits({});
    setDetailSnapshot({});
    setComments([]);
    setNewComment('');
    setDetailChecklistInput('');
  }

  async function uploadPhotos(docId, files) {
    const urls = [];
    let failed = 0;
    for (const file of files) {
      try {
        const resized = await resizeImageForUpload(file);
        const sRef = storageRef(storage, `churches/${churchId}/${isMaint ? 'maintenance' : 'tasks'}/${docId}/${Date.now()}_${file.name}`);
        const snap = await uploadBytes(sRef, resized);
        urls.push(await getDownloadURL(snap.ref));
      } catch (err) {
        console.error('[ChurchOpsHub] task photo upload failed', { fileName: file.name, err });
        failed++;
      }
    }
    return { urls, failed };
  }

  // ── Handlers ──
  async function createNextRecurringTask(source) {
    const sourceRef = doc(db, 'churches', churchId, 'workItems', `${docPrefix}${source._docId}`);
    let shouldCreate = false;
    await runTransaction(db, async (t) => {
      const snap = await t.get(sourceRef);
      if (!snap.exists() || snap.data().nextRecurrenceCreatedAt) return;
      shouldCreate = true;
      t.update(sourceRef, { nextRecurrenceCreatedAt: new Date().toISOString() });
    });
    if (!shouldCreate) return;
    const nextDue = calculateNextDue(source.dueDate, source.recurrence);
    const base = {
      name: source.name,
      description: source.description,
      priority: source.priority,
      tags: source.tags || [],
      dueDate: nextDue,
      recurrence: source.recurrence,
      assignees: source.assignees || [],
      checklist: (source.checklist || []).map(c => ({ ...c, done: false })),
      notes: source.notes || null,
      photos: [],
      completedAt: null,
    };
    const payload = isMaint
      ? { ...base,
          linkedItemDocId: source.linkedItemDocId || null,
          linkedItemId: source.linkedItemId || null,
          linkedItemDescription: source.linkedItemDescription || null,
          vendorId: source.vendorId || null,
          vendorName: source.vendorName || null,
          estimatedCost: source.estimatedCost ?? null,
          actualCost: null }
      : { ...base,
          visibility: source.visibility || 'team',
          sharedWith: source.visibility === 'shared' ? (source.sharedWith || []) : [] };
    try {
      await addItem(payload, userId, userName);
    } catch (err) {
      // Roll back the marker so the user can retry by completing the item again
      await updateDoc(sourceRef, { nextRecurrenceCreatedAt: deleteField() });
      throw err;
    }
  }

  async function handleAddTask() {
    if (!taskForm.name.trim()) return;
    setSaving(true);
    try {
      const base = {
        name: taskForm.name.trim(),
        description: taskForm.description.trim(),
        priority: taskForm.priority,
        status: taskForm.status || 'Backlog',
        tags: taskForm.tags,
        dueDate: taskForm.dueDate || null,
        recurrence: taskForm.recurrence || null,
        assignees: taskForm.assignees,
        checklist: [],
        photos: [],
        notes: taskForm.notes || null,
        completedAt: null,
      };
      let payload;
      if (isMaint) {
        const vendorName = taskForm.vendorId ? (vendors.find(v => v._docId === taskForm.vendorId)?.name || null) : null;
        const linkedItem = activeItems.find(i => i._docId === taskForm.linkedItemDocId);
        payload = { ...base,
          linkedItemDocId: taskForm.linkedItemDocId || null,
          linkedItemId: linkedItem?.itemId || null,
          linkedItemDescription: linkedItem?.description || null,
          vendorId: taskForm.vendorId || null,
          vendorName,
          estimatedCost: taskForm.estimatedCost ? Number(taskForm.estimatedCost) : null,
          actualCost: null };
      } else {
        payload = { ...base,
          visibility: taskForm.visibility || 'private',
          sharedWith: taskForm.visibility === 'shared' ? taskForm.sharedWith : [],
          linkedItemDocId: taskForm.linkedItemDocId || null,
          linkedTicketDocId: taskForm.linkedTicketDocId || null };
      }
      const docId = await addItem(payload, userId, userName);
      if (photoFiles.length > 0 && docId) {
        try {
          const { urls, failed } = await uploadPhotos(docId, photoFiles);
          if (urls.length > 0) await updateItem(docId, { photos: urls });
          if (failed > 0) {
            if (urls.length === 0) flash(`Photo upload failed — ${noun} saved without photos.`, true);
            else flash(`Uploaded ${urls.length} of ${urls.length + failed} photos; ${failed} failed.`, true);
          }
        } catch { flash(`Photo upload failed — ${noun} saved without photos.`, true); }
      }
      if ((isMaint || canOperate) && taskForm.tags.length > 0 && addItemTags) {
        await addItemTags(taskForm.tags);
      }
      setShowAdd(false);
      setTaskForm(getEmptyTask());
      setPhotoFiles([]);
      photoPreviews.forEach(u => URL.revokeObjectURL(u));
      setPhotoPreviews([]);
      flash(`${Noun} created!`);
    } catch {
      flash(`Failed to create ${noun}. Please try again.`, true);
    } finally {
      setSaving(false);
    }
  }

  function openPaste() {
    setPasteText('');
    setPasteProgress(null);
    setShowPaste(true);
  }

  async function handlePasteSubmit(rows) {
    // Sequential to avoid maxTaskNumber transaction contention; cap enforced upstream.
    if (!rows || rows.length === 0) return;
    setPasteSaving(true);
    const total = rows.length;
    let succeeded = 0;
    let failed = 0;
    for (let i = 0; i < total; i++) {
      setPasteProgress({ done: i, total });
      const row = rows[i];
      try {
        await addTask({
          name: row.name.trim(),
          description: row.description || '',
          priority: row.priority || 'Medium',
          status: row.status || 'Backlog',
          tags: [],
          dueDate: row.dueDate || null,
          recurrence: null,
          assignees: row.assignees?.length ? row.assignees : selfAssignee(),
          checklist: [],
          photos: [],
          notes: null,
          visibility: taskDefaults.visibility || 'private',
          sharedWith: taskDefaults.visibility === 'shared' ? taskDefaults.sharedWith : [],
          completedAt: null,
          linkedItemDocId: null,
          linkedTicketDocId: null,
        }, userId, userName);
        succeeded++;
      } catch {
        failed++;
      }
    }
    setPasteProgress({ done: total, total });
    setPasteSaving(false);
    setShowPaste(false);
    setPasteText('');
    setPasteProgress(null);
    if (failed === 0) flash(`Created ${succeeded} task${succeeded !== 1 ? 's' : ''}!`);
    else if (succeeded === 0) flash('Failed to create tasks. Please try again.', true);
    else flash(`Created ${succeeded} of ${total} tasks; ${failed} failed.`, true);
  }

  async function handleUpdateTask() {
    if (!showDetail) return;
    const wasComplete = showDetail.status === 'Complete';
    const isNowComplete = detailEdits.status === 'Complete';
    setSaving(true);
    try {
      const baseUpdates = {
        name: detailEdits.name,
        description: detailEdits.description,
        status: detailEdits.status,
        priority: detailEdits.priority,
        tags: detailEdits.tags || [],
        dueDate: detailEdits.dueDate || null,
        recurrence: detailEdits.recurrence || null,
        assignees: detailEdits.assignees || [],
        notes: detailEdits.notes || null,
        completedAt: isNowComplete && !wasComplete ? new Date().toISOString() : (isNowComplete ? showDetail.completedAt : null),
      };
      let updates;
      if (isMaint) {
        const vendorName = detailEdits.vendorId ? (vendors.find(v => v._docId === detailEdits.vendorId)?.name || null) : null;
        const linkedItem = activeItems.find(i => i._docId === detailEdits.linkedItemDocId);
        updates = { ...baseUpdates,
          vendorId: detailEdits.vendorId || null,
          vendorName,
          linkedItemDocId: detailEdits.linkedItemDocId || null,
          linkedItemId: linkedItem?.itemId || null,
          linkedItemDescription: linkedItem?.description || null,
          estimatedCost: detailEdits.estimatedCost ? Number(detailEdits.estimatedCost) : null,
          actualCost: detailEdits.actualCost ? Number(detailEdits.actualCost) : null };
      } else {
        updates = { ...baseUpdates,
          visibility: detailEdits.visibility,
          sharedWith: detailEdits.visibility === 'shared' ? (detailEdits.sharedWith || []) : [],
          ministry: detailEdits.ministry || '',
          estimatedHours: detailEdits.estimatedHours ?? null,
          actualHours: detailEdits.actualHours ?? null,
          linkedItemDocId: detailEdits.linkedItemDocId || null,
          linkedTicketDocId: detailEdits.linkedTicketDocId || null };
      }
      await updateItem(showDetail._docId, updates, userId, userName, showDetail[numberField]);
      if ((isMaint || canOperate) && detailEdits.tags?.length > 0 && addItemTags) {
        await addItemTags(detailEdits.tags);
      }

      // Email newly added assignees
      const oldAssigneeUids = new Set((showDetail.assignees || []).map(a => a.uid));
      const newlyAdded = (detailEdits.assignees || []).filter(a => a.uid !== userId && !oldAssigneeUids.has(a.uid));
      if (newlyAdded.length > 0 && notificationConfig?.enabled) {
        const fn = httpsCallable(getFunctions(), 'sendTicketAssignedEmail');
        for (const assignee of newlyAdded) {
          const assigneeUser = users.find(u => u.id === assignee.uid);
          if (!assigneeUser?.email) continue;
          fn({ kind: isMaint ? 'maintenance' : 'task', toEmail: assigneeUser.email, toName: assignee.name, churchName: config?.churchName || '', ticketNumber: showDetail[numberField], ticketName: detailEdits.name, assignedBy: userName }).catch(err => { console.error('[ChurchOpsHub] CF sendTicketAssignedEmail failed', err); });
        }
      }
      // In-app + push for newly added assignees (independent of the email toggle)
      if (newlyAdded.length > 0) {
        notify({ churchId, recipientUids: newlyAdded.map(a => a.uid), type: notifyType, title: `${Noun} assigned to you`, body: `${showDetail[numberField]}: ${detailEdits.name || ''} — by ${userName}`, link: { kind: 'hub', hub: hubKey } });
      }

      // Auto-create next recurring item on completion
      if (isNowComplete && !wasComplete && detailEdits.recurrence) {
        await createNextRecurringTask({ ...showDetail, ...updates });
      }

      setShowDetail(null);
      setDetailEdits({});
      setDetailSnapshot({});
      setDetailChecklistInput('');
      flash(isNowComplete && !wasComplete && detailEdits.recurrence ? `${Noun} completed — next recurring ${noun} created!` : `${Noun} updated!`);
    } catch {
      flash(`Failed to update ${noun}. Please try again.`, true);
    } finally {
      setSaving(false);
    }
  }

  async function handlePostComment() {
    if (!newComment.trim() || !showDetail?._docId) return;
    setPostingComment(true);
    try {
      const text = newComment.trim();
      // @-mentions are a tasks-only feature.
      const mentions = isMaint ? [] : taskHubUsers
        .filter(u => u.id !== userId && text.includes('@' + u.name))
        .map(u => u.id);
      await addItemComment(showDetail._docId, text, userId, userName, mentions.length ? mentions : undefined);
      if (mentions.length > 0 && notificationConfig?.enabled) {
        const fn = httpsCallable(getFunctions(), 'sendTaskMentionEmail');
        fn({ churchId, taskNumber: showDetail.taskNumber, taskName: showDetail.name || '', commentText: text, mentionedUids: mentions, commentAuthorName: userName }).catch(err => { console.error('[ChurchOpsHub] CF sendTaskMentionEmail failed', err); });
      }
      if (mentions.length > 0) {
        notify({ churchId, recipientUids: mentions, type: 'task_mention', title: `${userName} mentioned you`, body: `${showDetail.taskNumber}: ${text.slice(0, 120)}`, link: { kind: 'hub', hub: 'tasks' } });
      }
      setNewComment('');
    } catch { flash('Failed to post comment.', true); }
    finally { setPostingComment(false); }
  }

  async function handleEditComment(commentId, text) {
    if (!showDetail?._docId || !text.trim()) return;
    try {
      await updateItemComment(showDetail._docId, commentId, text.trim());
    } catch { flash('Failed to update comment.', true); }
  }

  async function handleDeleteComment(commentId) {
    if (!showDetail?._docId) return;
    if (!await confirm({
      title: 'Delete comment?',
      message: 'Delete this comment? This cannot be undone.',
      confirmLabel: 'Delete',
      danger: true,
    })) return;
    try {
      await deleteItemComment(showDetail._docId, commentId);
    } catch { flash('Failed to delete comment.', true); }
  }

  async function handleDetailPhotoAdd(files) {
    if (!showDetail?._docId) return;
    setUploadingPhotos(true);
    try {
      const { urls: newUrls, failed } = await uploadPhotos(showDetail._docId, files);
      if (newUrls.length > 0) {
        const updatedPhotos = [...(showDetail.photos || []), ...newUrls];
        await updateItem(showDetail._docId, { photos: updatedPhotos });
        setShowDetail(prev => ({ ...prev, photos: updatedPhotos }));
      }
      if (failed > 0) {
        if (newUrls.length === 0) flash('Photo upload failed. Please try again.', true);
        else flash(`Uploaded ${newUrls.length} of ${newUrls.length + failed} photos; ${failed} failed.`, true);
      }
    } catch {
      flash('Photo upload failed. Please try again.', true);
    } finally {
      setUploadingPhotos(false);
    }
  }

  async function handleDetailPhotoRemove(index) {
    if (!showDetail?._docId) return;
    if (!await confirm({
      title: 'Remove photo?',
      message: 'Remove this photo from the task? It will be permanently deleted from storage.',
      confirmLabel: 'Remove',
      danger: true,
    })) return;
    const photoUrl = (showDetail.photos || [])[index];
    const updatedPhotos = (showDetail.photos || []).filter((_, i) => i !== index);
    setUploadingPhotos(true);
    try {
      if (photoUrl) {
        try { await deleteObject(storageRef(storage, photoUrl)); } catch { /* storage object may already be gone */ }
      }
      await updateItem(showDetail._docId, { photos: updatedPhotos });
      setShowDetail(prev => ({ ...prev, photos: updatedPhotos }));
    } catch {
      flash('Failed to remove photo.', true);
    } finally {
      setUploadingPhotos(false);
    }
  }

  function handlePhotoSelect(files) {
    const valid = files.filter(f => f.size <= 5 * 1024 * 1024);
    if (valid.length < files.length) flash('One or more photos exceed 5 MB and were skipped.', true);
    if (!valid.length) return;
    setPhotoFiles(prev => [...prev, ...valid]);
    setPhotoPreviews(prev => [...prev, ...valid.map(f => URL.createObjectURL(f))]);
  }

  function handlePreviewRemove(index) {
    URL.revokeObjectURL(photoPreviews[index]);
    setPhotoFiles(prev => prev.filter((_, i) => i !== index));
    setPhotoPreviews(prev => prev.filter((_, i) => i !== index));
  }

  async function handleDrop(docId, newStatus) {
    const task = visibleTasks.find(t => t._docId === docId);
    if (!task || task.status === newStatus) return;
    if (newStatus === 'Complete' || newStatus === 'Cancelled') {
      const extra = newStatus === 'Complete' && task.recurrence ? ' A new recurring task will be created.' : '';
      const ok = await confirm({
        title: `Move to ${newStatus}?`,
        message: <>Move <strong>{task.name}</strong> to {newStatus}.{extra}</>,
        confirmLabel: newStatus,
        danger: newStatus === 'Cancelled',
      });
      if (!ok) return;
    }
    const wasComplete = task.status === 'Complete';
    const isNowComplete = newStatus === 'Complete';
    await updateItem(docId, {
      status: newStatus,
      completedAt: isNowComplete && !wasComplete ? new Date().toISOString() : (isNowComplete ? task.completedAt : null),
    }, userId, userName, task[numberField]);
    if (isNowComplete && !wasComplete && task.recurrence) {
      await createNextRecurringTask(task);
      flash(`${Noun} completed — next recurring ${noun} created!`);
    }
  }

  async function handleChecklistUpdate(cl, prevCl) {
    try {
      await updateItem(showDetail._docId, { checklist: cl });
      setDetailSnapshot(s => ({ ...s, checklist: cl }));
      setRemoteUpdate(null); // suppress transient conflict banner from our own write
    } catch {
      flash('Checklist save failed — please try again.', true);
      if (prevCl !== undefined) {
        setDetailEdits(d => ({ ...d, checklist: prevCl }));
        setShowDetail(prev => ({ ...prev, checklist: prevCl }));
      }
    }
  }

  async function handleDeleteTask() {
    if (!showDetail?._docId) return;
    const ok = await confirm({
      title: `Delete ${noun}?`,
      message: <>Permanently delete <strong>{showDetail.name}</strong>. This cannot be undone.</>,
      confirmLabel: 'Delete',
      danger: true,
    });
    if (!ok) return;
    setSaving(true);
    try {
      await deleteItem(showDetail._docId, showDetail, userId, userName);
      setShowDetail(null);
      setDetailEdits({});
      flash(`${Noun} deleted.`);
    } catch {
      flash(`Failed to delete ${noun}.`, true);
    } finally {
      setSaving(false);
    }
  }

  function toggleSelectTask(docId) {
    setSelectedTaskIds(prev => {
      const next = new Set(prev);
      if (next.has(docId)) next.delete(docId); else next.add(docId);
      return next;
    });
  }

  function selectAllVisible() {
    setSelectedTaskIds(new Set(sortedTasks.map(t => t._docId)));
  }

  function clearSelection() { setSelectedTaskIds(new Set()); setBulkStatus(''); setBulkAssigneeId(''); }

  async function handleBulkStatusChange() {
    if (!bulkStatus || selectedTaskIds.size === 0) return;
    const tasksToUpdate = [...selectedTaskIds].map(docId => tasksByDocId[docId]).filter(Boolean);
    setBulkSaving(true);
    try {
      const results = await Promise.allSettled(tasksToUpdate.map(task =>
        updateTask(task._docId, {
          status: bulkStatus,
          completedAt: bulkStatus === 'Complete' && task.status !== 'Complete' ? new Date().toISOString() : (bulkStatus === 'Complete' ? task.completedAt : null),
        }, userId, userName, task.taskNumber)
      ));
      const succeeded = results.filter(r => r.status === 'fulfilled').length;
      const failed = results.length - succeeded;
      let recurFailed = 0;
      if (bulkStatus === 'Complete') {
        const recurResults = await Promise.allSettled(
          tasksToUpdate.filter(t => t.recurrence && t.status !== 'Complete').map(t => createNextRecurringTask(t))
        );
        recurFailed = recurResults.filter(r => r.status === 'rejected').length;
      }
      if (failed > 0) {
        flash(`${succeeded} of ${results.length} tasks updated; ${failed} failed.`, true);
      } else if (recurFailed > 0) {
        flash(`${selectedTaskIds.size} tasks moved to ${bulkStatus}; ${recurFailed} recurring next-task creation${recurFailed !== 1 ? 's' : ''} failed.`, true);
      } else {
        flash(`${selectedTaskIds.size} task${selectedTaskIds.size !== 1 ? 's' : ''} moved to ${bulkStatus}.`);
      }
      clearSelection();
    } catch { flash('Bulk update failed.', true); }
    setBulkSaving(false);
  }

  async function handleBulkAssign() {
    if (!bulkAssigneeId || selectedTaskIds.size === 0) return;
    const assigneeUser = taskHubUsers.find(u => u.id === bulkAssigneeId);
    if (!assigneeUser) return;
    setBulkSaving(true);
    try {
      const results = await Promise.allSettled([...selectedTaskIds].map(docId => {
        const task = tasksByDocId[docId];
        if (!task) return Promise.resolve();
        const existing = task.assignees || [];
        if (existing.some(a => a.uid === bulkAssigneeId)) return Promise.resolve();
        return updateTask(docId, { assignees: [...existing, { uid: bulkAssigneeId, name: assigneeUser.name }] }, userId, userName, task.taskNumber);
      }));
      const succeeded = results.filter(r => r.status === 'fulfilled').length;
      flash(`Assigned ${assigneeUser.name} to ${succeeded} task${succeeded !== 1 ? 's' : ''}.`);
      clearSelection();
    } catch { flash('Bulk assign failed.', true); }
    setBulkSaving(false);
  }

  async function handleBulkDelete() {
    if (selectedTaskIds.size === 0) return;
    if (!await confirm({
      title: 'Bulk delete tasks?',
      message: `Permanently delete ${selectedTaskIds.size} task${selectedTaskIds.size !== 1 ? 's' : ''}. This cannot be undone.`,
      confirmLabel: 'Delete',
      danger: true,
    })) return;
    setBulkSaving(true);
    try {
      const results = await Promise.allSettled([...selectedTaskIds].map(docId => {
        const task = tasksByDocId[docId];
        return deleteTask(docId, task, userId, userName);
      }));
      const succeeded = results.filter(r => r.status === 'fulfilled').length;
      const failed = results.length - succeeded;
      if (failed > 0) {
        flash(`${succeeded} of ${selectedTaskIds.size} tasks deleted; ${failed} failed.`, true);
      } else {
        flash(`${selectedTaskIds.size} task${selectedTaskIds.size !== 1 ? 's' : ''} deleted.`);
      }
      clearSelection();
    } catch { flash('Bulk delete failed.', true); }
    setBulkSaving(false);
  }

  async function handleReorder(fromDocId, toDocId, status) {
    const columnTasks = tasksByStatus[status];
    const fromIdx = columnTasks.findIndex(t => t._docId === fromDocId);
    const toIdx = columnTasks.findIndex(t => t._docId === toDocId);
    if (fromIdx === -1 || toIdx === -1 || fromIdx === toIdx) return;
    const reordered = [...columnTasks];
    const [moved] = reordered.splice(fromIdx, 1);
    reordered.splice(toIdx, 0, moved);
    const results = await Promise.allSettled(reordered.map((t, i) =>
      updateDoc(doc(db, 'churches', churchId, 'workItems', `task_${t._docId}`), { sortOrder: i })
    ));
    const failed = results.filter(r => r.status === 'rejected').length;
    if (failed > 0) flash(`Failed to reorder ${failed} of ${reordered.length} tasks — refresh to see correct order.`, true);
  }

  async function handleQuickAddTask(name, status) {
    if (!name.trim()) return;
    try {
      await addTask({
        name: name.trim(),
        description: '',
        priority: 'Medium',
        status,
        tags: [],
        dueDate: null,
        recurrence: null,
        assignees: selfAssignee(),
        checklist: [],
        photos: [],
        notes: null,
        visibility: taskDefaults.visibility || 'private',
        sharedWith: taskDefaults.visibility === 'shared' ? (taskDefaults.sharedWith || []) : [],
        completedAt: null,
        linkedItemDocId: null,
        linkedTicketDocId: null,
      }, userId, userName);
    } catch { flash('Failed to add task.', true); }
  }

  function handleOpenSaveTemplate() {
    if (!showDetail) return;
    setSaveTemplateForm({
      name: showDetail.name || '',
      autoGenerate: false,
      autoGenerateFrequency: 'weekly',
      autoGenerateNextAt: localDateStr(new Date()),
    });
    setShowSaveTemplate(true);
  }

  async function handleSaveTemplateSubmit() {
    if (!saveTemplateForm.name.trim()) return;
    try {
      const templateData = {
        name: saveTemplateForm.name.trim(),
        description: detailEdits.description ?? showDetail?.description ?? '',
        priority: detailEdits.priority ?? showDetail?.priority ?? 'Medium',
        tags: detailEdits.tags ?? showDetail?.tags ?? [],
        recurrence: detailEdits.recurrence ?? showDetail?.recurrence ?? '',
        notes: detailEdits.notes ?? showDetail?.notes ?? '',
        checklist: (detailEdits.checklist ?? showDetail?.checklist ?? []).map(i => ({ ...i, done: false })),
        visibility: detailEdits.visibility ?? showDetail?.visibility ?? 'team',
        assignees: detailEdits.assignees ?? showDetail?.assignees ?? [],
        ministry: detailEdits.ministry ?? showDetail?.ministry ?? '',
      };
      if (saveTemplateForm.autoGenerate) {
        templateData.autoGenerate = true;
        templateData.autoGenerateFrequency = saveTemplateForm.autoGenerateFrequency;
        templateData.autoGenerateNextAt = saveTemplateForm.autoGenerateNextAt || localDateStr(new Date());
      }
      await addTaskTemplate(templateData, userId, userName);
      setShowSaveTemplate(false);
      flash('Template saved!');
    } catch { flash('Failed to save template.', true); }
  }

  function applyTemplate(template) {
    setTaskForm(f => ({
      ...f,
      name: template.name,
      description: template.description || '',
      priority: template.priority || 'Medium',
      tags: template.tags || [],
      recurrence: template.recurrence || '',
      notes: template.notes || '',
      checklist: (template.checklist || []).map(i => ({ ...i, done: false })),
    }));
    setShowTemplates(false);
  }

  function toggleCollapse(status) {
    setCollapsedStatuses(prev => {
      const next = new Set(prev);
      if (next.has(status)) next.delete(status);
      else next.add(status);
      return next;
    });
  }

  // ── Stats ──
  const { openCount, inProgressCount, completedThisMonth, overdueCount } = useMemo(() => {
    const now = new Date();
    const thisMonthStart = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-01`;
    const todayStr = localDateStr(now);
    return visibleTasks.reduce((acc, t) => {
      const active = t.status !== 'Complete' && t.status !== 'Cancelled';
      if (active) acc.openCount++;
      if (t.status === 'In Progress') acc.inProgressCount++;
      if (t.status === 'Complete' && (t.completedAt || '').slice(0, 10) >= thisMonthStart) acc.completedThisMonth++;
      if (t.dueDate && t.dueDate < todayStr && active) acc.overdueCount++;
      return acc;
    }, { openCount: 0, inProgressCount: 0, completedThisMonth: 0, overdueCount: 0 });
  }, [visibleTasks]);

  // ── COH-007 — historical Insights (A4, A19, A20) ────────────────────────
  //
  // From the reader gate on, a completed task leaves the active listeners after
  // 42 days while the 12-week chart spans 84 and the Avg/Week tile spans 90.
  // Both would undercount silently, by a growing amount. So Insights loads the
  // authorized archive for its own window and computes from a SEPARATE array.
  //
  // Separate is the whole point (review H3). `visibleTasks` also feeds
  // tasksByDocId, the filters, Kanban and list rendering, selection, bulk
  // actions, detail editing and linked-task behaviour — archived rows joined
  // there would reappear on the operational board carrying affordances the
  // rules reject.
  const insightWindowStart = () => {
    const d = new Date(); d.setDate(d.getDate() - 90);
    // The tile compares whole DATES, so the query floor is the START of the
    // boundary date. Bounding at the exact instant 90 days ago would drop
    // completions earlier that same day — undercounting the very metric this
    // exists to fix (A19).
    return `${localDateStr(d)}T00:00:00.000Z`;
  };
  const [insightArchive, setInsightArchive] = useState(null);
  const [insightLoading, setInsightLoading] = useState(false);
  const [insightReloadKey, setInsightReloadKey] = useState(0);
  // The earliest date either advertised figure looks at. The 90-day tile always
  // reaches further back than the 12-week chart (84 days plus at most 6 to the
  // week boundary), but both are computed rather than assumed — the point of
  // this floor is that it must never be later than a metric's own boundary.
  const historyBoundaryDate = () => {
    const d90 = new Date(); d90.setDate(d90.getDate() - 90);
    const now = new Date();
    const chartStart = new Date(now);
    chartStart.setDate(now.getDate() - now.getDay() - 77);
    const a = localDateStr(d90), b = localDateStr(chartStart);
    return a < b ? a : b;
  };

  // The active half of the join is LIVE and keeps moving WHILE the archive reads
  // are in flight, not only after they settle. The coordinator opens its
  // baseline before the first read and keeps absorbing observations until
  // settlement; this ref feeds it each new active set.
  const historyLoadRef = useRef(null);
  const visibleTasksRef = useRef([]);
  useEffect(() => {
    visibleTasksRef.current = visibleTasks;
    historyLoadRef.current?.observeActive(visibleTasks);
  }, [visibleTasks]);
  useEffect(() => {
    if (isMaint || !canOperate || viewMode !== 'insights' || !loadArchivedTasks) return undefined;
    let cancelled = false;
    setInsightLoading(true);
    const load = createInsightHistoryLoad({
      activeTasks: visibleTasksRef.current,
      boundaryDate: historyBoundaryDate(),
    });
    historyLoadRef.current = load;
    loadArchivedTasks({ since: insightWindowStart() }).then(result => {
      historyLoadRef.current = null;
      if (!cancelled) {
        setInsightArchive(load.settle(result));
        setInsightLoading(false);
      }
    });
    return () => { cancelled = true; historyLoadRef.current = null; };
  }, [viewMode, isMaint, canOperate, loadArchivedTasks, insightReloadKey]);

  // The forward race A20 names, and the one `mergeInsightTasks` cannot fix
  // (review H2). Live-wins closes the REOPEN direction: a task that comes back
  // after the read is in both sets and the live copy wins. It cannot close the
  // ARCHIVE direction — a task archived during or after the read is dropped by
  // the live listeners and is not in the frozen archive result, so it falls out
  // of the join entirely while the label still claims a complete history. The
  // figures then describe neither instant. Only noticing it can repair that.
  const insightStale = useMemo(() => insightHistoryStale({
    activeIdsAtLoad: insightArchive?.activeIdsAtLoad,
    activeTasks: visibleTasks,
    archivedTasks: insightArchive?.items,
  }), [visibleTasks, insightArchive]);

  // Live active data always wins a collision (A20): a task reopened after the
  // one-shot archive read settled is in both sets, and the frozen archived copy
  // would keep counting a completion that has since been undone.
  const insightTasks = useMemo(
    () => mergeInsightTasks(visibleTasks, insightArchive?.items || []),
    [visibleTasks, insightArchive]
  );

  // ── Task velocity (Insights view) ──
  const velocityData = useMemo(() => {
    if (!canOperate) return [];
    const now = new Date();
    return Array.from({ length: 12 }, (_, i) => {
      const weekStart = new Date(now);
      weekStart.setDate(now.getDate() - now.getDay() - (11 - i) * 7);
      const weekEnd = new Date(weekStart);
      weekEnd.setDate(weekStart.getDate() + 6);
      const startStr = localDateStr(weekStart);
      const endStr = localDateStr(weekEnd);
      const completed = insightTasks.filter(t => t.completedAt && t.completedAt.slice(0,10) >= startStr && t.completedAt.slice(0,10) <= endStr).length;
      const created = insightTasks.filter(t => t.createdAt && t.createdAt.slice(0,10) >= startStr && t.createdAt.slice(0,10) <= endStr).length;
      return { week: weekStart.toLocaleDateString('en-US', { month:'short', day:'numeric' }), completed, created };
    });
  }, [insightTasks, canOperate]);

  // ── Cross-hub: Convert task to job ──
  function openConvertToJob() {
    if (!showDetail) return;
    setConvertJobForm({
      title: showDetail.name || '',
      scheduledDate: showDetail.dueDate || '',
      location: '',
      spotsTotal: 1,
    });
    setShowConvertToJobModal(true);
  }

  async function handleConvertToJob() {
    if (!showDetail || !convertJobForm.title.trim()) return;
    setConvertJobSaving(true);
    let jobDocId = null;
    try {
      jobDocId = await addJobListing({
        ...convertJobForm,
        spotsTotal: Math.max(1, parseInt(convertJobForm.spotsTotal) || 1),
        pay: null,
        status: 'open',
        description: showDetail.description || '',
        linkedTaskDocId: showDetail._docId,
      }, userId, userName);
      try {
        await updateTask(showDetail._docId, { linkedJobDocId: jobDocId }, userId, userName, showDetail.taskNumber);
      } catch (linkErr) {
        // Backref failed — roll back the orphan job so we don't leave dangling state.
        try {
          await deleteJobListing(jobDocId, userId, userName, convertJobForm.title);
          flash('Failed to link the new job — rolled back.', true);
        } catch {
          flash(`Failed to link the new job. Orphaned job ${jobDocId.slice(0,8)}… needs manual cleanup.`, true);
        }
        throw linkErr;
      }
      setShowDetail(prev => ({ ...prev, linkedJobDocId: jobDocId }));
      setShowConvertToJobModal(false);
      flash('Job created and linked to this task.');
    } catch {
      if (!jobDocId) flash('Failed to create job.', true);
    }
    setConvertJobSaving(false);
  }

  // (The task→maintenance convert feature was removed with the Work board
  // merge: tasks and maintenance share one collection, so "make this a ticket"
  // is now just a type flip rather than a linked spawn. See merge plan §4.)

  // ── Maintenance-only: vendor directory CRUD ──
  async function handleAddVendor() {
    if (!vendorForm.name.trim()) return;
    setSaving(true);
    await addVendor({ ...vendorForm });
    setShowAddVendor(false);
    setVendorForm(getEmptyVendor());
    setSaving(false);
    flash('Vendor added!');
  }

  async function handleUpdateVendor() {
    if (!showEditVendor || !vendorForm.name.trim()) return;
    setSaving(true);
    const { _docId, createdAt: _createdAt, ...rest } = showEditVendor;
    await updateVendor(_docId, { ...rest, ...vendorForm });
    setShowEditVendor(null);
    setVendorForm(getEmptyVendor());
    setSaving(false);
    flash('Vendor updated!');
  }

  async function handleDeleteVendor(vendor) {
    const ok = await confirm({
      title: 'Delete vendor?',
      message: <>Delete <strong>{vendor.name}</strong>. Existing tickets that reference this vendor keep their stored name.</>,
      confirmLabel: 'Delete',
      danger: true,
    });
    if (!ok) return;
    await deleteVendor(vendor._docId);
    flash('Vendor deleted.');
  }

  // ── Maintenance-only: schedule a contractor against this ticket ──
  // Creates a linked, scheduled timeEntry (People Access → Timesheet). When the
  // hours are later logged there, the cost rolls back into actualCost.
  const contractors = (accessPeople || []).filter(p => p.active !== false && p.personType === 'contractor');
  function openContractorModal() {
    setContractorForm({ personId: contractors[0]?._docId || '', date: detailEdits.dueDate || localDateStr(new Date()), hours: '' });
    setContractorModal(true);
  }
  async function handleScheduleContractor() {
    const person = contractors.find(p => p._docId === contractorForm.personId);
    if (!person || !showDetail) return;
    const hrs = Number(contractorForm.hours);
    await addTimeEntry({
      personId: person._docId,
      personName: person.name || '',
      date: contractorForm.date,
      estHours: hrs > 0 ? hrs : null,
      hours: 0,
      cost: 0,
      description: `${showDetail[numberField] || ''}: ${showDetail.name || ''}`.trim().replace(/^:\s*/, ''),
      ministry: person.ministries?.[0] || null,
      rate: person.hourlyRate != null ? Number(person.hourlyRate) : null,
      status: 'scheduled',
      linkedTicketId: showDetail._docId,
      createdBy: userProfile.uid,
    });
    setContractorModal(false);
    flash('Contractor scheduled — see it in People Access → Timesheet.');
  }

  // ── Saved filter views ──
  const savedFilters = useMemo(() => {
    const u = (users || []).find(u => u.id === userId);
    return u?.taskSavedFilters || [];
  }, [users, userId]);

  function handleSaveView() {
    const name = window.prompt('Save this filter view as:');
    if (!name?.trim()) return;
    const view = { name: name.trim(), search: filterSearch, priority: filterPriority, status: filterStatus, assignee: filterAssignee, myTasks: filterMyTasks, ministry: filterMinistry };
    const current = (users || []).find(u => u.id === userId)?.taskSavedFilters || [];
    updateUser(userId, { taskSavedFilters: [...current, view] }).catch(() => flash('Failed to save view.', true));
  }

  function handleDeleteSavedView(index) {
    const current = (users || []).find(u => u.id === userId)?.taskSavedFilters || [];
    updateUser(userId, { taskSavedFilters: current.filter((_, i) => i !== index) }).catch(() => flash('Failed to delete view.', true));
  }

  function handleLoadSavedView(view) {
    setFilterSearch(view.search || '');
    setFilterPriority(view.priority || '');
    setFilterStatus(view.status || '');
    setFilterAssignee(view.assignee || '');
    setFilterMyTasks(!!view.myTasks);
    setFilterMinistry(view.ministry || '');
  }

  // ── Filtered tasks ──
  const filteredTasks = useMemo(() => {
    const search = filterSearch.trim().toLowerCase();
    return visibleTasks.filter(t => {
      if (filterPriority && t.priority !== filterPriority) return false;
      if (filterStatus && t.status !== filterStatus) return false;
      if (filterMyTasks && !t.assignees?.some(a => a.uid === userId)) return false;
      if (filterAssignee && !t.assignees?.some(a => a.uid === filterAssignee)) return false;
      if (filterMinistry && t.ministry !== filterMinistry) return false;
      if (search && !t.name?.toLowerCase().includes(search) && !t.description?.toLowerCase().includes(search) && !t.tags?.some(tag => tag.includes(search)) && !(t.taskNumber || t.ticketNumber)?.toLowerCase().includes(search)) return false;
      return true;
    });
  }, [visibleTasks, filterSearch, filterPriority, filterStatus, filterMyTasks, filterAssignee, filterMinistry, userId]);

  const sortedTasks = useMemo(() => {
    const sorted = [...filteredTasks];
    if (sortBy === 'priority') {
      const order = { High:0, Medium:1, Low:2 };
      sorted.sort((a, b) => (order[a.priority] ?? 1) - (order[b.priority] ?? 1));
    } else if (sortBy === 'dueDate') {
      sorted.sort((a, b) => {
        if (!a.dueDate && !b.dueDate) return 0;
        if (!a.dueDate) return 1;
        if (!b.dueDate) return -1;
        return a.dueDate.localeCompare(b.dueDate);
      });
    } else if (sortBy === 'createdAsc') {
      sorted.sort((a, b) => (a.createdAt || '').localeCompare(b.createdAt || ''));
    }
    return sorted;
  }, [filteredTasks, sortBy]);

  // Pre-computed per-status task lists — avoids 6 filter passes per render in Kanban/list.
  // High priority is always pinned to the top of each column regardless of the user's sort choice.
  const tasksByStatus = useMemo(() => {
    const map = {};
    STATUSES.forEach(s => { map[s] = []; });
    sortedTasks.forEach(t => { if (map[t.status]) map[t.status].push(t); });
    STATUSES.forEach(s => {
      map[s].sort((a, b) => {
        const aHasOrder = a.sortOrder != null;
        const bHasOrder = b.sortOrder != null;
        if (aHasOrder && bHasOrder) return a.sortOrder - b.sortOrder;
        if (aHasOrder) return -1;
        if (bHasOrder) return 1;
        return (a.priority === 'High' ? 0 : 1) - (b.priority === 'High' ? 0 : 1);
      });
    });
    return map;
  }, [sortedTasks]);

  // Whether current user can edit visibility on the detail task
  const canEditVisibility = showDetail && (showDetail.createdBy === userId || canOperate);

  // ── Render ──
  return (
    <div>
      {/* COH-006 gate 3: a work-item listener failed terminally, so this board is
          missing whatever that query alone delivers. Say so rather than letting an
          incomplete list read as the complete one — on a visibility feature, a
          silently short list is indistinguishable from "nothing is shared with
          you". */}
      {store.workItemsError && (
        <div role="alert" style={{ background:'#FEF3C7', border:'1px solid #F59E0B', borderRadius:8, padding:'10px 14px', marginBottom:16, fontFamily:f2, fontSize:13, color:'#7C2D12' }}>
          <strong>This board is not showing your {isMaint ? 'maintenance items' : 'tasks'}.</strong>{' '}
          Part of the data could not be loaded
          ({store.workItemsError.sources.join(', ')}
          {store.workItemsError.code ? `: ${store.workItemsError.code}` : ''}), so
          the list is hidden rather than shown incomplete — a short list here
          would look exactly like having nothing. Reload the page; if it keeps
          happening, tell your administrator.
        </div>
      )}
      {/* Header */}
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:20, flexWrap:'wrap', gap:12 }}>
        <div>
          <h2 style={{ fontFamily:f1, fontSize:22, fontWeight:700, color:B.navy, margin:'0 0 2px' }}>{isMaint ? 'Maintenance Hub' : 'Tasks Hub'}</h2>
          <p style={{ color:B.textLight, fontSize:13, margin:0 }}>{isMaint ? `Track repair tickets${canOperate ? ' and manage service vendors' : ''}` : 'Track and manage church admin tasks'}</p>
        </div>
        <div style={{ display:'flex', gap:8, flexWrap:'wrap' }}>
          {isMaint && canOperate && (
            <button onClick={() => setShowVendors(v => !v)} style={{ ...btnS, fontSize:13, padding:'9px 18px' }}>
              {showVendors ? 'Hide Vendors' : `Vendors (${vendors.length})`}
            </button>
          )}
          {!isMaint && (
            <button onClick={openPaste} style={btnS} title="Bulk-create tasks from a pasted list (one per line, or tab-separated columns)">
              Paste Tasks
            </button>
          )}
          {canCreate && (
            <button onClick={() => { setTaskForm(isMaint ? getEmptyTask() : { ...getEmptyTask(), visibility: taskDefaults.visibility, sharedWith: [...taskDefaults.sharedWith], assignees: selfAssignee() }); setPhotoFiles([]); setPhotoPreviews([]); setShowAdd(true); }} style={btnP}>
              + New {Noun}
            </button>
          )}
        </div>
      </div>

      {/* Vendor Directory (maintenance) */}
      {isMaint && showVendors && (
        <div style={{ background:B.white, borderRadius:14, padding:'20px 24px', border:'1px solid '+B.sand, marginBottom:20, boxShadow:'0 1px 3px rgba(27,42,74,0.06)' }}>
          <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:14 }}>
            <h3 style={{ margin:0, fontFamily:f1, fontSize:16, fontWeight:700, color:B.navy }}>Vendor Directory</h3>
            {canOperate && <button onClick={() => { setVendorForm(getEmptyVendor()); setShowAddVendor(true); }} style={{ ...btnP, padding:'6px 14px', fontSize:12 }}>+ Add Vendor</button>}
          </div>
          {vendors.length === 0
            ? <p style={{ color:B.textLight, fontSize:14 }}>No vendors yet. Add your service providers and contractors.</p>
            : (
              <div style={{ display:'grid', gridTemplateColumns:isMobile ? '1fr' : 'repeat(auto-fill, minmax(260px, 1fr))', gap:10 }}>
                {vendors.map(v => (
                  <div key={v._docId} style={{ padding:'14px 16px', borderRadius:10, background:B.warmGray, border:'1px solid '+B.sand }}>
                    <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:4 }}>
                      <div style={{ fontWeight:600, fontSize:14, color:B.navy }}>{v.name}</div>
                      {canOperate && <div style={{ display:'flex', gap:6, flexShrink:0, marginLeft:8 }}>
                        <button onClick={() => { setVendorForm({ name:v.name||'', phone:formatPhone(v.phone||''), email:v.email||'', specialty:v.specialty||'', notes:v.notes||'' }); setShowEditVendor(v); }} style={{ border:'none', background:'none', cursor:'pointer', fontSize:13, color:B.textLight, padding:'2px 4px' }} title="Edit">✏️</button>
                        <button onClick={() => handleDeleteVendor(v)} style={{ border:'none', background:'none', cursor:'pointer', fontSize:13, color:B.textLight, padding:'2px 4px' }} title="Delete">🗑️</button>
                      </div>}
                    </div>
                    {v.specialty && <div style={{ fontSize:12, color:B.teal, fontFamily:f1, marginBottom:4 }}>{v.specialty}</div>}
                    {v.phone && <div style={{ fontSize:12, color:B.textMid }}><EmojiIcon emoji="📞" label="Phone" /> <a href={`tel:${v.phone.replace(/[^0-9+]/g, '')}`} style={{ color:B.teal, textDecoration:'none' }}>{formatPhone(v.phone)}</a></div>}
                    {v.email && <div style={{ fontSize:12, color:B.textMid }}><EmojiIcon emoji="✉️" label="Email" /> <a href={`mailto:${v.email}`} style={{ color:B.teal, textDecoration:'none' }}>{v.email}</a></div>}
                    {v.notes && <div style={{ fontSize:11, color:B.textLight, marginTop:4 }}>{v.notes}</div>}
                  </div>
                ))}
              </div>
            )
          }
        </div>
      )}

      {/* Stats — active board only; the archive view carries its own count */}
      {!isArchiveView && <div style={{ display:'flex', flexWrap:'wrap', gap:10, marginBottom:20 }}>
        {[
          { label:'Open', value:openCount, icon:'📋', color:B.textMid },
          { label:'In Progress', value:inProgressCount, icon:'🔵', color:'#1A65C7' },
          { label:'Completed This Month', value:completedThisMonth, icon:'✅', color:B.teal },
          { label:'Overdue', value:overdueCount, icon:'⚠️', color:overdueCount > 0 ? B.red : B.textMid },
        ].map(s => (
          <div key={s.label} style={{ background:B.white, borderRadius:10, padding:'10px 16px', border:'1px solid '+B.sand, display:'flex', alignItems:'center', gap:10 }}>
            <span aria-hidden="true" style={{ fontSize:15 }}>{s.icon}</span>
            <span style={{ fontSize:20, fontWeight:700, color:s.color, fontFamily:f1 }}>{s.value}</span>
            <span style={{ fontSize:11, color:B.textLight, fontWeight:600, textTransform:'uppercase', letterSpacing:0.8, fontFamily:f1 }}>{s.label}</span>
          </div>
        ))}
      </div>}

      {msg && (
        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', background:msg.isError ? B.redPale : B.tealPale, border:'1px solid '+(msg.isError ? '#FECACA' : B.teal), borderRadius:10, padding:'10px 16px', marginBottom:16, color:msg.isError ? B.red : B.teal, fontWeight:600, fontSize:13, fontFamily:f1 }}><span>{msg.text}</span><button onClick={()=>setMsg(null)} style={{ border:'none', background:'none', cursor:'pointer', color:'inherit', fontSize:16, lineHeight:1, marginLeft:8, padding:'0 2px', fontWeight:700 }}>&times;</button></div>
      )}

      {/* Filter Bar — active board only. The archive has its own search, and
          sharing this one would imply the saved views and assignee filters apply
          to it. */}
      {!isArchiveView && <div style={{ display:'flex', gap:8, marginBottom:12, flexWrap:'wrap', alignItems:'center' }}>
        <input
          style={{ ...inp, flex:1, minWidth:160, maxWidth:280 }}
          placeholder={`Search ${noun}s...`}
          value={filterSearch}
          onChange={e => setFilterSearch(e.target.value)}
        />
        <select style={{ ...inp, width:'auto', cursor:'pointer' }} value={filterPriority} onChange={e => setFilterPriority(e.target.value)}>
          <option value="">All priorities</option>
          {PRIORITIES.map(p => <option key={p} value={p}>{p}</option>)}
        </select>
        <select style={{ ...inp, width:'auto', cursor:'pointer' }} value={filterStatus} onChange={e => setFilterStatus(e.target.value)}>
          <option value="">All statuses</option>
          {STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
        </select>
        <select style={{ ...inp, width:'auto', cursor:'pointer' }} value={filterAssignee} onChange={e => setFilterAssignee(e.target.value)}>
          <option value="">All assignees</option>
          {filterableAssignees.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
        </select>
        <button
          type="button"
          onClick={() => setFilterMyTasks(v => !v)}
          style={{ padding:'9px 14px', borderRadius:10, border:'1px solid '+(filterMyTasks ? B.teal : B.sand), background:filterMyTasks ? B.tealPale : B.white, color:filterMyTasks ? B.teal : B.textMid, fontSize:13, fontFamily:f1, cursor:'pointer', fontWeight:filterMyTasks ? 700 : 500, whiteSpace:'nowrap' }}
        >
          My {noun}s
        </button>
        {!isMaint && (settings?.ministries || []).length > 0 && (
          <select style={{ ...inp, width:'auto', cursor:'pointer' }} value={filterMinistry} onChange={e => setFilterMinistry(e.target.value)}>
            <option value="">All ministries</option>
            {(settings.ministries || []).map(m => <option key={m} value={m}>{m}</option>)}
          </select>
        )}
        {(filterSearch || filterPriority || filterStatus || filterAssignee || filterMyTasks || filterMinistry) && (
          <>
            <button type="button" onClick={() => { setFilterSearch(''); setFilterPriority(''); setFilterStatus(''); setFilterAssignee(''); setFilterMyTasks(false); setFilterMinistry(''); }} style={{ padding:'9px 12px', borderRadius:10, border:'1px solid '+B.sand, background:B.white, color:B.textMid, fontSize:13, cursor:'pointer' }}>Clear</button>
            {!isMaint && <button type="button" onClick={handleSaveView} title="Save current filters as a named view" style={{ padding:'9px 12px', borderRadius:10, border:'1px solid '+B.sand, background:B.white, color:B.teal, fontSize:13, cursor:'pointer' }}>Save View</button>}
          </>
        )}
      </div>}
      {!isMaint && !isArchiveView && savedFilters.length > 0 && (
        <div style={{ display:'flex', gap:6, flexWrap:'wrap', marginBottom:8 }}>
          {savedFilters.map((v, i) => (
            <span key={i} style={{ display:'inline-flex', alignItems:'center', gap:4, padding:'4px 12px', borderRadius:20, background:B.tealPale, border:'1px solid '+B.tealLight, fontSize:12, fontFamily:f1, color:B.teal }}>
              <button type="button" onClick={() => handleLoadSavedView(v)} style={{ background:'none', border:'none', cursor:'pointer', color:B.teal, fontSize:12, fontFamily:f1, fontWeight:600, padding:0 }}>{v.name}</button>
              <button type="button" onClick={() => handleDeleteSavedView(i)} aria-label={`Delete saved view ${v.name}`} style={{ background:'none', border:'none', cursor:'pointer', color:B.teal, fontSize:14, lineHeight:1, padding:'0 0 0 2px' }}>×</button>
            </span>
          ))}
        </div>
      )}

      {/* View Toggle + Sort */}
      <div style={{ display:'flex', gap:8, marginBottom:18, alignItems:'center', flexWrap:'wrap' }}>
        <div style={{ display:'flex', background:B.warmGray, borderRadius:10, padding:3 }}>
          {[['kanban', 'Kanban'], ['list', 'List'], ['calendar', 'Calendar'], ...(!isMaint && canOperate ? [['insights', 'Insights']] : []), ...(!isMaint ? [['archive', 'Archived']] : [])].map(([mode, label]) => (
            <button key={mode} onClick={() => switchViewMode(mode)} style={{ padding:'7px 18px', borderRadius:8, border:'none', background:viewMode===mode ? B.white : 'transparent', color:viewMode===mode ? B.navy : B.textMid, fontWeight:viewMode===mode ? 700 : 500, fontSize:13, fontFamily:f1, cursor:'pointer', boxShadow:viewMode===mode ? '0 1px 3px rgba(27,42,74,0.1)' : 'none', transition:'all 0.15s' }}>
              {label}
            </button>
          ))}
        </div>
        {!isArchiveView && <div style={{ display:'flex', alignItems:'center', gap:6, marginLeft:4 }}>
          <span style={{ fontSize:12, color:B.textLight, fontFamily:f1, fontWeight:600, textTransform:'uppercase', letterSpacing:.6, whiteSpace:'nowrap' }}>Sort:</span>
          <select style={{ ...inp, width:'auto', cursor:'pointer', fontSize:13, padding:'7px 12px' }} value={sortBy} onChange={e => { setSortBy(e.target.value); localStorage.setItem('tasks_sortBy', e.target.value); }}>
            <option value="createdDesc">Newest first</option>
            <option value="createdAsc">Oldest first</option>
            <option value="priority">Priority</option>
            <option value="dueDate">Due date</option>
          </select>
        </div>}
        {!isMaint && !isArchiveView && (
          <button
            type="button"
            onClick={() => { setDefaultsForm({ visibility: userProfile?.taskDefaultVisibility || 'private', sharedWith: userProfile?.taskDefaultSharedWith || [] }); setShowDefaultsModal(true); }}
            style={{ padding:'7px 14px', borderRadius:10, border:'1px solid '+B.sand, background:B.white, color:B.textMid, fontSize:13, fontFamily:f1, cursor:'pointer', fontWeight:500, display:'flex', alignItems:'center', gap:5 }}
          >
            ⚙ Defaults
          </button>
        )}
        {!isMaint && !isArchiveView && (
          <button
            type="button"
            onClick={() => exportTasksCSV(filteredTasks)}
            title="Export visible tasks to CSV"
            style={{ padding:'7px 14px', borderRadius:10, border:'1px solid '+B.sand, background:B.white, color:B.textMid, fontSize:13, fontFamily:f1, cursor:'pointer', fontWeight:500 }}
          >
            Export CSV
          </button>
        )}
        {!isMaint && !isArchiveView && (
          <button
            type="button"
            onClick={() => exportTasksICS(filteredTasks.filter(t => t.dueDate), config?.churchName || '')}
            title="Export tasks with due dates to iCal (.ics)"
            style={{ padding:'7px 14px', borderRadius:10, border:'1px solid '+B.sand, background:B.white, color:B.textMid, fontSize:13, fontFamily:f1, cursor:'pointer', fontWeight:500 }}
          >
            Export ICS
          </button>
        )}
        {!isArchiveView && <span style={{ color:B.textLight, fontSize:13, marginLeft:'auto' }}>
          {filteredTasks.length}{filteredTasks.length !== visibleTasks.length ? ` of ${visibleTasks.length}` : ''} {noun}{visibleTasks.length !== 1 ? 's' : ''}
        </span>}
      </div>

      {/* ═══ ARCHIVED TASKS (COH-007) ═══ */}
      {isArchiveView && (
        <ArchivedTasks
          churchId={churchId}
          userId={userId}
          users={taskHubUsers}
          canOperate={canOperate}
          loadArchivedTasks={loadArchivedTasks}
          reopenTask={reopenTask}
          onMessage={setMsg}
        />
      )}

      {/* Empty state — loading */}
      {!isArchiveView && visibleTasks.length === 0 && loading && (
        <div style={{ background:B.white, borderRadius:18, padding:'48px 32px', border:'1px solid '+B.sand, textAlign:'center' }}>
          <Spinner/>
        </div>
      )}

      {/* Empty state — no items at all */}
      {!isArchiveView && visibleTasks.length === 0 && !loading && (
        <div style={{ background:B.white, borderRadius:18, padding:'48px 32px', border:'1px solid '+B.sand, textAlign:'center' }}>
          <EmojiIcon emoji={isMaint ? '🔧' : '✅'} decorative style={{ fontSize:48, marginBottom:16, display:'block' }} />
          <h3 style={{ fontFamily:f1, color:B.navy, margin:'0 0 8px', fontSize:18 }}>{isMaint ? 'No maintenance tickets yet' : 'No tasks yet'}</h3>
          <p style={{ color:B.textLight, fontSize:14 }}>{isMaint ? (canOperate ? 'Create a ticket to track repairs and maintenance tasks.' : 'No tickets yet. Ask an admin or manager to create one.') : 'Create a task to start tracking your church admin work.'}</p>
        </div>
      )}

      {/* Empty state — My filter active but nothing assigned */}
      {!isArchiveView && filterMyTasks && filteredTasks.length === 0 && visibleTasks.length > 0 && (
        <div style={{ background:B.white, borderRadius:14, padding:'32px 24px', border:'1px solid '+B.sand, textAlign:'center', marginBottom:16 }}>
          <EmojiIcon emoji="👤" decorative style={{ fontSize:36, marginBottom:12, display:'block' }} />
          <h3 style={{ fontFamily:f1, color:B.navy, margin:'0 0 6px', fontSize:16 }}>No {noun}s assigned to you</h3>
          <p style={{ color:B.textLight, fontSize:13, margin:'0 0 12px' }}>Open any {noun} and click <strong>Me</strong> in the Assignees field, then save to assign yourself.</p>
          <button type="button" onClick={() => setFilterMyTasks(false)} style={{ padding:'8px 18px', borderRadius:10, border:'1px solid '+B.sand, background:B.white, color:B.teal, fontSize:13, fontFamily:f1, cursor:'pointer', fontWeight:600 }}>
            Show all {noun}s
          </button>
        </div>
      )}

      {/* Kanban View */}
      {viewMode === 'kanban' && visibleTasks.length > 0 && (
        <div style={{ display:'flex', gap:12, overflowX:isMobile ? 'hidden' : 'auto', flexDirection:isMobile ? 'column' : 'row', paddingBottom:8, alignItems:'flex-start' }}>
          {STATUSES.map(status => (
            <KanbanColumn key={status} status={status} tasks={tasksByStatus[status]} onTaskClick={openDetail} onDrop={docId => handleDrop(docId, status)} onReorder={isMaint ? undefined : (from, to) => handleReorder(from, to, status)} onStatusChange={(task, newStatus) => handleDrop(task._docId, newStatus)} isMobile={isMobile} onQuickAdd={isMaint ? undefined : name => handleQuickAddTask(name, status)}/>
          ))}
        </div>
      )}

      {/* List View */}
      {viewMode === 'list' && visibleTasks.length > 0 && (
        <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
          {/* Bulk action bar (tasks only) */}
          {!isMaint && selectedTaskIds.size > 0 && (
            <div style={{ display:'flex', alignItems:'center', gap:8, padding:'10px 16px', background:'#EFF6FF', borderRadius:12, border:'1px solid #BFDBFE', flexWrap:'wrap' }}>
              <span style={{ fontSize:13, fontWeight:700, color:'#1D4ED8', fontFamily:f1 }}>{selectedTaskIds.size} selected</span>
              <button onClick={clearSelection} style={{ ...btnS, fontSize:12, padding:'4px 10px' }}>Clear</button>
              <div style={{ display:'flex', alignItems:'center', gap:6, marginLeft:8 }}>
                <select
                  aria-label="Set status for selected tasks"
                  value={bulkStatus}
                  onChange={e => setBulkStatus(e.target.value)}
                  style={{ ...inp, width:'auto', fontSize:12, padding:'5px 10px', cursor:'pointer' }}
                >
                  <option value="">Move to status...</option>
                  {STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
                <button onClick={handleBulkStatusChange} disabled={bulkSaving || !bulkStatus} style={{ ...btnP, fontSize:12, padding:'5px 12px', opacity:(!bulkStatus || bulkSaving) ? .5 : 1 }}>Apply</button>
              </div>
              <div style={{ display:'flex', alignItems:'center', gap:6 }}>
                <select aria-label="Assign selected tasks to" value={bulkAssigneeId} onChange={e => setBulkAssigneeId(e.target.value)} style={{ ...inp, width:'auto', fontSize:12, padding:'5px 10px', cursor:'pointer' }}>
                  <option value="">Assign to...</option>
                  {taskHubUsers.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
                </select>
                <button onClick={handleBulkAssign} disabled={bulkSaving || !bulkAssigneeId} style={{ ...btnS, fontSize:12, padding:'5px 12px', opacity:(!bulkAssigneeId || bulkSaving) ? .5 : 1 }}>Assign</button>
              </div>
              {canOperate && <button onClick={handleBulkDelete} disabled={bulkSaving} style={{ ...btnD, fontSize:12, padding:'5px 12px', opacity:bulkSaving ? .5 : 1 }}>Delete Selected</button>}
              <button onClick={selectAllVisible} style={{ ...btnS, fontSize:12, padding:'4px 10px', marginLeft:'auto' }}>Select All</button>
            </div>
          )}
          {STATUSES.map(status => {
            const statusTasks = tasksByStatus[status];
            const collapsed = collapsedStatuses.has(status);
            const sc = statusColors[status];
            return (
              <div key={status} style={{ background:B.white, borderRadius:14, border:'1px solid '+B.sand, overflow:'hidden' }}>
                <div onClick={() => toggleCollapse(status)} onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggleCollapse(status); }}} role="button" tabIndex={0} aria-expanded={!collapsed} style={{ display:'flex', alignItems:'center', gap:10, padding:'13px 20px', cursor:'pointer', background:B.warmGray, userSelect:'none' }}>
                  <span style={{ width:10, height:10, borderRadius:'50%', background:sc.dot, flexShrink:0 }}/>
                  <span style={{ fontWeight:700, fontSize:14, color:B.navy, fontFamily:f1 }}>{status}</span>
                  <span style={{ background:B.white, borderRadius:20, padding:'2px 10px', fontSize:12, fontWeight:700, color:B.textMid, fontFamily:f1 }}>{statusTasks.length}</span>
                  <span style={{ marginLeft:'auto', color:B.textLight, fontSize:14, display:'inline-block', transform:collapsed ? 'rotate(-90deg)' : 'none', transition:'transform 0.2s' }}>▼</span>
                </div>
                {!collapsed && (
                  <div style={{ padding:'12px 16px 4px' }}>
                    {statusTasks.length === 0
                      ? <div style={{ color:B.textLight, fontSize:13, textAlign:'center', padding:'12px 0' }}>No {noun}s in {status}</div>
                      : statusTasks.map(t => {
                          const isSelected = selectedTaskIds.has(t._docId);
                          return (
                            <div key={t._docId} style={{ display:'flex', alignItems:'flex-start', gap:8 }}>
                              {!isMaint && <input type="checkbox" checked={isSelected} onChange={() => toggleSelectTask(t._docId)} onClick={e => e.stopPropagation()} style={{ marginTop:18, width:15, height:15, cursor:'pointer', flexShrink:0 }} aria-label={`Select task ${t.name}`}/>}
                              <div style={{ flex:1, minWidth:0 }}>
                                <TaskCard task={t} onClick={openDetail}/>
                              </div>
                            </div>
                          );
                        })
                    }
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Calendar View */}
      {viewMode === 'calendar' && (
        <BoardCalendar items={filteredTasks} onItemClick={openDetail} isMobile={isMobile} noun={noun}/>
      )}

      {/* Insights View (tasks only) */}
      {viewMode === 'insights' && !isMaint && canOperate && (
        <div style={{ display:'flex', flexDirection:'column', gap:20 }}>
          {/* COH-007 A20 — the honesty band. These two metrics span 84 and 90
              days while the active board keeps only 42, so they are a join of a
              LIVE listener and a frozen one-shot archive read. Dedupe closes the
              overlap; it cannot close the race, so the history is presented as
              an explicit as-of snapshot with a refresh, and a torn or failed
              archive load never reuses the complete presentation. */}
          {insightLoading && (
            <div style={{ background:B.white, borderRadius:14, padding:'14px 18px', border:'1px solid '+B.sand, display:'flex', alignItems:'center', gap:12 }}>
              <Spinner/>
              <span style={{ fontSize:13, color:B.textMid, fontFamily:f1 }}>Loading archived history for the 12-week and 90-day figures...</span>
            </div>
          )}
          {!insightLoading && insightArchive && !insightArchive.complete && (
            <div style={{ background:B.redPale, borderRadius:14, padding:'14px 18px', border:'1px solid #FECACA' }}>
              <div style={{ fontWeight:700, color:B.red, fontFamily:f1, marginBottom:4, fontSize:13 }}>These history figures are incomplete</div>
              <div style={{ fontSize:13, color:B.textDark, lineHeight:1.5 }}>
                Part of the archived history could not be loaded ({insightArchive.failures.map(f => `${f.arm}: ${f.code}`).join(', ')}), so the 12-week chart and the 90-day average below undercount. Do not read them as a complete record.
                <button type="button" onClick={() => setInsightReloadKey(k => k + 1)} style={{ ...btnS, marginLeft:10, padding:'4px 12px', fontSize:12 }}>Try again</button>
              </div>
            </div>
          )}
          {!insightLoading && insightArchive?.complete && insightStale && (
            <div style={{ background:B.warmGray, borderRadius:14, padding:'14px 18px', border:'1px solid '+B.sand }}>
              <div style={{ fontWeight:700, color:B.navy, fontFamily:f1, marginBottom:4, fontSize:13 }}>These history figures are out of date</div>
              <div style={{ fontSize:13, color:B.textDark, lineHeight:1.5 }}>
                A task moved out of the active board after this history was loaded, so the 12-week chart and the 90-day average below no longer describe either moment. Refresh to recompute them.
                <button type="button" onClick={() => setInsightReloadKey(k => k + 1)} style={{ ...btnS, marginLeft:10, padding:'4px 12px', fontSize:12 }}>Refresh</button>
              </div>
            </div>
          )}
          {!insightLoading && insightArchive?.complete && !insightStale && (
            <div style={{ fontSize:12, color:B.textLight, fontFamily:f1, display:'flex', alignItems:'center', gap:10 }}>
              <span>History including archived tasks, as of {new Date(insightArchive.loadedAt).toLocaleTimeString('en-US', { hour:'numeric', minute:'2-digit' })}.</span>
              <button type="button" onClick={() => setInsightReloadKey(k => k + 1)} style={{ ...btnS, padding:'4px 12px', fontSize:12 }}>Refresh</button>
            </div>
          )}
          <div style={{ background:B.white, borderRadius:14, padding:'24px', border:'1px solid '+B.sand }}>
            <div style={{ fontWeight:700, fontSize:14, color:B.navy, fontFamily:f1, marginBottom:2 }}>Task Velocity — Last 12 Weeks</div>
            <div style={{ fontSize:12, color:B.textLight, marginBottom:16, fontFamily:f1 }}>Completed vs. created per week</div>
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={velocityData} margin={{ top:0, right:0, left:-20, bottom:0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke={B.sand} />
                <XAxis dataKey="week" tick={{ fontSize:10, fontFamily:f1, fill:B.textMid }} />
                <YAxis allowDecimals={false} tick={{ fontSize:10, fontFamily:f1, fill:B.textMid }} />
                <Tooltip contentStyle={{ fontFamily:f1, fontSize:12 }} />
                <Bar dataKey="created" fill={B.gold} name="Created" radius={[3,3,0,0]} />
                <Bar dataKey="completed" fill={B.teal} name="Completed" radius={[3,3,0,0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
          <div style={{ display:'grid', gridTemplateColumns:isMobile ? '1fr 1fr' : 'repeat(4, 1fr)', gap:10 }}>
            {(() => {
              const d90 = new Date(); d90.setDate(d90.getDate() - 90);
              const s90 = localDateStr(d90);
              // The 90-day tile reads insightTasks; the first two tiles stay on
              // the ACTIVE board, because "Total Visible" and "Completed" describe
              // the board in front of you, not the history behind it.
              const c90 = insightTasks.filter(t => t.completedAt && t.completedAt.slice(0,10) >= s90).length;
              return [
                { label:'Total Visible', value:visibleTasks.length, icon:'📋' },
                { label:'Completed', value:visibleTasks.filter(t=>t.status==='Complete').length, icon:'✅' },
                { label:'Overdue', value:overdueCount, icon:'⚠️' },
                { label:'Avg/Week (90d)', value:(c90/13).toFixed(1), icon:'📈' },
              ];
            })().map(s => (
              <div key={s.label} style={{ background:B.white, borderRadius:10, padding:'14px 16px', border:'1px solid '+B.sand }}>
                <span style={{ fontSize:20 }}>{s.icon}</span>
                <div style={{ fontSize:22, fontWeight:700, color:B.navy, fontFamily:f1, margin:'6px 0 2px' }}>{s.value}</div>
                <div style={{ fontSize:11, color:B.textLight, fontWeight:600, textTransform:'uppercase', letterSpacing:.6, fontFamily:f1 }}>{s.label}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ═══ ADD ITEM MODAL ═══ */}
      <Modal open={showAdd} onClose={() => { setShowAdd(false); setTaskForm(getEmptyTask()); setPhotoFiles([]); photoPreviews.forEach(u => URL.revokeObjectURL(u)); setPhotoPreviews([]); }} title={isMaint ? 'New Maintenance Ticket' : 'New Task'} wide>
        {!isMaint && (taskTemplates || []).length > 0 && (
          <div style={{ marginBottom:14 }}>
            <button type="button" onClick={() => setShowTemplates(true)} style={{ ...btnS, fontSize:13, padding:'7px 14px' }}>
              From Template
            </button>
          </div>
        )}
        <FF label={`${Noun} Name`} required>
          <input style={inp} value={taskForm.name} onChange={e => setTaskForm(f => ({ ...f, name:e.target.value }))} placeholder="Short descriptive name..."/>
        </FF>
        <RichTextarea label="Description" style={{ ...inp, minHeight:72, resize:'vertical' }} value={taskForm.description} onChange={v => setTaskForm(f => ({ ...f, description:v }))} placeholder={isMaint ? 'Full details of the issue or maintenance needed...' : 'What needs to be done — scope, context, and acceptance criteria'}/>
        <div style={{ display:'grid', gridTemplateColumns:isMobile ? '1fr 1fr' : (isMaint ? '1fr 1fr 1fr' : '1fr 1fr 1fr 1fr'), gap:12 }}>
          {!isMaint && (
            <FF label="Status">
              <select style={{ ...inp, cursor:'pointer' }} value={taskForm.status} onChange={e => setTaskForm(f => ({ ...f, status:e.target.value }))}>
                {STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </FF>
          )}
          <FF label="Priority">
            <select style={{ ...inp, cursor:'pointer' }} value={taskForm.priority} onChange={e => setTaskForm(f => ({ ...f, priority:e.target.value }))}>
              {PRIORITIES.map(p => <option key={p} value={p}>{p}</option>)}
            </select>
          </FF>
          <FF label="Due Date">
            <input style={inp} type="date" value={taskForm.dueDate} onChange={e => setTaskForm(f => ({ ...f, dueDate:e.target.value }))}/>
          </FF>
          <div style={isMobile ? { gridColumn:'1 / -1' } : {}}>
            <FF label="Recurrence">
              <select style={{ ...inp, cursor:'pointer' }} value={taskForm.recurrence} onChange={e => setTaskForm(f => ({ ...f, recurrence:e.target.value }))}>
                {RECURRENCE_OPTIONS.map(([val, label]) => <option key={val} value={val}>{label}</option>)}
              </select>
            </FF>
            {taskForm.recurrence && taskForm.dueDate && (
              <div style={{ fontSize:12, color:B.textLight, marginTop:4, fontFamily:f1 }}>
                <EmojiIcon emoji="🔁" decorative /> Next recurrence: <strong style={{ color:B.textMid }}>{calculateNextDue(taskForm.dueDate, taskForm.recurrence) || '—'}</strong>
              </div>
            )}
          </div>
        </div>
        <FF label="Tags">
          <TagInput tags={taskForm.tags} onChange={tags => setTaskForm(f => ({ ...f, tags }))} suggestions={taskTags}/>
        </FF>
        <div style={{ display:'grid', gridTemplateColumns: isMobile || isMaint ? '1fr' : '1fr 1fr', gap:12 }}>
          <FF label="Assignees">
            <AssigneeSelect assignees={taskForm.assignees} onChange={assignees => setTaskForm(f => ({ ...f, assignees }))} users={taskHubUsers} currentUserId={userId} currentUserName={userName}/>
          </FF>
          {!isMaint && (
            <FF label="Visibility">
              <VisibilitySelect visibility={taskForm.visibility} onChange={v => setTaskForm(f => ({ ...f, visibility:v, sharedWith: v !== 'shared' ? [] : f.sharedWith })) } canEdit={true}/>
            </FF>
          )}
        </div>
        {!isMaint && taskForm.visibility === 'shared' && (
          <FF label="Share With">
            <SharedWithSelect sharedWith={taskForm.sharedWith} onChange={sharedWith => setTaskForm(f => ({ ...f, sharedWith }))} users={taskHubUsers} assignees={taskForm.assignees} currentUserId={userId}/>
          </FF>
        )}
        {!isMaint && (
          <>
            <div style={{ display:'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr 1fr', gap:12 }}>
              {(settings?.ministries || []).length > 0 && (
                <FF label="Ministry (optional)">
                  <select style={{ ...inp, cursor:'pointer' }} value={taskForm.ministry} onChange={e => setTaskForm(f => ({ ...f, ministry: e.target.value }))}>
                    <option value="">— None —</option>
                    {(settings.ministries || []).map(m => <option key={m} value={m}>{m}</option>)}
                  </select>
                </FF>
              )}
              <FF label="Estimate (hrs)">
                <input style={inp} type="number" min="0" step="0.5" value={taskForm.estimatedHours ?? ''} onChange={e => setTaskForm(f => ({ ...f, estimatedHours: e.target.value ? parseFloat(e.target.value) : null }))} placeholder="0"/>
              </FF>
            </div>
            <div style={{ display:'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap:12 }}>
              <FF label="Link to Item (optional)">
                <select style={{ ...inp, cursor:'pointer' }} value={taskForm.linkedItemDocId || ''} onChange={e => setTaskForm(f => ({ ...f, linkedItemDocId: e.target.value || null }))}>
                  <option value="">— None —</option>
                  {(items || []).filter(i => i.status !== 'Disposed').sort((a,b) => (a.itemId||'').localeCompare(b.itemId||'')).map(i => (
                    <option key={i._docId} value={i._docId}>{i.itemId}{i.description ? ' — '+i.description.slice(0,40) : ''}</option>
                  ))}
                </select>
              </FF>
              <FF label="Link to Ticket (optional)">
                <select style={{ ...inp, cursor:'pointer' }} value={taskForm.linkedTicketDocId || ''} onChange={e => setTaskForm(f => ({ ...f, linkedTicketDocId: e.target.value || null }))}>
                  <option value="">— None —</option>
                  {(maintenanceTickets || []).filter(t => t.status !== 'Closed').sort((a,b) => ((a.ticketNumber||'').localeCompare(b.ticketNumber||''))).map(t => (
                    <option key={t._docId} value={t._docId}>{t.ticketNumber}{t.name ? ' — '+t.name.slice(0,40) : ''}</option>
                  ))}
                </select>
              </FF>
            </div>
          </>
        )}
        {isMaint && (
          <>
            <FF label="Linked Equipment (optional)">
              <select style={{ ...inp, cursor:'pointer' }} value={taskForm.linkedItemDocId || ''} onChange={e => setTaskForm(f => ({ ...f, linkedItemDocId: e.target.value || '' }))}>
                <option value="">— None —</option>
                {activeItems.map(i => <option key={i._docId} value={i._docId}>{i.description} ({i.itemId})</option>)}
              </select>
            </FF>
            <div style={{ display:'grid', gridTemplateColumns:vendors.length > 0 ? '1fr 1fr' : '1fr', gap:12 }}>
              {vendors.length > 0 && (
                <FF label="Vendor">
                  <select style={{ ...inp, cursor:'pointer' }} value={taskForm.vendorId} onChange={e => setTaskForm(f => ({ ...f, vendorId:e.target.value }))}>
                    <option value="">— None —</option>
                    {vendors.map(v => <option key={v._docId} value={v._docId}>{v.name}{v.specialty ? ' — '+v.specialty : ''}</option>)}
                  </select>
                </FF>
              )}
              <FF label="Estimated Cost ($)">
                <input style={inp} type="number" min="0" step="0.01" value={taskForm.estimatedCost} onChange={e => setTaskForm(f => ({ ...f, estimatedCost:e.target.value }))} placeholder="0.00"/>
              </FF>
            </div>
          </>
        )}
        <FF label="Photos">
          <PhotoGrid photos={photoPreviews} onAdd={handlePhotoSelect} onRemove={handlePreviewRemove} uploading={false}/>
        </FF>
        <RichTextarea label="Notes" style={{ ...inp, minHeight:52, resize:'vertical' }} value={taskForm.notes} onChange={v => setTaskForm(f => ({ ...f, notes:v }))} placeholder={isMaint ? 'Additional notes...' : 'Follow-up reminders, reference links, or working notes'}/>
        <button onClick={handleAddTask} disabled={saving || !taskForm.name.trim()} style={{ ...btnP, width:'100%', opacity:(saving || !taskForm.name.trim()) ? .5 : 1, marginTop:4 }}>
          {saving ? 'Creating...' : `Create ${Noun}`}
        </button>
      </Modal>

      {/* ═══ ITEM DETAIL MODAL ═══ */}
      <Modal open={!!showDetail} onClose={closeDetail} title={(showDetail?.[numberField] || '') + (showDetail?.name ? ' — ' + showDetail.name.slice(0, 40) : '')} wide>
        {showDetail && (
          <div>
            {showDetail[numberField] && (
              <div style={{ display:'flex', alignItems:'center', gap:6, marginBottom:10, fontFamily:'monospace', fontSize:12, color:B.textLight }}>
                <span>{showDetail[numberField]}</span>
                <button
                  type="button"
                  onClick={async () => {
                    try {
                      await navigator.clipboard.writeText(showDetail[numberField]);
                      flash(`Copied ${showDetail[numberField]}`);
                    } catch {
                      flash('Could not copy to clipboard', true);
                    }
                  }}
                  aria-label={`Copy ${showDetail[numberField]}`}
                  title="Copy to clipboard"
                  style={{ background:'none', border:'none', cursor:'pointer', padding:'2px 6px', color:B.teal, fontSize:12, fontFamily:f1 }}>
                  <EmojiIcon emoji="📋" decorative /> Copy
                </button>
              </div>
            )}
            {remoteUpdate && (
              <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', gap:12, padding:'10px 14px', borderRadius:8, background:'#FEF3E8', border:'1px solid #F59E42', marginBottom:14 }}>
                <span style={{ fontSize:13, color:'#7A4A10', fontFamily:f2 }}>This {noun} was updated by another team member.</span>
                <div style={{ display:'flex', gap:8, flexShrink:0 }}>
                  <button type="button" style={{ ...btnP, padding:'4px 12px', fontSize:12 }} onClick={async () => {
                    if (isDetailDirtyNow) {
                      const ok = await confirm({
                        title: 'Discard changes?',
                        message: 'Reloading will discard your unsaved changes. Continue?',
                        confirmLabel: 'Reload',
                        danger: true,
                      });
                      if (!ok) return;
                    }
                    openDetail(remoteUpdate);
                  }}>Reload</button>
                  <button type="button" style={{ ...btnS, padding:'4px 12px', fontSize:12 }} onClick={() => setRemoteUpdate(null)}>Dismiss</button>
                </div>
              </div>
            )}
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12, marginBottom:14 }}>
              <FF label="Status">
                <select style={{ ...inp, cursor:'pointer' }} value={detailEdits.status} onChange={e => setDetailEdits(d => ({ ...d, status:e.target.value }))}>
                  {STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
              </FF>
              <FF label="Priority">
                <select style={{ ...inp, cursor:'pointer' }} value={detailEdits.priority} onChange={e => setDetailEdits(d => ({ ...d, priority:e.target.value }))}>
                  {PRIORITIES.map(p => <option key={p} value={p}>{p}</option>)}
                </select>
              </FF>
            </div>
            <FF label="Name">
              <input style={inp} value={detailEdits.name} onChange={e => setDetailEdits(d => ({ ...d, name:e.target.value }))}/>
            </FF>
            <RichTextarea label="Description" style={{ ...inp, minHeight:72, resize:'vertical' }} value={detailEdits.description} onChange={v => setDetailEdits(d => ({ ...d, description:v }))} placeholder="What needs to be done — scope, context, and acceptance criteria"/>
            <div style={{ display:'grid', gridTemplateColumns:isMobile ? '1fr 1fr' : '1fr 1fr', gap:12 }}>
              <FF label="Due Date">
                <input style={inp} type="date" value={detailEdits.dueDate} onChange={e => setDetailEdits(d => ({ ...d, dueDate:e.target.value }))}/>
              </FF>
              <FF label="Recurrence">
                <select style={{ ...inp, cursor: (isMaint && !canOperate) ? 'default' : 'pointer' }} value={detailEdits.recurrence} onChange={e => setDetailEdits(d => ({ ...d, recurrence:e.target.value }))} disabled={isMaint && !canOperate}>
                  {RECURRENCE_OPTIONS.map(([val, label]) => <option key={val} value={val}>{label}</option>)}
                </select>
                {detailEdits.recurrence && detailEdits.dueDate && (
                  <div style={{ fontSize:12, color:B.textLight, marginTop:4, fontFamily:f1 }}>
                    <EmojiIcon emoji="🔁" decorative /> Next recurrence: <strong style={{ color:B.textMid }}>{calculateNextDue(detailEdits.dueDate, detailEdits.recurrence) || '—'}</strong>
                  </div>
                )}
              </FF>
            </div>
            <FF label="Tags">
              <TagInput tags={detailEdits.tags || []} onChange={tags => setDetailEdits(d => ({ ...d, tags }))} suggestions={taskTags}/>
            </FF>
            <div style={{ display:'grid', gridTemplateColumns: isMobile || isMaint ? '1fr' : '1fr 1fr', gap:12 }}>
              <FF label="Assignees">
                <AssigneeSelect assignees={detailEdits.assignees || []} onChange={assignees => setDetailEdits(d => ({ ...d, assignees }))} users={taskHubUsers} currentUserId={userId} currentUserName={userName}/>
              </FF>
              {!isMaint && (
                <FF label="Visibility">
                  <VisibilitySelect
                    visibility={detailEdits.visibility || 'team'}
                    onChange={v => setDetailEdits(d => ({ ...d, visibility:v, sharedWith: v !== 'shared' ? [] : d.sharedWith }))}
                    canEdit={canEditVisibility}
                  />
                </FF>
              )}
            </div>
            {!isMaint && detailEdits.visibility === 'shared' && canEditVisibility && (
              <FF label="Share With">
                <SharedWithSelect sharedWith={detailEdits.sharedWith || []} onChange={sharedWith => setDetailEdits(d => ({ ...d, sharedWith }))} users={taskHubUsers} assignees={detailEdits.assignees || []} currentUserId={userId}/>
              </FF>
            )}
            {!isMaint && (
              <>
                <div style={{ display:'grid', gridTemplateColumns: isMobile ? '1fr 1fr' : '1fr 1fr 1fr', gap:12 }}>
                  {(settings?.ministries || []).length > 0 && (
                    <FF label="Ministry">
                      <select style={{ ...inp, cursor:'pointer' }} value={detailEdits.ministry || ''} onChange={e => setDetailEdits(d => ({ ...d, ministry: e.target.value }))}>
                        <option value="">— None —</option>
                        {(settings.ministries || []).map(m => <option key={m} value={m}>{m}</option>)}
                      </select>
                    </FF>
                  )}
                  <FF label="Estimate (hrs)">
                    <input style={inp} type="number" min="0" step="0.5" value={detailEdits.estimatedHours ?? ''} onChange={e => setDetailEdits(d => ({ ...d, estimatedHours: e.target.value ? parseFloat(e.target.value) : null }))} placeholder="0"/>
                  </FF>
                  <FF label="Actual (hrs)">
                    <input style={inp} type="number" min="0" step="0.5" value={detailEdits.actualHours ?? ''} onChange={e => setDetailEdits(d => ({ ...d, actualHours: e.target.value ? parseFloat(e.target.value) : null }))} placeholder="0"/>
                  </FF>
                </div>
                <div style={{ display:'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap:12 }}>
                  <FF label="Link to Item (optional)">
                    <select style={{ ...inp, cursor:'pointer' }} value={detailEdits.linkedItemDocId || ''} onChange={e => setDetailEdits(d => ({ ...d, linkedItemDocId: e.target.value || null }))}>
                      <option value="">— None —</option>
                      {(items || []).filter(i => i.status !== 'Disposed').sort((a,b) => (a.itemId||'').localeCompare(b.itemId||'')).map(i => (
                        <option key={i._docId} value={i._docId}>{i.itemId}{i.description ? ' — '+i.description.slice(0,40) : ''}</option>
                      ))}
                    </select>
                  </FF>
                  <FF label="Link to Ticket (optional)">
                    <select style={{ ...inp, cursor:'pointer' }} value={detailEdits.linkedTicketDocId || ''} onChange={e => setDetailEdits(d => ({ ...d, linkedTicketDocId: e.target.value || null }))}>
                      <option value="">— None —</option>
                      {(maintenanceTickets || []).filter(t => t.status !== 'Closed').sort((a,b) => ((a.ticketNumber||'').localeCompare(b.ticketNumber||''))).map(t => (
                        <option key={t._docId} value={t._docId}>{t.ticketNumber}{t.name ? ' — '+t.name.slice(0,40) : ''}</option>
                      ))}
                    </select>
                  </FF>
                </div>
              </>
            )}
            {isMaint && (
              <>
                <FF label="Linked Equipment">
                  <select style={{ ...inp, cursor: canOperate ? 'pointer' : 'default' }} value={detailEdits.linkedItemDocId || ''} onChange={e => setDetailEdits(d => ({ ...d, linkedItemDocId:e.target.value }))} disabled={!canOperate}>
                    <option value="">— None —</option>
                    {activeItems.map(i => <option key={i._docId} value={i._docId}>{i.description} ({i.itemId})</option>)}
                  </select>
                </FF>
                <div style={{ display:'grid', gridTemplateColumns: isMobile ? '1fr 1fr' : '1fr 1fr 1fr', gap:12 }}>
                  {vendors.length > 0 && (
                    <FF label="Vendor">
                      <select style={{ ...inp, cursor: canOperate ? 'pointer' : 'default' }} value={detailEdits.vendorId} onChange={e => setDetailEdits(d => ({ ...d, vendorId:e.target.value }))} disabled={!canOperate}>
                        <option value="">— None —</option>
                        {vendors.map(v => <option key={v._docId} value={v._docId}>{v.name}{v.specialty ? ' — '+v.specialty : ''}</option>)}
                      </select>
                    </FF>
                  )}
                  <FF label="Estimated Cost ($)">
                    <input style={inp} type="number" min="0" step="0.01" value={detailEdits.estimatedCost} onChange={e => setDetailEdits(d => ({ ...d, estimatedCost:e.target.value }))} placeholder="0.00" disabled={!canOperate}/>
                  </FF>
                  <FF label="Actual Cost ($)">
                    <input style={inp} type="number" min="0" step="0.01" value={detailEdits.actualCost} onChange={e => setDetailEdits(d => ({ ...d, actualCost:e.target.value }))} placeholder="0.00" disabled={!canOperate}/>
                  </FF>
                </div>
                <FF label="Contractor Work">
                  <div style={{ border:'1px dashed '+B.sand, borderRadius:10, padding:'10px 14px', display:'flex', flexDirection:'column', gap:8 }}>
                    {timeEntries.filter(e => e.linkedTicketId === showDetail?._docId).map(e => {
                      const st = { scheduled:'Scheduled', logged:'Logged', approved:'Approved', paid:'Paid' }[e.status] || e.status;
                      return (
                        <div key={e._docId} style={{ fontSize:13, color:B.textDark, fontFamily:f2 }}>
                          <EmojiIcon emoji="🔧" decorative /> <strong>{e.personName || 'Contractor'}</strong> · {e.date}
                          {e.estHours != null && e.status === 'scheduled' ? ` · ~${Number(e.estHours).toFixed(2)} h` : ''}
                          {e.cost ? ` · $${Number(e.cost).toFixed(2)}` : ''}
                          <span style={{ marginLeft:6, fontSize:11, fontWeight:700, color:B.textLight }}>{st}</span>
                        </div>
                      );
                    })}
                    {canOperate && (contractors.length > 0
                      ? <button type="button" onClick={openContractorModal} style={{ ...btnS, padding:'6px 14px', fontSize:12, alignSelf:'flex-start' }}>+ Schedule Contractor</button>
                      : <span style={{ fontSize:12, color:B.textLight, fontFamily:f2 }}>Add a person of type <strong>Contractor</strong> in People Access to schedule work here.</span>
                    )}
                  </div>
                </FF>
              </>
            )}
            <RichTextarea label="Notes" style={{ ...inp, minHeight:52, resize:'vertical' }} value={detailEdits.notes} onChange={v => setDetailEdits(d => ({ ...d, notes:v }))} placeholder={isMaint ? 'Additional notes...' : 'Follow-up reminders, reference links, or working notes'}/>
            <FF label="Checklist">
              <div style={{ border:'1px dashed '+B.sand, borderRadius:10, padding:'12px 14px' }}>
                {(detailEdits.checklist || []).length === 0 && (
                  <div style={{ fontSize:13, color:B.textLight, marginBottom:8, fontFamily:f2 }}>No checklist items yet.</div>
                )}
                {(detailEdits.checklist || []).map((item, idx) => (
                  <div
                    key={item.id}
                    draggable
                    onDragStart={() => { dragChecklistIdx.current = idx; }}
                    onDragEnd={() => { dragChecklistIdx.current = null; }}
                    onDragOver={e => e.preventDefault()}
                    onDrop={() => {
                      const from = dragChecklistIdx.current;
                      if (from === null || from === idx) return;
                      const prevCl = detailEdits.checklist || [];
                      const cl = [...prevCl];
                      const [moved] = cl.splice(from, 1);
                      cl.splice(idx, 0, moved);
                      dragChecklistIdx.current = null;
                      setDetailEdits(d => ({ ...d, checklist: cl }));
                      setShowDetail(prev => ({ ...prev, checklist: cl }));
                      handleChecklistUpdate(cl, prevCl);
                    }}
                    style={{ display:'flex', alignItems:'center', gap:8, padding:'7px 0', borderBottom:'1px solid '+B.sand, cursor:'grab' }}
                  >
                    <span style={{ color:B.textLight, fontSize:14, flexShrink:0, cursor:'grab' }}>⠿</span>
                    <input type="checkbox" checked={item.done} style={{ flexShrink:0, width:16, height:16, cursor:'pointer' }} onChange={() => {
                      const prevCl = detailEdits.checklist || [];
                      const cl = [...prevCl];
                      cl[idx] = { ...cl[idx], done: !cl[idx].done };
                      setDetailEdits(d => ({ ...d, checklist: cl }));
                      setShowDetail(prev => ({ ...prev, checklist: cl }));
                      handleChecklistUpdate(cl, prevCl);
                    }}/>
                    <span style={{ flex:1, fontSize:13, color:item.done ? B.textLight : B.textDark, textDecoration:item.done ? 'line-through' : 'none', fontFamily:f2 }}>{item.text}</span>
                    <button type="button" onClick={() => {
                      const prevCl = detailEdits.checklist || [];
                      const cl = prevCl.filter((_, i) => i !== idx);
                      setDetailEdits(d => ({ ...d, checklist: cl }));
                      setShowDetail(prev => ({ ...prev, checklist: cl }));
                      handleChecklistUpdate(cl, prevCl);
                    }} style={{ border:'none', background:'none', color:B.textLight, cursor:'pointer', fontSize:18, lineHeight:1, padding:'0 2px' }}>×</button>
                  </div>
                ))}
                <div style={{ display:'flex', gap:6, marginTop:8 }}>
                  <input
                    ref={checklistInputRef}
                    style={{ ...inp, flex:1 }}
                    placeholder="Add checklist item... (Enter to add)"
                    value={detailChecklistInput}
                    onChange={e => setDetailChecklistInput(e.target.value)}
                    onKeyDown={e => {
                      if (e.key === 'Enter' && detailChecklistInput.trim()) {
                        e.preventDefault();
                        const prevCl = detailEdits.checklist || [];
                        const cl = [...prevCl, { id: Date.now().toString(), text: detailChecklistInput.trim(), done: false }];
                        setDetailEdits(d => ({ ...d, checklist: cl }));
                        setShowDetail(prev => ({ ...prev, checklist: cl }));
                        handleChecklistUpdate(cl, prevCl);
                        setDetailChecklistInput('');
                        checklistInputRef.current?.focus();
                      }
                    }}
                  />
                  <button type="button" onClick={() => {
                    if (!detailChecklistInput.trim()) return;
                    const prevCl = detailEdits.checklist || [];
                    const cl = [...prevCl, { id: Date.now().toString(), text: detailChecklistInput.trim(), done: false }];
                    setDetailEdits(d => ({ ...d, checklist: cl }));
                    setShowDetail(prev => ({ ...prev, checklist: cl }));
                    handleChecklistUpdate(cl, prevCl);
                    setDetailChecklistInput('');
                    checklistInputRef.current?.focus();
                  }} style={{ ...btnS, padding:'9px 14px', fontSize:13, flexShrink:0 }}>Add</button>
                </div>
              </div>
            </FF>
            <div style={{ display:'flex', gap:10, justifyContent:'space-between', alignItems:'center', flexWrap:'wrap', marginBottom:20 }}>
              <div style={{ fontSize:12, color:B.textLight }}>
                Created by <strong>{showDetail.createdByName || showDetail.reportedByName}</strong> on {showDetail.createdAt?.split('T')[0]}
                {showDetail.completedAt && <> · Completed {showDetail.completedAt.split('T')[0]}</>}
              </div>
              <div style={{ display:'flex', gap:8, flexWrap:'wrap' }}>
                {(canOperate || (!isMaint && showDetail.createdBy === userId)) && <button onClick={handleDeleteTask} disabled={saving} style={{ ...btnD, fontSize:13, padding:'9px 14px', opacity:saving ? 0.5 : 1 }}>Delete</button>}
                {!isMaint && canOperate && <button onClick={handleOpenSaveTemplate} style={{ ...btnS, fontSize:13, padding:'9px 14px' }}>Save as Template</button>}
                {!isMaint && canOperate && !showDetail.linkedJobDocId && <button onClick={openConvertToJob} style={{ ...btnS, fontSize:13, padding:'9px 14px' }}>→ Job</button>}
                <button onClick={closeDetail} style={btnS}>Cancel</button>
                <button onClick={handleUpdateTask} disabled={saving || !detailEdits.name?.trim()} style={{ ...btnP, opacity:(saving || !detailEdits.name?.trim()) ? .5 : 1 }}>
                  {saving ? 'Saving...' : 'Save Changes'}
                </button>
              </div>
            </div>

            {/* Linked job chip */}
            {!isMaint && showDetail.linkedJobDocId && (
              <div style={{ marginBottom:12, padding:'8px 12px', borderRadius:8, background:'#EDF2FF', border:'1px solid #C7D2FE', display:'flex', alignItems:'center', gap:8 }}>
                <span style={{ fontSize:12, color:'#3730A3', fontFamily:f1, fontWeight:600 }}><EmojiIcon emoji="💼" decorative /> Linked Job</span>
                <span style={{ fontSize:12, color:'#4F46E5', fontFamily:'monospace' }}>{showDetail.linkedJobDocId.slice(0,8)}…</span>
              </div>
            )}

            {/* Photos */}
            <div style={{ marginBottom:20 }}>
              <div style={{ fontWeight:700, fontSize:12, color:B.textMid, fontFamily:f1, textTransform:'uppercase', letterSpacing:.5, marginBottom:10 }}>Photos</div>
              {(() => {
                const canEditPhotos = canOperate || showDetail.createdBy === userId || (showDetail.assignees || []).some(a => a.uid === userId);
                return <PhotoGrid photos={showDetail.photos || []} onAdd={canEditPhotos ? handleDetailPhotoAdd : undefined} onRemove={canEditPhotos ? handleDetailPhotoRemove : undefined} uploading={uploadingPhotos}/>;
              })()}
            </div>

            {/* Comments */}
            <div>
              <div style={{ fontWeight:700, fontSize:12, color:B.textMid, fontFamily:f1, textTransform:'uppercase', letterSpacing:.5, marginBottom:10 }}>Comments</div>
              <CommentThread comments={comments} loading={commentsLoading} newComment={newComment} onChange={setNewComment} onPost={handlePostComment} posting={postingComment} userId={userId} canOperate={canOperate} onEdit={handleEditComment} onDelete={handleDeleteComment} users={isMaint ? undefined : taskHubUsers}/>
            </div>
          </div>
        )}
      </Modal>

      {/* ═══ PASTE TASKS MODAL ═══ */}
      <Modal open={showPaste} onClose={() => { if (!pasteSaving) { setShowPaste(false); setPasteText(''); setPasteProgress(null); } }} title="Paste Tasks" wide>
        <PastePanel
          pasteText={pasteText}
          setPasteText={setPasteText}
          taskHubUsers={taskHubUsers}
          pasteSaving={pasteSaving}
          pasteProgress={pasteProgress}
          onCancel={() => { if (!pasteSaving) { setShowPaste(false); setPasteText(''); setPasteProgress(null); } }}
          onSubmit={handlePasteSubmit}
        />
      </Modal>

      {/* ═══ TASK DEFAULTS MODAL ═══ */}
      <Modal open={showDefaultsModal} onClose={() => setShowDefaultsModal(false)} title="My Task Defaults">
        <p style={{ fontSize:13, color:B.textMid, margin:'0 0 16px' }}>
          New tasks you create will start with these settings. You can always override them per task.
        </p>
        <FF label="Default Visibility">
          <VisibilitySelect
            visibility={defaultsForm.visibility}
            onChange={v => setDefaultsForm(f => ({ ...f, visibility:v, sharedWith: v !== 'shared' ? [] : f.sharedWith }))}
            canEdit={true}
          />
        </FF>
        {defaultsForm.visibility === 'shared' && (
          <FF label="Default Share With">
            <SharedWithSelect
              sharedWith={defaultsForm.sharedWith}
              onChange={sharedWith => setDefaultsForm(f => ({ ...f, sharedWith }))}
              users={taskHubUsers}
              assignees={[]}
              currentUserId={userId}
            />
          </FF>
        )}
        <div style={{ display:'flex', gap:10, justifyContent:'flex-end', marginTop:8 }}>
          <button onClick={() => setShowDefaultsModal(false)} style={btnS}>Cancel</button>
          <button onClick={handleSaveDefaults} disabled={savingDefaults} style={{ ...btnP, opacity:savingDefaults ? .5 : 1 }}>
            {savingDefaults ? 'Saving...' : 'Save Defaults'}
          </button>
        </div>
      </Modal>

      {/* ═══ SAVE AS TEMPLATE MODAL ═══ */}
      <Modal open={showSaveTemplate} onClose={() => setShowSaveTemplate(false)} title="Save as Template">
        <FF label="Template Name" required>
          <input style={inp} value={saveTemplateForm.name} onChange={e => setSaveTemplateForm(f => ({ ...f, name: e.target.value }))} placeholder="Template name..."/>
        </FF>
        <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:12 }}>
          <input type="checkbox" id="tplAutoGen" checked={saveTemplateForm.autoGenerate} onChange={e => setSaveTemplateForm(f => ({ ...f, autoGenerate: e.target.checked }))} style={{ width:16, height:16, cursor:'pointer' }}/>
          <label htmlFor="tplAutoGen" style={{ fontSize:13, color:B.textDark, fontFamily:f2, cursor:'pointer' }}>Auto-generate tasks on a recurring schedule</label>
        </div>
        {saveTemplateForm.autoGenerate && (
          <>
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12 }}>
              <FF label="Frequency">
                <select style={{ ...inp, cursor:'pointer' }} value={saveTemplateForm.autoGenerateFrequency} onChange={e => setSaveTemplateForm(f => ({ ...f, autoGenerateFrequency: e.target.value }))}>
                  {RECURRENCE_OPTIONS.filter(([v]) => v).map(([val, label]) => <option key={val} value={val}>{label}</option>)}
                </select>
              </FF>
              <FF label="First Generate On">
                <input style={inp} type="date" value={saveTemplateForm.autoGenerateNextAt} onChange={e => setSaveTemplateForm(f => ({ ...f, autoGenerateNextAt: e.target.value }))}/>
              </FF>
            </div>
            <p style={{ fontSize:12, color:B.textLight, margin:'0 0 14px', fontFamily:f2 }}>
              A new task will be created from this template automatically on this date and then on the recurring schedule.
            </p>
          </>
        )}
        <div style={{ display:'flex', gap:10, justifyContent:'flex-end', marginTop:4 }}>
          <button onClick={() => setShowSaveTemplate(false)} style={btnS}>Cancel</button>
          <button onClick={handleSaveTemplateSubmit} disabled={!saveTemplateForm.name.trim()} style={{ ...btnP, opacity:!saveTemplateForm.name.trim() ? .5 : 1 }}>Save Template</button>
        </div>
      </Modal>

      {/* ═══ TASK TEMPLATES MODAL ═══ */}
      <Modal open={showTemplates} onClose={() => setShowTemplates(false)} title="Choose a Template">
        {(taskTemplates || []).length === 0 ? (
          <p style={{ fontSize:13, color:B.textLight, textAlign:'center', padding:'24px 0' }}>No templates saved yet.</p>
        ) : (
          <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
            {(taskTemplates || []).map(t => (
              <div key={t._docId} style={{ display:'flex', alignItems:'center', justifyContent:'space-between', gap:10, padding:'12px 14px', borderRadius:10, border:'1px solid '+B.sand, background:B.white }}>
                <div style={{ flex:1, minWidth:0 }}>
                  <div style={{ fontWeight:700, fontSize:14, color:B.navy, fontFamily:f1 }}>{t.name}</div>
                  {t.description && <div style={{ fontSize:12, color:B.textLight, fontFamily:f2, marginTop:2, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{t.description}</div>}
                  <div style={{ fontSize:11, color:B.textLight, marginTop:3, fontFamily:f1 }}>
                    {t.priority}{t.recurrence ? ' · ' + (RECURRENCE_LABELS[t.recurrence] || t.recurrence) : ''}{(t.checklist||[]).length > 0 ? ' · ' + t.checklist.length + ' checklist item' + (t.checklist.length !== 1 ? 's' : '') : ''}
                  </div>
                </div>
                <div style={{ display:'flex', gap:6, flexShrink:0 }}>
                  <button onClick={() => applyTemplate(t)} style={{ ...btnP, fontSize:12, padding:'6px 12px' }}>Use</button>
                  {canOperate && <button onClick={async () => {
                    const ok = await confirm({
                      title: 'Delete template?',
                      message: <>Delete template <strong>{t.name}</strong>. Existing tasks created from it are not affected.</>,
                      confirmLabel: 'Delete',
                      danger: true,
                    });
                    if (!ok) return;
                    await deleteTaskTemplate(t._docId, userId, userName);
                    setShowTemplates(false);
                  }} style={{ ...btnD, fontSize:12, padding:'6px 10px' }} aria-label={`Delete template ${t.name}`}>✕</button>}
                </div>
              </div>
            ))}
          </div>
        )}
      </Modal>

      {/* ═══ CONVERT TO JOB MODAL ═══ */}
      <Modal open={showConvertToJobModal} onClose={() => setShowConvertToJobModal(false)} title="Convert to Job">
        <FF label="Job Title" required>
          <input style={inp} value={convertJobForm.title} onChange={e => setConvertJobForm(f => ({ ...f, title: e.target.value }))} placeholder="Job title…" />
        </FF>
        <FF label="Scheduled Date">
          <input type="date" style={inp} value={convertJobForm.scheduledDate} onChange={e => setConvertJobForm(f => ({ ...f, scheduledDate: e.target.value }))} />
        </FF>
        <FF label="Location (optional)">
          <input style={inp} value={convertJobForm.location} onChange={e => setConvertJobForm(f => ({ ...f, location: e.target.value }))} placeholder="Location…" />
        </FF>
        <FF label="Spots Available">
          <input type="number" min={1} style={inp} value={convertJobForm.spotsTotal} onChange={e => setConvertJobForm(f => ({ ...f, spotsTotal: e.target.value }))} />
        </FF>
        <div style={{ display:'flex', gap:10, justifyContent:'flex-end', marginTop:8 }}>
          <button onClick={() => setShowConvertToJobModal(false)} style={btnS}>Cancel</button>
          <button onClick={handleConvertToJob} disabled={convertJobSaving || !convertJobForm.title.trim()} style={{ ...btnP, opacity: (convertJobSaving || !convertJobForm.title.trim()) ? 0.5 : 1 }}>
            {convertJobSaving ? 'Creating…' : 'Create Job'}
          </button>
        </div>
      </Modal>

      {/* ═══ EDIT VENDOR MODAL (maintenance) ═══ */}
      <Modal open={!!showEditVendor} onClose={() => { setShowEditVendor(null); setVendorForm(getEmptyVendor()); }} title="Edit Vendor">
        <FF label="Vendor / Company Name" required>
          <input style={inp} value={vendorForm.name} onChange={e => setVendorForm(f => ({ ...f, name:e.target.value }))} placeholder="e.g. Smith's HVAC"/>
        </FF>
        <FF label="Specialty">
          <input style={inp} value={vendorForm.specialty} onChange={e => setVendorForm(f => ({ ...f, specialty:e.target.value }))} placeholder="e.g. HVAC, Electrical, AV Systems"/>
        </FF>
        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12 }}>
          <FF label="Phone">
            <input style={inp} value={vendorForm.phone} onChange={e => setVendorForm(f => ({ ...f, phone:formatPhone(e.target.value) }))} placeholder="(555) 000-0000"/>
          </FF>
          <FF label="Email">
            <input style={inp} type="email" value={vendorForm.email} onChange={e => setVendorForm(f => ({ ...f, email:e.target.value }))} placeholder="contact@vendor.com"/>
          </FF>
        </div>
        <FF label="Notes">
          <textarea style={{ ...inp, minHeight:60, resize:'vertical' }} value={vendorForm.notes} onChange={e => setVendorForm(f => ({ ...f, notes:e.target.value }))} placeholder="Contract details, hours, etc."/>
        </FF>
        <button onClick={handleUpdateVendor} disabled={saving || !vendorForm.name.trim()} style={{ ...btnP, width:'100%', opacity:(saving || !vendorForm.name.trim()) ? .5 : 1, marginTop:4 }}>
          {saving ? 'Saving...' : 'Save Changes'}
        </button>
      </Modal>

      {/* ═══ ADD VENDOR MODAL (maintenance) ═══ */}
      <Modal open={showAddVendor} onClose={() => { setShowAddVendor(false); setVendorForm(getEmptyVendor()); }} title="Add Vendor">
        <FF label="Vendor / Company Name" required>
          <input style={inp} value={vendorForm.name} onChange={e => setVendorForm(f => ({ ...f, name:e.target.value }))} placeholder="e.g. Smith's HVAC"/>
        </FF>
        <FF label="Specialty">
          <input style={inp} value={vendorForm.specialty} onChange={e => setVendorForm(f => ({ ...f, specialty:e.target.value }))} placeholder="e.g. HVAC, Electrical, AV Systems"/>
        </FF>
        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12 }}>
          <FF label="Phone">
            <input style={inp} value={vendorForm.phone} onChange={e => setVendorForm(f => ({ ...f, phone:formatPhone(e.target.value) }))} placeholder="(555) 000-0000"/>
          </FF>
          <FF label="Email">
            <input style={inp} type="email" value={vendorForm.email} onChange={e => setVendorForm(f => ({ ...f, email:e.target.value }))} placeholder="contact@vendor.com"/>
          </FF>
        </div>
        <FF label="Notes">
          <textarea style={{ ...inp, minHeight:60, resize:'vertical' }} value={vendorForm.notes} onChange={e => setVendorForm(f => ({ ...f, notes:e.target.value }))} placeholder="Contract details, hours, etc."/>
        </FF>
        <button onClick={handleAddVendor} disabled={saving || !vendorForm.name.trim()} style={{ ...btnP, width:'100%', opacity:(saving || !vendorForm.name.trim()) ? .5 : 1, marginTop:4 }}>
          {saving ? 'Saving...' : 'Add Vendor'}
        </button>
      </Modal>

      {/* ═══ SCHEDULE CONTRACTOR MODAL (maintenance) ═══ */}
      <Modal open={contractorModal} onClose={() => setContractorModal(false)} title="Schedule Contractor">
        <FF label="Contractor" required>
          <select style={inp} value={contractorForm.personId} onChange={e => setContractorForm(f => ({ ...f, personId:e.target.value }))}>
            {contractors.length === 0 && <option value="">No contractors yet</option>}
            {contractors.map(p => (
              <option key={p._docId} value={p._docId}>{p.name}{p.hourlyRate != null ? ` ($${Number(p.hourlyRate).toFixed(2)}/hr)` : ''}</option>
            ))}
          </select>
        </FF>
        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12 }}>
          <FF label="Date" required>
            <input style={inp} type="date" value={contractorForm.date} onChange={e => setContractorForm(f => ({ ...f, date:e.target.value }))} />
          </FF>
          <FF label="Estimated hours">
            <input style={inp} type="number" min="0" step="0.25" value={contractorForm.hours} onChange={e => setContractorForm(f => ({ ...f, hours:e.target.value }))} placeholder="optional" />
          </FF>
        </div>
        <p style={{ fontSize:12, color:B.textLight, fontFamily:f2, margin:'4px 0 12px' }}>
          Creates a scheduled entry in People Access → Timesheet, linked to this ticket. When you log the actual hours there, the cost rolls into this ticket's Actual Cost.
        </p>
        <button onClick={handleScheduleContractor} disabled={!contractorForm.personId || !contractorForm.date} style={{ ...btnP, width:'100%', opacity:(!contractorForm.personId || !contractorForm.date) ? .5 : 1 }}>
          Schedule
        </button>
      </Modal>
      <ConfirmHost />
    </div>
  );
}
