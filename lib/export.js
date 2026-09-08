// ── Export CSV / Excel ─────────────────────────────────────────────────────────
export function exportExcel(devices, t) {
  const headers = [
    '#',
    t.table.name,
    t.table.type,
    t.table.status,
    t.table.serial,
    t.table.location,
    t.table.connection,
    t.table.employee,
    t.table.empId,
    t.table.addedBy,
    t.table.addedAt,
    t.table.notes,
    t.table.attachment,           // اسم الملف المعروض
  ];

  const rows = devices.map((d, i) => [
    i + 1,
    d.name,
    t.deviceTypes[d.type] || d.type,
    t.statuses[d.status] || d.status,
    d.serial,
    t.locations[d.location] || d.location,
    d.online ? t.online : t.offline,
    d.employee || '',
    d.empId || '',
    d.addedBy || '',
    d.addedAt ? new Date(d.addedAt).toLocaleString(t.dir === 'rtl' ? 'ar-SA' : 'en-US') : '',
    d.notes || '',
    d.attachmentLabel || d.attachmentName || '',   // اسم الملف فقط — بدون رابط
  ]);

  const escape = (v) => {
    const s = String(v ?? '');
    if (s.includes(',') || s.includes('"') || s.includes('\n')) {
      return '"' + s.replace(/"/g, '""') + '"';
    }
    return s;
  };

  const csv = [headers, ...rows]
    .map(row => row.map(escape).join(','))
    .join('\r\n');

  const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'net-expert-inventory.csv';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// ── Export PDF ─────────────────────────────────────────────────────────────────
export function exportPDF(devices, t) {
  const isAr = t.dir === 'rtl';
  const date = new Date().toLocaleDateString(isAr ? 'ar-SA' : 'en-US');
  const statusColor = { new: '#10b981', used: '#3b82f6', damaged: '#ef4444' };

  const tableRows = devices.map((d, i) => `
    <tr>
      <td>${i + 1}</td>
      <td><strong>${d.name}</strong></td>
      <td>${t.deviceTypes[d.type] || d.type}</td>
      <td><span style="color:${statusColor[d.status] || '#94a3b8'};font-weight:600">${t.statuses[d.status] || d.status}</span></td>
      <td style="font-family:monospace;font-size:10px">${d.serial}</td>
      <td>${t.locations[d.location] || d.location}</td>
      <td><span style="color:${d.online ? '#10b981' : '#94a3b8'};font-weight:600">${d.online ? '● ' + t.online : '○ ' + t.offline}</span></td>
      <td>${d.employee || '—'}</td>
      <td style="font-size:10px">${d.empId || '—'}</td>
      <td style="font-size:10px">${d.addedBy || '—'}</td>
      <td style="font-size:10px">${d.addedAt ? new Date(d.addedAt).toLocaleDateString(isAr ? 'ar-SA' : 'en-US') : '—'}</td>
      <td style="font-size:10px;color:#94a3b8">${d.notes || '—'}</td>
      <td>${d.attachmentUrl ? `<a href="${d.attachmentUrl}" style="color:#06b6d4" target="_blank">${d.attachmentLabel || d.attachmentName || '📎'}</a>` : '—'}</td>
    </tr>
  `).join('');

  const html = `<!DOCTYPE html>
<html dir="${t.dir}" lang="${isAr ? 'ar' : 'en'}">
<head>
  <meta charset="UTF-8"/>
  <title>${t.appName}</title>
  <link href="https://fonts.googleapis.com/css2?family=IBM+Plex+Sans+Arabic:wght@400;500;600;700&display=swap" rel="stylesheet"/>
  <style>
    *{box-sizing:border-box;margin:0;padding:0}
    body{font-family:'IBM Plex Sans Arabic','Segoe UI',Arial,sans-serif;direction:${t.dir};padding:24px 28px;color:#1e293b;font-size:12px;background:#fff}
    .header{display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:18px;padding-bottom:12px;border-bottom:3px solid #0891b2}
    .logo{display:flex;align-items:center;gap:10px}
    .logo-icon{width:36px;height:36px;border-radius:9px;background:#e0f2fe;display:flex;align-items:center;justify-content:center;font-size:18px}
    .title{font-size:18px;font-weight:700;color:#0891b2}
    .subtitle{font-size:10px;color:#64748b;margin-top:2px}
    .meta{text-align:${isAr ? 'left' : 'right'};font-size:11px;color:#475569}
    .stats{display:flex;gap:10px;margin-bottom:14px;flex-wrap:wrap}
    .stat{background:#f8fafc;border:1px solid #e2e8f0;border-radius:7px;padding:6px 12px;font-size:11px}
    .stat strong{color:#0891b2}
    table{width:100%;border-collapse:collapse}
    thead tr{background:#0891b2;color:#fff}
    thead th{padding:8px 10px;font-weight:600;font-size:10px;text-align:${isAr ? 'right' : 'left'};white-space:nowrap}
    tbody tr{border-bottom:1px solid #f1f5f9}
    tbody tr:nth-child(even){background:#f8fafc}
    tbody td{padding:7px 10px;vertical-align:middle}
    .footer{margin-top:16px;padding-top:10px;border-top:1px solid #e2e8f0;display:flex;justify-content:space-between;font-size:9px;color:#94a3b8}
    @media print{body{padding:8px 12px}@page{margin:0.6cm;size:A4 landscape}}
  </style>
</head>
<body>
  <div class="header">
    <div class="logo">
      <div class="logo-icon">⚡</div>
      <div><div class="title">${t.appName}</div><div class="subtitle">${t.appSub}</div></div>
    </div>
    <div class="meta">
      <div>${date}</div>
      <div>${isAr ? 'إجمالي الأجهزة' : 'Total'}: <strong>${devices.length}</strong></div>
    </div>
  </div>
  <div class="stats">
    <div class="stat">${isAr ? 'الإجمالي' : 'Total'}: <strong>${devices.length}</strong></div>
    <div class="stat">${t.online}: <strong style="color:#10b981">${devices.filter(d=>d.online).length}</strong></div>
    <div class="stat">${t.offline}: <strong style="color:#94a3b8">${devices.filter(d=>!d.online).length}</strong></div>
    <div class="stat">${t.statuses.damaged}: <strong style="color:#ef4444">${devices.filter(d=>d.status==='damaged').length}</strong></div>
    <div class="stat">${t.statuses.new}: <strong style="color:#10b981">${devices.filter(d=>d.status==='new').length}</strong></div>
  </div>
  <table>
    <thead><tr>
      <th>#</th>
      <th>${t.table.name}</th>
      <th>${t.table.type}</th>
      <th>${t.table.status}</th>
      <th>${t.table.serial}</th>
      <th>${t.table.location}</th>
      <th>${t.table.connection}</th>
      <th>${t.table.employee}</th>
      <th>${t.table.empId}</th>
      <th>${t.table.addedBy}</th>
      <th>${t.table.addedAt}</th>
      <th>${t.table.notes}</th>
      <th>${t.table.attachment}</th>
    </tr></thead>
    <tbody>${tableRows}</tbody>
  </table>
  <div class="footer">
    <span>${t.appName} — ${t.appSub}</span>
    <span>${date}</span>
  </div>
  <script>window.onload=function(){setTimeout(function(){window.print();},900)};<\/script>
</body></html>`;

  const win = window.open('', '_blank', 'width=1200,height=750');
  if (!win) { alert(isAr ? 'يرجى السماح بالنوافذ المنبثقة' : 'Please allow popups'); return; }
  win.document.write(html);
  win.document.close();
}

// ── Save to Google Sheets (with audit) ────────────────────────────────────────
export async function saveToSheets(devices, auditLog, sheetsUrl) {
  if (!sheetsUrl) throw new Error('No URL');
  const res = await fetch(sheetsUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'syncInventory', devices, auditLog }),
  });
  if (!res.ok) throw new Error('Sheets error');
  return true;
}
