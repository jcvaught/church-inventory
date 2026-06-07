import { useState, useMemo, useContext, useEffect } from 'react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell,
  AreaChart, Area,
} from 'recharts';
import { B, f1, f2, inp, btnS } from '../../components/brand/tokens.js';
import { escapeHtml } from '../../utils/print.js';
import { MobileCtx } from '../../hooks/useMobile.js';
import { localDateStr } from '../../utils/date.js';
import { Stat } from '../../components/primitives/Stat.jsx';
import { DataTableDisclosure } from '../../components/primitives/DataTableDisclosure.jsx';
import { EmojiIcon } from '../../components/primitives/EmojiIcon.jsx';

/* ─── Helpers ─────────────────────────────────────────────── */

function calcDepreciation(purchasePrice, purchaseDate, estimatedValueOverride) {
  if (estimatedValueOverride != null && estimatedValueOverride !== '') return Number(estimatedValueOverride);
  if (!purchasePrice || !purchaseDate) return null;
  const yearsOwned = (Date.now() - new Date(purchaseDate).getTime()) / (365.25 * 86400000);
  return Math.max(0, Math.round(Number(purchasePrice) * (1 - Math.min(yearsOwned / 5, 1)) * 100) / 100);
}

function fmtCurrency(n) {
  if (n == null) return '—';
  return '$' + Number(n).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
}

const CHART_COLORS = [B.teal, B.gold, B.navy, B.red, '#7C5BA0', '#2A6E9E', '#8BAD4A', '#C47D3E'];

const tooltipStyle = {
  contentStyle: { background: B.white, border: '1px solid ' + B.sand, borderRadius: 8, fontFamily: f1, fontSize: 12 },
  labelStyle: { color: B.navy, fontWeight: 600 },
};

/* ─── Shared layout ───────────────────────────────────────── */

function SectionCard({ title, icon, children, action }) {
  return (
    <div style={{ background: B.white, borderRadius: 14, padding: '20px 24px', border: '1px solid ' + B.sand, marginBottom: 20, boxShadow: '0 1px 3px rgba(27,42,74,0.06)' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16, flexWrap: 'wrap', gap: 8 }}>
        <h3 style={{ fontFamily: f1, fontSize: 16, fontWeight: 700, color: B.navy, margin: 0 }}>
          {icon} {title}
        </h3>
        {action}
      </div>
      {children}
    </div>
  );
}

function EmptyState({ icon, title, sub }) {
  return (
    <div style={{ textAlign: 'center', padding: '48px 32px', color: B.textLight }}>
      <div style={{ fontSize: 48, marginBottom: 16 }}>{icon}</div>
      <h3 style={{ fontFamily: f1, color: B.navy, margin: '0 0 8px', fontSize: 16 }}>{title}</h3>
      <p style={{ fontSize: 14, margin: 0 }}>{sub}</p>
    </div>
  );
}

function SimpleTable({ headers, rows }) {
  return (
    <div style={{ overflowX: 'auto', borderRadius: 8, border: '1px solid ' + B.sand }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
        <thead>
          <tr style={{ background: B.warmGray }}>
            {headers.map(h => (
              <th key={h} style={{ padding: '8px 12px', textAlign: 'left', fontFamily: f1, fontSize: 11, fontWeight: 600, color: B.textLight, textTransform: 'uppercase', letterSpacing: 0.8, whiteSpace: 'nowrap' }}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={i} style={{ borderTop: '1px solid ' + B.sand, background: i % 2 === 0 ? B.white : B.cream }}>
              {row.map((cell, j) => (
                <td key={j} style={{ padding: '9px 12px', color: B.textDark, verticalAlign: 'middle' }}>{cell}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/* ─── Utilization Section ─────────────────────────────────── */

function UtilizationSection({ items, activityLog, isMobile }) {
  const checkoutsByItem = useMemo(() => {
    const map = {};
    activityLog.filter(l => l.action === 'check_out').forEach(l => {
      map[l.itemId] = (map[l.itemId] || 0) + 1;
    });
    return map;
  }, [activityLog]);

  const avgDurationByItem = useMemo(() => {
    const checkouts = activityLog.filter(l => l.action === 'check_out').sort((a, b) => a.timestamp?.localeCompare(b.timestamp));
    const returns = activityLog.filter(l => l.action === 'return').sort((a, b) => a.timestamp?.localeCompare(b.timestamp));
    const durations = {};
    returns.forEach(ret => {
      const prior = [...checkouts].reverse().find(c => c.itemId === ret.itemId && c.timestamp < ret.timestamp);
      if (!prior) return;
      const days = (new Date(ret.timestamp) - new Date(prior.timestamp)) / 86400000;
      if (!durations[ret.itemId]) durations[ret.itemId] = [];
      durations[ret.itemId].push(days);
    });
    const result = {};
    Object.entries(durations).forEach(([id, arr]) => {
      result[id] = Math.round((arr.reduce((s, v) => s + v, 0) / arr.length) * 10) / 10;
    });
    return result;
  }, [activityLog]);

  const itemsByUse = useMemo(() =>
    items.filter(i => i.status !== 'Disposed')
      .map(i => ({ ...i, checkouts: checkoutsByItem[i.itemId] || 0, avgDays: avgDurationByItem[i.itemId] ?? null }))
      .sort((a, b) => b.checkouts - a.checkouts),
  [items, checkoutsByItem, avgDurationByItem]);

  const neverUsed = useMemo(() => itemsByUse.filter(i => i.checkouts === 0), [itemsByUse]);
  const totalCheckouts = useMemo(() => Object.values(checkoutsByItem).reduce((s, v) => s + v, 0), [checkoutsByItem]);

  const top10 = itemsByUse.filter(i => i.checkouts > 0).slice(0, 10).map(i => ({
    name: i.description.length > 22 ? i.description.slice(0, 22) + '…' : i.description,
    full: i.description,
    checkouts: i.checkouts,
  }));

  if (totalCheckouts === 0) {
    return <EmptyState icon="📊" title="No checkout history yet" sub="Utilization data appears here as items are checked out and returned." />;
  }

  return (
    <>
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 20 }}>
        <Stat label="Total Checkouts" value={totalCheckouts} icon="📤" color={B.teal} />
        <Stat label="Most Used" value={itemsByUse[0]?.checkouts > 0 ? itemsByUse[0].checkouts + 'x' : '—'} icon="🏆" color={B.gold} />
        <Stat label="Never Used" value={neverUsed.length} icon="💤" color={neverUsed.length > 0 ? B.red : B.textMid} />
      </div>

      {top10.length > 0 && (
        <div style={{ marginBottom: 20 }}>
          <div style={{ fontSize: 12, color: B.textLight, fontFamily: f1, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 10 }}>Top {top10.length} Most Used Items</div>
          <ResponsiveContainer width="100%" height={isMobile ? 180 : 260}>
            <BarChart data={top10} layout="vertical" margin={{ top: 0, right: 16, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke={B.sand} />
              <XAxis type="number" tick={{ fontFamily: f1, fontSize: 11, fill: B.textLight }} />
              <YAxis type="category" dataKey="name" width={isMobile ? 90 : 140} tick={{ fontFamily: f1, fontSize: 11, fill: B.textDark }} />
              <Tooltip {...tooltipStyle} formatter={(v, _, p) => [v + ' checkouts', p.payload.full]} />
              <Bar dataKey="checkouts" fill={B.teal} radius={[0, 4, 4, 0]} />
            </BarChart>
          </ResponsiveContainer>
          <DataTableDisclosure
            caption={`Top ${top10.length} most used items`}
            headers={['Item', 'Checkouts']}
            rows={top10.map(i => [i.full, i.checkouts])}
          />
        </div>
      )}

      <SimpleTable
        headers={['Item', 'ID', 'Checkouts', 'Avg Duration']}
        rows={itemsByUse.slice(0, 20).map(i => [
          i.description,
          <span key={i.itemId} style={{ fontFamily: 'monospace', fontSize: 12 }}>{i.itemId}</span>,
          i.checkouts,
          i.avgDays != null ? i.avgDays + ' days' : '—',
        ])}
      />

      {neverUsed.length > 0 && (
        <details style={{ marginTop: 16 }}>
          <summary style={{ cursor: 'pointer', fontFamily: f1, fontSize: 13, fontWeight: 600, color: B.textMid, padding: '8px 0' }}>
            {neverUsed.length} item{neverUsed.length !== 1 ? 's' : ''} never checked out
          </summary>
          <div style={{ marginTop: 8, display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {neverUsed.map(i => (
              <span key={i._docId} style={{ padding: '4px 10px', borderRadius: 20, background: B.warmGray, fontSize: 12, color: B.textMid, fontFamily: f1 }}>{i.description}</span>
            ))}
          </div>
        </details>
      )}
    </>
  );
}

/* ─── Ministry Breakdown Section ──────────────────────────── */

function MinistrySection({ activityLog, isMobile }) {
  const ministryData = useMemo(() => {
    const map = {};
    activityLog.filter(l => l.action === 'check_out' && l.details?.ministry).forEach(l => {
      const m = l.details.ministry;
      map[m] = (map[m] || 0) + 1;
    });
    return Object.entries(map).sort((a, b) => b[1] - a[1]).map(([name, value]) => ({ name, value }));
  }, [activityLog]);

  const total = ministryData.reduce((s, d) => s + d.value, 0);

  if (ministryData.length === 0) {
    return <EmptyState icon="⛪" title="No ministry data yet" sub="Ministry breakdown appears when items are checked out with a ministry selected." />;
  }

  return (
    <>
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 20 }}>
        <Stat label="Top Ministry" value={ministryData[0]?.name || '—'} icon="🥇" color={B.teal} />
        <Stat label="Ministries Active" value={ministryData.length} icon="⛪" color={B.navy} />
        <Stat label="Checkouts Tracked" value={total} icon="📊" color={B.gold} />
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 24, flexWrap: 'wrap', marginBottom: 20 }}>
        <div style={{ flex: '0 0 auto' }}>
          <PieChart width={isMobile ? 160 : 200} height={isMobile ? 160 : 200}>
            <Pie data={ministryData} cx="50%" cy="50%" outerRadius={isMobile ? 70 : 88} dataKey="value">
              {ministryData.map((_, i) => <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />)}
            </Pie>
            <Tooltip {...tooltipStyle} formatter={(v) => [v + ' checkouts']} />
          </PieChart>
        </div>
        <div style={{ flex: 1, minWidth: 160 }}>
          {ministryData.map((d, i) => (
            <div key={d.name} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
              <div style={{ width: 10, height: 10, borderRadius: 2, background: CHART_COLORS[i % CHART_COLORS.length], flexShrink: 0 }} />
              <div style={{ flex: 1, fontSize: 13, color: B.textDark, fontFamily: f2 }}>{d.name}</div>
              <div style={{ fontSize: 13, fontWeight: 600, color: B.navy, fontFamily: f1 }}>{d.value}</div>
              <div style={{ fontSize: 11, color: B.textLight, width: 36, textAlign: 'right' }}>{Math.round(d.value / total * 100)}%</div>
            </div>
          ))}
        </div>
      </div>
      <DataTableDisclosure
        caption="Checkouts by ministry"
        headers={['Ministry', 'Checkouts', 'Share']}
        rows={ministryData.map(d => [d.name, d.value, Math.round(d.value / total * 100) + '%'])}
      />
    </>
  );
}

/* ─── Seasonal Trends Section ─────────────────────────────── */

function SeasonalSection({ activityLog, isMobile }) {
  const monthlyData = useMemo(() => {
    const map = {};
    const cutoff = new Date();
    cutoff.setMonth(cutoff.getMonth() - 11);
    cutoff.setDate(1);
    activityLog
      .filter(l => l.action === 'check_out' && l.timestamp >= cutoff.toISOString())
      .forEach(l => {
        const key = l.timestamp.slice(0, 7);
        map[key] = (map[key] || 0) + 1;
      });
    const result = [];
    for (let i = 11; i >= 0; i--) {
      const d = new Date();
      d.setMonth(d.getMonth() - i);
      const key = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;
      result.push({ month: d.toLocaleString('default', { month: 'short', year: '2-digit' }), checkouts: map[key] || 0 });
    }
    return result;
  }, [activityLog]);

  const maxMonth = monthlyData.reduce((a, b) => b.checkouts > a.checkouts ? b : a, monthlyData[0]);
  const currentMonth = monthlyData[monthlyData.length - 1];
  const totalLast12 = monthlyData.reduce((s, d) => s + d.checkouts, 0);

  if (totalLast12 === 0) {
    return <EmptyState icon="📅" title="No trend data yet" sub="Seasonal trends appear after items have been checked out." />;
  }

  return (
    <>
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 20 }}>
        <Stat label="Last 12 Months" value={totalLast12} icon="📅" color={B.teal} />
        <Stat label="Busiest Month" value={maxMonth?.month || '—'} icon="📈" color={B.gold} />
        <Stat label="This Month" value={currentMonth?.checkouts || 0} icon="📆" color={B.navy} />
      </div>
      <ResponsiveContainer width="100%" height={isMobile ? 180 : 220}>
        <AreaChart data={monthlyData} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
          <defs>
            <linearGradient id="tealGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor={B.teal} stopOpacity={0.2} />
              <stop offset="95%" stopColor={B.teal} stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke={B.sand} />
          <XAxis dataKey="month" tick={{ fontFamily: f1, fontSize: 10, fill: B.textLight }} angle={isMobile ? -35 : 0} textAnchor={isMobile ? 'end' : 'middle'} height={isMobile ? 44 : 30} interval={isMobile ? 0 : 'preserveEnd'} />
          <YAxis allowDecimals={false} tick={{ fontFamily: f1, fontSize: 10, fill: B.textLight }} />
          <Tooltip {...tooltipStyle} formatter={(v) => [v + ' checkouts', 'Checkouts']} />
          <Area type="monotone" dataKey="checkouts" stroke={B.teal} strokeWidth={2} fill="url(#tealGrad)" dot={{ r: 3, fill: B.teal }} />
        </AreaChart>
      </ResponsiveContainer>
      <DataTableDisclosure
        caption="Monthly checkouts — last 12 months"
        headers={['Month', 'Checkouts']}
        rows={monthlyData.map(m => [m.month, m.checkouts])}
      />
    </>
  );
}

/* ─── Financial & Depreciation Section ───────────────────── */

function FinancialSection({ items, isMobile: _isMobile }) {
  const today = new Date();

  const financialItems = useMemo(() =>
    items.filter(i => i.status !== 'Disposed' && (i.purchasePrice != null || i.estimatedValue != null))
      .map(i => ({ ...i, currentValue: calcDepreciation(i.purchasePrice, i.purchaseDate, i.estimatedValue) }))
      .sort((a, b) => (b.currentValue ?? 0) - (a.currentValue ?? 0)),
  [items]);

  const totalOriginal = useMemo(() => financialItems.reduce((s, i) => s + (i.purchasePrice || 0), 0), [financialItems]);
  const totalCurrent = useMemo(() => financialItems.reduce((s, i) => s + (i.currentValue || 0), 0), [financialItems]);

  const warrantyAlerts = useMemo(() => {
    const in90 = new Date();
    in90.setDate(in90.getDate() + 90);
    return items
      .filter(i => i.warrantyExpiry && i.status !== 'Disposed')
      .filter(i => new Date(i.warrantyExpiry) <= in90)
      .sort((a, b) => a.warrantyExpiry.localeCompare(b.warrantyExpiry));
  }, [items]);

  if (financialItems.length === 0) {
    return (
      <EmptyState
        icon="💰"
        title="No financial data yet"
        sub={`Add purchase date, price, or warranty info when editing items. ${items.filter(i => i.status !== 'Disposed').length} active items have no financial data.`}
      />
    );
  }

  const depreciation = totalOriginal - totalCurrent;
  const deprecPct = totalOriginal > 0 ? Math.round(depreciation / totalOriginal * 100) : 0;

  return (
    <>
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 20 }}>
        <Stat label="Original Cost" value={fmtCurrency(totalOriginal)} icon="💵" color={B.navy} />
        <Stat label="Current Value" value={fmtCurrency(totalCurrent)} icon="📊" color={B.teal} />
        <Stat label="Depreciation" value={fmtCurrency(depreciation)} icon="📉" color={B.textMid} />
      </div>

      {warrantyAlerts.length > 0 && (
        <div style={{ background: B.redPale, border: '1px solid #FECACA', borderRadius: 10, padding: '12px 16px', marginBottom: 16 }}>
          <div style={{ fontFamily: f1, fontWeight: 700, color: B.red, fontSize: 13, marginBottom: 6 }}><EmojiIcon emoji="⚠️" label="Warning" /> Warranty Alerts ({warrantyAlerts.length})</div>
          {warrantyAlerts.map(i => (
            <div key={i._docId} style={{ fontSize: 13, color: B.textDark, display: 'flex', justifyContent: 'space-between', padding: '3px 0' }}>
              <span>{i.description}</span>
              <span style={{ color: new Date(i.warrantyExpiry) < today ? B.red : B.textMid, fontWeight: 600 }}>
                {new Date(i.warrantyExpiry) < today ? 'EXPIRED' : 'Expires'} {i.warrantyExpiry}
              </span>
            </div>
          ))}
        </div>
      )}

      <p style={{ fontSize: 12, color: B.textLight, margin: '0 0 12px', fontFamily: f1 }}>
        {financialItems.length} of {items.filter(i => i.status !== 'Disposed').length} active items have financial data · {deprecPct}% depreciated
      </p>

      <SimpleTable
        headers={['Item', 'Purchased', 'Original Cost', 'Est. Value', '% Remaining']}
        rows={financialItems.map(i => {
          const pct = i.purchasePrice ? Math.round((i.currentValue || 0) / i.purchasePrice * 100) : null;
          return [
            i.description,
            i.purchaseDate || '—',
            i.purchasePrice != null ? fmtCurrency(i.purchasePrice) : '—',
            fmtCurrency(i.currentValue),
            pct != null ? <span style={{ color: pct < 20 ? B.red : pct < 50 ? B.gold : B.teal, fontWeight: 600 }}>{pct}%</span> : '—',
          ];
        })}
      />
    </>
  );
}

/* ─── Supply Burn Rate Section ────────────────────────────── */

function SuppliesSection({ supplies, activityLog, isMobile }) {
  const burnData = useMemo(() => {
    // eslint-disable-next-line react-hooks/purity
    const cutoff90 = new Date(Date.now() - 90 * 86400000).toISOString();
    const usage = {};
    activityLog
      .filter(l => l.action === 'use_supply' && l.timestamp >= cutoff90)
      .forEach(l => {
        usage[l.itemId] = (usage[l.itemId] || 0) + (l.details?.quantityUsed || 0);
      });

    return supplies
      .map(s => {
        const used90 = usage[s.supplyId] || 0;
        const dailyRate = used90 / 90;
        const daysLeft = dailyRate > 0 ? Math.floor(s.quantity / dailyRate) : null;
        const reorderDate = daysLeft != null
          // eslint-disable-next-line react-hooks/purity
          ? localDateStr(new Date(Date.now() + daysLeft * 86400000))
          : null;
        return { ...s, used90, dailyRate: Math.round(dailyRate * 10) / 10, daysLeft, reorderDate };
      })
      .filter(s => s.quantity > 0 || s.used90 > 0)
      .sort((a, b) => (a.daysLeft ?? 9999) - (b.daysLeft ?? 9999));
  }, [supplies, activityLog]);

  const runningOutSoon = burnData.filter(s => s.daysLeft != null && s.daysLeft <= 14);
  const tracked = burnData.filter(s => s.used90 > 0);

  if (burnData.length === 0) {
    return <EmptyState icon="🧴" title="No supply data yet" sub="Supply burn rate appears after supplies have been used." />;
  }

  const top10Chart = [...burnData].filter(s => s.used90 > 0).sort((a, b) => b.used90 - a.used90).slice(0, 10).map(s => ({
    name: s.description.length > 20 ? s.description.slice(0, 20) + '…' : s.description,
    used: s.used90,
  }));

  return (
    <>
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 20 }}>
        <Stat label="Supplies Tracked" value={supplies.length} icon="🧴" color={B.navy} />
        <Stat label="Used (90 days)" value={tracked.length} icon="📉" color={B.teal} />
        <Stat label="Running Low" value={runningOutSoon.length} icon="⚠️" color={runningOutSoon.length > 0 ? B.red : B.textMid} />
      </div>

      {runningOutSoon.length > 0 && (
        <div style={{ background: B.redPale, border: '1px solid #FECACA', borderRadius: 10, padding: '12px 16px', marginBottom: 16 }}>
          <div style={{ fontFamily: f1, fontWeight: 700, color: B.red, fontSize: 13, marginBottom: 6 }}><EmojiIcon emoji="⚠️" label="Warning" /> Running Out Soon</div>
          {runningOutSoon.map(s => (
            <div key={s._docId} style={{ fontSize: 13, color: B.textDark, display: 'flex', justifyContent: 'space-between', padding: '3px 0' }}>
              <span>{s.description}</span>
              <span style={{ color: B.red, fontWeight: 600 }}>{s.quantity} left · ~{s.daysLeft} days</span>
            </div>
          ))}
        </div>
      )}

      {top10Chart.length > 0 && (
        <div style={{ marginBottom: 20 }}>
          <div style={{ fontSize: 12, color: B.textLight, fontFamily: f1, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 10 }}>Top Consumed (last 90 days)</div>
          <ResponsiveContainer width="100%" height={isMobile ? 160 : 220}>
            <BarChart data={top10Chart} layout="vertical" margin={{ top: 0, right: 16, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke={B.sand} />
              <XAxis type="number" tick={{ fontFamily: f1, fontSize: 11, fill: B.textLight }} />
              <YAxis type="category" dataKey="name" width={isMobile ? 90 : 140} tick={{ fontFamily: f1, fontSize: 11, fill: B.textDark }} />
              <Tooltip {...tooltipStyle} formatter={(v) => [v + ' units', 'Used']} />
              <Bar dataKey="used" fill={B.gold} radius={[0, 4, 4, 0]} />
            </BarChart>
          </ResponsiveContainer>
          <DataTableDisclosure
            caption="Top consumed supplies — last 90 days"
            headers={['Supply', 'Units used (90d)']}
            rows={top10Chart.map(s => [s.name, s.used])}
          />
        </div>
      )}

      <SimpleTable
        headers={['Supply', 'In Stock', 'Used (90d)', 'Daily Avg', 'Days Left', 'Est. Reorder']}
        rows={burnData.map(s => [
          s.description,
          s.quantity + (s.unit ? ' ' + s.unit : ''),
          s.used90 || '—',
          s.dailyRate > 0 ? s.dailyRate + '/day' : '—',
          s.daysLeft != null
            ? <span style={{ color: s.daysLeft <= 14 ? B.red : s.daysLeft <= 30 ? B.gold : B.teal, fontWeight: 600 }}>{s.daysLeft}</span>
            : '—',
          s.reorderDate || '—',
        ])}
      />
    </>
  );
}

/* ─── Location Report Section ────────────────────────────── */

function LocationSection({ items, supplies, settings, isMobile }) {
  const locations = useMemo(() => settings?.locations || [], [settings]);
  const [loc, setLoc] = useState('');

  const locItems = useMemo(() =>
    loc ? items.filter(i => i.status !== 'Disposed' && i.location === loc) : [],
  [items, loc]);

  const locSupplies = useMemo(() =>
    loc ? supplies.filter(s => s.location === loc) : [],
  [supplies, loc]);

  function exportCSV() {
    const rows = [
      ['Type', 'ID', 'Description', 'Status / Qty', 'Ministry', 'Tags'],
      ...locItems.map(i => ['Item', i.itemId, i.description, i.status, i.ministry || '', (i.tags || []).join('; ')]),
      ...locSupplies.map(s => ['Supply', s.supplyId, s.description, s.quantity + (s.unit ? ' ' + s.unit : ''), s.ministry || '', (s.tags || []).join('; ')]),
    ];
    const csv = rows.map(r => r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `location-${(loc || 'report').replace(/\s+/g, '-').toLowerCase()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  if (!locations.length) {
    return <EmptyState icon="📍" title="No locations configured" sub="Add locations in Settings to use this report." />;
  }

  return (
    <>
      <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 20, flexWrap: 'wrap' }}>
        <select style={{ ...inp, flex: isMobile ? '1' : '0 0 240px' }} value={loc} onChange={e => setLoc(e.target.value)}>
          <option value="">— Select a location —</option>
          {locations.map(l => <option key={l} value={l}>{l}</option>)}
        </select>
        {loc && (
          <button onClick={exportCSV} style={{ ...btnS, fontSize: 13, padding: '8px 14px' }} aria-label="Export location report CSV">
            <EmojiIcon emoji="⬇" decorative /> Export CSV
          </button>
        )}
      </div>

      {loc && (
        <>
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 20 }}>
            <Stat label="Items" value={locItems.length} icon="📦" color={B.navy} />
            <Stat label="Supplies" value={locSupplies.length} icon="🧴" color={B.teal} />
          </div>

          <div style={{ marginBottom: 20 }}>
            <div style={{ fontSize: 12, color: B.textLight, fontFamily: f1, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 10 }}>
              Items ({locItems.length})
            </div>
            {locItems.length === 0
              ? <p style={{ color: B.textLight, fontSize: 13 }}>No active items at this location.</p>
              : <SimpleTable
                  headers={['ID', 'Description', 'Status', 'Ministry']}
                  rows={locItems.map(i => [
                    <span key="id" style={{ fontFamily: 'monospace', fontSize: 12 }}>{i.itemId}</span>,
                    i.description,
                    <span key="status" style={{ color: i.status === 'Available' ? B.teal : i.status === 'Checked Out' ? B.gold : B.textMid, fontWeight: 600, fontSize: 12 }}>{i.status}</span>,
                    i.ministry || <span key="ministry" style={{ color: B.textLight }}>—</span>,
                  ])}
                />
            }
          </div>

          <div>
            <div style={{ fontSize: 12, color: B.textLight, fontFamily: f1, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 10 }}>
              Supplies ({locSupplies.length})
            </div>
            {locSupplies.length === 0
              ? <p style={{ color: B.textLight, fontSize: 13 }}>No supplies at this location.</p>
              : <SimpleTable
                  headers={['ID', 'Description', 'In Stock', 'Min', 'Ministry']}
                  rows={locSupplies.map(s => [
                    <span key="id" style={{ fontFamily: 'monospace', fontSize: 12 }}>{s.supplyId}</span>,
                    s.description,
                    <span key="qty" style={{ color: s.quantity <= s.minQuantity ? B.red : B.teal, fontWeight: 600 }}>{s.quantity} {s.unit || ''}</span>,
                    s.minQuantity || '—',
                    s.ministry || <span key="ministry" style={{ color: B.textLight }}>—</span>,
                  ])}
                />
            }
          </div>
        </>
      )}
    </>
  );
}

/* ─── Print Report ────────────────────────────────────────── */

function printInsightsReport({ utilization, ministry, financial, churchName }) {
  const win = window.open('', '_blank');
  if (!win) return;

  const topItems = utilization.slice(0, 20);
  const finItems = financial.slice(0, 30);
  const minData = ministry;

  const safeChurchName = escapeHtml(churchName) || 'ChurchOpsHub';
  win.document.write(`<!DOCTYPE html><html><head><title>Insights Report — ${safeChurchName}</title>
  <style>
    *{margin:0;padding:0;box-sizing:border-box}
    body{font-family:Arial,sans-serif;font-size:12px;color:#1B2A4A;padding:32px}
    h1{font-size:20px;font-weight:700;margin-bottom:4px}
    h2{font-size:14px;font-weight:700;color:#2A7D6E;border-bottom:2px solid #2A7D6E;padding-bottom:4px;margin:24px 0 10px}
    .meta{font-size:11px;color:#8B93A1;margin-bottom:24px}
    table{width:100%;border-collapse:collapse;margin-bottom:12px}
    th{text-align:left;font-size:10px;text-transform:uppercase;letter-spacing:.8px;color:#8B93A1;padding:6px 8px;border-bottom:1px solid #E8E4DC}
    td{padding:7px 8px;border-bottom:1px solid #F2F0EB;font-size:12px}
    @media print{body{padding:16px}}
  </style></head><body>
  <h1>${safeChurchName} — Insights Report</h1>
  <div class="meta">Generated ${new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}</div>

  <h2>Item Utilization (Top 20)</h2>
  <table><thead><tr><th>Item</th><th>ID</th><th>Checkouts</th><th>Avg Duration</th></tr></thead><tbody>
    ${topItems.map(i => `<tr><td>${escapeHtml(i.description)}</td><td style="font-family:monospace">${escapeHtml(i.itemId)}</td><td>${i.checkouts}</td><td>${i.avgDays != null ? i.avgDays + ' days' : '—'}</td></tr>`).join('')}
  </tbody></table>

  <h2>Ministry Breakdown</h2>
  <table><thead><tr><th>Ministry</th><th>Checkouts</th><th>Share</th></tr></thead><tbody>
    ${(() => { const tot = minData.reduce((s,d)=>s+d.value,0); return minData.map(d => `<tr><td>${escapeHtml(d.name)}</td><td>${d.value}</td><td>${Math.round(d.value/tot*100)}%</td></tr>`).join(''); })()}
  </tbody></table>

  ${finItems.length > 0 ? `
  <h2>Financial Summary</h2>
  <table><thead><tr><th>Item</th><th>Purchased</th><th>Original Cost</th><th>Est. Value</th></tr></thead><tbody>
    ${finItems.map(i => `<tr><td>${escapeHtml(i.description)}</td><td>${escapeHtml(i.purchaseDate) || '—'}</td><td>${i.purchasePrice != null ? '$' + Number(i.purchasePrice).toLocaleString() : '—'}</td><td>${i.currentValue != null ? '$' + Number(i.currentValue).toLocaleString() : '—'}</td></tr>`).join('')}
  </tbody></table>` : ''}
  </body></html>`);
  win.document.close();
}

/* ─── InsightsPage ────────────────────────────────────────── */

const SECTIONS = [
  { key: 'utilization', label: 'Item Utilization', icon: '📊' },
  { key: 'ministry',    label: 'Ministry Breakdown', icon: '⛪' },
  { key: 'seasonal',    label: 'Seasonal Trends', icon: '📅' },
  { key: 'financial',   label: 'Financial', icon: '💰' },
  { key: 'supplies',    label: 'Supply Burn Rate', icon: '🧴' },
  { key: 'location',    label: 'Location Report', icon: '📍' },
];

export function InsightsPage({ store, userProfile: _userProfile }) {
  const { items, supplies, activityLog, config, settings, loadActivityLogSince } = store;
  const isMobile = useContext(MobileCtx);
  const [section, setSection] = useState(() => localStorage.getItem('insights_section') || 'utilization');

  // The live `activityLog` subscription is capped at 100 entries to bound read
  // cost (useFirestore.js), which silently truncated analytics on older
  // churches. Pull the trailing 12-month window once for the analytics math —
  // it covers seasonal (12mo) and supply burn (90d) alike. Falls back to the
  // capped live array until the one-shot fetch resolves.
  const [windowLog, setWindowLog] = useState(null);
  useEffect(() => {
    let cancelled = false;
    const since = new Date();
    since.setMonth(since.getMonth() - 12);
    since.setDate(since.getDate() - 1); // small cushion past the 12-month edge
    loadActivityLogSince(since.toISOString()).then((rows) => {
      if (!cancelled) setWindowLog(rows);
    });
    return () => { cancelled = true; };
  }, [loadActivityLogSince]);
  const analyticsLog = windowLog ?? activityLog;

  function setActiveSection(k) {
    setSection(k);
    localStorage.setItem('insights_section', k);
  }

  const activeItems = useMemo(() => items.filter(i => i.status !== 'Disposed'), [items]);

  /* data for print report */
  const utilizationForPrint = useMemo(() => {
    const map = {};
    analyticsLog.filter(l => l.action === 'check_out').forEach(l => { map[l.itemId] = (map[l.itemId] || 0) + 1; });
    const returns = analyticsLog.filter(l => l.action === 'return').sort((a, b) => a.timestamp?.localeCompare(b.timestamp));
    const checkouts = analyticsLog.filter(l => l.action === 'check_out').sort((a, b) => a.timestamp?.localeCompare(b.timestamp));
    const durations = {};
    returns.forEach(ret => {
      const prior = [...checkouts].reverse().find(c => c.itemId === ret.itemId && c.timestamp < ret.timestamp);
      if (!prior) return;
      const days = (new Date(ret.timestamp) - new Date(prior.timestamp)) / 86400000;
      if (!durations[ret.itemId]) durations[ret.itemId] = [];
      durations[ret.itemId].push(days);
    });
    return activeItems.map(i => ({
      ...i,
      checkouts: map[i.itemId] || 0,
      avgDays: durations[i.itemId] ? Math.round(durations[i.itemId].reduce((s,v)=>s+v,0) / durations[i.itemId].length * 10) / 10 : null,
    })).sort((a, b) => b.checkouts - a.checkouts);
  }, [activeItems, analyticsLog]);

  const ministryForPrint = useMemo(() => {
    const map = {};
    analyticsLog.filter(l => l.action === 'check_out' && l.details?.ministry).forEach(l => {
      const m = l.details.ministry;
      map[m] = (map[m] || 0) + 1;
    });
    return Object.entries(map).sort((a, b) => b[1] - a[1]).map(([name, value]) => ({ name, value }));
  }, [analyticsLog]);

  const financialForPrint = useMemo(() =>
    activeItems
      .filter(i => i.purchasePrice != null || i.estimatedValue != null)
      .map(i => ({ ...i, currentValue: calcDepreciation(i.purchasePrice, i.purchaseDate, i.estimatedValue) }))
      .sort((a, b) => (b.currentValue ?? 0) - (a.currentValue ?? 0)),
  [activeItems]);

  const pillStyle = (k) => ({
    padding: '8px 16px', borderRadius: 20, cursor: 'pointer', fontSize: 13, fontWeight: 600,
    fontFamily: f1, whiteSpace: 'nowrap', transition: 'all 0.15s',
    background: section === k ? B.teal : B.white,
    color: section === k ? B.white : B.textMid,
    boxShadow: section === k ? '0 2px 6px rgba(42,125,110,0.25)' : 'none',
    border: section === k ? 'none' : '1px solid ' + B.sand,
  });

  return (
    <div>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20, flexWrap: 'wrap', gap: 12 }}>
        <h2 style={{ fontFamily: f1, fontSize: 22, fontWeight: 700, color: B.navy, margin: 0 }}>Insights Hub</h2>
        <button
          onClick={() => printInsightsReport({ utilization: utilizationForPrint, ministry: ministryForPrint, financial: financialForPrint, churchName: config?.churchName })}
          style={{ ...btnS, fontSize: 13, padding: '9px 18px' }}
        >
          <EmojiIcon emoji="🖨" decorative /> Print Report
        </button>
      </div>

      {/* Section tabs */}
      <div style={{ display: 'flex', gap: 8, overflowX: 'auto', paddingBottom: 4, marginBottom: 20, WebkitOverflowScrolling: 'touch' }}>
        {SECTIONS.map(s => (
          <button key={s.key} onClick={() => setActiveSection(s.key)} style={pillStyle(s.key)}>
            {s.icon} {isMobile ? '' : s.label}
          </button>
        ))}
      </div>

      {/* Active section */}
      {['utilization', 'ministry', 'seasonal', 'supplies'].includes(section) && (
        <p style={{ fontSize: 11, color: B.textLight, fontFamily: f1, margin: '-8px 0 14px' }}>
          Usage analytics computed from the last 12 months of activity.
        </p>
      )}
      {section === 'utilization' && (
        <SectionCard title="Item Utilization" icon="📊">
          <UtilizationSection items={activeItems} activityLog={analyticsLog} isMobile={isMobile} />
        </SectionCard>
      )}
      {section === 'ministry' && (
        <SectionCard title="Ministry Breakdown" icon="⛪">
          <MinistrySection activityLog={analyticsLog} isMobile={isMobile} />
        </SectionCard>
      )}
      {section === 'seasonal' && (
        <SectionCard title="Seasonal Trends" icon="📅">
          <SeasonalSection activityLog={analyticsLog} isMobile={isMobile} />
        </SectionCard>
      )}
      {section === 'financial' && (
        <SectionCard title="Financial & Depreciation" icon="💰">
          <FinancialSection items={activeItems} isMobile={isMobile} />
        </SectionCard>
      )}
      {section === 'supplies' && (
        <SectionCard title="Supply Burn Rate" icon="🧴">
          <SuppliesSection supplies={supplies} activityLog={analyticsLog} isMobile={isMobile} />
        </SectionCard>
      )}
      {section === 'location' && (
        <SectionCard title="Location Report" icon="📍">
          <LocationSection items={activeItems} supplies={supplies} settings={settings} isMobile={isMobile} />
        </SectionCard>
      )}
    </div>
  );
}
