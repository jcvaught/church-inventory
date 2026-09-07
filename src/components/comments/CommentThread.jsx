import { useRef, useState, useEffect } from 'react';
import { B, f1, inp, btnP, btnS } from '../brand/tokens.js';
import { RichTextarea } from '../primitives/RichTextarea.jsx';

// Shared comment thread for the work hubs. Tasks and Maintenance each carried a
// near-identical copy; this is the single source of truth (Phase 0 board-engine
// groundwork). The optional `users` prop powers @-mention rendering + the
// mention picker — when it's empty (e.g. Maintenance), the body renders plain
// text and the mention UI is hidden, so the component degrades to the simpler
// behavior with no change.

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
  return d.toLocaleDateString([], { month: 'short', day: 'numeric' });
}

function renderWithMentions(text, users = []) {
  if (!text || !text.includes('@')) return text;
  // Match against actual user names rather than a regex. The previous
  // `[\w][\w\s]*?\b` pattern dropped apostrophes/hyphens (O'Brien, Mary-Jane)
  // and clipped multi-word names like "@John Vaught" after the first token.
  // Longest-first so "Jean-Luc Picard" beats "Jean".
  const names = users.map(u => u?.name).filter(Boolean).sort((a, b) => b.length - a.length);
  if (!names.length) return text;
  const out = [];
  let buf = '';
  let i = 0;
  while (i < text.length) {
    if (text[i] === '@') {
      const rest = text.slice(i + 1);
      const match = names.find(n => rest.startsWith(n));
      if (match) {
        if (buf) { out.push(buf); buf = ''; }
        out.push(<span key={out.length} style={{ color: '#2A7D6E', fontWeight: 700 }}>@{match}</span>);
        i += match.length + 1;
        continue;
      }
    }
    buf += text[i++];
  }
  if (buf) out.push(buf);
  return out;
}

function AutoGrowTextarea({ value, onChange, style, autoFocus }) {
  const ref = useRef(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = el.scrollHeight + 'px';
  }, [value]);
  return <textarea ref={ref} value={value} onChange={e => onChange(e.target.value)} style={style} autoFocus={autoFocus} />;
}

// `readOnly` renders the thread as a record rather than a conversation: no
// composer, no edit/delete affordances. COH-007 uses it for an archived task,
// whose comments the rules keep readable and freeze against every write — so
// offering a Post button here would only produce a permission-denied.
export function CommentThread({ comments, loading, newComment, onChange, onPost, posting, userId, canOperate, onEdit, onDelete, users = [], readOnly = false }) {
  const listRef = useRef(null);
  const commentInputWrapRef = useRef(null);
  const [editingId, setEditingId] = useState(null);
  const [editText, setEditText] = useState('');
  const [mentionOpen, setMentionOpen] = useState(false);
  // Scope auto-scroll to the comment list itself instead of scrollIntoView —
  // the latter scrolls the nearest scrollable ancestor (the modal panel),
  // jerking the whole modal whenever a comment is posted.
  useEffect(() => {
    const el = listRef.current;
    if (el && comments.length) el.scrollTop = el.scrollHeight;
  }, [comments.length]);

  function insertMentionAtCursor(name) {
    const ta = commentInputWrapRef.current?.querySelector('textarea');
    const cursor = ta?.selectionStart ?? newComment.length;
    const before = newComment.slice(0, cursor);
    const after = newComment.slice(cursor);
    const lead = before.length > 0 && !before.endsWith(' ') ? ' ' : '';
    const trail = after.startsWith(' ') ? '' : ' ';
    const insertion = lead + '@' + name + trail;
    onChange(before + insertion + after);
    setMentionOpen(false);
    const newCursor = before.length + insertion.length;
    setTimeout(() => {
      if (!ta) return;
      ta.focus();
      ta.setSelectionRange(newCursor, newCursor);
    }, 0);
  }

  function startEdit(c) { setEditingId(c.id); setEditText(c.text); }
  function cancelEdit() { setEditingId(null); setEditText(''); }
  async function submitEdit(c) { await onEdit(c.id, editText); setEditingId(null); setEditText(''); }

  return (
    <div>
      <div ref={listRef} style={{ maxHeight: 200, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 10, paddingRight: 2 }}>
        {loading
          ? <div style={{ color: B.textLight, fontSize: 13 }}>Loading...</div>
          : comments.length === 0
            ? <div style={{ color: B.textLight, fontSize: 13 }}>No comments yet.</div>
            : comments.map(c => {
                const isOwn = c.authorId === userId;
                const canModify = !readOnly && (isOwn || canOperate);
                return (
                  <div key={c.id} style={{ background: isOwn ? B.tealPale : B.warmGray, borderRadius: 10, padding: '10px 14px', border: isOwn ? '1px solid ' + B.tealLight : '1px solid transparent' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 3, gap: 6 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <span style={{ fontWeight: 700, fontSize: 13, color: B.navy, fontFamily: f1 }}>{c.authorName}</span>
                        {isOwn && <span style={{ fontSize: 10, fontWeight: 700, color: B.teal, fontFamily: f1, background: B.white, borderRadius: 10, padding: '1px 6px' }}>You</span>}
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span style={{ fontSize: 11, color: B.textLight }}>{formatCommentDate(c.createdAt)}{c.updatedAt ? ' · edited' : ''}</span>
                        {canModify && editingId !== c.id && (
                          <div style={{ display: 'flex', gap: 4 }}>
                            <button onClick={() => startEdit(c)} aria-label="Edit comment" style={{ border: 'none', background: 'none', cursor: 'pointer', fontSize: 14, color: B.textLight, padding: '6px 8px', minWidth: 28, minHeight: 28 }}>✏️</button>
                            <button onClick={() => onDelete(c.id)} aria-label="Delete comment" style={{ border: 'none', background: 'none', cursor: 'pointer', fontSize: 14, color: B.textLight, padding: '6px 8px', minWidth: 28, minHeight: 28 }}>🗑️</button>
                          </div>
                        )}
                      </div>
                    </div>
                    {editingId === c.id
                      ? (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 4 }}>
                          <AutoGrowTextarea value={editText} onChange={setEditText} style={{ ...inp, minHeight: 60, resize: 'vertical', width: '100%', boxSizing: 'border-box' }} autoFocus />
                          <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
                            <button onClick={cancelEdit} style={{ ...btnS, padding: '5px 12px', fontSize: 12 }}>Cancel</button>
                            <button onClick={() => submitEdit(c)} disabled={!editText.trim()} style={{ ...btnP, padding: '5px 12px', fontSize: 12, opacity: editText.trim() ? 1 : 0.5 }}>Save</button>
                          </div>
                        </div>
                      )
                      : <div style={{ fontSize: 13, color: B.textDark, lineHeight: 1.5, whiteSpace: 'pre-wrap' }}>{renderWithMentions(c.text, users)}</div>
                    }
                  </div>
                );
              })
        }
      </div>
      {!readOnly && <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
        <div ref={commentInputWrapRef} style={{ flex: 1, position: 'relative' }}>
          <RichTextarea
            value={newComment}
            onChange={onChange}
            style={{ ...inp, minHeight: 38, resize: 'vertical', width: '100%', boxSizing: 'border-box' }}
            placeholder="Add a comment... (Enter to post · Shift+Enter for new line)"
            onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey && newComment.trim()) { e.preventDefault(); onPost(); } else if (e.key === 'Escape') setMentionOpen(false); }}
          />
          {mentionOpen && users.filter(u => u.id !== userId).length > 0 && (
            <div style={{ position: 'absolute', bottom: '100%', left: 0, right: 0, zIndex: 200, background: '#fff', border: '1px solid #E8E0D5', borderRadius: 10, boxShadow: '0 4px 16px rgba(27,42,74,0.1)', maxHeight: 150, overflowY: 'auto', marginBottom: 2 }}>
              {users.filter(u => u.id !== userId).map(u => (
                <div key={u.id} onMouseDown={e => { e.preventDefault(); insertMentionAtCursor(u.name); }} style={{ padding: '8px 14px', cursor: 'pointer', fontSize: 13, fontFamily: 'Source Sans 3, sans-serif', color: '#1B2A4A' }}
                  onMouseEnter={e => e.currentTarget.style.background = '#F7F4EF'}
                  onMouseLeave={e => e.currentTarget.style.background = ''}
                >@{u.name}</div>
              ))}
            </div>
          )}
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4, flexShrink: 0 }}>
          <button onClick={onPost} disabled={posting || !newComment.trim()} style={{ ...btnP, padding: '11px 18px', opacity: (posting || !newComment.trim()) ? .5 : 1 }}>{posting ? 'Posting...' : 'Post'}</button>
          {users.filter(u => u.id !== userId).length > 0 && (
            <button type="button" onMouseDown={e => { e.preventDefault(); setMentionOpen(v => !v); }} style={{ ...btnS, padding: '6px 12px', fontSize: 12, textAlign: 'center' }}>@ Mention</button>
          )}
        </div>
      </div>}
    </div>
  );
}
