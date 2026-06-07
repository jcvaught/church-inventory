import { useState } from 'react';
import { B, f1, f2, inp, btnP, btnS } from '../../components/brand/tokens.js';
import { Modal } from '../../components/primitives/Modal.jsx';
import { FF } from '../../components/primitives/FF.jsx';
import { localDateStr } from '../../utils/date.js';

// Contractor / labor timesheet — Phase 1 of the Work-unification plan
// (docs/WORK-UNIFICATION-AND-PRICING-PLAN-2026-06-06.md §3). Lives inside the
// People Access hub because contractors are tracked people. A time entry moves
// through a lifecycle: Scheduled (planned future work, est. hours) → Logged
// (actual hours recorded) → Approved → Paid. "Upcoming" = scheduled entries;
// "Awaiting payment" = approved-but-not-paid. Cost computes from the person's
// hourly rate. Reads/filters the whole timeEntries collection client-side
// (church-scale volumes are tiny).

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

const STATUS_STYLE = {
  scheduled: { label: 'Scheduled', bg: '#EFF6FF', color: '#1D4ED8' },
  logged:    { label: 'Logged',    bg: B.goldLight, color: '#96750E' },
  approved:  { label: 'Approved',  bg: B.tealPale, color: B.teal },
  paid:      { label: 'Paid',      bg: '#DCFCE7', color: '#15803D' },
};

export function Timesheet({ store, userProfile, canEdit }) {
  const {
    timeEntries = [], accessPeople = [], maintenanceTickets = [],
    addTimeEntry, updateTimeEntry, deleteTimeEntry, updateTicket,
  } = store;
  const [range, setRange] = useState('thisWeek');
  const [modal, setModal] = useState(null); // { mode: 'log' | 'schedule', convertId }
  const [busy, setBusy] = useState(false);
  const [confirmDeleteId, setConfirmDeleteId] = useState(null);
  const [form, setForm] = useState({ personId: '', date: localDateStr(new Date()), hours: '', description: '' });

  const today = localDateStr(new Date());
  const activePeople = accessPeople.filter(p => p.active !== false);
  const personById = Object.fromEntries(activePeople.map(p => [p._docId, p]));
  // Contractors first in the picker, then alphabetical.
  const pickerPeople = [...activePeople].sort((a, b) => {
    const ac = a.personType === 'contractor' ? 0 : 1;
    const bc = b.personType === 'contractor' ? 0 : 1;
    return ac - bc || (a.name || '').localeCompare(b.name || '');
  });
  const hasContractors = activePeople.some(p => p.personType === 'contractor');

  // Upcoming = scheduled entries (all of them, not range-filtered — planned work
  // is inherently forward-looking). Past-dated-but-still-scheduled = needs logging.
  const upcoming = timeEntries
    .filter(e => e.status === 'scheduled')
    .sort((a, b) => (a.date || '').localeCompare(b.date || ''));

  // History = actual work (logged / approved / paid), range-filtered + grouped.
  const r = rangeFor(range);
  const history = timeEntries.filter(e => e.status !== 'scheduled' && (!r || (e.date >= r.start && e.date <= r.end)));

  const groupMap = {};
  for (const e of history) (groupMap[e.personId] ||= []).push(e);
  const groups = Object.entries(groupMap).map(([pid, entries]) => ({
    pid,
    name: entries[0]?.personName || personById[pid]?.name || 'Unknown',
    type: personById[pid]?.personType,
    entries: [...entries].sort((a, b) => (b.date || '').localeCompare(a.date || '')),
    hours: entries.reduce((s, e) => s + (Number(e.hours) || 0), 0),
    cost: entries.reduce((s, e) => s + (Number(e.cost) || 0), 0),
  })).sort((a, b) => a.name.localeCompare(b.name));

  const totalHours = history.reduce((s, e) => s + (Number(e.hours) || 0), 0);
  const totalCost = history.reduce((s, e) => s + (Number(e.cost) || 0), 0);
  // Awaiting payment = approved-but-not-paid, across ALL time (not range-bound —
  // an outstanding balance shouldn't disappear because you switched to This Week).
  const outstanding = timeEntries
    .filter(e => e.status === 'approved')
    .reduce((s, e) => s + (Number(e.cost) || 0), 0);

  const ticketById = Object.fromEntries((maintenanceTickets || []).map(t => [t._docId, t]));

  function openLog() {
    const firstContractor = pickerPeople.find(p => p.personType === 'contractor');
    setForm({ personId: firstContractor?._docId || pickerPeople[0]?._docId || '', date: localDateStr(new Date()), hours: '', description: '' });
    setModal({ mode: 'log', convertId: null });
  }
  function openSchedule() {
    const firstContractor = pickerPeople.find(p => p.personType === 'contractor');
    setForm({ personId: firstContractor?._docId || pickerPeople[0]?._docId || '', date: localDateStr(new Date()), hours: '', description: '' });
    setModal({ mode: 'schedule', convertId: null });
  }
  function openLogActuals(entry) {
    setForm({ personId: entry.personId, date: entry.date < today ? today : entry.date, hours: '', description: entry.description || '' });
    setModal({ mode: 'log', convertId: entry._docId });
  }

  const selectedPerson = personById[form.personId];
  const selectedRate = selectedPerson?.hourlyRate != null ? Number(selectedPerson.hourlyRate) : null;
  const previewCost = selectedRate != null && Number(form.hours) > 0 ? Number(form.hours) * selectedRate : null;

  async function handleSave() {
    const person = personById[form.personId];
    const hours = Number(form.hours);
    if (!person) return;
    const rate = person.hourlyRate != null ? Number(person.hourlyRate) : null;

    if (modal.mode === 'schedule') {
      setBusy(true);
      await addTimeEntry({
        personId: person._docId,
        personName: person.name || '',
        date: form.date,
        estHours: hours > 0 ? hours : null,
        hours: 0,
        cost: 0,
        description: form.description.trim(),
        ministry: person.ministries?.[0] || null,
        rate,
        status: 'scheduled',
        createdBy: userProfile.uid,
      });
      setBusy(false);
      setModal(null);
      return;
    }

    // Log mode — needs actual hours.
    if (!hours || hours <= 0) return;
    setBusy(true);
    const cost = rate != null ? +(hours * rate).toFixed(2) : 0;
    if (modal.convertId) {
      // Converting a scheduled entry into logged actuals (in place).
      const entry = timeEntries.find(e => e._docId === modal.convertId);
      await updateTimeEntry(modal.convertId, {
        date: form.date, hours, cost, status: 'logged',
        description: form.description.trim(),
      });
      await rollUpToTicket(entry, cost);
    } else {
      await addTimeEntry({
        personId: person._docId,
        personName: person.name || '',
        date: form.date,
        hours,
        description: form.description.trim(),
        ministry: person.ministries?.[0] || null,
        rate,
        cost,
        status: 'logged',
        createdBy: userProfile.uid,
      });
    }
    setBusy(false);
    setModal(null);
  }

  // When a ticket-linked entry is logged, add its cost to the maintenance
  // ticket's actualCost once (guarded by rolledUp so re-logging won't double-add).
  async function rollUpToTicket(entry, cost) {
    if (!entry?.linkedTicketId || entry.rolledUp || !updateTicket) return;
    const ticket = ticketById[entry.linkedTicketId];
    if (!ticket) return;
    const next = +((Number(ticket.actualCost) || 0) + (Number(cost) || 0)).toFixed(2);
    try {
      await updateTicket(entry.linkedTicketId, { actualCost: next });
      await updateTimeEntry(entry._docId, { rolledUp: true });
    } catch { /* best-effort rollup; non-blocking */ }
  }

  async function handleDelete(entry) {
    // If a rolled-up linked entry is deleted, back its cost out of the ticket.
    if (entry.rolledUp && entry.linkedTicketId && updateTicket) {
      const ticket = ticketById[entry.linkedTicketId];
      if (ticket) {
        const next = +Math.max(0, (Number(ticket.actualCost) || 0) - (Number(entry.cost) || 0)).toFixed(2);
        try { await updateTicket(entry.linkedTicketId, { actualCost: next }); } catch { /* best-effort */ }
      }
    }
    await deleteTimeEntry(entry._docId);
    setConfirmDeleteId(null);
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

  const Badge = ({ status }) => {
    const s = STATUS_STYLE[status] || STATUS_STYLE.logged;
    return <span style={{ padding: '2px 9px', borderRadius: 20, fontSize: 11, fontWeight: 700, fontFamily: f1, background: s.bg, color: s.color }}>{s.label}</span>;
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
        {history.length > 0 && (
          <button onClick={exportCSV} style={{ ...btnS, padding: '8px 14px', fontSize: 13 }}>⬇ Export CSV</button>
        )}
        {canEdit && (
          <button onClick={openSchedule} style={{ ...btnS, padding: '8px 14px', fontSize: 13 }}>📅 Schedule Work</button>
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
        <div style={{ background: B.white, border: '1px solid ' + B.sand, borderRadius: 12, padding: '14px 20px', minWidth: 140 }}>
          <div style={{ fontSize: 12, color: B.textLight, fontFamily: f1, fontWeight: 600 }}>Awaiting Payment</div>
          <div style={{ fontSize: 24, fontWeight: 700, color: outstanding > 0 ? B.gold : B.textMid, fontFamily: f1 }}>{money(outstanding)}</div>
        </div>
      </div>

      {!hasContractors && (
        <div style={{ background: B.tealPale, border: '1px solid ' + B.teal, borderRadius: 10, padding: '12px 16px', marginBottom: 16, fontSize: 13, color: B.teal, lineHeight: 1.6 }}>
          Tip: set a person's type to <strong>Contractor</strong> (with an hourly rate) in the <strong>People</strong> tab to auto-calculate cost when you log their hours.
        </div>
      )}

      {/* Upcoming (scheduled) work */}
      {upcoming.length > 0 && (
        <div style={{ background: B.white, border: '1px solid ' + B.sand, borderRadius: 12, overflow: 'hidden', marginBottom: 20 }}>
          <div style={{ padding: '12px 16px', background: '#EFF6FF', fontWeight: 700, fontSize: 14, color: '#1D4ED8', fontFamily: f1 }}>
            📅 Upcoming Work ({upcoming.length})
          </div>
          {upcoming.map(e => {
            const overdue = e.date < today;
            const linkedTicket = e.linkedTicketId ? ticketById[e.linkedTicketId] : null;
            return (
              <div key={e._docId} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 16px', borderTop: '1px solid ' + B.cream, flexWrap: 'wrap' }}>
                <div style={{ width: 92, fontSize: 13, fontWeight: 600, color: overdue ? B.red : B.textMid, fontFamily: f1, flexShrink: 0 }}>{e.date}</div>
                <div style={{ flex: 1, minWidth: 120, fontSize: 13, color: B.textDark }}>
                  <strong>{e.personName || personById[e.personId]?.name || 'Unknown'}</strong>
                  {e.description ? <span style={{ color: B.textMid }}> · {e.description}</span> : null}
                  {linkedTicket && <span style={{ color: B.textLight, fontSize: 12 }}> · 🔧 {linkedTicket.ticketNumber || 'ticket'}</span>}
                </div>
                <div style={{ width: 70, textAlign: 'right', fontSize: 13, color: B.textMid, fontFamily: f1 }}>{e.estHours != null ? `~${Number(e.estHours).toFixed(2)} h` : '—'}</div>
                {overdue && <span style={{ fontSize: 11, fontWeight: 700, color: B.red, fontFamily: f1 }}>needs logging</span>}
                {canEdit && (confirmDeleteId === e._docId ? (
                  <span style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                    <button onClick={() => handleDelete(e)} style={{ background: B.redPale, color: B.red, border: '1px solid #FECACA', borderRadius: 6, padding: '4px 10px', fontSize: 12, fontWeight: 600, fontFamily: f1, cursor: 'pointer' }}>Delete</button>
                    <button onClick={() => setConfirmDeleteId(null)} style={{ background: 'none', border: 'none', color: B.textLight, fontSize: 12, cursor: 'pointer', fontFamily: f1 }}>Cancel</button>
                  </span>
                ) : (
                  <span style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                    <button onClick={() => openLogActuals(e)} style={{ background: 'none', border: '1px solid ' + B.teal, borderRadius: 6, padding: '4px 10px', fontSize: 12, fontWeight: 600, fontFamily: f1, cursor: 'pointer', color: B.teal }}>Log actuals</button>
                    <button onClick={() => setConfirmDeleteId(e._docId)} aria-label="Delete entry" style={{ background: 'none', border: 'none', color: B.textLight, fontSize: 15, cursor: 'pointer', padding: '2px 6px' }}>🗑</button>
                  </span>
                ))}
              </div>
            );
          })}
        </div>
      )}

      {/* History groups */}
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
                    <div style={{ flex: 1, minWidth: 120, fontSize: 13, color: B.textDark }}>
                      {e.description || <span style={{ color: B.textLight }}>—</span>}
                      {e.linkedTicketId && ticketById[e.linkedTicketId] && <span style={{ color: B.textLight, fontSize: 12 }}> · 🔧 {ticketById[e.linkedTicketId].ticketNumber || 'ticket'}</span>}
                    </div>
                    <div style={{ width: 70, textAlign: 'right', fontSize: 13, fontWeight: 600, color: B.navy, fontFamily: f1 }}>{(Number(e.hours) || 0).toFixed(2)} h</div>
                    <div style={{ width: 80, textAlign: 'right', fontSize: 13, color: B.teal, fontFamily: f1 }}>{e.rate != null ? money(e.cost) : '—'}</div>
                    <Badge status={e.status} />
                    {canEdit && (confirmDeleteId === e._docId ? (
                      <span style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                        <button onClick={() => handleDelete(e)} style={{ background: B.redPale, color: B.red, border: '1px solid #FECACA', borderRadius: 6, padding: '4px 10px', fontSize: 12, fontWeight: 600, fontFamily: f1, cursor: 'pointer' }}>Delete</button>
                        <button onClick={() => setConfirmDeleteId(null)} style={{ background: 'none', border: 'none', color: B.textLight, fontSize: 12, cursor: 'pointer', fontFamily: f1 }}>Cancel</button>
                      </span>
                    ) : (
                      <span style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                        {e.status === 'logged' && (
                          <button onClick={() => updateTimeEntry(e._docId, { status: 'approved' })} title="Approve"
                            style={{ background: 'none', border: '1px solid ' + B.sand, borderRadius: 6, padding: '4px 10px', fontSize: 12, fontWeight: 600, fontFamily: f1, cursor: 'pointer', color: B.teal }}>Approve</button>
                        )}
                        {e.status === 'approved' && (
                          <>
                            <button onClick={() => updateTimeEntry(e._docId, { status: 'paid', paidDate: today })} title="Mark as paid"
                              style={{ background: 'none', border: '1px solid ' + B.sand, borderRadius: 6, padding: '4px 10px', fontSize: 12, fontWeight: 600, fontFamily: f1, cursor: 'pointer', color: '#15803D' }}>Mark Paid</button>
                            <button onClick={() => updateTimeEntry(e._docId, { status: 'logged' })} title="Unapprove"
                              style={{ background: 'none', border: '1px solid ' + B.sand, borderRadius: 6, padding: '4px 10px', fontSize: 12, fontWeight: 600, fontFamily: f1, cursor: 'pointer', color: B.textLight }}>Unapprove</button>
                          </>
                        )}
                        {e.status === 'paid' && (
                          <button onClick={() => updateTimeEntry(e._docId, { status: 'approved', paidDate: null })} title="Mark unpaid"
                            style={{ background: 'none', border: '1px solid ' + B.sand, borderRadius: 6, padding: '4px 10px', fontSize: 12, fontWeight: 600, fontFamily: f1, cursor: 'pointer', color: B.textLight }}>Unpay</button>
                        )}
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

      {/* Log / schedule modal */}
      {modal && (
        <Modal open onClose={() => setModal(null)}>
          <h3 style={{ margin: '0 0 20px', fontSize: 18, fontFamily: f1, color: B.navy }}>
            {modal.mode === 'schedule' ? 'Schedule Work' : modal.convertId ? 'Log Actual Hours' : 'Log Time'}
          </h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <FF label="Person" required>
              <select value={form.personId} onChange={e => setForm(f => ({ ...f, personId: e.target.value }))} style={inp} disabled={!!modal.convertId}>
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
            <FF label={modal.mode === 'schedule' ? 'Estimated hours' : 'Hours'} required={modal.mode !== 'schedule'}>
              <input type="number" min="0" step="0.25" value={form.hours} onChange={e => setForm(f => ({ ...f, hours: e.target.value }))} placeholder={modal.mode === 'schedule' ? 'optional, e.g. 3' : 'e.g. 3.5'} style={inp} />
            </FF>
            <FF label="Description">
              <input value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} placeholder="What was worked on?" style={inp} />
            </FF>
            {previewCost != null && (
              <div style={{ fontSize: 13, color: B.textMid, fontFamily: f1 }}>
                {modal.mode === 'schedule' ? 'Est. cost' : 'Cost'}: <strong style={{ color: B.teal }}>{money(previewCost)}</strong> ({form.hours} hrs × {money(selectedRate)}/hr)
              </div>
            )}
          </div>
          <div style={{ display: 'flex', gap: 10, marginTop: 20, justifyContent: 'flex-end' }}>
            <button onClick={() => setModal(null)} style={btnS}>Cancel</button>
            <button
              onClick={handleSave}
              disabled={busy || !form.personId || (modal.mode !== 'schedule' && !(Number(form.hours) > 0))}
              style={{ ...btnP, opacity: busy || !form.personId || (modal.mode !== 'schedule' && !(Number(form.hours) > 0)) ? 0.6 : 1 }}>
              {busy ? 'Saving…' : modal.mode === 'schedule' ? 'Schedule' : 'Log Time'}
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}
