// Audit overnight 2026-05-12 / Perf #7: qrcode is ~50KB minified and only
// fires on printLabel (one of many print operations). Dynamic import keeps
// it out of the main bundle.

import { formatTimeForDisplay } from './time.js';

export function escapeHtml(str) {
  if (str == null) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export async function printLabel(item, churchName) {
  const appUrl = window.location.origin + window.location.pathname.replace(/\/+$/, '') + '?item=' + encodeURIComponent(item.itemId);
  const { default: QRCode } = await import('qrcode');
  const qrSrc = await QRCode.toDataURL(appUrl, { width: 200, margin: 2 });
  const win = window.open('', '_blank');
  if (!win) return;
  const org = escapeHtml(churchName) || 'ChurchOpsHub';
  const desc = escapeHtml(item.description);
  const id = escapeHtml(item.itemId);
  const loc = escapeHtml(item.location);
  const min = escapeHtml(item.ministry);
  const cond = escapeHtml(item.condition);
  win.document.write(`<!DOCTYPE html><html><head><title>${id}</title><style>
    *{margin:0;padding:0;box-sizing:border-box}
    body{font-family:Arial,sans-serif;display:flex;justify-content:center;padding:32px;background:#fff}
    .label{border:2px solid #1B2A4A;border-radius:12px;padding:22px 26px;width:340px;text-align:center}
    .org{font-size:10px;color:#8B93A1;text-transform:uppercase;letter-spacing:2px;font-weight:600;margin-bottom:14px}
    .desc{font-size:22px;font-weight:700;color:#1B2A4A;line-height:1.2;margin-bottom:6px}
    .id{font-family:monospace;font-size:16px;letter-spacing:3px;color:#5A6477;margin-bottom:16px}
    hr{border:none;border-top:1px solid #E8E4DC;margin:10px 0}
    .meta{font-size:12px;color:#8B93A1;margin:4px 0}
    @media print{body{padding:0}}
  </style></head><body>
  <div class="label">
    <div class="org">${org} · Inventory</div>
    <div class="desc">${desc}</div>
    <div class="id">${id}</div>
    <img src="${qrSrc}" width="180" height="180" style="display:block;margin:0 auto 16px" onload="window.print()">
    <hr>
    ${loc?`<div class="meta">📍 ${loc}</div>`:''}
    ${min?`<div class="meta">⛪ ${min}</div>`:''}
    ${cond?`<div class="meta">Condition: ${cond}</div>`:''}
  </div>
  </body></html>`);
  win.document.close();
}

export function printJobRoster(jobs, churchName) {
  const org = escapeHtml(churchName) || 'ChurchOpsHub';
  const rows = jobs.map(job => {
    const parts = (job.scheduledDate || '').slice(0, 10).split('-').map(Number);
    const dateStr = parts.length === 3 ? new Date(parts[0], parts[1] - 1, parts[2]).toLocaleDateString('en-US', { weekday:'short', month:'short', day:'numeric', year:'numeric' }) : '—';
    const timeStr = job.scheduledTime ? ` at ${escapeHtml(formatTimeForDisplay(job.scheduledTime))}` : '';
    const signupList = (job.signups || []).map(s => escapeHtml(s.name)).join(', ') || '<em style="color:#aaa">No signups</em>';
    return `<tr>
      <td class="mono">${escapeHtml(job.jobNumber || '')}</td>
      <td>${escapeHtml(job.title || '')}</td>
      <td style="white-space:nowrap">${dateStr}${timeStr}</td>
      <td>${escapeHtml(job.location || '—')}</td>
      <td style="text-align:center">${(job.signups||[]).length}/${job.spotsTotal||1}</td>
      <td>${signupList}</td>
    </tr>`;
  }).join('');
  const win = window.open('', '_blank');
  if (!win) return;
  win.document.write(`<!DOCTYPE html><html><head><title>Job Roster — ${org}</title><style>
    *{margin:0;padding:0;box-sizing:border-box}
    body{font-family:Arial,sans-serif;font-size:12px;color:#1B2A4A;padding:32px}
    h1{font-size:20px;font-weight:700;margin-bottom:4px}
    .meta{font-size:11px;color:#8B93A1;margin-bottom:24px}
    table{width:100%;border-collapse:collapse}
    th{text-align:left;font-size:10px;text-transform:uppercase;letter-spacing:.8px;color:#8B93A1;padding:8px 10px;border-bottom:2px solid #2A7D6E;background:#F9F9F7}
    td{padding:8px 10px;border-bottom:1px solid #F2F0EB;vertical-align:top}
    tr:last-child td{border-bottom:none}
    tr:nth-child(even) td{background:#FAFAF9}
    .mono{font-family:monospace;letter-spacing:1px}
    .no-print{margin-bottom:16px;display:flex;gap:8px}
    @media print{body{padding:16px}.no-print{display:none}}
  </style></head><body>
  <h1>${org} — Job Roster</h1>
  <div class="meta">Generated ${new Date().toLocaleDateString('en-US',{month:'long',day:'numeric',year:'numeric'})} · ${jobs.length} job${jobs.length !== 1 ? 's' : ''}</div>
  <div class="no-print">
    <button onclick="window.print()" style="padding:8px 18px;background:#2A7D6E;color:#fff;border:none;border-radius:6px;cursor:pointer;font-size:13px;font-weight:600">Print</button>
    <button onclick="window.close()" style="padding:8px 18px;background:#eee;border:none;border-radius:6px;cursor:pointer;font-size:13px">Close</button>
  </div>
  <table>
    <thead><tr><th>Job #</th><th>Title</th><th>Date &amp; Time</th><th>Location</th><th>Spots</th><th>Signed Up</th></tr></thead>
    <tbody>${rows || '<tr><td colspan="6" style="text-align:center;padding:20px;color:#aaa">No jobs to display.</td></tr>'}</tbody>
  </table>
  </body></html>`);
  win.document.close();
}

export function printInventory(items, churchName, groupBy = "location") {
  const activeItems = items.filter(i => i.status !== "Disposed");
  const groups = {};
  activeItems.forEach(item => {
    const key = item[groupBy] || "— Unassigned —";
    if (!groups[key]) groups[key] = [];
    groups[key].push(item);
  });
  const sortedGroups = Object.keys(groups).sort();
  const statusColors = { Available:"#2A7D6E", "Checked Out":"#96750E", "In Use":"#1A65C7", "Under Repair":"#D94F4F", Disposed:"#7C5BA0" };
  const rows = sortedGroups.map(group => `
    <div class="group">
      <div class="group-header">${escapeHtml(group)}</div>
      <table>
        <thead><tr><th>ID</th><th>Description</th><th>Status</th><th>Condition</th><th>${groupBy === "location" ? "Ministry" : "Location"}</th><th>Assigned To</th></tr></thead>
        <tbody>${groups[group].map(i => `
          <tr>
            <td class="mono">${escapeHtml(i.itemId)}</td>
            <td>${escapeHtml(i.description)}</td>
            <td style="color:${statusColors[i.status]||"#333"};font-weight:600">${escapeHtml(i.status)}</td>
            <td>${escapeHtml(i.condition)}</td>
            <td>${groupBy === "location" ? escapeHtml(i.ministry) : escapeHtml(i.location)}</td>
            <td>${escapeHtml(i.assignedTo)}</td>
          </tr>`).join("")}
        </tbody>
      </table>
    </div>`).join("");
  const win = window.open("", "_blank");
  if (!win) return;
  win.document.write(`<!DOCTYPE html><html><head><title>Inventory — ${escapeHtml(churchName)||"ChurchOpsHub"}</title><style>
    *{margin:0;padding:0;box-sizing:border-box}
    body{font-family:Arial,sans-serif;font-size:12px;color:#1B2A4A;padding:32px}
    h1{font-size:20px;font-weight:700;margin-bottom:4px}
    .meta{font-size:11px;color:#8B93A1;margin-bottom:24px}
    .group{margin-bottom:28px;page-break-inside:avoid}
    .group-header{font-size:13px;font-weight:700;text-transform:uppercase;letter-spacing:1px;color:#2A7D6E;border-bottom:2px solid #2A7D6E;padding-bottom:4px;margin-bottom:8px}
    table{width:100%;border-collapse:collapse}
    th{text-align:left;font-size:10px;text-transform:uppercase;letter-spacing:.8px;color:#8B93A1;padding:6px 8px;border-bottom:1px solid #E8E4DC}
    td{padding:7px 8px;border-bottom:1px solid #F2F0EB;font-size:12px}
    tr:last-child td{border-bottom:none}
    .mono{font-family:monospace;letter-spacing:1px}
    .summary{display:flex;gap:24px;margin-bottom:20px;padding:14px 18px;background:#F2F0EB;border-radius:8px}
    .summary-item{text-align:center}
    .summary-item .num{font-size:22px;font-weight:700}
    .summary-item .lbl{font-size:10px;color:#8B93A1;text-transform:uppercase;letter-spacing:1px}
    @media print{body{padding:16px}.no-print{display:none}}
  </style></head><body>
  <h1>${escapeHtml(churchName)||"ChurchOpsHub"} — Inventory Report</h1>
  <div class="meta">Generated ${new Date().toLocaleDateString("en-US",{month:"long",day:"numeric",year:"numeric"})} · ${activeItems.length} active items · Grouped by ${groupBy}</div>
  <div class="summary">
    <div class="summary-item"><div class="num">${activeItems.length}</div><div class="lbl">Total</div></div>
    <div class="summary-item"><div class="num" style="color:#2A7D6E">${activeItems.filter(i=>i.status==="Available").length}</div><div class="lbl">Available</div></div>
    <div class="summary-item"><div class="num" style="color:#96750E">${activeItems.filter(i=>i.status==="Checked Out").length}</div><div class="lbl">Checked Out</div></div>
    <div class="summary-item"><div class="num" style="color:#1A65C7">${activeItems.filter(i=>i.status==="In Use").length}</div><div class="lbl">In Use</div></div>
    <div class="summary-item"><div class="num" style="color:#D94F4F">${activeItems.filter(i=>i.status==="Under Repair").length}</div><div class="lbl">Repair</div></div>
  </div>
  <div class="no-print" style="margin-bottom:16px;display:flex;gap:8px">
    <button onclick="window.print()" style="padding:8px 18px;background:#2A7D6E;color:#fff;border:none;border-radius:6px;cursor:pointer;font-size:13px;font-weight:600">Print</button>
    <button onclick="window.close()" style="padding:8px 18px;background:#eee;border:none;border-radius:6px;cursor:pointer;font-size:13px">Close</button>
  </div>
  ${rows}
  </body></html>`);
  win.document.close();
}
