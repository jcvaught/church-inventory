import { useState } from 'react';
import { B, f1, f2, inp, btnP, btnS } from '../../components/brand/tokens.js';
import { Modal } from '../../components/primitives/Modal.jsx';
import { FF } from '../../components/primitives/FF.jsx';
import { localDateStr } from '../../utils/date.js';

// Contractor / labor hours timesheet — Phase 1 of the Work-unification plan
// (docs/WORK-UNIFICATION-AND-PRICING-PLAN-2026-06-06.md §3). Lives inside the
// People Access hub because contractors are tracked people. Logs hours against
// a person, computes cost from their hourly rate, groups by person for a given
// date range, supports lightweight approval + CSV export. Reads/filters the
// whole timeEntries collection client-side (church-scale volumes are tiny).

const RANGES = [['thisWeek', 'This Week'], ['lastWeek', 'Last Week'], ['thisMonth', 'This Month'], ['all', 'All']];

function rangeFor(key) {
  const now = new Date();
  if (key === 'all') return null;
  if (key === 'thisMonth') {
    const y = now.getFullYear(), m = now.getMonth();
    return { start: localDateStr(new Date(y, m, 1)), end: localDateStr(new Date(y, m + 1, 0)) };
  }
  // Sunday-start week containing today (or the prior week for 'lastWeek').
  const sunday = new Date(now);
  sunday.setDate(now.getDate() - now.getDay());
  if (key === 'lastWeek') sunday.setDate(sunday.getDate() - 7);
  const sat = new Date(sunday);
  sat.setDate(sunday.getDate() + 6);
  return { start: localDateStr(sunday), end: localDateStr(sat) };
}

function money(n) { return '$' + (Number(n) || 0).toFixed(2); }

export function Timesheet({ store, userProfile, canEdit }) {
  const { timeEntries = [], accessPeople = [], addTimeEntry, updateTimeEntry, deleteTimeEntry } = store;
  const [range, setRange] = useState('thisWeek');
  const [showLog, setShowLog] = useState(false);
  const [busy, setBusy] = useState(false);
  const [confirmDeleteId, setConfirmDeleteId] = useState(null);
  const [form, setForm] = useState({ personId: '', date: localDateStr(new Date()), hours: '', description: '' });

  const activePeople = accessPeople.filter(p => p.active !== false);
  const personById = Object.fromEntries(activePeople.map(p => [p._docId, p]));
  // Contractors first in the picker, then alphabetical.
  const pickerPeople = [...activePeople].sort((a, b) => {
    const ac = a.personType === 'contractor' ? 0 : 1;
    const bc = b.personType === 'contractor' ? 0 : 1;
    return ac - bc || (a.name || '').localeCompare(b.name || '');
  });
  const hasContractors = activePeople.some(p => p.personType === 'contractor');

  const r = rangeFor(range);
  const filtered = timeEntries.filter(e => !r || (e.date >= r.start && e.date <= r.end));

  const groupMap = {};
  for (const e of filtered) (groupMap[e.personId] ||= []).push(e);
  const groups = Object.entries(groupMap).map(([pid, entries]) => ({
    pid,
    name: entries[0]?.personName || personById[pid]?.name || 'Unknown',
    type: personById[pid]?.personType,
    entries: [...entries].sort((a, b) => (b.date || '').localeCompare(a.date || '')),
    hours: entries.reduce((s, e) => s + (Number(e.hours) || 0), 0),
    cost: entries.reduce((s, e) => s + (Number(e.cost) || 0), 0),
  })).sort((a, b) => a.name.localeCompare(b.name));

  const totalHours = filtered.reduce((s, e) => s + (Number(e.hours) || 0), 0);
  const totalCost = filtered.reduce((s, e) => s + (Number(e.cost) || 0), 0);

  function openLog() {
    const firstContractor = pickerPeople.find(p => p.personType === 'contractor');
    setForm({ personId: firstContractor?._docId || pickerPeople[0]?._docId || '', date: localDateStr(new Date()), hours: '', description: '' });
    setShowLog(true);
  }

  const selectedPerson = personById[form.personId];
  const selectedRate = selectedPerson?.hourlyRate != null ? Number(selectedPerson.hourlyRate) : null;
  const previewCost = selectedRate != null && Number(form.hours) > 0 ? Number(form.hours) * selectedRate : null;

  async function handleSave() {
    const person = personById[form.personId];
    const hours = Number(form.hours);
    if (!person || !hours || hours <= 0) return;
    setBusy(true);
    const rate = person.hourlyRate != null ? Number(person.hourlyRate) : null;
    await addTimeEntry({
      personId: person._docId,
      personName: person.name || '',
      date: form.date,
      hours,
      description: form.description.trim(),
      ministry: person.ministries?.[0] || null,
      rate,
      cost: rate != null ? +(hours * rate).toFixed(2) : 0,
      status: 'logged',
      createdBy: userProfile.uid,
    });
    setBusy(false);
    setShowLog(false);
  }

  function exportCSV() {
    const rows = [['Person', 'Date', 'Hours', 'Rate', 'Cost', 'Status', 'Description']];
    for (const g of groups) for (const e of g.entries) {
      rows.push([g.name, e.date, e.hours, e.rate ?? '', e.cost ?? '', e.status || 'logged', (e.description || '').replace(/\n/g, ' ')]);
    }
    const csv = rows.map(row => row.map(c => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `timesheet-${range}.csv`; a.click();
    URL.revokeObjectURL(url);
  }

  const badge = (status) => {
    const approved = status === 'approved';
    return (
      <span style={{ padding: '2px 9px', borderRadius: 20, fontSize: 11, fontWeight: 700, fontFamily: f1, background: approved ? B.tealPale : B.goldLight, color: approved ? B.teal : '#96750E' }}>
        {approved ? 'Approved' : 'Logged'}
      </span>
    );
  };

  return (
    <div>
      {/* Controls */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 16, flexWrap: 'wrap', alignItems: 'center' }}>
        <div style={{ display: 'flex', gap: 4, background: B.sand, borderRadius: 10, padding: 4 }}>
          {RANGES.map(([k, label]) => (
            <button key={k} onClick={() => setRange(k)} style={{
              padding: '6px 14px', borderRadius: 8, border: 'none', cursor: 'pointer', fontSize: 12, fontWeight: 600, fontFamily: f1,
              background: range === k ? B.white : 'transparent', color: range === k ? B.navy : B.textLight,
              boxShadow: range === k ? '0 1px 4px rgba(0,0,0,0.1)' : 'none',
            }}>{label}</button>
          ))}
        </div>
        <div style={{ flex: 1 }} />
        {filtered.length > 0 && (
          <button onClick={exportCSV} style={{ ...btnS, padding: '8px 14px', fontSize: 13 }}>⬇ Export CSV</button>
        )}
        {canEdit && (
          <button onClick={openLog} style={{ ...btnP, padding: '8px 16px', fontSize: 13 }}>+ Log Time</button>
        )}
      </div>

      {/* Summary */}
      <div style={{ display: 'flex', gap: 12, marginBottom: 20, flexWrap: 'wrap' }}>
        <div style={{ background: B.white, border: '1px solid ' + B.sand, borderRadius: 12, padding: '14px 20px', minWidth: 140 }}>
          <div style={{ fontSize: 12, color: B.textLight, fontFamily: f1, fontWeight: 600 }}>Total Hours</div>
          <div style={{ fontSize: 24, fontWeight: 700, color: B.navy, fontFamily: f1 }}>{totalHours.toFixed(2)}</div>
        </div>
        <div style={{ background: B.white, border: '1px solid ' + B.sand, borderRadius: 12, padding: '14px 20px', minWidth: 140 }}>
          <div style={{ fontSize: 12, color: B.textLight, fontFamily: f1, fontWeight: 600 }}>Total Cost</div>
          <div style={{ fontSize: 24, fontWeight: 700, color: B.teal, fontFamily: f1 }}>{money(totalCost)}</div>
        </div>
      </div>

      {!hasContractors && (
        <div style={{ background: B.tealPale, border: '1px solid ' + B.teal, borderRadius: 10, padding: '12px 16px', marginBottom: 16, fontSize: 13, color: B.teal, lineHeight: 1.6 }}>
          Tip: set a person's type to <strong>Contractor</strong> (with an hourly rate) in the <strong>People</strong> tab to auto-calculate cost when you log their hours.
        </div>
      )}

      {/* Groups */}
      {groups.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '60px 20px', color: B.textLight, fontFamily: f2 }}>
          No hours logged for this period.{canEdit ? ' Click “Log Time” to add some.' : ''}
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {groups.map(g => (
            <div key={g.pid} style={{ background: B.white, border: '1px solid ' + B.sand, borderRadius: 12, overflow: 'hidden' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 16px', background: B.warmGray, flexWrap: 'wrap', gap: 8 }}>
                <div style={{ fontWeight: 700, fontSize: 15, color: B.navy, fontFamily: f1 }}>
                  {g.name}
                  {g.type === 'contractor' && <span style={{ marginLeft: 8, fontSize: 11, fontWeight: 600, color: B.teal, fontFamily: f1 }}>· Contractor</span>}
                </div>
                <div style={{ fontSize: 13, color: B.textMid, fontFamily: f1 }}>
                  <strong>{g.hours.toFixed(2)}</strong> hrs · <strong style={{ color: B.teal }}>{money(g.cost)}</strong>
                </div>
              </div>
              <div>
                {g.entries.map(e => (
                  <div key={e._docId} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 16px', borderTop: '1px solid ' + B.cream, flexWrap: 'wrap' }}>
                    <div style={{ width: 92, fontSize: 13, color: B.textMid, fontFamily: f1, flexShrink: 0 }}>{e.date}</div>
                    <div style={{ flex: 1, minWidth: 120, fontSize: 13, color: B.textDark }}>{e.description || <span style={{ color: B.textLight }}>—</span>}</div>
                    <div style={{ width: 70, textAlign: 'right', fontSize: 13, fontWeight: 600, color: B.navy, fontFamily: f1 }}>{(Number(e.hours) || 0).toFixed(2)} h</div>
                    <div style={{ width: 80, textAlign: 'right', fontSize: 13, color: B.teal, fontFamily: f1 }}>{e.rate != null ? money(e.cost) : '—'}</div>
                    {badge(e.status)}
                    {canEdit && (confirmDeleteId === e._docId ? (
                      <span style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                        <button onClick={async () => { await deleteTimeEntry(e._docId); setConfirmDeleteId(null); }} style={{ background: B.redPale, color: B.red, border: '1px solid #FECACA', borderRadius: 6, padding: '4px 10px', fontSize: 12, fontWeight: 600, fontFamily: f1, cursor: 'pointer' }}>Delete</button>
                        <button onClick={() => setConfirmDeleteId(null)} style={{ background: 'none', border: 'none', color: B.textLight, fontSize: 12, cursor: 'pointer', fontFamily: f1 }}>Cancel</button>
                      </span>
                    ) : (
                      <span style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                        <button onClick={() => updateTimeEntry(e._docId, { status: e.status === 'approved' ? 'logged' : 'approved' })}
                          title={e.status === 'approved' ? 'Mark as logged' : 'Approve'}
                          style={{ background: 'none', border: '1px solid ' + B.sand, borderRadius: 6, padding: '4px 10px', fontSize: 12, fontWeight: 600, fontFamily: f1, cursor: 'pointer', color: e.status === 'approved' ? B.textLight : B.teal }}>
                          {e.status === 'approved' ? 'Unapprove' : 'Approve'}
                        </button>
                        <button onClick={() => setConfirmDeleteId(e._docId)} aria-label="Delete entry" style={{ background: 'none', border: 'none', color: B.textLight, fontSize: 15, cursor: 'pointer', padding: '2px 6px' }}>🗑</button>
                      </span>
                    ))}
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Log time modal */}
      {showLog && (
        <Modal open onClose={() => setShowLog(false)}>
          <h3 style={{ margin: '0 0 20px', fontSize: 18, fontFamily: f1, color: B.navy }}>Log Time</h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <FF label="Person" required>
              <select value={form.personId} onChange={e => setForm(f => ({ ...f, personId: e.target.value }))} style={inp}>
                {pickerPeople.length === 0 && <option value="">No people yet — add one in the People tab</option>}
                {pickerPeople.map(p => (
                  <option key={p._docId} value={p._docId}>
                    {p.name}{p.personType === 'contractor' ? ` — contractor${p.hourlyRate != null ? ` (${money(p.hourlyRate)}/hr)` : ''}` : ''}
                  </option>
                ))}
              </select>
            </FF>
            <FF label="Date" required>
              <input type="date" value={form.date} onChange={e => setForm(f => ({ ...f, date: e.target.value }))} style={inp} />
            </FF>
            <FF label="Hours" required>
              <input type="number" min="0" step="0.25" value={form.hours} onChange={e => setForm(f => ({ ...f, hours: e.target.value }))} placeholder="e.g. 3.5" style={inp} />
            </FF>
            <FF label="Description">
              <input value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} placeholder="What was worked on?" style={inp} />
            </FF>
            {previewCost != null && (
              <div style={{ fontSize: 13, color: B.textMid, fontFamily: f1 }}>
                Cost: <strong style={{ color: B.teal }}>{money(previewCost)}</strong> ({form.hours} hrs × {money(selectedRate)}/hr)
              </div>
            )}
          </div>
          <div style={{ display: 'flex', gap: 10, marginTop: 20, justifyContent: 'flex-end' }}>
            <button onClick={() => setShowLog(false)} style={btnS}>Cancel</button>
            <button onClick={handleSave} disabled={busy || !form.personId || !(Number(form.hours) > 0)} style={{ ...btnP, opacity: busy || !form.personId || !(Number(form.hours) > 0) ? 0.6 : 1 }}>
              {busy ? 'Saving…' : 'Log Time'}
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}
