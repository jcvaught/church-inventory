import QRCode from 'qrcode';

export async function printLabel(item, churchName) {
  const appUrl = window.location.origin + window.location.pathname.replace(/\/+$/, '') + '?item=' + encodeURIComponent(item.itemId);
  const qrSrc = await QRCode.toDataURL(appUrl, { width: 200, margin: 2 });
  const win = window.open('', '_blank');
  if (!win) return;
  win.document.write(`<!DOCTYPE html><html><head><title>${item.itemId}</title><style>
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
    <div class="org">${churchName||'ChurchOpsHub'} · Inventory</div>
    <div class="desc">${item.description}</div>
    <div class="id">${item.itemId}</div>
    <img src="${qrSrc}" width="180" height="180" style="display:block;margin:0 auto 16px" onload="window.print()">
    <hr>
    ${item.location?`<div class="meta">📍 ${item.location}</div>`:''}
    ${item.ministry?`<div class="meta">⛪ ${item.ministry}</div>`:''}
    ${item.condition?`<div class="meta">Condition: ${item.condition}</div>`:''}
  </div>
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
      <div class="group-header">${group}</div>
      <table>
        <thead><tr><th>ID</th><th>Description</th><th>Status</th><th>Condition</th><th>${groupBy === "location" ? "Ministry" : "Location"}</th><th>Assigned To</th></tr></thead>
        <tbody>${groups[group].map(i => `
          <tr>
            <td class="mono">${i.itemId||""}</td>
            <td>${i.description||""}</td>
            <td style="color:${statusColors[i.status]||"#333"};font-weight:600">${i.status||""}</td>
            <td>${i.condition||""}</td>
            <td>${groupBy === "location" ? (i.ministry||"") : (i.location||"")}</td>
            <td>${i.assignedTo||""}</td>
          </tr>`).join("")}
        </tbody>
      </table>
    </div>`).join("");
  const win = window.open("", "_blank");
  if (!win) return;
  win.document.write(`<!DOCTYPE html><html><head><title>Inventory — ${churchName||"ChurchOpsHub"}</title><style>
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
  <h1>${churchName||"ChurchOpsHub"} — Inventory Report</h1>
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
