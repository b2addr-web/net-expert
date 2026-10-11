const esc=value=>String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const clean=(rows,attachments)=>rows.map(row=>Object.fromEntries(Object.entries(row).filter(([key])=>key!=='organization_id'&&(attachments||!key.toLowerCase().includes('attachment')))));
const safeCell=value=>{const text=String(value??'');return /^[=+\-@\t\r]/.test(text)?`'${text}`:text};
const csvCell=value=>{const text=safeCell(value);return /[",\r\n]/.test(text)?`"${text.replace(/"/g,'""')}"`:text};
const csv=rows=>{const headers=rows[0]?Object.keys(rows[0]):[];return [headers.map(csvCell).join(','),...rows.map(row=>headers.map(key=>csvCell(row[key])).join(','))].join('\r\n')};
const save=(blob,name)=>{const url=URL.createObjectURL(blob),anchor=document.createElement('a');anchor.href=url;anchor.download=name;document.body.appendChild(anchor);anchor.click();anchor.remove();setTimeout(()=>URL.revokeObjectURL(url),1500);return blob.size};

export async function generateExport({rows,format,fileName,includeAttachments,organization,user,title,rtl}){
 const data=clean(rows,includeAttachments);
 if(format==='xlsx'){
  const {default:ExcelJS}=await import('exceljs');
  const workbook=new ExcelJS.Workbook(),sheet=workbook.addWorksheet('Data',{views:[{state:'frozen',ySplit:1}]});
  const headers=data[0]?Object.keys(data[0]):[];sheet.addRow(headers);data.forEach(row=>sheet.addRow(headers.map(key=>safeCell(row[key]))));sheet.getRow(1).font={bold:true};
  sheet.columns.forEach(column=>{column.width=Math.min(40,Math.max(12,...column.values.slice(1).map(value=>String(value??'').length+2)))});
  const buffer=await workbook.xlsx.writeBuffer();return save(new Blob([buffer],{type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'}),fileName+'.xlsx');
 }
 if(format==='csv')return save(new Blob(['\uFEFF',csv(data)],{type:'text/csv;charset=utf-8'}),fileName+'.csv');
 const headers=data[0]?Object.keys(data[0]):[],body=data.map(row=>`<tr>${headers.map(key=>`<td>${esc(row[key])}</td>`).join('')}</tr>`).join('');
 const html=`<!doctype html><html dir="${rtl?'rtl':'ltr'}"><head><meta charset="utf-8"><title>${esc(title)}</title><style>@page{size:A4 landscape;margin:17mm 10mm}body{font:11px Segoe UI,Arial;color:#1f2937}header{display:flex;justify-content:space-between;border-bottom:2px solid #0f6cbd;padding-bottom:12px;margin-bottom:16px}.brand{display:flex;gap:10px}.mark{width:34px;height:34px;background:#0f6cbd;color:#fff;display:grid;place-items:center;border-radius:4px;font-weight:700}h1{font-size:17px;margin:0}.meta{text-align:end;color:#64748b}table{width:100%;border-collapse:collapse}thead{display:table-header-group}th{background:#f1f5f9;border-block:1px solid #cbd5e1;padding:7px;text-align:start;font-size:9px}td{border-bottom:1px solid #e5e7eb;padding:6px;word-break:break-word}tr{break-inside:avoid}footer{margin-top:12px;color:#64748b;font-size:9px}</style></head><body><header><div class="brand"><div class="mark">NE</div><div><h1>${esc(organization)}</h1><span>${esc(title)}</span></div></div><div class="meta">${new Date().toLocaleString(rtl?'ar-SA':'en-US')}<br>${esc(user)}</div></header><table><thead><tr>${headers.map(value=>`<th>${esc(value)}</th>`).join('')}</tr></thead><tbody>${body}</tbody></table><footer>${data.length} records · Net Expert Enterprise Export</footer><script>onload=()=>setTimeout(()=>print(),250)<\/script></body></html>`;
 const popup=window.open('','_blank','width=1200,height=800');if(!popup)throw new Error('POPUP_BLOCKED');popup.document.write(html);popup.document.close();return new Blob([html]).size;
}
export function exportExcel(rows,t){return generateExport({rows,format:'xlsx',fileName:'net-expert-assets',organization:'Net Expert',user:'',title:t.exportExcel,rtl:t.dir==='rtl'})}
