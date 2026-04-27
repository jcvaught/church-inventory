import { useState, useEffect, useContext, useRef, useMemo, memo } from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { collection, doc, onSnapshot, query as fsQuery, orderBy, runTransaction, getDocs, where, updateDoc, deleteField, arrayRemove } from 'firebase/firestore';
import { ref as storageRef, uploadBytes, getDownloadURL, deleteObject } from 'firebase/storage';
import { db, storage } from '../../firebase.js';
import { MobileCtx } from '../../hooks/useMobile.js';
import { B, f1, f2, inp, btnP, btnS, btnD } from '../../components/brand/tokens.js';
import { Modal } from '../../components/primitives/Modal.jsx';
import { FF } from '../../components/primitives/FF.jsx';
import { Spinner } from '../../components/primitives/Spinner.jsx';
import { resizeImageForUpload } from '../../utils/imageResize.js';
import { exportTasksCSV } from '../../utils/csv.js';
import { exportTasksICS } from '../../utils/ical.js';
import { localDateStr, calculateNextDue } from '../../utils/date.js';

const STATUSES = ['Backlog', 'Planning', 'In Progress', 'On Hold', 'Complete', 'Cancelled'];

function initials(name) {
  const parts = (name || '?').trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return '?';
  if (parts.length === 1) return parts[0].charAt(0).toUpperCase();
  return (parts[0].charAt(0) + parts[parts.length - 1].charAt(0)).toUpperCase();
}
const ASSIGNEE_COLORS = ['#2A7D6E','#5B6ABF','#C0592B','#7B2D8E','#2E86AB','#D4A843','#C44569','#3D7A4A'];
function assigneeColor(uid) {
  let h = 0;
  for (let i = 0; i < (uid||'').length; i++) h = ((h << 5) - h + uid.charCodeAt(i)) | 0;
  return ASSIGNEE_COLORS[Math.abs(h) % ASSIGNEE_COLORS.length];
}
const PRIORITIES = ['High', 'Medium', 'Low'];
const RECURRENCE_OPTIONS = [['', 'None'], ['weekly', 'Weekly'], ['biweekly', 'Every 2 weeks'], ['monthly', 'Monthly'], ['quarterly', 'Quarterly'], ['annually', 'Annually']];
const RECURRENCE_LABELS = { weekly:'Weekly', biweekly:'Every 2 wks', monthly:'Monthly', quarterly:'Quarterly', annually:'Annually' };


const priorityColors = {
  High:   { bg: '#FEE8E8', tx: B.red,      dot: '#E87171' },
  Medium: { bg: B.goldLight, tx: '#96750E', dot: B.gold },
  Low:    { bg: B.warmGray,  tx: B.textMid, dot: B.textLight },
};

const statusColors = {
  'Backlog':     { bg: B.warmGray,  tx: B.textMid,  dot: B.textLight },
  'Planning':    { bg: B.goldLight, tx: '#96750E',   dot: B.gold },
  'In Progress': { bg: '#E8F0FE',   tx: '#1A65C7',   dot: '#3B82F6' },
  'On Hold':     { bg: '#FEF3E8',   tx: '#9A5E10',   dot: '#F59E42' },
  'Complete':    { bg: B.tealPale,  tx: B.teal,      dot: B.tealLight },
  'Cancelled':   { bg: B.warmGray,  tx: B.textMid,   dot: B.textLight },
};

function PriorityBadge({ priority }) {
  const s = priorityColors[priority] || priorityColors.Medium;
  return (
    <span style={{ display:'inline-flex', alignItems:'center', gap:5, padding:'3px 10px', borderRadius:20, background:s.bg, color:s.tx, fontSize:11, fontWeight:700, fontFamily:f1 }}>
      <span style={{ width:6, height:6, borderRadius:'50%', background:s.dot }}/>{priority}
    </span>
  );
}


const TaskCard = memo(function TaskCard({ task, onClick, onDragStart, onStatusChange, isMobile, subtaskCount, subtaskDone, parentName }) {
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
      aria-label={`${task.taskNumber ? task.taskNumber + ': ' : ''}${task.name}${isOverdue ? ' (overdue)' : ''}`}
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
      {task.blockedBy?.length > 0 && task.status !== 'Complete' && task.status !== 'Cancelled' && (
        <div style={{ fontSize:11, fontWeight:700, color:B.red, fontFamily:f1, marginBottom:3 }}>⛔ Blocked by {task.blockedBy.join(', ')}</div>
      )}
      {parentName && <div style={{ fontSize:11, color:B.textLight, fontFamily:f1, marginBottom:3 }}>↳ {parentName}</div>}
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
      {(task.recurrence || task.checklist?.length > 0 || subtaskCount > 0) && (
        <div style={{ display:'flex', gap:8, alignItems:'center', marginBottom:4 }}>
          {task.recurrence && <span style={{ fontSize:12, color:B.teal, fontFamily:f1 }}>🔁 {RECURRENCE_LABELS[task.recurrence]}</span>}
          {task.checklist?.length > 0 && (
            <span style={{ fontSize:12, color:task.checklist.filter(c=>c.done).length===task.checklist.length ? B.teal : B.textMid, fontFamily:f1 }}>
              ✓ {task.checklist.filter(c=>c.done).length}/{task.checklist.length}
            </span>
          )}
          {subtaskCount > 0 && (
            <span style={{ fontSize:12, color:subtaskDone===subtaskCount ? B.teal : B.textMid, fontFamily:f1 }}>
              ↳ {subtaskDone}/{subtaskCount} subtask{subtaskCount !== 1 ? 's' : ''}
            </span>
          )}
        </div>
      )}
      {(task.photos?.length > 0 || task.dueDate || task.estimatedHours != null || task.actualHours != null) && (
        <div style={{ display:'flex', justifyContent:'flex-end', gap:8, alignItems:'center', flexWrap:'wrap' }}>
          {task.photos?.length > 0 && <span style={{ fontSize:11, color:B.textLight }}>📷 {task.photos.length}</span>}
          {(task.estimatedHours != null || task.actualHours != null) && (
            <span style={{ fontSize:11, color:B.textLight }}>⏱ {task.actualHours != null ? task.actualHours : '—'}/{task.estimatedHours != null ? task.estimatedHours : '—'}h</span>
          )}
          {task.dueDate && <span style={{ fontSize:11, color: isOverdue ? B.red : B.textLight }}>📅 {task.dueDate}</span>}
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
  const blurTimerRef = useRef(null);
  useEffect(() => () => { if (blurTimerRef.current) clearTimeout(blurTimerRef.current); }, []);
  const filtered = suggestions.filter(s => !tags.includes(s) && s.toLowerCase().includes(inputVal.toLowerCase()));

  function addTag(t) {
    const tag = t.trim().toLowerCase();
    if (tag && !tags.includes(tag)) onChange([...tags, tag]);
    setInputVal('');
    setShowDrop(false);
  }
  function onKey(e) {
    if ((e.key === 'Enter' || e.key === ',') && inputVal.trim()) { e.preventDefault(); e.stopPropagation(); addTag(inputVal); }
    else if (e.key === 'Backspace' && !inputVal && tags.length) onChange(tags.slice(0, -1));
  }
  // onKeyUp is a fallback for mobile virtual keyboards where onKeyDown may not fire for Enter
  function onKeyUp(e) {
    if (e.key === 'Enter' && inputVal.trim()) { e.preventDefault(); e.stopPropagation(); addTag(inputVal); }
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
        <div style={{ position:'absolute', top:'100%', left:0, right:0, zIndex:200, background:B.white, border:'1px solid '+B.sand, borderRadius:10, boxShadow:'0 4px 16px rgba(27,42,74,0.1)', maxHeight:130, overflowY:'auto', marginTop:2 }}>
          {filtered.map(s => (
            <div key={s} onMouseDown={() => addTag(s)} style={{ padding:'8px 14px', cursor:'pointer', fontSize:13, fontFamily:f2, color:B.textDark }}
              onMouseEnter={e => e.currentTarget.style.background=B.warmGray}
              onMouseLeave={e => e.currentTarget.style.background=''}
            >{s}</div>
          ))}
        </div>
      )}
    </div>
  );
}

function BlockedByInput({ blockedBy = [], onChange, tasks = [], currentTaskNumber }) {
  const [inputVal, setInputVal] = useState('');
  const [blockerError, setBlockerError] = useState('');
  const suggestions = tasks.filter(t =>
    t.taskNumber?.startsWith('TSK-') &&
    t.taskNumber !== currentTaskNumber &&
    !blockedBy.includes(t.taskNumber) &&
    !['Complete', 'Cancelled'].includes(t.status) &&
    t.taskNumber.toLowerCase().includes(inputVal.toLowerCase())
  ).slice(0, 8);

  function addBlocker(num) {
    const v = num.trim().toUpperCase();
    if (!v || blockedBy.includes(v)) { setInputVal(''); return; }
    if (!tasks.find(t => t.taskNumber === v)) {
      setBlockerError('Task not found.');
      setTimeout(() => setBlockerError(''), 3000);
      return;
    }
    onChange([...blockedBy, v]);
    setInputVal('');
  }
  function onKey(e) {
    if ((e.key === 'Enter' || e.key === ',') && inputVal.trim()) { e.preventDefault(); addBlocker(inputVal); }
    else if (e.key === 'Backspace' && !inputVal && blockedBy.length) onChange(blockedBy.slice(0, -1));
  }
  function onKeyUp(e) { if (e.key === 'Enter' && inputVal.trim()) { e.preventDefault(); addBlocker(inputVal); } }

  return (
    <div style={{ position:'relative' }}>
      <div style={{ display:'flex', flexWrap:'wrap', gap:6, padding:'7px 10px', borderRadius:10, border:'1px solid '+B.sand, background:B.white, minHeight:42, alignItems:'center' }}>
        {blockedBy.map(num => (
          <span key={num} style={{ display:'inline-flex', alignItems:'center', gap:4, padding:'2px 8px', borderRadius:12, background:'#FEE8E8', color:B.red, fontSize:12, fontFamily:f1 }}>
            {num}
            <button onMouseDown={e => { e.preventDefault(); onChange(blockedBy.filter(x => x !== num)); }} aria-label={`Remove blocker ${num}`} style={{ border:'none', background:'none', color:B.red, cursor:'pointer', padding:'0 0 0 2px', fontSize:14, lineHeight:1 }}>×</button>
          </span>
        ))}
        <input value={inputVal} onChange={e => setInputVal(e.target.value)} onKeyDown={onKey} onKeyUp={onKeyUp} enterKeyHint="done" placeholder={blockedBy.length ? '' : 'Type TSK-###, press Enter...'} style={{ border:'none', outline:'none', fontSize:13, flex:1, minWidth:100, fontFamily:f2, color:B.textDark, background:'transparent' }}/>
      </div>
      {inputVal && suggestions.length > 0 && (
        <div style={{ position:'absolute', top:'100%', left:0, right:0, zIndex:200, background:B.white, border:'1px solid '+B.sand, borderRadius:10, boxShadow:'0 4px 16px rgba(27,42,74,0.1)', maxHeight:130, overflowY:'auto', marginTop:2 }}>
          {suggestions.map(t => (
            <div key={t._docId} onMouseDown={() => addBlocker(t.taskNumber)} style={{ padding:'8px 14px', cursor:'pointer', fontSize:13, fontFamily:f2, color:B.textDark }}
              onMouseEnter={e => e.currentTarget.style.background=B.warmGray}
              onMouseLeave={e => e.currentTarget.style.background=''}
            ><strong>{t.taskNumber}</strong> — {t.name}</div>
          ))}
        </div>
      )}
      {blockerError && <div style={{ fontSize:11, color:B.red, fontFamily:f1, marginTop:3 }}>{blockerError}</div>}
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
      <button key={label} type="button" onClick={onClick} style={{ padding:'5px 12px', borderRadius:20, border:'1px solid '+(selected ? B.teal : B.sand), background:selected ? B.tealPale : B.white, color:selected ? B.teal : B.textMid, fontSize:12, fontFamily:f1, cursor:'pointer', fontWeight:600 }}>
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

function RichTextarea({ value, onChange, style, placeholder, onKeyDown, label }) {
  const taRef = useRef();

  function getLineRange(selStart, selEnd) {
    const lines = value.split('\n');
    let pos = 0, startLine = 0, endLine = lines.length - 1, foundStart = false;
    for (let i = 0; i < lines.length; i++) {
      const end = pos + lines[i].length;
      if (!foundStart && selStart <= end) { startLine = i; foundStart = true; }
      if (foundStart && selEnd <= end) { endLine = i; break; }
      pos = end + 1;
    }
    return { lines, startLine, endLine };
  }

  function toggleBullet() {
    const el = taRef.current;
    const { lines, startLine, endLine } = getLineRange(el.selectionStart, el.selectionEnd);
    const slice = lines.slice(startLine, endLine + 1);
    const allHave = slice.every(l => l.startsWith('• '));
    onChange(lines.map((l, i) => {
      if (i < startLine || i > endLine) return l;
      const stripped = l.replace(/^\d+\.\s/, '').replace(/^• /, '');
      return allHave ? stripped : '• ' + stripped;
    }).join('\n'));
    setTimeout(() => el.focus(), 0);
  }

  function toggleNumbered() {
    const el = taRef.current;
    const { lines, startLine, endLine } = getLineRange(el.selectionStart, el.selectionEnd);
    const slice = lines.slice(startLine, endLine + 1);
    const allHave = slice.every(l => /^\d+\.\s/.test(l));
    let n = 1;
    onChange(lines.map((l, i) => {
      if (i < startLine || i > endLine) return l;
      const stripped = l.replace(/^\d+\.\s/, '').replace(/^• /, '');
      return allHave ? stripped : (n++) + '. ' + stripped;
    }).join('\n'));
    setTimeout(() => el.focus(), 0);
  }

  function handleKeyDown(e) {
    if (e.key === 'Enter') {
      const el = taRef.current;
      const pos = el.selectionStart;
      const textBefore = value.substring(0, pos);
      const lineStart = textBefore.lastIndexOf('\n') + 1;
      const currentLine = textBefore.substring(lineStart);
      const atLineEnd = pos === value.length || value[pos] === '\n';

      const numMatch = currentLine.match(/^(\d+)\. /);
      if (currentLine === '• ' && atLineEnd) {
        e.preventDefault();
        const newValue = value.substring(0, lineStart) + value.substring(pos);
        onChange(newValue);
        setTimeout(() => { el.selectionStart = el.selectionEnd = lineStart; }, 0);
        return;
      }
      if (currentLine.startsWith('• ')) {
        e.preventDefault();
        const insert = '\n• ';
        const newValue = value.substring(0, pos) + insert + value.substring(el.selectionEnd);
        onChange(newValue);
        setTimeout(() => { el.selectionStart = el.selectionEnd = pos + insert.length; }, 0);
        return;
      }
      if (numMatch && currentLine === numMatch[0] && atLineEnd) {
        e.preventDefault();
        const newValue = value.substring(0, lineStart) + value.substring(pos);
        onChange(newValue);
        setTimeout(() => { el.selectionStart = el.selectionEnd = lineStart; }, 0);
        return;
      }
      if (numMatch) {
        e.preventDefault();
        const insert = '\n' + (parseInt(numMatch[1]) + 1) + '. ';
        const newValue = value.substring(0, pos) + insert + value.substring(el.selectionEnd);
        onChange(newValue);
        setTimeout(() => { el.selectionStart = el.selectionEnd = pos + insert.length; }, 0);
        return;
      }
    }
    onKeyDown?.(e);
  }

  const tb = { padding:'3px 9px', borderRadius:6, border:'1px solid '+B.sand, background:B.warmGray, color:B.textMid, fontSize:12, fontFamily:f1, cursor:'pointer', fontWeight:600 };

  const buttons = (
    <>
      <button type="button" onMouseDown={e => { e.preventDefault(); toggleBullet(); }} style={tb}>• List</button>
      <button type="button" onMouseDown={e => { e.preventDefault(); toggleNumbered(); }} style={tb}>1. List</button>
    </>
  );

  return (
    <div style={label ? { marginBottom:16 } : {}}>
      {label ? (
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:5 }}>
          <label style={{ fontSize:12, fontWeight:600, color:B.textLight, textTransform:'uppercase', letterSpacing:.8, fontFamily:f1 }}>{label}</label>
          <div style={{ display:'flex', gap:4 }}>{buttons}</div>
        </div>
      ) : (
        <div style={{ display:'flex', gap:4, marginBottom:4 }}>{buttons}</div>
      )}
      <textarea ref={taRef} value={value} onChange={e => onChange(e.target.value)} style={style} placeholder={placeholder} onKeyDown={handleKeyDown}/>
    </div>
  );
}

function formatCommentDate(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d)) return '';
  const now = new Date();
  const diffMs = now - d;
  const diffMin = Math.floor(diffMs / 60000);
  if (diffMin < 1) return 'just now';
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffH = Math.floor(diffMin / 60);
  if (diffH < 24) return `${diffH}h ago`;
  const yesterday = new Date(now); yesterday.setDate(yesterday.getDate() - 1);
  if (d.toDateString() === yesterday.toDateString()) return 'Yesterday';
  return d.toLocaleDateString([], { month:'short', day:'numeric' });
}

function renderWithMentions(text) {
  if (!text || !text.includes('@')) return text;
  const parts = text.split(/(@[\w][\w\s]*?\b)/g);
  return parts.map((p, i) => p.startsWith('@') ? <span key={i} style={{ color:'#2A7D6E', fontWeight:700 }}>{p}</span> : p);
}

function CommentThread({ comments, loading, newComment, onChange, onPost, posting, userId, canOperate, onEdit, onDelete, users = [] }) {
  const endRef = useRef();
  const [editingId, setEditingId] = useState(null);
  const [editText, setEditText] = useState('');
  const [mentionOpen, setMentionOpen] = useState(false);
  useEffect(() => { if (comments.length) endRef.current?.scrollIntoView({ behavior:'smooth' }); }, [comments.length]);

  function startEdit(c) { setEditingId(c.id); setEditText(c.text); }
  function cancelEdit() { setEditingId(null); setEditText(''); }
  async function submitEdit(c) { await onEdit(c.id, editText); setEditingId(null); setEditText(''); }

  return (
    <div>
      <div style={{ maxHeight:200, overflowY:'auto', display:'flex', flexDirection:'column', gap:10, marginBottom:10, paddingRight:2 }}>
        {loading
          ? <div style={{ color:B.textLight, fontSize:13 }}>Loading...</div>
          : comments.length === 0
            ? <div style={{ color:B.textLight, fontSize:13 }}>No comments yet.</div>
            : comments.map(c => {
                const isOwn = c.authorId === userId;
                const canModify = isOwn || canOperate;
                return (
                  <div key={c.id} style={{ background: isOwn ? B.tealPale : B.warmGray, borderRadius:10, padding:'10px 14px', border: isOwn ? '1px solid '+B.tealLight : '1px solid transparent' }}>
                    <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:3, gap:6 }}>
                      <div style={{ display:'flex', alignItems:'center', gap:6 }}>
                        <span style={{ fontWeight:700, fontSize:13, color:B.navy, fontFamily:f1 }}>{c.authorName}</span>
                        {isOwn && <span style={{ fontSize:10, fontWeight:700, color:B.teal, fontFamily:f1, background:B.white, borderRadius:10, padding:'1px 6px' }}>You</span>}
                      </div>
                      <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                        <span style={{ fontSize:11, color:B.textLight }}>{formatCommentDate(c.createdAt)}{c.updatedAt ? ' · edited' : ''}</span>
                        {canModify && editingId !== c.id && (
                          <div style={{ display:'flex', gap:4 }}>
                            <button onClick={() => startEdit(c)} aria-label="Edit comment" style={{ border:'none', background:'none', cursor:'pointer', fontSize:14, color:B.textLight, padding:'6px 8px', minWidth:28, minHeight:28 }}>✏️</button>
                            <button onClick={() => onDelete(c.id)} aria-label="Delete comment" style={{ border:'none', background:'none', cursor:'pointer', fontSize:14, color:B.textLight, padding:'6px 8px', minWidth:28, minHeight:28 }}>🗑️</button>
                          </div>
                        )}
                      </div>
                    </div>
                    {editingId === c.id
                      ? (
                        <div style={{ display:'flex', flexDirection:'column', gap:6, marginTop:4 }}>
                          <textarea value={editText} onChange={e => setEditText(e.target.value)} style={{ ...inp, minHeight:60, resize:'vertical', width:'100%', boxSizing:'border-box' }} autoFocus/>
                          <div style={{ display:'flex', gap:6, justifyContent:'flex-end' }}>
                            <button onClick={cancelEdit} style={{ ...btnS, padding:'5px 12px', fontSize:12 }}>Cancel</button>
                            <button onClick={() => submitEdit(c)} disabled={!editText.trim()} style={{ ...btnP, padding:'5px 12px', fontSize:12, opacity:editText.trim() ? 1 : 0.5 }}>Save</button>
                          </div>
                        </div>
                      )
                      : <div style={{ fontSize:13, color:B.textDark, lineHeight:1.5, whiteSpace:'pre-wrap' }}>{renderWithMentions(c.text)}</div>
                    }
                  </div>
                );
              })
        }
        <div ref={endRef}/>
      </div>
      <div style={{ display:'flex', gap:8, alignItems:'flex-start' }}>
        <div style={{ flex:1, position:'relative' }}>
          <RichTextarea
            value={newComment}
            onChange={onChange}
            style={{ ...inp, minHeight:38, resize:'vertical', width:'100%', boxSizing:'border-box' }}
            placeholder="Add a comment... (Enter to post · Shift+Enter for new line)"
            onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey && newComment.trim()) { e.preventDefault(); onPost(); } else if (e.key === 'Escape') setMentionOpen(false); }}
          />
          {mentionOpen && users.filter(u => u.id !== userId).length > 0 && (
            <div style={{ position:'absolute', bottom:'100%', left:0, right:0, zIndex:200, background:'#fff', border:'1px solid #E8E0D5', borderRadius:10, boxShadow:'0 4px 16px rgba(27,42,74,0.1)', maxHeight:150, overflowY:'auto', marginBottom:2 }}>
              {users.filter(u => u.id !== userId).map(u => (
                <div key={u.id} onMouseDown={e => { e.preventDefault(); onChange(newComment + (newComment.length && !newComment.endsWith(' ') ? ' ' : '') + '@' + u.name + ' '); setMentionOpen(false); }} style={{ padding:'8px 14px', cursor:'pointer', fontSize:13, fontFamily:'Source Sans 3, sans-serif', color:'#1B2A4A' }}
                  onMouseEnter={e => e.currentTarget.style.background='#F7F4EF'}
                  onMouseLeave={e => e.currentTarget.style.background=''}
                >@{u.name}</div>
              ))}
            </div>
          )}
        </div>
        <div style={{ display:'flex', flexDirection:'column', gap:4, flexShrink:0 }}>
          <button onClick={onPost} disabled={posting || !newComment.trim()} style={{ ...btnP, padding:'11px 18px', opacity:(posting || !newComment.trim()) ? .5 : 1 }}>{posting ? 'Posting...' : 'Post'}</button>
          {users.filter(u => u.id !== userId).length > 0 && (
            <button type="button" onMouseDown={e => { e.preventDefault(); setMentionOpen(v => !v); }} style={{ ...btnS, padding:'6px 12px', fontSize:12, textAlign:'center' }}>@ Mention</button>
          )}
        </div>
      </div>
    </div>
  );
}

const KanbanColumn = memo(function KanbanColumn({ status, tasks, onTaskClick, onDrop, onReorder, onStatusChange, isMobile, tasksByParent, tasksByDocId, onQuickAdd }) {
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
              const subs = tasksByParent?.[t._docId] || [];
              const parentTask = t.parentTaskId ? tasksByDocId?.[t.parentTaskId] : null;
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
                  <TaskCard task={t} onClick={onTaskClick} onDragStart={onDrop || onReorder || undefined} onStatusChange={onStatusChange} isMobile={isMobile} subtaskCount={subs.length} subtaskDone={subs.filter(s=>s.status==='Complete').length} parentName={parentTask?.taskNumber ? parentTask.taskNumber + ' ' + parentTask.name : parentTask?.name}/>
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

// ── Task Calendar ─────────────────────────────────────────────────────────
const MONTH_NAMES = ['January','February','March','April','May','June','July','August','September','October','November','December'];
const DAY_NAMES = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];

const TaskChip = memo(function TaskChip({ task, todayStr, onTaskClick }) {
  const pc = priorityColors[task.priority] || priorityColors.Medium;
  const isOverdue = task.dueDate < todayStr && task.status !== 'Complete' && task.status !== 'Cancelled';
  return (
    <div onClick={e => { e.stopPropagation(); onTaskClick(task); }}
      style={{ display:'flex', alignItems:'center', gap:4, padding:'2px 5px', borderRadius:5, background:isOverdue ? '#FEE8E8' : pc.bg, borderLeft:'3px solid '+pc.dot, cursor:'pointer', marginBottom:2, overflow:'hidden' }}
      title={task.name}>
      <span style={{ fontSize:11, color:isOverdue ? B.red : pc.tx, fontWeight:600, fontFamily:f1, whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis', flex:1 }}>{task.name}</span>
      {task.recurrence && <span style={{ fontSize:10, flexShrink:0 }}>🔁</span>}
    </div>
  );
});

function TaskCalendar({ tasks, onTaskClick, isMobile }) {
  const now = new Date();
  const [viewYear, setViewYear] = useState(now.getFullYear());
  const [viewMonth, setViewMonth] = useState(now.getMonth());
  const [expandedDay, setExpandedDay] = useState(null);

  const tasksByDate = useMemo(() => {
    const map = new Map();
    tasks.forEach(t => {
      if (!t.dueDate) return;
      const key = t.dueDate.slice(0, 10);
      if (!map.has(key)) map.set(key, []);
      map.get(key).push(t);
    });
    return map;
  }, [tasks]);

  function prevMonth() { if (viewMonth === 0) { setViewYear(y => y - 1); setViewMonth(11); } else setViewMonth(m => m - 1); setExpandedDay(null); }
  function nextMonth() { if (viewMonth === 11) { setViewYear(y => y + 1); setViewMonth(0); } else setViewMonth(m => m + 1); setExpandedDay(null); }
  function goToday() { setViewYear(now.getFullYear()); setViewMonth(now.getMonth()); setExpandedDay(null); }

  const calendarDays = useMemo(() => {
    const firstDay = new Date(viewYear, viewMonth, 1).getDay();
    const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
    const daysInPrev = new Date(viewYear, viewMonth, 0).getDate();
    const days = [];
    for (let i = firstDay - 1; i >= 0; i--) days.push({ date: new Date(viewYear, viewMonth - 1, daysInPrev - i), isCurrentMonth: false });
    for (let d = 1; d <= daysInMonth; d++) days.push({ date: new Date(viewYear, viewMonth, d), isCurrentMonth: true });
    while (days.length % 7 !== 0) { const last = days[days.length - 1].date; days.push({ date: new Date(last.getFullYear(), last.getMonth(), last.getDate() + 1), isCurrentMonth: false }); }
    return days;
  }, [viewYear, viewMonth]);

  const todayStr = localDateStr(now);

  // Mobile: grouped vertical list
  if (isMobile) {
    const weekEnd = new Date(now); weekEnd.setDate(now.getDate() + 7);
    const monthEnd = new Date(now); monthEnd.setDate(now.getDate() + 30);
    const weekEndStr = localDateStr(weekEnd);
    const monthEndStr = localDateStr(monthEnd);
    const withDue = tasks.filter(t => t.dueDate).sort((a, b) => a.dueDate.localeCompare(b.dueDate));
    const groups = [
      { label:'Overdue', tasks: withDue.filter(t => t.dueDate < todayStr && t.status !== 'Complete' && t.status !== 'Cancelled') },
      { label:'This Week', tasks: withDue.filter(t => t.dueDate >= todayStr && t.dueDate <= weekEndStr) },
      { label:'Next 30 Days', tasks: withDue.filter(t => t.dueDate > weekEndStr && t.dueDate <= monthEndStr) },
      { label:'Later', tasks: withDue.filter(t => t.dueDate > monthEndStr) },
    ];
    return (
      <div>
        {groups.map(g => g.tasks.length > 0 && (
          <div key={g.label} style={{ marginBottom:20 }}>
            <div style={{ fontFamily:f1, fontWeight:700, fontSize:13, color:g.label==='Overdue' ? B.red : B.textMid, textTransform:'uppercase', letterSpacing:.8, marginBottom:8 }}>{g.label}</div>
            {g.tasks.map(t => (
              <div key={t._docId} onClick={() => onTaskClick(t)} style={{ display:'flex', alignItems:'center', gap:10, padding:'10px 14px', borderRadius:10, background:B.white, border:'1px solid '+B.sand, marginBottom:6, cursor:'pointer' }}>
                <span style={{ width:8, height:8, borderRadius:'50%', background:(priorityColors[t.priority]||priorityColors.Medium).dot, flexShrink:0 }}/>
                <div style={{ flex:1 }}>
                  <div style={{ fontSize:14, fontWeight:600, color:B.navy, fontFamily:f1 }}>{t.name}</div>
                  <div style={{ fontSize:12, color:B.textLight, marginTop:2 }}>{t.dueDate}{t.recurrence ? ' · 🔁' : ''}</div>
                </div>
              </div>
            ))}
          </div>
        ))}
        {tasks.filter(t => t.dueDate).length === 0 && <div style={{ textAlign:'center', color:B.textLight, fontSize:14, padding:32 }}>No tasks with due dates.</div>}
      </div>
    );
  }

  // Desktop: month grid
  return (
    <div>
      {/* Nav */}
      <div style={{ display:'flex', alignItems:'center', gap:12, marginBottom:16 }}>
        <button onClick={prevMonth} style={{ ...btnS, padding:'6px 12px', fontSize:16, lineHeight:1 }}>‹</button>
        <span style={{ fontFamily:f1, fontWeight:700, fontSize:18, color:B.navy, minWidth:200, textAlign:'center' }}>{MONTH_NAMES[viewMonth]} {viewYear}</span>
        <button onClick={nextMonth} style={{ ...btnS, padding:'6px 12px', fontSize:16, lineHeight:1 }}>›</button>
        <button onClick={goToday} style={{ ...btnS, padding:'6px 14px', fontSize:13, marginLeft:4 }}>Today</button>
        {(() => { const total = [...tasksByDate.values()].reduce((a, b) => a + b.length, 0); return (
          <span style={{ marginLeft:'auto', fontSize:13, color:B.textLight, fontFamily:f1 }}>{total} task{total !== 1 ? 's' : ''} with due dates</span>
        ); })()}
      </div>
      {/* Day headers */}
      <div style={{ display:'grid', gridTemplateColumns:'repeat(7, 1fr)', gap:2, marginBottom:2 }}>
        {DAY_NAMES.map(d => <div key={d} style={{ textAlign:'center', fontSize:12, fontWeight:700, color:B.textLight, fontFamily:f1, padding:'4px 0', textTransform:'uppercase', letterSpacing:.6 }}>{d}</div>)}
      </div>
      {/* Day cells */}
      <div style={{ display:'grid', gridTemplateColumns:'repeat(7, 1fr)', gap:2 }}>
        {calendarDays.map((day, idx) => {
          const ds = localDateStr(day.date);
          const dayTasks = tasksByDate.get(ds) || [];
          const isToday = ds === todayStr;
          const hasOverdue = dayTasks.some(t => ds < todayStr && t.status !== 'Complete' && t.status !== 'Cancelled');
          const isExpanded = expandedDay === ds;
          const CHIP_LIMIT = 3;
          const visible = dayTasks.slice(0, CHIP_LIMIT);
          const overflow = dayTasks.length - CHIP_LIMIT;
          return (
            <div key={idx}
              onClick={() => dayTasks.length > CHIP_LIMIT && setExpandedDay(isExpanded ? null : ds)}
              style={{ minHeight:88, background:day.isCurrentMonth ? B.white : '#F8F8FA', borderRadius:8, border:'1px solid '+(isToday ? B.teal : hasOverdue ? '#FECACA' : B.sand), padding:'5px 6px', position:'relative', cursor:dayTasks.length > CHIP_LIMIT ? 'pointer' : 'default', outline:isToday ? '2px solid '+B.teal : 'none', outlineOffset:'-1px' }}>
              <div style={{ fontSize:12, fontWeight:isToday ? 800 : 500, color:isToday ? B.teal : day.isCurrentMonth ? B.textDark : B.textLight, fontFamily:f1, marginBottom:3, textAlign:'right' }}>{day.date.getDate()}</div>
              {(isExpanded ? dayTasks : visible).map(t => <TaskChip key={t._docId} task={t} todayStr={todayStr} onTaskClick={onTaskClick}/>)}
              {!isExpanded && overflow > 0 && (
                <div style={{ fontSize:11, color:B.teal, fontWeight:700, fontFamily:f1, textAlign:'center', marginTop:2 }}>+{overflow} more</div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

const getEmptyTask = () => ({ name:'', description:'', priority:'Medium', tags:[], dueDate:'', recurrence:'', assignees:[], visibility:'team', sharedWith:[], notes:'', checklist:[], parentTaskId:null, blockedBy:[], linkedItemDocId:null, linkedTicketDocId:null, estimatedHours:null, actualHours:null, ministry:'' });

export function TasksPage({ store, userProfile }) {
  const { tasks, items, maintenanceTickets, users, settings, config, notificationConfig, loading, addTask, updateTask, deleteTask, addTaskComment, updateTaskComment, deleteTaskComment, addTaskTags, updateUser, taskTemplates, addTaskTemplate, deleteTaskTemplate, addJobListing, addTicket, deleteJobListing, deleteTicket } = store;
  const isMobile = useContext(MobileCtx);

  const userId = userProfile?.id || userProfile?.uid;
  const userName = userProfile?.name || 'Unknown';
  const churchId = userProfile?.churchId;
  const isAdmin = userProfile?.role === 'admin';
  const isManager = userProfile?.role === 'manager';
  const canOperate = isAdmin || isManager;

  const taskTags = settings?.taskTags || [];

  // ── Filter users to those with Tasks Hub access ──
  const taskHubUsers = useMemo(() =>
    (users || []).filter(u => {
      if (u.active === false) return false;
      if (u.role === 'admin') return true;
      const allowed = u.allowedHubs;
      if (allowed == null) return true;
      return allowed.includes('tasks');
    }),
  [users]);

  // Assignees for the filter dropdown: active users with Tasks Hub access, plus deactivated users
  // who appear on existing tasks (so tasks assigned to them remain filterable).
  const filterableAssignees = useMemo(() => {
    const fromTasks = (tasks || []).flatMap(t => t.assignees || []);
    const seen = new Set(taskHubUsers.map(u => u.id));
    const extra = fromTasks.filter(a => !seen.has(a.uid)).map(a => ({ id: a.uid, name: a.name }));
    return [...taskHubUsers, ...extra];
  }, [taskHubUsers, tasks]);

  // ── Visibility filter — applied before any rendering ──
  // Private/shared tasks are truly private: no admin override.
  const visibleTasks = useMemo(() => (tasks || []).filter(t => {
    if (t.visibility === 'team' || !t.visibility) return true;
    if (t.createdBy === userId) return true;
    if (t.assignees?.some(a => a.uid === userId)) return true;
    if (t.visibility === 'shared' && t.sharedWith?.some(s => s.uid === userId)) return true;
    return false;
  }), [tasks, userId]);

  // Declared early — referenced in the pruning useEffect below (TDZ guard per CLAUDE.md Known Pitfalls)
  const tasksByDocId = useMemo(() => {
    const map = {};
    visibleTasks.forEach(t => { map[t._docId] = t; });
    return map;
  }, [visibleTasks]);

  // ── State ──
  const [viewMode, setViewMode] = useState(() => localStorage.getItem('tasks_viewMode') || 'kanban');
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
  const [collapsedStatuses, setCollapsedStatuses] = useState(new Set());
  const [uploadingPhotos, setUploadingPhotos] = useState(false);

  // ── Task defaults (per-user, persisted to users/{uid}) ──
  const [taskDefaults, setTaskDefaults] = useState(() => ({
    visibility: userProfile?.taskDefaultVisibility || 'team',
    sharedWith: userProfile?.taskDefaultSharedWith || [],
  }));
  const [showDefaultsModal, setShowDefaultsModal] = useState(false);
  const [defaultsForm, setDefaultsForm] = useState(() => ({
    visibility: userProfile?.taskDefaultVisibility || 'team',
    sharedWith: userProfile?.taskDefaultSharedWith || [],
  }));
  const [savingDefaults, setSavingDefaults] = useState(false);

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

  // Convert / cross-hub
  const [showConvertToJobModal, setShowConvertToJobModal] = useState(false);
  const [convertJobForm, setConvertJobForm] = useState({ title:'', scheduledDate:'', location:'', spotsTotal:1 });
  const [convertJobSaving, setConvertJobSaving] = useState(false);
  const [showCreateTicketModal, setShowCreateTicketModal] = useState(false);
  const [createTicketSaving, setCreateTicketSaving] = useState(false);

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
      collection(db, 'churches', churchId, 'tasks', showDetail._docId, 'comments'),
      orderBy('createdAt', 'asc')
    );
    const unsub = onSnapshot(q, snap => {
      setComments(snap.docs.map(d => ({ id:d.id, ...d.data() })));
      setCommentsLoading(false);
    }, () => setCommentsLoading(false));
    return unsub;
  }, [showDetail?._docId, churchId]);

  // Task document real-time subscription — keeps detail modal in sync with concurrent edits
  useEffect(() => {
    if (!showDetail?._docId || !churchId) { setRemoteUpdate(null); return; }
    setRemoteUpdate(null);
    const initialRef = { current: true };
    const unsub = onSnapshot(
      doc(db, 'churches', churchId, 'tasks', showDetail._docId),
      snap => {
        if (!snap.exists()) {
          if (initialRef.current) { initialRef.current = false; return; }
          setShowDetail(null);
          flash('This task was deleted by another user.', true);
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
      }
    );
    return () => { unsub(); setRemoteUpdate(null); };
  }, [showDetail?._docId, churchId]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Dirty-state tracking ──
  const isDetailDirtyNow = useMemo(() => {
    const fields = ['name', 'description', 'status', 'priority', 'dueDate', 'recurrence', 'visibility', 'notes', 'parentTaskId'];
    if (fields.some(f => (detailEdits[f] ?? '') !== (detailSnapshot[f] ?? ''))) return true;
    if (JSON.stringify(detailEdits.tags) !== JSON.stringify(detailSnapshot.tags)) return true;
    if (JSON.stringify(detailEdits.assignees) !== JSON.stringify(detailSnapshot.assignees)) return true;
    if (JSON.stringify(detailEdits.sharedWith) !== JSON.stringify(detailSnapshot.sharedWith)) return true;
    if (JSON.stringify(detailEdits.checklist) !== JSON.stringify(detailSnapshot.checklist)) return true;
    if (JSON.stringify(detailEdits.blockedBy) !== JSON.stringify(detailSnapshot.blockedBy)) return true;
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
      parentTaskId: task.parentTaskId || null,
      blockedBy: task.blockedBy || [],
      linkedItemDocId: task.linkedItemDocId || null,
      linkedTicketDocId: task.linkedTicketDocId || null,
      estimatedHours: task.estimatedHours ?? null,
      actualHours: task.actualHours ?? null,
      ministry: task.ministry || '',
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

  function closeDetail() {
    if (isDetailDirtyNow && !window.confirm('You have unsaved changes. Close without saving?')) return;
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
        const sRef = storageRef(storage, `churches/${churchId}/tasks/${docId}/${Date.now()}_${file.name}`);
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
    const sourceRef = doc(db, 'churches', churchId, 'tasks', source._docId);
    let shouldCreate = false;
    await runTransaction(db, async (t) => {
      const snap = await t.get(sourceRef);
      if (!snap.exists() || snap.data().nextRecurrenceCreatedAt) return;
      shouldCreate = true;
      t.update(sourceRef, { nextRecurrenceCreatedAt: new Date().toISOString() });
    });
    if (!shouldCreate) return;
    const nextDue = calculateNextDue(source.dueDate, source.recurrence);
    try {
      await addTask({
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
        visibility: source.visibility || 'team',
        sharedWith: source.visibility === 'shared' ? (source.sharedWith || []) : [],
        parentTaskId: source.parentTaskId || null,
        blockedBy: source.blockedBy || [],
        completedAt: null,
      }, userId, userName);
    } catch (err) {
      // Roll back the marker so the user can retry by completing the task again
      await updateDoc(sourceRef, { nextRecurrenceCreatedAt: deleteField() });
      throw err;
    }
  }

  async function handleAddTask() {
    if (!taskForm.name.trim()) return;
    setSaving(true);
    try {
      const docId = await addTask({
        name: taskForm.name.trim(),
        description: taskForm.description.trim(),
        priority: taskForm.priority,
        status: 'Backlog',
        tags: taskForm.tags,
        dueDate: taskForm.dueDate || null,
        recurrence: taskForm.recurrence || null,
        assignees: taskForm.assignees,
        checklist: [],
        photos: [],
        notes: taskForm.notes || null,
        visibility: taskForm.visibility || 'team',
        sharedWith: taskForm.visibility === 'shared' ? taskForm.sharedWith : [],
        completedAt: null,
        linkedItemDocId: taskForm.linkedItemDocId || null,
        linkedTicketDocId: taskForm.linkedTicketDocId || null,
      }, userId, userName);
      if (photoFiles.length > 0 && docId) {
        try {
          const { urls, failed } = await uploadPhotos(docId, photoFiles);
          if (urls.length > 0) await updateTask(docId, { photos: urls });
          if (failed > 0) {
            if (urls.length === 0) flash('Photo upload failed — task saved without photos.', true);
            else flash(`Uploaded ${urls.length} of ${urls.length + failed} photos; ${failed} failed.`, true);
          }
        } catch { flash('Photo upload failed — task saved without photos.', true); }
      }
      if (canOperate && taskForm.tags.length > 0 && addTaskTags) {
        await addTaskTags(taskForm.tags);
      }
      setShowAdd(false);
      setTaskForm(getEmptyTask());
      setPhotoFiles([]);
      photoPreviews.forEach(u => URL.revokeObjectURL(u));
      setPhotoPreviews([]);
      flash('Task created!');
    } catch {
      flash('Failed to create task. Please try again.', true);
    } finally {
      setSaving(false);
    }
  }

  async function handleUpdateTask() {
    if (!showDetail) return;
    const wasComplete = showDetail.status === 'Complete';
    const isNowComplete = detailEdits.status === 'Complete';
    const blockers = detailEdits.blockedBy || [];
    if (!wasComplete && isNowComplete && blockers.length > 0) {
      if (!window.confirm(`This task is marked as blocked by ${blockers.join(', ')}. Mark it Complete anyway?`)) return;
    }
    setSaving(true);
    try {
      const updates = {
        ...detailEdits,
        recurrence: detailEdits.recurrence || null,
        sharedWith: detailEdits.visibility === 'shared' ? (detailEdits.sharedWith || []) : [],
        completedAt: isNowComplete && !wasComplete ? new Date().toISOString() : (isNowComplete ? showDetail.completedAt : null),
      };
      await updateTask(showDetail._docId, updates, userId, userName, showDetail.taskNumber);
      if (canOperate && detailEdits.tags?.length > 0 && addTaskTags) {
        await addTaskTags(detailEdits.tags);
      }

      // Email newly added assignees
      const oldAssigneeUids = new Set((showDetail.assignees || []).map(a => a.uid));
      const newlyAdded = (detailEdits.assignees || []).filter(a => a.uid !== userId && !oldAssigneeUids.has(a.uid));
      if (newlyAdded.length > 0 && notificationConfig?.enabled) {
        const fn = httpsCallable(getFunctions(), 'sendTicketAssignedEmail');
        for (const assignee of newlyAdded) {
          const assigneeUser = users.find(u => u.id === assignee.uid);
          if (!assigneeUser?.email) continue;
          fn({ toEmail: assigneeUser.email, toName: assignee.name, churchName: config?.churchName || '', ticketNumber: showDetail.taskNumber, ticketName: detailEdits.name, assignedBy: userName }).catch(err => { console.error('[ChurchOpsHub] CF sendTicketAssignedEmail failed', err); });
        }
      }

      // Auto-create next recurring task on completion
      if (isNowComplete && !wasComplete && detailEdits.recurrence) {
        await createNextRecurringTask(detailEdits);
      }

      setShowDetail(null);
      setDetailEdits({});
      setDetailSnapshot({});
      setDetailChecklistInput('');
      flash(isNowComplete && !wasComplete && detailEdits.recurrence ? 'Task completed — next recurring task created!' : 'Task updated!');
    } catch {
      flash('Failed to update task. Please try again.', true);
    } finally {
      setSaving(false);
    }
  }

  async function handlePostComment() {
    if (!newComment.trim() || !showDetail?._docId) return;
    setPostingComment(true);
    try {
      const text = newComment.trim();
      const mentions = taskHubUsers
        .filter(u => u.id !== userId && text.includes('@' + u.name))
        .map(u => u.id);
      await addTaskComment(showDetail._docId, text, userId, userName, mentions.length ? mentions : undefined);
      if (mentions.length > 0 && notificationConfig?.enabled) {
        const fn = httpsCallable(getFunctions(), 'sendTaskMentionEmail');
        fn({ churchId, taskNumber: showDetail.taskNumber, taskName: showDetail.name || '', commentText: text, mentionedUids: mentions, commentAuthorName: userName }).catch(err => { console.error('[ChurchOpsHub] CF sendTaskMentionEmail failed', err); });
      }
      setNewComment('');
    } catch { flash('Failed to post comment.', true); }
    finally { setPostingComment(false); }
  }

  async function handleEditComment(commentId, text) {
    if (!showDetail?._docId || !text.trim()) return;
    try {
      await updateTaskComment(showDetail._docId, commentId, text.trim());
    } catch { flash('Failed to update comment.', true); }
  }

  async function handleDeleteComment(commentId) {
    if (!showDetail?._docId) return;
    if (!window.confirm('Delete this comment?')) return;
    try {
      await deleteTaskComment(showDetail._docId, commentId);
    } catch { flash('Failed to delete comment.', true); }
  }

  async function handleDetailPhotoAdd(files) {
    if (!showDetail?._docId) return;
    setUploadingPhotos(true);
    try {
      const { urls: newUrls, failed } = await uploadPhotos(showDetail._docId, files);
      if (newUrls.length > 0) {
        const updatedPhotos = [...(showDetail.photos || []), ...newUrls];
        await updateTask(showDetail._docId, { photos: updatedPhotos });
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
    if (!window.confirm('Remove this photo?')) return;
    const photoUrl = (showDetail.photos || [])[index];
    const updatedPhotos = (showDetail.photos || []).filter((_, i) => i !== index);
    setUploadingPhotos(true);
    try {
      if (photoUrl) {
        try { await deleteObject(storageRef(storage, photoUrl)); } catch { /* storage object may already be gone */ }
      }
      await updateTask(showDetail._docId, { photos: updatedPhotos });
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
    if (newStatus === 'Complete' && task.blockedBy?.length > 0) {
      if (!window.confirm(`"${task.name}" is blocked by ${task.blockedBy.join(', ')}. Mark it Complete anyway?`)) return;
    }
    if (newStatus === 'Complete' || newStatus === 'Cancelled') {
      const extra = newStatus === 'Complete' && task.recurrence ? ' A new recurring task will be created.' : '';
      if (!window.confirm(`Move "${task.name}" to ${newStatus}?${extra}`)) return;
    }
    const wasComplete = task.status === 'Complete';
    const isNowComplete = newStatus === 'Complete';
    await updateTask(docId, {
      status: newStatus,
      completedAt: isNowComplete && !wasComplete ? new Date().toISOString() : (isNowComplete ? task.completedAt : null),
    }, userId, userName, task.taskNumber);
    if (isNowComplete && !wasComplete && task.recurrence) {
      await createNextRecurringTask(task);
      flash('Task completed — next recurring task created!');
    }
  }

  async function handleChecklistUpdate(cl, prevCl) {
    try {
      await updateTask(showDetail._docId, { checklist: cl });
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
    const subtasks = (tasks || []).filter(t => t.parentTaskId === showDetail._docId);
    const confirmMsg = subtasks.length > 0
      ? `Delete "${showDetail.name}" and its ${subtasks.length} subtask${subtasks.length !== 1 ? 's' : ''}? This cannot be undone.`
      : `Delete "${showDetail.name}"? This cannot be undone.`;
    if (!window.confirm(confirmMsg)) return;
    setSaving(true);
    try {
      const subtaskResults = await Promise.allSettled(subtasks.map(st => deleteTask(st._docId, st, userId, userName)));
      const subtaskFailed = subtaskResults.filter(r => r.status === 'rejected').length;
      const deletedTaskNumber = showDetail.taskNumber;
      await deleteTask(showDetail._docId, showDetail, userId, userName);
      let blockedFailed = 0;
      if (deletedTaskNumber) {
        const blockedSnap = await getDocs(
          fsQuery(collection(db, 'churches', churchId, 'tasks'), where('blockedBy', 'array-contains', deletedTaskNumber))
        );
        const blockedResults = await Promise.allSettled(blockedSnap.docs.map(d => updateDoc(d.ref, { blockedBy: arrayRemove(deletedTaskNumber) })));
        blockedFailed = blockedResults.filter(r => r.status === 'rejected').length;
      }
      setShowDetail(null);
      setDetailEdits({});
      if (subtaskFailed === 0 && blockedFailed === 0) {
        flash('Task deleted.');
      } else {
        const parts = [];
        if (subtaskFailed > 0) parts.push(`${subtaskFailed} subtask${subtaskFailed !== 1 ? 's' : ''}`);
        if (blockedFailed > 0) parts.push(`${blockedFailed} dependent task${blockedFailed !== 1 ? 's' : ''}`);
        flash(`Task deleted. Cleanup of ${parts.join(' and ')} failed — refresh to verify.`, true);
      }
    } catch {
      flash('Failed to delete task.', true);
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
    const topLevel = sortedTasks.filter(t => !subtaskDocIds.has(t._docId));
    setSelectedTaskIds(new Set(topLevel.map(t => t._docId)));
  }

  function clearSelection() { setSelectedTaskIds(new Set()); setBulkStatus(''); setBulkAssigneeId(''); }

  async function handleBulkStatusChange() {
    if (!bulkStatus || selectedTaskIds.size === 0) return;
    const tasksToUpdate = [...selectedTaskIds].map(docId => tasksByDocId[docId]).filter(Boolean);
    if (bulkStatus === 'Complete') {
      const blocked = tasksToUpdate.filter(t => (t.blockedBy || []).length > 0 && t.status !== 'Complete' && t.status !== 'Cancelled');
      if (blocked.length > 0 && !window.confirm(`${blocked.length} selected task${blocked.length !== 1 ? 's' : ''} ha${blocked.length !== 1 ? 've' : 's'} open dependencies. Mark complete anyway?`)) return;
    }
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
    if (!window.confirm(`Delete ${selectedTaskIds.size} task${selectedTaskIds.size !== 1 ? 's' : ''}? This cannot be undone.`)) return;
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
      updateDoc(doc(db, 'churches', churchId, 'tasks', t._docId), { sortOrder: i })
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
        assignees: [],
        checklist: [],
        photos: [],
        notes: null,
        visibility: taskDefaults.visibility || 'team',
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
      const completed = visibleTasks.filter(t => t.completedAt && t.completedAt.slice(0,10) >= startStr && t.completedAt.slice(0,10) <= endStr).length;
      const created = visibleTasks.filter(t => t.createdAt && t.createdAt.slice(0,10) >= startStr && t.createdAt.slice(0,10) <= endStr).length;
      return { week: weekStart.toLocaleDateString('en-US', { month:'short', day:'numeric' }), completed, created };
    });
  }, [visibleTasks, canOperate]);

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

  // ── Cross-hub: Create maintenance ticket from task ──
  async function handleCreateTicket() {
    if (!showDetail) return;
    setCreateTicketSaving(true);
    let ticketDocId = null;
    try {
      ticketDocId = await addTicket({
        name: showDetail.name,
        description: showDetail.description || '',
        priority: showDetail.priority || 'Medium',
        linkedTaskDocId: showDetail._docId,
      }, userId, userName);
      try {
        await updateTask(showDetail._docId, { linkedTicketDocId: ticketDocId }, userId, userName, showDetail.taskNumber);
      } catch (linkErr) {
        try {
          await deleteTicket(ticketDocId);
          flash('Failed to link the new ticket — rolled back.', true);
        } catch {
          flash(`Failed to link the new ticket. Orphaned ticket ${ticketDocId.slice(0,8)}… needs manual cleanup.`, true);
        }
        throw linkErr;
      }
      setDetailEdits(d => ({ ...d, linkedTicketDocId: ticketDocId }));
      setShowDetail(prev => ({ ...prev, linkedTicketDocId: ticketDocId }));
      setShowCreateTicketModal(false);
      flash('Maintenance ticket created and linked.');
    } catch {
      if (!ticketDocId) flash('Failed to create ticket.', true);
    }
    setCreateTicketSaving(false);
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
      if (search && !t.name?.toLowerCase().includes(search) && !t.description?.toLowerCase().includes(search) && !t.tags?.some(tag => tag.includes(search)) && !t.taskNumber?.toLowerCase().includes(search)) return false;
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

  // Subtask support
  const tasksByParent = useMemo(() => {
    const map = {};
    sortedTasks.forEach(t => {
      if (t.parentTaskId) {
        if (!map[t.parentTaskId]) map[t.parentTaskId] = [];
        map[t.parentTaskId].push(t);
      }
    });
    return map;
  }, [sortedTasks]);

  // Subtask docIds that have a visible parent (used to hide them from top-level list view)
  const subtaskDocIds = useMemo(() => {
    const ids = new Set();
    sortedTasks.forEach(t => { if (t.parentTaskId && tasksByDocId[t.parentTaskId]) ids.add(t._docId); });
    return ids;
  }, [sortedTasks, tasksByDocId]);

  // Whether current user can edit visibility on the detail task
  const canEditVisibility = showDetail && (showDetail.createdBy === userId || canOperate);

  // ── Render ──
  return (
    <div>
      {/* Header */}
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:20, flexWrap:'wrap', gap:12 }}>
        <div>
          <h2 style={{ fontFamily:f1, fontSize:22, fontWeight:700, color:B.navy, margin:'0 0 2px' }}>Tasks Hub</h2>
          <p style={{ color:B.textLight, fontSize:13, margin:0 }}>Track and manage church admin tasks</p>
        </div>
        <button onClick={() => { setTaskForm({ ...getEmptyTask(), visibility: taskDefaults.visibility, sharedWith: [...taskDefaults.sharedWith] }); setPhotoFiles([]); setPhotoPreviews([]); setShowAdd(true); }} style={btnP}>
          + New Task
        </button>
      </div>

      {/* Stats */}
      <div style={{ display:'flex', flexWrap:'wrap', gap:10, marginBottom:20 }}>
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
      </div>

      {msg && (
        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', background:msg.isError ? B.redPale : B.tealPale, border:'1px solid '+(msg.isError ? '#FECACA' : B.teal), borderRadius:10, padding:'10px 16px', marginBottom:16, color:msg.isError ? B.red : B.teal, fontWeight:600, fontSize:13, fontFamily:f1 }}><span>{msg.text}</span><button onClick={()=>setMsg(null)} style={{ border:'none', background:'none', cursor:'pointer', color:'inherit', fontSize:16, lineHeight:1, marginLeft:8, padding:'0 2px', fontWeight:700 }}>&times;</button></div>
      )}

      {/* Filter Bar */}
      <div style={{ display:'flex', gap:8, marginBottom:12, flexWrap:'wrap', alignItems:'center' }}>
        <input
          style={{ ...inp, flex:1, minWidth:160, maxWidth:280 }}
          placeholder="Search tasks..."
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
          My tasks
        </button>
        {(settings?.ministries || []).length > 0 && (
          <select style={{ ...inp, width:'auto', cursor:'pointer' }} value={filterMinistry} onChange={e => setFilterMinistry(e.target.value)}>
            <option value="">All ministries</option>
            {(settings.ministries || []).map(m => <option key={m} value={m}>{m}</option>)}
          </select>
        )}
        {(filterSearch || filterPriority || filterStatus || filterAssignee || filterMyTasks || filterMinistry) && (
          <>
            <button type="button" onClick={() => { setFilterSearch(''); setFilterPriority(''); setFilterStatus(''); setFilterAssignee(''); setFilterMyTasks(false); setFilterMinistry(''); }} style={{ padding:'9px 12px', borderRadius:10, border:'1px solid '+B.sand, background:B.white, color:B.textMid, fontSize:13, cursor:'pointer' }}>Clear</button>
            <button type="button" onClick={handleSaveView} title="Save current filters as a named view" style={{ padding:'9px 12px', borderRadius:10, border:'1px solid '+B.sand, background:B.white, color:B.teal, fontSize:13, cursor:'pointer' }}>Save View</button>
          </>
        )}
      </div>
      {savedFilters.length > 0 && (
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
          {[['kanban', 'Kanban'], ['list', 'List'], ['calendar', 'Calendar'], ...(canOperate ? [['insights', 'Insights']] : [])].map(([mode, label]) => (
            <button key={mode} onClick={() => switchViewMode(mode)} style={{ padding:'7px 18px', borderRadius:8, border:'none', background:viewMode===mode ? B.white : 'transparent', color:viewMode===mode ? B.navy : B.textMid, fontWeight:viewMode===mode ? 700 : 500, fontSize:13, fontFamily:f1, cursor:'pointer', boxShadow:viewMode===mode ? '0 1px 3px rgba(27,42,74,0.1)' : 'none', transition:'all 0.15s' }}>
              {label}
            </button>
          ))}
        </div>
        <div style={{ display:'flex', alignItems:'center', gap:6, marginLeft:4 }}>
          <span style={{ fontSize:12, color:B.textLight, fontFamily:f1, fontWeight:600, textTransform:'uppercase', letterSpacing:.6, whiteSpace:'nowrap' }}>Sort:</span>
          <select style={{ ...inp, width:'auto', cursor:'pointer', fontSize:13, padding:'7px 12px' }} value={sortBy} onChange={e => { setSortBy(e.target.value); localStorage.setItem('tasks_sortBy', e.target.value); }}>
            <option value="createdDesc">Newest first</option>
            <option value="createdAsc">Oldest first</option>
            <option value="priority">Priority</option>
            <option value="dueDate">Due date</option>
          </select>
        </div>
        <button
          type="button"
          onClick={() => { setDefaultsForm({ visibility: userProfile?.taskDefaultVisibility || 'team', sharedWith: userProfile?.taskDefaultSharedWith || [] }); setShowDefaultsModal(true); }}
          style={{ padding:'7px 14px', borderRadius:10, border:'1px solid '+B.sand, background:B.white, color:B.textMid, fontSize:13, fontFamily:f1, cursor:'pointer', fontWeight:500, display:'flex', alignItems:'center', gap:5 }}
        >
          ⚙ Defaults
        </button>
        <button
          type="button"
          onClick={() => exportTasksCSV(filteredTasks)}
          title="Export visible tasks to CSV"
          style={{ padding:'7px 14px', borderRadius:10, border:'1px solid '+B.sand, background:B.white, color:B.textMid, fontSize:13, fontFamily:f1, cursor:'pointer', fontWeight:500 }}
        >
          Export CSV
        </button>
        <button
          type="button"
          onClick={() => exportTasksICS(filteredTasks.filter(t => t.dueDate), config?.churchName || '')}
          title="Export tasks with due dates to iCal (.ics)"
          style={{ padding:'7px 14px', borderRadius:10, border:'1px solid '+B.sand, background:B.white, color:B.textMid, fontSize:13, fontFamily:f1, cursor:'pointer', fontWeight:500 }}
        >
          Export ICS
        </button>
        <span style={{ color:B.textLight, fontSize:13, marginLeft:'auto' }}>
          {filteredTasks.length}{filteredTasks.length !== visibleTasks.length ? ` of ${visibleTasks.length}` : ''} task{visibleTasks.length !== 1 ? 's' : ''}
        </span>
      </div>

      {/* Empty state — loading */}
      {visibleTasks.length === 0 && loading && (
        <div style={{ background:B.white, borderRadius:18, padding:'48px 32px', border:'1px solid '+B.sand, textAlign:'center' }}>
          <Spinner/>
        </div>
      )}

      {/* Empty state — no tasks at all */}
      {visibleTasks.length === 0 && !loading && (
        <div style={{ background:B.white, borderRadius:18, padding:'48px 32px', border:'1px solid '+B.sand, textAlign:'center' }}>
          <div style={{ fontSize:48, marginBottom:16 }}>✅</div>
          <h3 style={{ fontFamily:f1, color:B.navy, margin:'0 0 8px', fontSize:18 }}>No tasks yet</h3>
          <p style={{ color:B.textLight, fontSize:14 }}>Create a task to start tracking your church admin work.</p>
        </div>
      )}

      {/* Empty state — My Tasks filter active but no assigned tasks */}
      {filterMyTasks && filteredTasks.length === 0 && visibleTasks.length > 0 && (
        <div style={{ background:B.white, borderRadius:14, padding:'32px 24px', border:'1px solid '+B.sand, textAlign:'center', marginBottom:16 }}>
          <div style={{ fontSize:36, marginBottom:12 }}>👤</div>
          <h3 style={{ fontFamily:f1, color:B.navy, margin:'0 0 6px', fontSize:16 }}>No tasks assigned to you</h3>
          <p style={{ color:B.textLight, fontSize:13, margin:'0 0 12px' }}>Open any task and click <strong>Me</strong> in the Assignees field, then save to assign yourself.</p>
          <button type="button" onClick={() => setFilterMyTasks(false)} style={{ padding:'8px 18px', borderRadius:10, border:'1px solid '+B.sand, background:B.white, color:B.teal, fontSize:13, fontFamily:f1, cursor:'pointer', fontWeight:600 }}>
            Show all tasks
          </button>
        </div>
      )}

      {/* Kanban View */}
      {viewMode === 'kanban' && visibleTasks.length > 0 && (
        <div style={{ display:'flex', gap:12, overflowX:isMobile ? 'hidden' : 'auto', flexDirection:isMobile ? 'column' : 'row', paddingBottom:8, alignItems:'flex-start' }}>
          {STATUSES.map(status => (
            <KanbanColumn key={status} status={status} tasks={tasksByStatus[status]} onTaskClick={openDetail} onDrop={docId => handleDrop(docId, status)} onReorder={(from, to) => handleReorder(from, to, status)} onStatusChange={(task, newStatus) => handleDrop(task._docId, newStatus)} isMobile={isMobile} tasksByParent={tasksByParent} tasksByDocId={tasksByDocId} onQuickAdd={name => handleQuickAddTask(name, status)}/>
          ))}
        </div>
      )}

      {/* List View */}
      {viewMode === 'list' && visibleTasks.length > 0 && (
        <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
          {/* Bulk action bar */}
          {selectedTaskIds.size > 0 && (
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
                    {statusTasks.filter(t => !subtaskDocIds.has(t._docId)).length === 0
                      ? <div style={{ color:B.textLight, fontSize:13, textAlign:'center', padding:'12px 0' }}>No tasks in {status}</div>
                      : statusTasks.filter(t => !subtaskDocIds.has(t._docId)).map(t => {
                          const subs = tasksByParent[t._docId] || [];
                          const isSelected = selectedTaskIds.has(t._docId);
                          return (
                            <div key={t._docId} style={{ display:'flex', alignItems:'flex-start', gap:8 }}>
                              <input type="checkbox" checked={isSelected} onChange={() => toggleSelectTask(t._docId)} onClick={e => e.stopPropagation()} style={{ marginTop:18, width:15, height:15, cursor:'pointer', flexShrink:0 }} aria-label={`Select task ${t.name}`}/>
                              <div style={{ flex:1, minWidth:0 }}>
                                <TaskCard task={t} onClick={openDetail} subtaskCount={subs.length} subtaskDone={subs.filter(s=>s.status==='Complete').length}/>
                                {subs.length > 0 && (
                                  <div style={{ marginLeft:20, borderLeft:'2px solid '+B.sand, paddingLeft:8, marginBottom:4 }}>
                                    {subs.map(sub => (
                                      <TaskCard key={sub._docId} task={sub} onClick={openDetail} parentName={t.taskNumber ? t.taskNumber : t.name}/>
                                    ))}
                                  </div>
                                )}
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
        <TaskCalendar tasks={filteredTasks} onTaskClick={openDetail} isMobile={isMobile}/>
      )}

      {/* Insights View */}
      {viewMode === 'insights' && canOperate && (
        <div style={{ display:'flex', flexDirection:'column', gap:20 }}>
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
              const c90 = visibleTasks.filter(t => t.completedAt && t.completedAt.slice(0,10) >= s90).length;
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

      {/* ═══ ADD TASK MODAL ═══ */}
      <Modal open={showAdd} onClose={() => { setShowAdd(false); setTaskForm(getEmptyTask()); setPhotoFiles([]); photoPreviews.forEach(u => URL.revokeObjectURL(u)); setPhotoPreviews([]); }} title="New Task" wide>
        {(taskTemplates || []).length > 0 && (
          <div style={{ marginBottom:14 }}>
            <button type="button" onClick={() => setShowTemplates(true)} style={{ ...btnS, fontSize:13, padding:'7px 14px' }}>
              From Template
            </button>
          </div>
        )}
        <FF label="Task Name *">
          <input style={inp} value={taskForm.name} onChange={e => setTaskForm(f => ({ ...f, name:e.target.value }))} placeholder="Short descriptive name..."/>
        </FF>
        <RichTextarea label="Description" style={{ ...inp, minHeight:72, resize:'vertical' }} value={taskForm.description} onChange={v => setTaskForm(f => ({ ...f, description:v }))} placeholder="What needs to be done — scope, context, and acceptance criteria"/>
        <div style={{ display:'grid', gridTemplateColumns:isMobile ? '1fr 1fr' : '1fr 1fr 1fr', gap:12 }}>
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
          </div>
        </div>
        <FF label="Tags">
          <TagInput tags={taskForm.tags} onChange={tags => setTaskForm(f => ({ ...f, tags }))} suggestions={taskTags}/>
        </FF>
        <div style={{ display:'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap:12 }}>
          <FF label="Assignees">
            <AssigneeSelect assignees={taskForm.assignees} onChange={assignees => setTaskForm(f => ({ ...f, assignees }))} users={taskHubUsers} currentUserId={userId} currentUserName={userName}/>
          </FF>
          <FF label="Visibility">
            <VisibilitySelect visibility={taskForm.visibility} onChange={v => setTaskForm(f => ({ ...f, visibility:v, sharedWith: v !== 'shared' ? [] : f.sharedWith })) } canEdit={true}/>
          </FF>
        </div>
        {taskForm.visibility === 'shared' && (
          <FF label="Share With">
            <SharedWithSelect sharedWith={taskForm.sharedWith} onChange={sharedWith => setTaskForm(f => ({ ...f, sharedWith }))} users={taskHubUsers} assignees={taskForm.assignees} currentUserId={userId}/>
          </FF>
        )}
        <FF label="Parent Task (optional)">
          <select style={{ ...inp, cursor:'pointer' }} value={taskForm.parentTaskId || ''} onChange={e => setTaskForm(f => ({ ...f, parentTaskId: e.target.value || null }))}>
            <option value="">— None (top-level task) —</option>
            {(visibleTasks).filter(t => !t.parentTaskId && t.status !== 'Complete' && t.status !== 'Cancelled').map(t => (
              <option key={t._docId} value={t._docId}>{t.taskNumber ? t.taskNumber + ' — ' : ''}{t.name}</option>
            ))}
          </select>
        </FF>
        <FF label="Blocked By (optional)">
          <BlockedByInput blockedBy={taskForm.blockedBy || []} onChange={blockedBy => setTaskForm(f => ({ ...f, blockedBy }))} tasks={visibleTasks}/>
        </FF>
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
              {(maintenanceTickets || []).filter(t => t.status !== 'Closed').sort((a,b) => (a.ticketNumber||'').localeCompare(b.ticketNumber||'')).map(t => (
                <option key={t._docId} value={t._docId}>{t.ticketNumber}{t.title ? ' — '+t.title.slice(0,40) : ''}</option>
              ))}
            </select>
          </FF>
        </div>
        <FF label="Photos">
          <PhotoGrid photos={photoPreviews} onAdd={handlePhotoSelect} onRemove={handlePreviewRemove} uploading={false}/>
        </FF>
        <RichTextarea label="Notes" style={{ ...inp, minHeight:52, resize:'vertical' }} value={taskForm.notes} onChange={v => setTaskForm(f => ({ ...f, notes:v }))} placeholder="Follow-up reminders, reference links, or working notes"/>
        <button onClick={handleAddTask} disabled={saving || !taskForm.name.trim()} style={{ ...btnP, width:'100%', opacity:(saving || !taskForm.name.trim()) ? .5 : 1, marginTop:4 }}>
          {saving ? 'Creating...' : 'Create Task'}
        </button>
      </Modal>

      {/* ═══ TASK DETAIL MODAL ═══ */}
      <Modal open={!!showDetail} onClose={closeDetail} title={(showDetail?.taskNumber || '') + (showDetail?.name ? ' — ' + showDetail.name.slice(0, 40) : '')} wide>
        {showDetail && (
          <div>
            {remoteUpdate && (
              <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', gap:12, padding:'10px 14px', borderRadius:8, background:'#FEF3E8', border:'1px solid #F59E42', marginBottom:14 }}>
                <span style={{ fontSize:13, color:'#7A4A10', fontFamily:f2 }}>This task was updated by another team member.</span>
                <div style={{ display:'flex', gap:8, flexShrink:0 }}>
                  <button type="button" style={{ ...btnP, padding:'4px 12px', fontSize:12 }} onClick={() => { if (isDetailDirtyNow && !window.confirm('Reload will discard your unsaved changes. Continue?')) return; openDetail(remoteUpdate); }}>Reload</button>
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
                <select style={{ ...inp, cursor:'pointer' }} value={detailEdits.recurrence} onChange={e => setDetailEdits(d => ({ ...d, recurrence:e.target.value }))}>
                  {RECURRENCE_OPTIONS.map(([val, label]) => <option key={val} value={val}>{label}</option>)}
                </select>
              </FF>
            </div>
            <FF label="Tags">
              <TagInput tags={detailEdits.tags || []} onChange={tags => setDetailEdits(d => ({ ...d, tags }))} suggestions={taskTags}/>
            </FF>
            <div style={{ display:'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap:12 }}>
              <FF label="Assignees">
                <AssigneeSelect assignees={detailEdits.assignees || []} onChange={assignees => setDetailEdits(d => ({ ...d, assignees }))} users={taskHubUsers} currentUserId={userId} currentUserName={userName}/>
              </FF>
              <FF label="Visibility">
                <VisibilitySelect
                  visibility={detailEdits.visibility || 'team'}
                  onChange={v => setDetailEdits(d => ({ ...d, visibility:v, sharedWith: v !== 'shared' ? [] : d.sharedWith }))}
                  canEdit={canEditVisibility}
                />
              </FF>
            </div>
            {detailEdits.visibility === 'shared' && canEditVisibility && (
              <FF label="Share With">
                <SharedWithSelect sharedWith={detailEdits.sharedWith || []} onChange={sharedWith => setDetailEdits(d => ({ ...d, sharedWith }))} users={taskHubUsers} assignees={detailEdits.assignees || []} currentUserId={userId}/>
              </FF>
            )}
            <FF label="Blocked By (optional)">
              <BlockedByInput blockedBy={detailEdits.blockedBy || []} onChange={blockedBy => setDetailEdits(d => ({ ...d, blockedBy }))} tasks={visibleTasks} currentTaskNumber={showDetail.taskNumber}/>
            </FF>
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
                  {(maintenanceTickets || []).filter(t => t.status !== 'Closed').sort((a,b) => (a.ticketNumber||'').localeCompare(b.ticketNumber||'')).map(t => (
                    <option key={t._docId} value={t._docId}>{t.ticketNumber}{t.title ? ' — '+t.title.slice(0,40) : ''}</option>
                  ))}
                </select>
              </FF>
            </div>
            <RichTextarea label="Notes" style={{ ...inp, minHeight:52, resize:'vertical' }} value={detailEdits.notes} onChange={v => setDetailEdits(d => ({ ...d, notes:v }))} placeholder="Follow-up reminders, reference links, or working notes"/>
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
                Created by <strong>{showDetail.createdByName}</strong> on {showDetail.createdAt?.split('T')[0]}
                {showDetail.completedAt && <> · Completed {showDetail.completedAt.split('T')[0]}</>}
              </div>
              <div style={{ display:'flex', gap:8, flexWrap:'wrap' }}>
                {(canOperate || showDetail.createdBy === userId) && <button onClick={handleDeleteTask} disabled={saving} style={{ ...btnD, fontSize:13, padding:'9px 14px', opacity:saving ? 0.5 : 1 }}>Delete</button>}
                {canOperate && <button onClick={handleOpenSaveTemplate} style={{ ...btnS, fontSize:13, padding:'9px 14px' }}>Save as Template</button>}
                {canOperate && !showDetail.linkedJobDocId && <button onClick={openConvertToJob} style={{ ...btnS, fontSize:13, padding:'9px 14px' }}>→ Job</button>}
                {canOperate && !showDetail.linkedTicketDocId && <button onClick={() => setShowCreateTicketModal(true)} style={{ ...btnS, fontSize:13, padding:'9px 14px' }}>→ Ticket</button>}
                <button onClick={closeDetail} style={btnS}>Cancel</button>
                <button onClick={handleUpdateTask} disabled={saving || !detailEdits.name?.trim()} style={{ ...btnP, opacity:(saving || !detailEdits.name?.trim()) ? .5 : 1 }}>
                  {saving ? 'Saving...' : 'Save Changes'}
                </button>
              </div>
            </div>

            {/* Linked job chip */}
            {showDetail.linkedJobDocId && (
              <div style={{ marginBottom:12, padding:'8px 12px', borderRadius:8, background:'#EDF2FF', border:'1px solid #C7D2FE', display:'flex', alignItems:'center', gap:8 }}>
                <span style={{ fontSize:12, color:'#3730A3', fontFamily:f1, fontWeight:600 }}>💼 Linked Job</span>
                <span style={{ fontSize:12, color:'#4F46E5', fontFamily:'monospace' }}>{showDetail.linkedJobDocId.slice(0,8)}…</span>
              </div>
            )}

            {/* Parent link */}
            {showDetail.parentTaskId && tasksByDocId[showDetail.parentTaskId] && (
              <div style={{ marginBottom:16, padding:'8px 12px', borderRadius:8, background:B.warmGray, border:'1px solid '+B.sand, display:'flex', alignItems:'center', gap:8 }}>
                <span style={{ fontSize:12, color:B.textLight, fontFamily:f1 }}>Parent:</span>
                <button onClick={() => openDetail(tasksByDocId[showDetail.parentTaskId])} style={{ background:'none', border:'none', cursor:'pointer', fontSize:13, fontFamily:f1, color:B.teal, fontWeight:600, padding:0 }}>
                  {tasksByDocId[showDetail.parentTaskId].taskNumber} — {tasksByDocId[showDetail.parentTaskId].name}
                </button>
              </div>
            )}

            {/* Subtasks */}
            {(tasksByParent[showDetail._docId]||[]).length > 0 && (
              <div style={{ marginBottom:20 }}>
                <div style={{ fontWeight:700, fontSize:12, color:B.textMid, fontFamily:f1, textTransform:'uppercase', letterSpacing:.5, marginBottom:8 }}>
                  Subtasks ({tasksByParent[showDetail._docId].filter(s=>s.status==='Complete').length}/{tasksByParent[showDetail._docId].length} done)
                </div>
                <div style={{ display:'flex', flexDirection:'column', gap:4 }}>
                  {tasksByParent[showDetail._docId].map(sub => {
                    const sc2 = statusColors[sub.status] || statusColors['Backlog'];
                    return (
                      <div key={sub._docId} onClick={() => openDetail(sub)} style={{ display:'flex', alignItems:'center', gap:8, padding:'8px 12px', borderRadius:8, background:B.white, border:'1px solid '+B.sand, cursor:'pointer' }}>
                        <span style={{ width:8, height:8, borderRadius:'50%', background:sc2.dot, flexShrink:0 }}/>
                        <span style={{ flex:1, fontSize:13, fontFamily:f2, color:B.textDark }}>{sub.name}</span>
                        <span style={{ fontSize:11, fontFamily:f1, color:sc2.tx, background:sc2.bg, padding:'2px 8px', borderRadius:12, fontWeight:600 }}>{sub.status}</span>
                      </div>
                    );
                  })}
                </div>
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
              <CommentThread comments={comments} loading={commentsLoading} newComment={newComment} onChange={setNewComment} onPost={handlePostComment} posting={postingComment} userId={userId} canOperate={canOperate} onEdit={handleEditComment} onDelete={handleDeleteComment} users={taskHubUsers}/>
            </div>
          </div>
        )}
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
        <FF label="Template Name *">
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
                  {canOperate && <button onClick={async () => { if (window.confirm(`Delete template "${t.name}"?`)) { await deleteTaskTemplate(t._docId, userId, userName); setShowTemplates(false); }}} style={{ ...btnD, fontSize:12, padding:'6px 10px' }} aria-label={`Delete template ${t.name}`}>✕</button>}
                </div>
              </div>
            ))}
          </div>
        )}
      </Modal>

      {/* ═══ CONVERT TO JOB MODAL ═══ */}
      <Modal open={showConvertToJobModal} onClose={() => setShowConvertToJobModal(false)} title="Convert to Job">
        <FF label="Job Title *">
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

      {/* ═══ CREATE TICKET FROM TASK MODAL ═══ */}
      <Modal open={showCreateTicketModal} onClose={() => setShowCreateTicketModal(false)} title="Create Maintenance Ticket">
        <p style={{ fontSize:13, color:B.textMid, fontFamily:f2, marginBottom:16 }}>
          Create a maintenance ticket from "<strong>{showDetail?.name}</strong>"?
        </p>
        <div style={{ display:'flex', gap:10, justifyContent:'flex-end' }}>
          <button onClick={() => setShowCreateTicketModal(false)} style={btnS}>Cancel</button>
          <button onClick={handleCreateTicket} disabled={createTicketSaving} style={{ ...btnP, opacity: createTicketSaving ? 0.5 : 1 }}>
            {createTicketSaving ? 'Creating…' : 'Create Ticket'}
          </button>
        </div>
      </Modal>
    </div>
  );
}
