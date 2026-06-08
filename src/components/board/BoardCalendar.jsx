import { useState, useMemo } from 'react';
import { B, f1, btnS } from '../brand/tokens.js';
import { EmojiIcon } from '../primitives/EmojiIcon.jsx';
import { localDateStr } from '../../utils/date.js';
import { priorityColors } from './boardUI.jsx';

// Shared month-grid + mobile-grouped-list calendar for the work boards. The
// Tasks and Maintenance hubs each carried a character-identical copy of this
// (TaskCalendar/MaintenanceCalendar); this is the single source of truth
// (Phase 0 board-engine groundwork). Parameterized by:
//   - items / onItemClick / isMobile
//   - noun: singular label for counts + empty state ("task", "ticket", …)
//   - dateField: which YYYY-MM-DD field places an item ("dueDate" by default)
//   - renderChip(item, todayStr): optional override for the per-day chip (a hub
//     with a different chip — e.g. Jobs — can supply one; Tasks/Maintenance use
//     the identical default below).

const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function DefaultChip({ item, date, todayStr, onItemClick }) {
  const pc = priorityColors[item.priority] || priorityColors.Medium;
  const isOverdue = date < todayStr && item.status !== 'Complete' && item.status !== 'Cancelled';
  return (
    <div onClick={e => { e.stopPropagation(); onItemClick(item); }}
      style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '2px 5px', borderRadius: 5, background: isOverdue ? '#FEE8E8' : pc.bg, borderLeft: '3px solid ' + pc.dot, cursor: 'pointer', marginBottom: 2, overflow: 'hidden' }}
      title={item.name}>
      <span style={{ fontSize: 11, color: isOverdue ? B.red : pc.tx, fontWeight: 600, fontFamily: f1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', flex: 1 }}>{item.name}</span>
      {item.recurrence && <EmojiIcon emoji="🔁" label="Recurring" style={{ fontSize: 10, flexShrink: 0 }} />}
    </div>
  );
}

export function BoardCalendar({ items, onItemClick, isMobile, noun = 'item', dateField = 'dueDate', renderChip }) {
  const now = new Date();
  const [viewYear, setViewYear] = useState(now.getFullYear());
  const [viewMonth, setViewMonth] = useState(now.getMonth());
  const [expandedDay, setExpandedDay] = useState(null);

  const dateOf = it => it[dateField];

  const itemsByDate = useMemo(() => {
    const map = new Map();
    items.forEach(t => {
      const d = dateOf(t);
      if (!d) return;
      const key = d.slice(0, 10);
      if (!map.has(key)) map.set(key, []);
      map.get(key).push(t);
    });
    return map;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items, dateField]);

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
  const chipFor = (item) => renderChip
    ? renderChip(item, todayStr)
    : <DefaultChip key={item._docId} item={item} date={dateOf(item)} todayStr={todayStr} onItemClick={onItemClick} />;

  // Mobile: grouped vertical list
  if (isMobile) {
    const weekEnd = new Date(now); weekEnd.setDate(now.getDate() + 7);
    const monthEnd = new Date(now); monthEnd.setDate(now.getDate() + 30);
    const weekEndStr = localDateStr(weekEnd);
    const monthEndStr = localDateStr(monthEnd);
    const withDue = items.filter(t => dateOf(t)).sort((a, b) => dateOf(a).localeCompare(dateOf(b)));
    const groups = [
      { label: 'Overdue', items: withDue.filter(t => dateOf(t) < todayStr && t.status !== 'Complete' && t.status !== 'Cancelled') },
      { label: 'This Week', items: withDue.filter(t => dateOf(t) >= todayStr && dateOf(t) <= weekEndStr) },
      { label: 'Next 30 Days', items: withDue.filter(t => dateOf(t) > weekEndStr && dateOf(t) <= monthEndStr) },
      { label: 'Later', items: withDue.filter(t => dateOf(t) > monthEndStr) },
    ];
    return (
      <div>
        {groups.map(g => g.items.length > 0 && (
          <div key={g.label} style={{ marginBottom: 20 }}>
            <div style={{ fontFamily: f1, fontWeight: 700, fontSize: 13, color: g.label === 'Overdue' ? B.red : B.textMid, textTransform: 'uppercase', letterSpacing: .8, marginBottom: 8 }}>{g.label}</div>
            {g.items.map(t => (
              <div key={t._docId} onClick={() => onItemClick(t)} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', borderRadius: 10, background: B.white, border: '1px solid ' + B.sand, marginBottom: 6, cursor: 'pointer' }}>
                <span style={{ width: 8, height: 8, borderRadius: '50%', background: (priorityColors[t.priority] || priorityColors.Medium).dot, flexShrink: 0 }} />
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 14, fontWeight: 600, color: B.navy, fontFamily: f1 }}>{t.name}</div>
                  <div style={{ fontSize: 12, color: B.textLight, marginTop: 2 }}>{dateOf(t)}{t.recurrence ? <> · <EmojiIcon emoji="🔁" label="Recurring" /></> : ''}</div>
                </div>
              </div>
            ))}
          </div>
        ))}
        {items.filter(t => dateOf(t)).length === 0 && <div style={{ textAlign: 'center', color: B.textLight, fontSize: 14, padding: 32 }}>No {noun}s with due dates.</div>}
      </div>
    );
  }

  // Desktop: month grid
  const total = [...itemsByDate.values()].reduce((a, b) => a + b.length, 0);
  return (
    <div>
      {/* Nav */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
        <button onClick={prevMonth} style={{ ...btnS, padding: '6px 12px', fontSize: 16, lineHeight: 1 }}>‹</button>
        <span style={{ fontFamily: f1, fontWeight: 700, fontSize: 18, color: B.navy, minWidth: 200, textAlign: 'center' }}>{MONTH_NAMES[viewMonth]} {viewYear}</span>
        <button onClick={nextMonth} style={{ ...btnS, padding: '6px 12px', fontSize: 16, lineHeight: 1 }}>›</button>
        <button onClick={goToday} style={{ ...btnS, padding: '6px 14px', fontSize: 13, marginLeft: 4 }}>Today</button>
        <span style={{ marginLeft: 'auto', fontSize: 13, color: B.textLight, fontFamily: f1 }}>{total} {noun}{total !== 1 ? 's' : ''} with due dates</span>
      </div>
      {/* Day headers */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 2, marginBottom: 2 }}>
        {DAY_NAMES.map(d => <div key={d} style={{ textAlign: 'center', fontSize: 12, fontWeight: 700, color: B.textLight, fontFamily: f1, padding: '4px 0', textTransform: 'uppercase', letterSpacing: .6 }}>{d}</div>)}
      </div>
      {/* Day cells */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 2 }}>
        {calendarDays.map((day, idx) => {
          const ds = localDateStr(day.date);
          const dayItems = itemsByDate.get(ds) || [];
          const isToday = ds === todayStr;
          const hasOverdue = dayItems.some(t => ds < todayStr && t.status !== 'Complete' && t.status !== 'Cancelled');
          const isExpanded = expandedDay === ds;
          const CHIP_LIMIT = 3;
          const visible = dayItems.slice(0, CHIP_LIMIT);
          const overflow = dayItems.length - CHIP_LIMIT;
          return (
            <div key={idx}
              onClick={() => dayItems.length > CHIP_LIMIT && setExpandedDay(isExpanded ? null : ds)}
              style={{ minHeight: 88, background: day.isCurrentMonth ? B.white : '#F8F8FA', borderRadius: 8, border: '1px solid ' + (isToday ? B.teal : hasOverdue ? '#FECACA' : B.sand), padding: '5px 6px', position: 'relative', cursor: dayItems.length > CHIP_LIMIT ? 'pointer' : 'default', outline: isToday ? '2px solid ' + B.teal : 'none', outlineOffset: '-1px' }}>
              <div style={{ fontSize: 12, fontWeight: isToday ? 800 : 500, color: isToday ? B.teal : day.isCurrentMonth ? B.textDark : B.textLight, fontFamily: f1, marginBottom: 3, textAlign: 'right' }}>{day.date.getDate()}</div>
              {(isExpanded ? dayItems : visible).map(chipFor)}
              {!isExpanded && overflow > 0 && (
                <div style={{ fontSize: 11, color: B.teal, fontWeight: 700, fontFamily: f1, textAlign: 'center', marginTop: 2 }}>+{overflow} more</div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
