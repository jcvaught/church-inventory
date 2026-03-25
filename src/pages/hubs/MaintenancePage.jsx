import { useState, useEffect, useContext, useRef, useMemo } from 'react';
import { collection, onSnapshot, query as fsQuery, orderBy } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { db, storage } from '../../firebase.js';
import { MobileCtx } from '../../hooks/useMobile.js';
import { B, f1, f2, inp, btnP, btnS, btnD } from '../../components/brand/tokens.js';
import { Modal } from '../../components/primitives/Modal.jsx';
import { FF } from '../../components/primitives/FF.jsx';
import { resizeImageForUpload } from '../../utils/imageResize.js';

const STATUSES = ['Backlog', 'Planning', 'In Progress', 'On Hold', 'Complete', 'Cancelled'];

function initials(name) {
  const parts = (name || '?').trim().split(/\s+/);
  if (parts.length === 1) return parts[0].charAt(0).toUpperCase();
  return (parts[0].charAt(0) + parts[parts.length - 1].charAt(0)).toUpperCase();
}
const PRIORITIES = ['High', 'Medium', 'Low'];
const RECURRENCE_OPTIONS = [['', 'None'], ['weekly', 'Weekly'], ['biweekly', 'Every 2 weeks'], ['monthly', 'Monthly'], ['quarterly', 'Quarterly'], ['annually', 'Annually']];
const RECURRENCE_LABELS = { weekly:'Weekly', biweekly:'Every 2 wks', monthly:'Monthly', quarterly:'Quarterly', annually:'Annually' };

function calculateNextDue(dueDate, recurrence) {
  const base = dueDate ? new Date(dueDate + 'T12:00:00') : new Date();
  if (recurrence === 'weekly') base.setDate(base.getDate() + 7);
  else if (recurrence === 'biweekly') base.setDate(base.getDate() + 14);
  else if (recurrence === 'monthly') {
    const day = base.getDate();
    base.setMonth(base.getMonth() + 1);
    const lastDay = new Date(base.getFullYear(), base.getMonth() + 1, 0).getDate();
    if (base.getDate() !== day) base.setDate(lastDay);
  } else if (recurrence === 'quarterly') {
    const day = base.getDate();
    base.setMonth(base.getMonth() + 3);
    const lastDay = new Date(base.getFullYear(), base.getMonth() + 1, 0).getDate();
    if (base.getDate() !== day) base.setDate(lastDay);
  }
  else if (recurrence === 'annually') base.setFullYear(base.getFullYear() + 1);
  return base.toISOString().slice(0, 10);
}

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

function _StatusBadge({ status }) {
  const s = statusColors[status] || statusColors['Backlog'];
  return (
    <span style={{ display:'inline-flex', alignItems:'center', gap:5, padding:'3px 10px', borderRadius:20, background:s.bg, color:s.tx, fontSize:11, fontWeight:700, fontFamily:f1 }}>
      <span style={{ width:6, height:6, borderRadius:'50%', background:s.dot }}/>{status}
    </span>
  );
}

function TicketCard({ ticket, onClick, onDragStart, onStatusChange, isMobile }) {
  const sc = statusColors[ticket.status] || statusColors['Backlog'];
  const isOverdue = ticket.dueDate && new Date(ticket.dueDate) < new Date() && ticket.status !== 'Complete' && ticket.status !== 'Cancelled';
  return (
    <div
      draggable={!isMobile && !!onDragStart}
      onDragStart={!isMobile && onDragStart ? e => { e.dataTransfer.setData('ticketDocId', ticket._docId); e.dataTransfer.effectAllowed = 'move'; } : undefined}
      onClick={() => onClick(ticket)}
      style={{ background:B.white, borderRadius:12, padding:'14px 16px', border:'1px solid '+B.sand, cursor: !isMobile && onDragStart ? 'grab' : 'pointer', borderLeft:'4px solid '+sc.dot, boxShadow:'0 1px 3px rgba(27,42,74,0.06)', marginBottom:8, transition:'box-shadow 0.15s' }}
      onMouseEnter={e => e.currentTarget.style.boxShadow='0 4px 16px rgba(27,42,74,0.12)'}
      onMouseLeave={e => e.currentTarget.style.boxShadow='0 1px 3px rgba(27,42,74,0.06)'}
    >
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:6 }}>
        <div style={{ display:'flex', gap:4, alignItems:'center' }}>
          {ticket.assignees?.length > 0
            ? ticket.assignees.slice(0,3).map((a, i) => (
                <div key={a.uid || i} title={a.name} style={{ width:22, height:22, borderRadius:'50%', background:B.teal, color:B.white, fontSize:9, fontWeight:700, display:'flex', alignItems:'center', justifyContent:'center', fontFamily:f1 }}>
                  {initials(a.name)}
                </div>
              ))
            : <span style={{ fontSize:11, color:B.textLight, fontFamily:f1 }}>Unassigned</span>
          }
        </div>
        <PriorityBadge priority={ticket.priority}/>
      </div>
      <div style={{ fontWeight:600, fontSize:14, color:B.navy, marginBottom:4, lineHeight:1.3 }}>{ticket.name}</div>
      {ticket.description && (
        <div style={{ fontSize:12, color:B.textMid, lineHeight:1.4, marginBottom:6, overflow:'hidden', display:'-webkit-box', WebkitLineClamp:2, WebkitBoxOrient:'vertical', whiteSpace:'pre-wrap' }}>
          {ticket.description}
        </div>
      )}
      {ticket.tags?.length > 0 && (
        <div style={{ display:'flex', gap:4, flexWrap:'wrap', marginBottom:6 }}>
          {ticket.tags.slice(0,4).map(tag => (
            <span key={tag} style={{ padding:'2px 8px', borderRadius:12, background:B.warmGray, color:B.textMid, fontSize:10, fontFamily:f1 }}>{tag}</span>
          ))}
        </div>
      )}
      {(ticket.recurrence || ticket.checklist?.length > 0) && (
        <div style={{ display:'flex', gap:8, alignItems:'center', marginBottom:4 }}>
          {ticket.recurrence && <span style={{ fontSize:12, color:B.teal, fontFamily:f1 }}>🔁 {RECURRENCE_LABELS[ticket.recurrence]}</span>}
          {ticket.checklist?.length > 0 && (
            <span style={{ fontSize:12, color:ticket.checklist.filter(c=>c.done).length===ticket.checklist.length ? B.teal : B.textMid, fontFamily:f1 }}>
              ✓ {ticket.checklist.filter(c=>c.done).length}/{ticket.checklist.length}
            </span>
          )}
        </div>
      )}
      {(ticket.photos?.length > 0 || ticket.dueDate) && (
        <div style={{ display:'flex', justifyContent:'flex-end', gap:8, alignItems:'center' }}>
          {ticket.photos?.length > 0 && <span style={{ fontSize:11, color:B.textLight }}>📷 {ticket.photos.length}</span>}
          {ticket.dueDate && <span style={{ fontSize:11, color: isOverdue ? B.red : B.textLight }}>📅 {ticket.dueDate}</span>}
        </div>
      )}
      {isMobile && onStatusChange && (
        <div onClick={e => e.stopPropagation()} style={{ marginTop:10, borderTop:'1px solid '+B.sand, paddingTop:8, display:'flex', alignItems:'center', gap:8 }}>
          <span style={{ fontSize:11, color:B.textLight, fontFamily:f1, fontWeight:600, flexShrink:0 }}>Move to:</span>
          <select
            value={ticket.status}
            onChange={e => onStatusChange(ticket, e.target.value)}
            style={{ flex:1, fontSize:12, borderRadius:8, border:'1px solid '+B.sand, padding:'4px 8px', fontFamily:f1, color:B.navy, background:B.white }}
          >
            {STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>
      )}
    </div>
  );
}

function TagInput({ tags = [], onChange, suggestions = [] }) {
  const [inputVal, setInputVal] = useState('');
  const [showDrop, setShowDrop] = useState(false);
  const filtered = suggestions.filter(s => !tags.includes(s) && s.toLowerCase().includes(inputVal.toLowerCase()));

  function addTag(t) {
    const tag = t.trim().toLowerCase();
    if (tag && !tags.includes(tag)) onChange([...tags, tag]);
    setInputVal('');
    setShowDrop(false);
  }
  function onKey(e) {
    if ((e.key === 'Enter' || e.key === ',') && inputVal.trim()) { e.preventDefault(); addTag(inputVal); }
    else if (e.key === 'Backspace' && !inputVal && tags.length) onChange(tags.slice(0, -1));
  }
  return (
    <div style={{ position:'relative' }}>
      <div style={{ display:'flex', flexWrap:'wrap', gap:6, padding:'7px 10px', borderRadius:10, border:'1px solid '+B.sand, background:B.white, minHeight:42, alignItems:'center' }}>
        {tags.map(t => (
          <span key={t} style={{ display:'inline-flex', alignItems:'center', gap:4, padding:'2px 8px', borderRadius:12, background:B.tealPale, color:B.teal, fontSize:12, fontFamily:f1 }}>
            {t}
            <button onMouseDown={e => { e.preventDefault(); onChange(tags.filter(x => x !== t)); }} style={{ border:'none', background:'none', color:B.teal, cursor:'pointer', padding:'0 0 0 2px', fontSize:14, lineHeight:1 }}>×</button>
          </span>
        ))}
        <input
          value={inputVal}
          onChange={e => { setInputVal(e.target.value); setShowDrop(true); }}
          onKeyDown={onKey}
          onFocus={() => setShowDrop(true)}
          onBlur={() => setTimeout(() => setShowDrop(false), 150)}
          placeholder={tags.length ? '' : 'Type tag, press Enter...'}
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

function PhotoGrid({ photos = [], onAdd, onRemove, uploading }) {
  const fileRef = useRef();
  return (
    <div>
      <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill, minmax(90px, 1fr))', gap:8 }}>
        {photos.map((url, i) => (
          <div key={i} style={{ position:'relative', borderRadius:8, overflow:'hidden', aspectRatio:'1', background:B.warmGray }}>
            <img src={url} alt="" style={{ width:'100%', height:'100%', objectFit:'cover' }}/>
            {onRemove && (
              <button onClick={() => onRemove(i)} style={{ position:'absolute', top:3, right:3, width:20, height:20, borderRadius:'50%', background:'rgba(0,0,0,0.55)', border:'none', color:B.white, cursor:'pointer', fontSize:13, display:'flex', alignItems:'center', justifyContent:'center', padding:0 }}>×</button>
            )}
          </div>
        ))}
        {onAdd && (
          <div
            onClick={() => !uploading && fileRef.current?.click()}
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

function RichTextarea({ value, onChange, style, placeholder, onKeyDown }) {
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
        // Empty bullet line — exit list
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
        // Empty numbered line — exit list
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

  return (
    <div>
      <div style={{ display:'flex', gap:4, marginBottom:4 }}>
        <button type="button" onMouseDown={e => { e.preventDefault(); toggleBullet(); }} style={tb}>• List</button>
        <button type="button" onMouseDown={e => { e.preventDefault(); toggleNumbered(); }} style={tb}>1. List</button>
      </div>
      <textarea ref={taRef} value={value} onChange={e => onChange(e.target.value)} style={style} placeholder={placeholder} onKeyDown={handleKeyDown}/>
    </div>
  );
}

function formatCommentDate(iso) {
  if (!iso) return '';
  const d = new Date(iso);
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

function CommentThread({ comments, loading, newComment, onChange, onPost, posting, userId, canOperate, onEdit, onDelete }) {
  const endRef = useRef();
  const [editingId, setEditingId] = useState(null);
  const [editText, setEditText] = useState('');
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
                            <button onClick={() => startEdit(c)} style={{ border:'none', background:'none', cursor:'pointer', fontSize:14, color:B.textLight, padding:'6px 8px', minWidth:28, minHeight:28 }} title="Edit">✏️</button>
                            <button onClick={() => onDelete(c.id)} style={{ border:'none', background:'none', cursor:'pointer', fontSize:14, color:B.textLight, padding:'6px 8px', minWidth:28, minHeight:28 }} title="Delete">🗑️</button>
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
                      : <div style={{ fontSize:13, color:B.textDark, lineHeight:1.5, whiteSpace:'pre-wrap' }}>{c.text}</div>
                    }
                  </div>
                );
              })
        }
        <div ref={endRef}/>
      </div>
      <div style={{ display:'flex', gap:8, alignItems:'flex-start' }}>
        <div style={{ flex:1 }}>
          <RichTextarea
            value={newComment}
            onChange={onChange}
            style={{ ...inp, minHeight:38, resize:'vertical', width:'100%', boxSizing:'border-box' }}
            placeholder="Add a comment... (Enter to post · Shift+Enter for new line)"
            onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey && newComment.trim()) { e.preventDefault(); onPost(); } }}
          />
        </div>
        <button onClick={onPost} disabled={posting || !newComment.trim()} style={{ ...btnP, padding:'11px 18px', opacity:(posting || !newComment.trim()) ? .5 : 1, flexShrink:0 }}>Post</button>
      </div>
    </div>
  );
}

function KanbanColumn({ status, tickets, onTicketClick, onDrop, onStatusChange, isMobile }) {
  const sc = statusColors[status] || statusColors['Backlog'];
  const [dragOver, setDragOver] = useState(false);
  return (
    <div
      onDragOver={!isMobile && onDrop ? e => { e.preventDefault(); setDragOver(true); } : undefined}
      onDragLeave={!isMobile && onDrop ? () => setDragOver(false) : undefined}
      onDrop={!isMobile && onDrop ? e => { e.preventDefault(); setDragOver(false); const docId = e.dataTransfer.getData('ticketDocId'); if (docId) onDrop(docId); } : undefined}
      style={{ minWidth:isMobile ? '100%' : 260, maxWidth:isMobile ? '100%' : 280, flexShrink:0, background:dragOver ? B.tealPale : B.warmGray, borderRadius:14, padding:'12px 10px', border:'2px solid '+(dragOver ? B.teal : 'transparent'), transition:'background 0.15s, border-color 0.15s' }}
    >
      <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:10, paddingLeft:4 }}>
        <span style={{ width:10, height:10, borderRadius:'50%', background:sc.dot, flexShrink:0 }}/>
        <span style={{ fontWeight:700, fontSize:13, color:B.navy, fontFamily:f1 }}>{status}</span>
        <span style={{ marginLeft:'auto', background:B.white, borderRadius:20, padding:'2px 8px', fontSize:11, fontWeight:700, color:B.textMid, fontFamily:f1 }}>{tickets.length}</span>
      </div>
      <div style={{ overflowY:'auto', maxHeight:isMobile ? 'none' : 'calc(100vh - 380px)', minHeight:80 }}>
        {tickets.length === 0
          ? <div style={{ textAlign:'center', color:B.textLight, fontSize:12, padding:'16px 0', fontStyle:'italic' }}>Empty</div>
          : tickets.map(t => <TicketCard key={t._docId} ticket={t} onClick={onTicketClick} onDragStart={onDrop || undefined} onStatusChange={onStatusChange} isMobile={isMobile}/>)
        }
      </div>
    </div>
  );
}

const getEmptyTicket = () => ({ name:'', description:'', priority:'Medium', tags:[], dueDate:'', recurrence:'', assignees:[], linkedItemDocId:'', vendorId:'', estimatedCost:'', notes:'', checklist:[] });
const getEmptyVendor = () => ({ name:'', phone:'', email:'', specialty:'', notes:'' });

export function MaintenancePage({ store, userProfile }) {
  const { items, maintenanceTickets, vendors, users, settings, notificationConfig, addTicket, updateTicket, deleteTicket, addTicketComment, updateTicketComment, deleteTicketComment, addMaintenanceTags, addVendor, updateVendor, deleteVendor } = store;
  const isMobile = useContext(MobileCtx);

  const userId = userProfile?.id || userProfile?.uid;
  const userName = userProfile?.name || 'Unknown';
  const churchId = userProfile?.churchId;
  const isAdmin = userProfile?.role === 'admin';
  const isManager = userProfile?.role === 'manager';
  const canOperate = isAdmin || isManager;

  const activeItems = items.filter(i => i.status !== 'Disposed');
  const maintenanceTags = settings?.maintenanceTags || [];

  // ── State ──
  const [viewMode, setViewMode] = useState(() => localStorage.getItem('maint_viewMode') || 'kanban');
  const [filterSearch, setFilterSearch] = useState('');
  const [filterPriority, setFilterPriority] = useState('');
  const [filterMyTickets, setFilterMyTickets] = useState(false);
  const [showAdd, setShowAdd] = useState(false);
  const [showDetail, setShowDetail] = useState(null);
  const [showAddVendor, setShowAddVendor] = useState(false);
  const [showEditVendor, setShowEditVendor] = useState(null); // vendor object being edited
  const [showVendors, setShowVendors] = useState(false);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState(null);
  const [collapsedStatuses, setCollapsedStatuses] = useState(new Set());
  const [uploadingPhotos, setUploadingPhotos] = useState(false);

  const [ticketForm, setTicketForm] = useState(getEmptyTicket);
  const [photoFiles, setPhotoFiles] = useState([]);
  const [photoPreviews, setPhotoPreviews] = useState([]);
  const [detailEdits, setDetailEdits] = useState({});
  const [detailSnapshot, setDetailSnapshot] = useState({});
  const [vendorForm, setVendorForm] = useState(getEmptyVendor);
  const [sortBy, setSortBy] = useState(() => localStorage.getItem('maint_sortBy') || 'createdDesc');
  const [detailChecklistInput, setDetailChecklistInput] = useState('');
  const checklistInputRef = useRef();

  // Comments
  const [comments, setComments] = useState([]);
  const [commentsLoading, setCommentsLoading] = useState(false);
  const [newComment, setNewComment] = useState('');
  const [postingComment, setPostingComment] = useState(false);

  // Comments subscription — fires whenever a ticket detail is opened
  useEffect(() => {
    if (!showDetail?._docId || !churchId) { setComments([]); return; }
    setCommentsLoading(true);
    setComments([]);
    const q = fsQuery(
      collection(db, 'churches', churchId, 'maintenanceTickets', showDetail._docId, 'comments'),
      orderBy('createdAt', 'asc')
    );
    const unsub = onSnapshot(q, snap => {
      setComments(snap.docs.map(d => ({ id:d.id, ...d.data() })));
      setCommentsLoading(false);
    }, () => setCommentsLoading(false));
    return unsub;
  }, [showDetail?._docId, churchId]);

  // ── Helpers ──
  function flash(text, isError = false) { setMsg({ text, isError }); setTimeout(() => setMsg(null), 3000); }

  function switchViewMode(mode) {
    setViewMode(mode);
    localStorage.setItem('maint_viewMode', mode);
  }

  function openDetail(ticket) {
    const edits = {
      name: ticket.name || '',
      description: ticket.description || '',
      status: ticket.status || 'Backlog',
      priority: ticket.priority || 'Medium',
      tags: ticket.tags || [],
      dueDate: ticket.dueDate || '',
      recurrence: ticket.recurrence || '',
      assignees: ticket.assignees || [],
      linkedItemDocId: ticket.linkedItemDocId || '',
      vendorId: ticket.vendorId || '',
      estimatedCost: ticket.estimatedCost != null ? String(ticket.estimatedCost) : '',
      actualCost: ticket.actualCost != null ? String(ticket.actualCost) : '',
      notes: ticket.notes || '',
      checklist: ticket.checklist || [],
    };
    setShowDetail(ticket);
    setDetailEdits(edits);
    setDetailSnapshot(edits);
    setNewComment('');
    setDetailChecklistInput('');
  }

  function isDetailDirty() {
    const fields = ['name', 'description', 'status', 'priority', 'dueDate', 'recurrence', 'linkedItemDocId', 'vendorId', 'estimatedCost', 'actualCost', 'notes'];
    if (fields.some(f => (detailEdits[f] ?? '') !== (detailSnapshot[f] ?? ''))) return true;
    if (JSON.stringify(detailEdits.tags) !== JSON.stringify(detailSnapshot.tags)) return true;
    if (JSON.stringify(detailEdits.assignees) !== JSON.stringify(detailSnapshot.assignees)) return true;
    return false;
  }

  function closeDetail() {
    if (isDetailDirty() && !window.confirm('You have unsaved changes. Close without saving?')) return;
    setShowDetail(null);
    setDetailEdits({});
    setDetailSnapshot({});
    setComments([]);
    setNewComment('');
    setDetailChecklistInput('');
  }

  async function uploadPhotos(docId, files) {
    const urls = [];
    for (const file of files) {
      const resized = await resizeImageForUpload(file);
      const storageRef = ref(storage, `churches/${churchId}/maintenance/${docId}/${Date.now()}_${file.name}`);
      const snap = await uploadBytes(storageRef, resized);
      urls.push(await getDownloadURL(snap.ref));
    }
    return urls;
  }

  // ── Handlers ──
  async function handleAddTicket() {
    if (!ticketForm.name.trim()) return;
    setSaving(true);
    try {
      const vendorName = ticketForm.vendorId ? (vendors.find(v => v._docId === ticketForm.vendorId)?.name || null) : null;
      const linkedItem = activeItems.find(i => i._docId === ticketForm.linkedItemDocId);
      const docId = await addTicket({
        name: ticketForm.name.trim(),
        description: ticketForm.description.trim(),
        priority: ticketForm.priority,
        status: 'Backlog',
        tags: ticketForm.tags,
        dueDate: ticketForm.dueDate || null,
        recurrence: ticketForm.recurrence || null,
        assignees: ticketForm.assignees,
        checklist: [],
        photos: [],
        linkedItemDocId: ticketForm.linkedItemDocId || null,
        linkedItemId: linkedItem?.itemId || null,
        linkedItemDescription: linkedItem?.description || null,
        vendorId: ticketForm.vendorId || null,
        vendorName,
        estimatedCost: ticketForm.estimatedCost ? Number(ticketForm.estimatedCost) : null,
        actualCost: null,
        completedAt: null,
      }, userId, userName);
      if (photoFiles.length > 0 && docId) {
        try {
          const urls = await uploadPhotos(docId, photoFiles);
          await updateTicket(docId, { photos: urls });
        } catch { flash('Photo upload failed — ticket saved without photos.', true); }
      }
      if (ticketForm.tags.length > 0 && addMaintenanceTags) {
        await addMaintenanceTags(ticketForm.tags);
      }
      setShowAdd(false);
      setTicketForm(getEmptyTicket());
      setPhotoFiles([]);
      setPhotoPreviews([]);
      flash('Ticket created!');
    } finally {
      setSaving(false);
    }
  }

  async function handleUpdateTicket() {
    if (!showDetail) return;
    setSaving(true);
    try {
      const vendorName = detailEdits.vendorId ? (vendors.find(v => v._docId === detailEdits.vendorId)?.name || null) : null;
      const linkedItem = activeItems.find(i => i._docId === detailEdits.linkedItemDocId);
      const wasComplete = showDetail.status === 'Complete';
      const isNowComplete = detailEdits.status === 'Complete';
      const updates = {
        ...detailEdits,
        vendorName,
        vendorId: detailEdits.vendorId || null,
        linkedItemDocId: detailEdits.linkedItemDocId || null,
        linkedItemId: linkedItem?.itemId || null,
        linkedItemDescription: linkedItem?.description || null,
        estimatedCost: detailEdits.estimatedCost ? Number(detailEdits.estimatedCost) : null,
        actualCost: detailEdits.actualCost ? Number(detailEdits.actualCost) : null,
        recurrence: detailEdits.recurrence || null,
        completedAt: isNowComplete && !wasComplete ? new Date().toISOString() : (isNowComplete ? showDetail.completedAt : null),
      };
      await updateTicket(showDetail._docId, updates);
      if (detailEdits.tags?.length > 0 && addMaintenanceTags) {
        await addMaintenanceTags(detailEdits.tags);
      }

      // Email newly added assignees
      const oldAssigneeUids = new Set((showDetail.assignees || []).map(a => a.uid));
      const newlyAdded = (detailEdits.assignees || []).filter(a => a.uid !== userId && !oldAssigneeUids.has(a.uid));
      if (newlyAdded.length > 0 && notificationConfig?.enabled && notificationConfig?.templateAssigned && notificationConfig?.serviceId && notificationConfig?.publicKey) {
        try {
          const emailjs = await import('@emailjs/browser');
          for (const assignee of newlyAdded) {
            const assigneeUser = users.find(u => u.id === assignee.uid);
            if (!assigneeUser?.email) continue;
            await emailjs.send(notificationConfig.serviceId, notificationConfig.templateAssigned, {
              to_email: assigneeUser.email,
              to_name: assignee.name,
              ticket_name: detailEdits.name,
              ticket_number: showDetail.ticketNumber,
              priority: detailEdits.priority,
              due_date: detailEdits.dueDate || 'Not set',
              assigned_by: userName,
            }, notificationConfig.publicKey);
          }
        } catch { flash('Ticket saved, but assignment notification email failed — please notify manually.', true); }
      }

      // Auto-create next recurring ticket on completion
      if (isNowComplete && !wasComplete && detailEdits.recurrence) {
        const nextDue = calculateNextDue(detailEdits.dueDate, detailEdits.recurrence);
        const linkedItem2 = activeItems.find(i => i._docId === detailEdits.linkedItemDocId);
        await addTicket({
          name: detailEdits.name,
          description: detailEdits.description,
          priority: detailEdits.priority,
          tags: detailEdits.tags || [],
          dueDate: nextDue,
          recurrence: detailEdits.recurrence,
          assignees: detailEdits.assignees || [],
          checklist: (detailEdits.checklist || []).map(c => ({ ...c, done: false })),
          notes: detailEdits.notes || null,
          photos: [],
          linkedItemDocId: detailEdits.linkedItemDocId || null,
          linkedItemId: linkedItem2?.itemId || null,
          linkedItemDescription: linkedItem2?.description || null,
          vendorId: detailEdits.vendorId || null,
          vendorName,
          estimatedCost: detailEdits.estimatedCost ? Number(detailEdits.estimatedCost) : null,
          actualCost: null,
        }, userId, userName);
      }

      setShowDetail(null);
      setDetailEdits({});
      setDetailSnapshot({});
      setDetailChecklistInput('');
      flash(isNowComplete && !wasComplete && detailEdits.recurrence ? 'Ticket completed — next recurring ticket created!' : 'Ticket updated!');
    } finally {
      setSaving(false);
    }
  }

  async function handlePostComment() {
    if (!newComment.trim() || !showDetail?._docId) return;
    setPostingComment(true);
    try {
      await addTicketComment(showDetail._docId, newComment.trim(), userId, userName);
      setNewComment('');
    } finally {
      setPostingComment(false);
    }
  }

  async function handleEditComment(commentId, text) {
    if (!showDetail?._docId || !text.trim()) return;
    await updateTicketComment(showDetail._docId, commentId, text.trim());
  }

  async function handleDeleteComment(commentId) {
    if (!showDetail?._docId) return;
    if (!window.confirm('Delete this comment?')) return;
    await deleteTicketComment(showDetail._docId, commentId);
  }

  async function handleDetailPhotoAdd(files) {
    if (!showDetail?._docId) return;
    setUploadingPhotos(true);
    try {
      const newUrls = await uploadPhotos(showDetail._docId, files);
      const updatedPhotos = [...(showDetail.photos || []), ...newUrls];
      await updateTicket(showDetail._docId, { photos: updatedPhotos });
      setShowDetail(prev => ({ ...prev, photos: updatedPhotos }));
    } finally {
      setUploadingPhotos(false);
    }
  }

  async function handleDetailPhotoRemove(index) {
    if (!showDetail?._docId) return;
    const updatedPhotos = (showDetail.photos || []).filter((_, i) => i !== index);
    await updateTicket(showDetail._docId, { photos: updatedPhotos });
    setShowDetail(prev => ({ ...prev, photos: updatedPhotos }));
  }

  function handlePhotoSelect(files) {
    setPhotoFiles(prev => [...prev, ...files]);
    setPhotoPreviews(prev => [...prev, ...files.map(f => URL.createObjectURL(f))]);
  }

  function handlePreviewRemove(index) {
    setPhotoFiles(prev => prev.filter((_, i) => i !== index));
    setPhotoPreviews(prev => prev.filter((_, i) => i !== index));
  }

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
    if (!window.confirm(`Delete "${vendor.name}"? This cannot be undone.`)) return;
    await deleteVendor(vendor._docId);
    flash('Vendor deleted.');
  }

  async function handleDrop(docId, newStatus) {
    const ticket = maintenanceTickets.find(t => t._docId === docId);
    if (!ticket || ticket.status === newStatus) return;
    const wasComplete = ticket.status === 'Complete';
    const isNowComplete = newStatus === 'Complete';
    await updateTicket(docId, {
      status: newStatus,
      completedAt: isNowComplete && !wasComplete ? new Date().toISOString() : (isNowComplete ? ticket.completedAt : null),
    });
    if (isNowComplete && !wasComplete && ticket.recurrence) {
      const nextDue = calculateNextDue(ticket.dueDate, ticket.recurrence);
      const linkedItem = activeItems.find(i => i._docId === ticket.linkedItemDocId);
      const dropVendorName = ticket.vendorId ? (vendors.find(v => v._docId === ticket.vendorId)?.name || null) : null;
      await addTicket({
        name: ticket.name,
        description: ticket.description,
        priority: ticket.priority,
        tags: ticket.tags || [],
        dueDate: nextDue,
        recurrence: ticket.recurrence,
        assignees: ticket.assignees || [],
        checklist: (ticket.checklist || []).map(c => ({ ...c, done: false })),
        notes: ticket.notes || null,
        photos: [],
        linkedItemDocId: ticket.linkedItemDocId || null,
        linkedItemId: linkedItem?.itemId || null,
        linkedItemDescription: linkedItem?.description || null,
        vendorId: ticket.vendorId || null,
        vendorName: dropVendorName,
        estimatedCost: ticket.estimatedCost || null,
        actualCost: null,
      }, userId, userName);
      flash('Ticket completed — next recurring ticket created!');
    }
  }

  async function handleChecklistUpdate(cl) {
    try {
      await updateTicket(showDetail._docId, { checklist: cl });
    } catch { flash('Checklist save failed — please try again.', true); }
  }

  async function handleDeleteTicket() {
    if (!showDetail?._docId) return;
    if (!window.confirm(`Delete "${showDetail.name}"? This cannot be undone.`)) return;
    await deleteTicket(showDetail._docId);
    setShowDetail(null);
    setDetailEdits({});
    flash('Ticket deleted.');
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
  const thisMonthStart = new Date().toISOString().slice(0, 7) + '-01';
  const today = new Date();
  const openCount = maintenanceTickets.filter(t => t.status !== 'Complete' && t.status !== 'Cancelled').length;
  const inProgressCount = maintenanceTickets.filter(t => t.status === 'In Progress').length;
  const completedThisMonth = maintenanceTickets.filter(t => t.status === 'Complete' && (t.completedAt || '').slice(0, 10) >= thisMonthStart).length;
  const overdueCount = maintenanceTickets.filter(t => t.dueDate && new Date(t.dueDate) < today && t.status !== 'Complete' && t.status !== 'Cancelled').length;

  // ── Filtered tickets ──
  const filteredTickets = useMemo(() => {
    const search = filterSearch.toLowerCase();
    return maintenanceTickets.filter(t => {
      if (filterPriority && t.priority !== filterPriority) return false;
      if (filterMyTickets && !t.assignees?.some(a => a.uid === userId)) return false;
      if (search && !t.name?.toLowerCase().includes(search) && !t.description?.toLowerCase().includes(search) && !t.tags?.some(tag => tag.includes(search)) && !t.ticketNumber?.toLowerCase().includes(search)) return false;
      return true;
    });
  }, [maintenanceTickets, filterSearch, filterPriority, filterMyTickets, userId]);

  const sortedTickets = useMemo(() => {
    const sorted = [...filteredTickets];
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
    // createdDesc: already sorted by Firestore subscription
    return sorted;
  }, [filteredTickets, sortBy]);

  // ── Render ──
  return (
    <div>
      {/* Header */}
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:20, flexWrap:'wrap', gap:12 }}>
        <div>
          <h2 style={{ fontFamily:f1, fontSize:22, fontWeight:700, color:B.navy, margin:'0 0 2px' }}>Maintenance Hub</h2>
          <p style={{ color:B.textLight, fontSize:13, margin:0 }}>Track repair tickets{canOperate ? ' and manage service vendors' : ''}</p>
        </div>
        <div style={{ display:'flex', gap:8, flexWrap:'wrap' }}>
          {canOperate && (
            <button onClick={() => setShowVendors(v => !v)} style={{ ...btnS, fontSize:13, padding:'9px 18px' }}>
              {showVendors ? 'Hide Vendors' : `Vendors (${vendors.length})`}
            </button>
          )}
          {canOperate && (
            <button onClick={() => { setTicketForm(getEmptyTicket()); setPhotoFiles([]); setPhotoPreviews([]); setShowAdd(true); }} style={btnP}>
              + New Ticket
            </button>
          )}
        </div>
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
            <span style={{ fontSize:15 }}>{s.icon}</span>
            <span style={{ fontSize:20, fontWeight:700, color:s.color, fontFamily:f1 }}>{s.value}</span>
            <span style={{ fontSize:11, color:B.textLight, fontWeight:600, textTransform:'uppercase', letterSpacing:0.8, fontFamily:f1 }}>{s.label}</span>
          </div>
        ))}
      </div>

      {msg && (
        <div style={{ background:msg.isError ? B.redPale : B.tealPale, border:'1px solid '+(msg.isError ? '#FECACA' : B.teal), borderRadius:10, padding:'10px 16px', marginBottom:16, color:msg.isError ? B.red : B.teal, fontWeight:600, fontSize:13, fontFamily:f1 }}>{msg.text}</div>
      )}

      {/* Vendor Directory */}
      {showVendors && (
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
                        <button onClick={() => { setVendorForm({ name:v.name||'', phone:v.phone||'', email:v.email||'', specialty:v.specialty||'', notes:v.notes||'' }); setShowEditVendor(v); }} style={{ border:'none', background:'none', cursor:'pointer', fontSize:13, color:B.textLight, padding:'2px 4px' }} title="Edit">✏️</button>
                        <button onClick={() => handleDeleteVendor(v)} style={{ border:'none', background:'none', cursor:'pointer', fontSize:13, color:B.textLight, padding:'2px 4px' }} title="Delete">🗑️</button>
                      </div>}
                    </div>
                    {v.specialty && <div style={{ fontSize:12, color:B.teal, fontFamily:f1, marginBottom:4 }}>{v.specialty}</div>}
                    {v.phone && <div style={{ fontSize:12, color:B.textMid }}>📞 {v.phone}</div>}
                    {v.email && <div style={{ fontSize:12, color:B.textMid }}>✉️ {v.email}</div>}
                    {v.notes && <div style={{ fontSize:11, color:B.textLight, marginTop:4 }}>{v.notes}</div>}
                  </div>
                ))}
              </div>
            )
          }
        </div>
      )}

      {/* Filter Bar */}
      <div style={{ display:'flex', gap:8, marginBottom:12, flexWrap:'wrap', alignItems:'center' }}>
        <input
          style={{ ...inp, flex:1, minWidth:160, maxWidth:280 }}
          placeholder="Search tickets..."
          value={filterSearch}
          onChange={e => setFilterSearch(e.target.value)}
        />
        <select style={{ ...inp, width:'auto', cursor:'pointer' }} value={filterPriority} onChange={e => setFilterPriority(e.target.value)}>
          <option value="">All priorities</option>
          {PRIORITIES.map(p => <option key={p} value={p}>{p}</option>)}
        </select>
        <button
          type="button"
          onClick={() => setFilterMyTickets(v => !v)}
          style={{ padding:'9px 14px', borderRadius:10, border:'1px solid '+(filterMyTickets ? B.teal : B.sand), background:filterMyTickets ? B.tealPale : B.white, color:filterMyTickets ? B.teal : B.textMid, fontSize:13, fontFamily:f1, cursor:'pointer', fontWeight:filterMyTickets ? 700 : 500, whiteSpace:'nowrap' }}
        >
          My tickets
        </button>
        {(filterSearch || filterPriority || filterMyTickets) && (
          <button type="button" onClick={() => { setFilterSearch(''); setFilterPriority(''); setFilterMyTickets(false); }} style={{ padding:'9px 12px', borderRadius:10, border:'1px solid '+B.sand, background:B.white, color:B.textMid, fontSize:13, cursor:'pointer' }}>Clear</button>
        )}
      </div>

      {/* View Toggle + Sort */}
      <div style={{ display:'flex', gap:8, marginBottom:18, alignItems:'center', flexWrap:'wrap' }}>
        <div style={{ display:'flex', background:B.warmGray, borderRadius:10, padding:3 }}>
          {[['kanban', 'Kanban'], ['list', 'List']].map(([mode, label]) => (
            <button key={mode} onClick={() => switchViewMode(mode)} style={{ padding:'7px 18px', borderRadius:8, border:'none', background:viewMode===mode ? B.white : 'transparent', color:viewMode===mode ? B.navy : B.textMid, fontWeight:viewMode===mode ? 700 : 500, fontSize:13, fontFamily:f1, cursor:'pointer', boxShadow:viewMode===mode ? '0 1px 3px rgba(27,42,74,0.1)' : 'none', transition:'all 0.15s' }}>
              {label}
            </button>
          ))}
        </div>
        <div style={{ display:'flex', alignItems:'center', gap:6, marginLeft:4 }}>
          <span style={{ fontSize:12, color:B.textLight, fontFamily:f1, fontWeight:600, textTransform:'uppercase', letterSpacing:.6, whiteSpace:'nowrap' }}>Sort:</span>
          <select style={{ ...inp, width:'auto', cursor:'pointer', fontSize:13, padding:'7px 12px' }} value={sortBy} onChange={e => { setSortBy(e.target.value); localStorage.setItem('maint_sortBy', e.target.value); }}>
            <option value="createdDesc">Newest first</option>
            <option value="createdAsc">Oldest first</option>
            <option value="priority">Priority</option>
            <option value="dueDate">Due date</option>
          </select>
        </div>
        <span style={{ color:B.textLight, fontSize:13, marginLeft:'auto' }}>
          {filteredTickets.length}{filteredTickets.length !== maintenanceTickets.length ? ` of ${maintenanceTickets.length}` : ''} ticket{maintenanceTickets.length !== 1 ? 's' : ''}
        </span>
      </div>

      {/* Empty state — no tickets at all */}
      {maintenanceTickets.length === 0 && (
        <div style={{ background:B.white, borderRadius:18, padding:'48px 32px', border:'1px solid '+B.sand, textAlign:'center' }}>
          <div style={{ fontSize:48, marginBottom:16 }}>🔧</div>
          <h3 style={{ fontFamily:f1, color:B.navy, margin:'0 0 8px', fontSize:18 }}>No maintenance tickets yet</h3>
          <p style={{ color:B.textLight, fontSize:14 }}>{canOperate ? 'Create a ticket to track repairs and maintenance tasks.' : 'No tickets yet. Ask an admin or manager to create one.'}</p>
        </div>
      )}

      {/* Empty state — My Tickets filter active but no assigned tickets */}
      {filterMyTickets && filteredTickets.length === 0 && maintenanceTickets.length > 0 && (
        <div style={{ background:B.white, borderRadius:14, padding:'32px 24px', border:'1px solid '+B.sand, textAlign:'center', marginBottom:16 }}>
          <div style={{ fontSize:36, marginBottom:12 }}>👤</div>
          <h3 style={{ fontFamily:f1, color:B.navy, margin:'0 0 6px', fontSize:16 }}>No tickets assigned to you</h3>
          <p style={{ color:B.textLight, fontSize:13, margin:'0 0 12px' }}>Open any ticket and click <strong>Me</strong> in the Assignees field, then save to assign yourself.</p>
          <button type="button" onClick={() => setFilterMyTickets(false)} style={{ padding:'8px 18px', borderRadius:10, border:'1px solid '+B.sand, background:B.white, color:B.teal, fontSize:13, fontFamily:f1, cursor:'pointer', fontWeight:600 }}>
            Show all tickets
          </button>
        </div>
      )}

      {/* Kanban View */}
      {viewMode === 'kanban' && maintenanceTickets.length > 0 && (
        <div style={{ display:'flex', gap:12, overflowX:isMobile ? 'hidden' : 'auto', flexDirection:isMobile ? 'column' : 'row', paddingBottom:8, alignItems:'flex-start' }}>
          {STATUSES.map(status => (
            <KanbanColumn key={status} status={status} tickets={sortedTickets.filter(t => t.status === status)} onTicketClick={openDetail} onDrop={docId => handleDrop(docId, status)} onStatusChange={(ticket, newStatus) => handleDrop(ticket._docId, newStatus)} isMobile={isMobile}/>
          ))}
        </div>
      )}

      {/* List View */}
      {viewMode === 'list' && maintenanceTickets.length > 0 && (
        <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
          {STATUSES.map(status => {
            const tickets = sortedTickets.filter(t => t.status === status);
            const collapsed = collapsedStatuses.has(status);
            const sc = statusColors[status];
            return (
              <div key={status} style={{ background:B.white, borderRadius:14, border:'1px solid '+B.sand, overflow:'hidden' }}>
                <div onClick={() => toggleCollapse(status)} style={{ display:'flex', alignItems:'center', gap:10, padding:'13px 20px', cursor:'pointer', background:B.warmGray, userSelect:'none' }}>
                  <span style={{ width:10, height:10, borderRadius:'50%', background:sc.dot, flexShrink:0 }}/>
                  <span style={{ fontWeight:700, fontSize:14, color:B.navy, fontFamily:f1 }}>{status}</span>
                  <span style={{ background:B.white, borderRadius:20, padding:'2px 10px', fontSize:12, fontWeight:700, color:B.textMid, fontFamily:f1 }}>{tickets.length}</span>
                  <span style={{ marginLeft:'auto', color:B.textLight, fontSize:14, display:'inline-block', transform:collapsed ? 'rotate(-90deg)' : 'none', transition:'transform 0.2s' }}>▼</span>
                </div>
                {!collapsed && (
                  <div style={{ padding:'12px 16px 4px' }}>
                    {tickets.length === 0
                      ? <div style={{ color:B.textLight, fontSize:13, textAlign:'center', padding:'12px 0' }}>No tickets in {status}</div>
                      : tickets.map(t => <TicketCard key={t._docId} ticket={t} onClick={openDetail}/>)
                    }
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* ═══ ADD TICKET MODAL ═══ */}
      <Modal open={showAdd} onClose={() => { setShowAdd(false); setPhotoFiles([]); setPhotoPreviews([]); }} title="New Maintenance Ticket" wide>
        <FF label="Ticket Name *">
          <input style={inp} value={ticketForm.name} onChange={e => setTicketForm(f => ({ ...f, name:e.target.value }))} placeholder="Short descriptive name..."/>
        </FF>
        <FF label="Description">
          <RichTextarea style={{ ...inp, minHeight:72, resize:'vertical' }} value={ticketForm.description} onChange={v => setTicketForm(f => ({ ...f, description:v }))} placeholder="Full details of the issue or maintenance needed..."/>
        </FF>
        <div style={{ display:'grid', gridTemplateColumns:isMobile ? '1fr 1fr' : '1fr 1fr 1fr', gap:12 }}>
          <FF label="Priority">
            <select style={{ ...inp, cursor:'pointer' }} value={ticketForm.priority} onChange={e => setTicketForm(f => ({ ...f, priority:e.target.value }))}>
              {PRIORITIES.map(p => <option key={p} value={p}>{p}</option>)}
            </select>
          </FF>
          <FF label="Due Date">
            <input style={inp} type="date" value={ticketForm.dueDate} onChange={e => setTicketForm(f => ({ ...f, dueDate:e.target.value }))}/>
          </FF>
          <div style={isMobile ? { gridColumn:'1 / -1' } : {}}>
            <FF label="Recurrence">
              <select style={{ ...inp, cursor:'pointer' }} value={ticketForm.recurrence} onChange={e => setTicketForm(f => ({ ...f, recurrence:e.target.value }))}>
                {RECURRENCE_OPTIONS.map(([val, label]) => <option key={val} value={val}>{label}</option>)}
              </select>
            </FF>
          </div>
        </div>
        <FF label="Tags">
          <TagInput tags={ticketForm.tags} onChange={tags => setTicketForm(f => ({ ...f, tags }))} suggestions={maintenanceTags}/>
        </FF>
        <FF label="Assignees">
          <AssigneeSelect assignees={ticketForm.assignees} onChange={assignees => setTicketForm(f => ({ ...f, assignees }))} users={users} currentUserId={userId} currentUserName={userName}/>
        </FF>
        <FF label="Linked Equipment (optional)">
          <select style={{ ...inp, cursor:'pointer' }} value={ticketForm.linkedItemDocId} onChange={e => setTicketForm(f => ({ ...f, linkedItemDocId:e.target.value }))}>
            <option value="">— None —</option>
            {activeItems.map(i => <option key={i._docId} value={i._docId}>{i.description} ({i.itemId})</option>)}
          </select>
        </FF>
        <div style={{ display:'grid', gridTemplateColumns:vendors.length > 0 ? '1fr 1fr' : '1fr', gap:12 }}>
          {vendors.length > 0 && (
            <FF label="Vendor">
              <select style={{ ...inp, cursor:'pointer' }} value={ticketForm.vendorId} onChange={e => setTicketForm(f => ({ ...f, vendorId:e.target.value }))}>
                <option value="">— None —</option>
                {vendors.map(v => <option key={v._docId} value={v._docId}>{v.name}{v.specialty ? ' — '+v.specialty : ''}</option>)}
              </select>
            </FF>
          )}
          <FF label="Estimated Cost ($)">
            <input style={inp} type="number" min="0" step="0.01" value={ticketForm.estimatedCost} onChange={e => setTicketForm(f => ({ ...f, estimatedCost:e.target.value }))} placeholder="0.00"/>
          </FF>
        </div>
        <FF label="Photos">
          <PhotoGrid photos={photoPreviews} onAdd={handlePhotoSelect} onRemove={handlePreviewRemove} uploading={false}/>
        </FF>
        <FF label="Notes">
          <RichTextarea style={{ ...inp, minHeight:52, resize:'vertical' }} value={ticketForm.notes} onChange={v => setTicketForm(f => ({ ...f, notes:v }))} placeholder="Additional notes..."/>
        </FF>
        <button onClick={handleAddTicket} disabled={saving || !ticketForm.name.trim()} style={{ ...btnP, width:'100%', opacity:(saving || !ticketForm.name.trim()) ? .5 : 1, marginTop:4 }}>
          {saving ? 'Creating...' : 'Create Ticket'}
        </button>
      </Modal>

      {/* ═══ TICKET DETAIL MODAL ═══ */}
      <Modal open={!!showDetail} onClose={closeDetail} title={(showDetail?.ticketNumber || '') + (showDetail?.name ? ' — ' + showDetail.name.slice(0, 40) : '')} wide>
        {showDetail && (
          <div>
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
            <FF label="Description">
              <RichTextarea style={{ ...inp, minHeight:72, resize:'vertical' }} value={detailEdits.description} onChange={v => setDetailEdits(d => ({ ...d, description:v }))} placeholder="Full details..."/>
            </FF>
            <div style={{ display:'grid', gridTemplateColumns:isMobile ? '1fr 1fr' : '1fr 1fr 1fr', gap:12 }}>
              <FF label="Due Date">
                <input style={inp} type="date" value={detailEdits.dueDate} onChange={e => setDetailEdits(d => ({ ...d, dueDate:e.target.value }))}/>
              </FF>
              <FF label="Actual Cost ($)">
                <input style={inp} type="number" min="0" step="0.01" value={detailEdits.actualCost} onChange={e => setDetailEdits(d => ({ ...d, actualCost:e.target.value }))} placeholder="0.00"/>
              </FF>
              <div style={isMobile ? { gridColumn:'1 / -1' } : {}}>
                <FF label="Recurrence">
                  <select style={{ ...inp, cursor:'pointer' }} value={detailEdits.recurrence} onChange={e => setDetailEdits(d => ({ ...d, recurrence:e.target.value }))}>
                    {RECURRENCE_OPTIONS.map(([val, label]) => <option key={val} value={val}>{label}</option>)}
                  </select>
                </FF>
              </div>
            </div>
            <FF label="Tags">
              <TagInput tags={detailEdits.tags || []} onChange={tags => setDetailEdits(d => ({ ...d, tags }))} suggestions={maintenanceTags}/>
            </FF>
            <FF label="Assignees">
              <AssigneeSelect assignees={detailEdits.assignees || []} onChange={assignees => setDetailEdits(d => ({ ...d, assignees }))} users={users} currentUserId={userId} currentUserName={userName}/>
            </FF>
            <FF label="Linked Equipment">
              <select style={{ ...inp, cursor:'pointer' }} value={detailEdits.linkedItemDocId} onChange={e => setDetailEdits(d => ({ ...d, linkedItemDocId:e.target.value }))}>
                <option value="">— None —</option>
                {activeItems.map(i => <option key={i._docId} value={i._docId}>{i.description} ({i.itemId})</option>)}
              </select>
            </FF>
            <div style={{ display:'grid', gridTemplateColumns:vendors.length > 0 ? '1fr 1fr' : '1fr', gap:12 }}>
              {vendors.length > 0 && (
                <FF label="Vendor">
                  <select style={{ ...inp, cursor:'pointer' }} value={detailEdits.vendorId} onChange={e => setDetailEdits(d => ({ ...d, vendorId:e.target.value }))}>
                    <option value="">— None —</option>
                    {vendors.map(v => <option key={v._docId} value={v._docId}>{v.name}{v.specialty ? ' — '+v.specialty : ''}</option>)}
                  </select>
                </FF>
              )}
              <FF label="Estimated Cost ($)">
                <input style={inp} type="number" min="0" step="0.01" value={detailEdits.estimatedCost} onChange={e => setDetailEdits(d => ({ ...d, estimatedCost:e.target.value }))} placeholder="0.00"/>
              </FF>
            </div>
            <FF label="Notes">
              <RichTextarea style={{ ...inp, minHeight:52, resize:'vertical' }} value={detailEdits.notes} onChange={v => setDetailEdits(d => ({ ...d, notes:v }))} placeholder="Additional notes..."/>
            </FF>
            <FF label="Checklist">
              <div style={{ border:'1px dashed '+B.sand, borderRadius:10, padding:'12px 14px' }}>
                {(detailEdits.checklist || []).length === 0 && (
                  <div style={{ fontSize:13, color:B.textLight, marginBottom:8, fontFamily:f2 }}>No checklist items yet.</div>
                )}
                {(detailEdits.checklist || []).map((item, idx) => (
                  <div key={item.id} style={{ display:'flex', alignItems:'center', gap:8, padding:'7px 0', borderBottom:'1px solid '+B.sand }}>
                    <input type="checkbox" checked={item.done} style={{ flexShrink:0, width:16, height:16, cursor:'pointer' }} onChange={() => {
                      const cl = [...(detailEdits.checklist || [])];
                      cl[idx] = { ...cl[idx], done: !cl[idx].done };
                      setDetailEdits(d => ({ ...d, checklist: cl }));
                      setShowDetail(prev => ({ ...prev, checklist: cl }));
                      handleChecklistUpdate(cl);
                    }}/>
                    <span style={{ flex:1, fontSize:13, color:item.done ? B.textLight : B.textDark, textDecoration:item.done ? 'line-through' : 'none', fontFamily:f2 }}>{item.text}</span>
                    <button type="button" onClick={() => {
                      const cl = (detailEdits.checklist || []).filter((_, i) => i !== idx);
                      setDetailEdits(d => ({ ...d, checklist: cl }));
                      handleChecklistUpdate(cl);
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
                        const cl = [...(detailEdits.checklist || []), { id: Date.now().toString(), text: detailChecklistInput.trim(), done: false }];
                        setDetailEdits(d => ({ ...d, checklist: cl }));
                        handleChecklistUpdate(cl);
                        setDetailChecklistInput('');
                        checklistInputRef.current?.focus();
                      }
                    }}
                  />
                  <button type="button" onClick={() => {
                    if (!detailChecklistInput.trim()) return;
                    const cl = [...(detailEdits.checklist || []), { id: Date.now().toString(), text: detailChecklistInput.trim(), done: false }];
                    setDetailEdits(d => ({ ...d, checklist: cl }));
                    handleChecklistUpdate(cl);
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
                {canOperate && <button onClick={handleDeleteTicket} style={{ ...btnD, fontSize:13, padding:'9px 14px' }}>Delete</button>}
                <button onClick={closeDetail} style={btnS}>Cancel</button>
                <button onClick={handleUpdateTicket} disabled={saving || !detailEdits.name?.trim()} style={{ ...btnP, opacity:(saving || !detailEdits.name?.trim()) ? .5 : 1 }}>
                  {saving ? 'Saving...' : 'Save Changes'}
                </button>
              </div>
            </div>

            {/* Photos */}
            <div style={{ marginBottom:20 }}>
              <div style={{ fontWeight:700, fontSize:12, color:B.textMid, fontFamily:f1, textTransform:'uppercase', letterSpacing:.5, marginBottom:10 }}>Photos</div>
              <PhotoGrid photos={showDetail.photos || []} onAdd={handleDetailPhotoAdd} onRemove={handleDetailPhotoRemove} uploading={uploadingPhotos}/>
            </div>

            {/* Comments */}
            <div>
              <div style={{ fontWeight:700, fontSize:12, color:B.textMid, fontFamily:f1, textTransform:'uppercase', letterSpacing:.5, marginBottom:10 }}>Comments</div>
              <CommentThread comments={comments} loading={commentsLoading} newComment={newComment} onChange={setNewComment} onPost={handlePostComment} posting={postingComment} userId={userId} canOperate={canOperate} onEdit={handleEditComment} onDelete={handleDeleteComment}/>
            </div>
          </div>
        )}
      </Modal>

      {/* ═══ EDIT VENDOR MODAL ═══ */}
      <Modal open={!!showEditVendor} onClose={() => { setShowEditVendor(null); setVendorForm(getEmptyVendor()); }} title="Edit Vendor">
        <FF label="Vendor / Company Name *">
          <input style={inp} value={vendorForm.name} onChange={e => setVendorForm(f => ({ ...f, name:e.target.value }))} placeholder="e.g. Smith's HVAC"/>
        </FF>
        <FF label="Specialty">
          <input style={inp} value={vendorForm.specialty} onChange={e => setVendorForm(f => ({ ...f, specialty:e.target.value }))} placeholder="e.g. HVAC, Electrical, AV Systems"/>
        </FF>
        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12 }}>
          <FF label="Phone">
            <input style={inp} value={vendorForm.phone} onChange={e => setVendorForm(f => ({ ...f, phone:e.target.value }))} placeholder="(555) 000-0000"/>
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

      {/* ═══ ADD VENDOR MODAL ═══ */}
      <Modal open={showAddVendor} onClose={() => { setShowAddVendor(false); setVendorForm(getEmptyVendor()); }} title="Add Vendor">
        <FF label="Vendor / Company Name *">
          <input style={inp} value={vendorForm.name} onChange={e => setVendorForm(f => ({ ...f, name:e.target.value }))} placeholder="e.g. Smith's HVAC"/>
        </FF>
        <FF label="Specialty">
          <input style={inp} value={vendorForm.specialty} onChange={e => setVendorForm(f => ({ ...f, specialty:e.target.value }))} placeholder="e.g. HVAC, Electrical, AV Systems"/>
        </FF>
        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12 }}>
          <FF label="Phone">
            <input style={inp} value={vendorForm.phone} onChange={e => setVendorForm(f => ({ ...f, phone:e.target.value }))} placeholder="(555) 000-0000"/>
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
    </div>
  );
}
