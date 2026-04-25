import { localDateStr } from './date.js';

export function exportItemsCSV(items) {
  const cols = ['itemId','description','location','ministry','status','condition','tags','assignedTo','checkOutDate','expectedReturn','notes'];
  const header = cols.join(',');
  const rows = items.map(item => cols.map(c => {
    const v = item[c];
    if (Array.isArray(v)) return `"${v.join('; ')}"`;
    if (v == null || v === '') return '';
    const s = String(v);
    return (s.includes(',') || s.includes('"') || s.includes('\n')) ? `"${s.replace(/"/g,'""')}"` : s;
  }).join(','));
  const csv = [header, ...rows].join('\n');
  const a = Object.assign(document.createElement('a'), {
    href: URL.createObjectURL(new Blob([csv], {type:'text/csv'})),
    download: `inventory-${localDateStr(new Date())}.csv`
  });
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
  URL.revokeObjectURL(a.href);
}

export function exportSuppliesCSV(supplies) {
  const cols = ['supplyId','description','location','ministry','quantity','minQuantity','unit'];
  const header = cols.join(',');
  const rows = supplies.map(s => cols.map(c => {
    const v = s[c];
    if (v == null || v === '') return '';
    const str = String(v);
    return (str.includes(',') || str.includes('"') || str.includes('\n')) ? `"${str.replace(/"/g,'""')}"` : str;
  }).join(','));
  const csv = [header, ...rows].join('\n');
  const a = Object.assign(document.createElement('a'), {
    href: URL.createObjectURL(new Blob([csv], {type:'text/csv'})),
    download: `supplies-${localDateStr(new Date())}.csv`
  });
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
  URL.revokeObjectURL(a.href);
}

export function exportAccessRecordsCSV(records) {
  const cols = ['personName','type','completedDate','expiryDate','ministry','notes',
                 'keyIdentifier','returnedDate','certType','issuingOrganization','requirementName','recordedByName'];
  const header = cols.join(',');
  const rows = (records||[]).map(r => cols.map(c => {
    const v = r[c];
    if (v == null || v === '') return '';
    const s = String(v);
    return (s.includes(',') || s.includes('"') || s.includes('\n')) ? `"${s.replace(/"/g,'""')}"` : s;
  }).join(','));
  const csv = [header, ...rows].join('\n');
  const a = Object.assign(document.createElement('a'), {
    href: URL.createObjectURL(new Blob([csv], {type:'text/csv'})),
    download: `people-access-${localDateStr(new Date())}.csv`
  });
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
  URL.revokeObjectURL(a.href);
}

export function exportTasksCSV(tasks) {
  const cols = ['taskNumber','name','description','priority','status','visibility','ministry','dueDate','recurrence','estimatedHours','actualHours','assignees','tags','notes','createdByName','createdAt','completedAt'];
  const header = cols.join(',');
  const rows = (tasks || []).map(t => cols.map(c => {
    let v = t[c];
    if (c === 'assignees') v = (t.assignees || []).map(a => a.name).join('; ');
    if (c === 'tags') v = (t.tags || []).join('; ');
    if (v == null || v === '') return '';
    const s = String(v);
    return (s.includes(',') || s.includes('"') || s.includes('\n')) ? `"${s.replace(/"/g,'""')}"` : s;
  }).join(','));
  const csv = [header, ...rows].join('\n');
  const a = Object.assign(document.createElement('a'), {
    href: URL.createObjectURL(new Blob([csv], { type: 'text/csv' })),
    download: `tasks-${localDateStr(new Date())}.csv`
  });
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
  URL.revokeObjectURL(a.href);
}

export function exportReservationsCSV(reservations) {
  const header = 'resourceType,resource,itemId,eventName,eventDate,returnDate,purpose,ministry,status,requestedByName,approvedByName,notes';
  const rows = reservations.map(r => {
    const isRoom = r.resourceType === 'room';
    const cells = [
      isRoom ? 'Space' : 'Equipment',
      isRoom ? (r.roomName || '') : (r.itemDesc || ''),
      isRoom ? '' : (r.itemId || ''),
      r.eventName || '', r.eventDate || '', r.returnDate || '',
      r.purpose || '', r.ministry || '', r.status || '',
      r.requestedByName || '', r.approvedByName || '', r.notes || '',
    ];
    return cells.map(v => { const s = String(v); return (s.includes(',') || s.includes('"') || s.includes('\n')) ? `"${s.replace(/"/g,'""')}"` : s; }).join(',');
  });
  const csv = [header, ...rows].join('\n');
  const a = Object.assign(document.createElement('a'), {
    href: URL.createObjectURL(new Blob([csv], {type:'text/csv'})),
    download: `reservations-${localDateStr(new Date())}.csv`
  });
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
  URL.revokeObjectURL(a.href);
}
