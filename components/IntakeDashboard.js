import {useEffect,useState} from 'react';
import {supabase} from '../lib/supabase';

// Keep the stored Arabic status values unchanged; translate only their presentation.
const statuses={report:['جديد','قيد المعالجة','بانتظار إجراء','تم الحل','مغلق'],device_request:['جديد','قيد المراجعة','بانتظار الموافقة','تمت الموافقة','مرفوض','قيد التجهيز','تم التسليم','مغلق']};
const english={
 'جديد':'New','قيد المعالجة':'In progress','بانتظار إجراء':'Awaiting action','تم الحل':'Resolved','مغلق':'Closed','قيد المراجعة':'Under review','بانتظار الموافقة':'Awaiting approval','تمت الموافقة':'Approved','مرفوض':'Rejected','قيد التجهيز':'Preparing','تم التسليم':'Delivered',
 'أنشئ روابط استقبال خارجية وتابع الحالات من مكان واحد.':'Create external intake links and track cases in one place.',
 'اسم الرابط':'Link name','اسم الرابط، مثل فرع الرياض':'Link name, for example Riyadh branch','إنشاء رابط ونسخه':'Create and copy link',
 'يمكنك نسخ كل رابط لاحقاً أو تعطيله عند الحاجة.':'You can copy each link later or disable it when needed.','يمكنك عرض الروابط ونسخها.':'You can view and copy links.',
 'أُنشئ الرابط ونُسخ: ':'Link created and copied: ','أُنشئ الرابط. انسخه الآن: ':'Link created. Copy it now: ','تم نسخ الرابط':'Link copied','نسخ الرابط':'Copy link',
 'تم تعطيل الرابط':'Link disabled','تم تفعيل الرابط':'Link enabled','تعطيل':'Disable','تفعيل':'Enable','نشط':'Active','معطل':'Disabled',
 'الإجمالي':'Total','قيد المتابعة':'In progress','بحث':'Search','بحث بالرقم أو الموظف أو الوصف':'Search by reference, employee, or description',
 'الحالة':'Status','كل الحالات':'All statuses','القسم':'Department','كل الأقسام':'All departments','من':'From','إلى':'To','مسح':'Clear',
 'الرقم':'Reference','الموظف':'Employee','المشكلة':'Issue','الجهاز':'Device','التاريخ':'Date','عرض':'View','لا توجد حالات مطابقة.':'No matching cases.','جارٍ التحميل…':'Loading…',
 'تفاصيل الحالة':'Case details','إغلاق':'Close','الاسم':'Name','الرقم الوظيفي':'Employee number','البريد':'Email','نوع المشكلة':'Issue type','نوع الجهاز':'Device type','الوصف':'Description',
 'الصورة المرفقة':'Attached image','فتح الصورة بحجمها الكامل':'Open full-size image','تعذر عرض الصورة حالياً. أعد فتح البلاغ لتجديد الرابط.':'The image is unavailable. Reopen the case to refresh its link.',
 'الملاحظات والتغييرات':'Notes and changes','ملاحظة داخلية':'Internal note','إضافة ملاحظة':'Add note',
 'تم تحديث الحالة وإرسال تنبيه للموظف.':'Status updated and employee notified.','تم تحديث الحالة، لكن تعذر إرسال التنبيه.':'Status updated, but the email notification could not be sent.','تعذر إكمال العملية':'Could not complete the operation.'
};
const names={
 ar:{report:'البلاغات',device_request:'طلبات الأجهزة'},
 en:{report:'Technical Reports',device_request:'Device Requests'}
};
const linkHeadings={
 ar:{report:'روابط استقبال البلاغات',device_request:'روابط استقبال طلبات الأجهزة'},
 en:{report:'Incident intake links',device_request:'Device request intake links'}
};

export default function IntakeDashboard({kind,user,ar}){
 const tr=value=>ar?value:english[value]||value;
 const locale=ar?'ar-SA':'en-US';
 const formatDate=value=>new Date(value).toLocaleDateString(locale);
 const displayError=value=>!ar&&/[\u0600-\u06ff]/.test(value||'')?tr('تعذر إكمال العملية'):value||tr('تعذر إكمال العملية');
 const canManage=['company_admin','operator','manager'].includes(user.role);
 const [data,setData]=useState({links:[],cases:[]}),[loading,setLoading]=useState(true),[error,setError]=useState(''),[notice,setNotice]=useState(''),[label,setLabel]=useState('');
 const [selected,setSelected]=useState(null),[detail,setDetail]=useState(null),[note,setNote]=useState('');
 const [query,setQuery]=useState(''),[status,setStatus]=useState(''),[department,setDepartment]=useState(''),[from,setFrom]=useState(''),[to,setTo]=useState('');
 const api=async(method,path,body)=>{
  const {data:session}=await supabase.auth.getSession();
  const response=await fetch('/api/intake/'+path,{method,headers:{Authorization:`Bearer ${session.session?.access_token||''}`,...(body?{'Content-Type':'application/json'}:{})},body:body?JSON.stringify(body):undefined});
  const value=await response.json();
  if(!response.ok)throw new Error(value.error||'تعذر إكمال العملية');
  return value;
 };
 const load=async()=>{setLoading(true);setError('');try{setData(await api('GET',`admin?kind=${encodeURIComponent(kind)}`))}catch(e){setError(e.message)}finally{setLoading(false)}};
 useEffect(()=>{load()},[kind,user.organization_id]);
 const act=async(action)=>{setError('');setNotice('');try{await action();await load()}catch(e){setError(e.message)}};
 const createLink=()=>act(async()=>{
  const result=await api('POST','admin',{action:'create_link',kind,label:label.trim()||names[ar?'ar':'en'][kind]});
  setLabel('');let copied=false;
  try{await navigator.clipboard.writeText(result.url);copied=true}catch{}
  setNotice(tr(copied?'أُنشئ الرابط ونُسخ: ':'أُنشئ الرابط. انسخه الآن: ')+result.url);
 });
 const open=async record=>{setSelected(record);setError('');try{setDetail(await api('GET',`details?id=${encodeURIComponent(record.id)}`))}catch(e){setError(e.message)}};
 const updateStatus=value=>act(async()=>{
  const result=await api('PATCH','admin',{action:'status',caseId:selected.id,status:value});
  setNotice(tr(result.emailSent?'تم تحديث الحالة وإرسال تنبيه للموظف.':'تم تحديث الحالة، لكن تعذر إرسال التنبيه.'));
  setDetail(await api('GET',`details?id=${encodeURIComponent(selected.id)}`));
 });
 const addNote=()=>act(async()=>{await api('POST','admin',{action:'note',caseId:selected.id,note});setNote('');setDetail(await api('GET',`details?id=${encodeURIComponent(selected.id)}`))});
 const list=data.cases.filter(x=>x.kind===kind),links=data.links.filter(x=>x.kind===kind);
 const filtered=list.filter(x=>(!query||[x.reference,x.employee_name,x.employee_number,x.email,x.description].some(v=>String(v||'').toLowerCase().includes(query.toLowerCase())))&&(!status||x.status===status)&&(!department||x.department===department)&&(!from||x.created_at.slice(0,10)>=from)&&(!to||x.created_at.slice(0,10)<=to));
 return <div className="work-page intake-dashboard" dir={ar?'rtl':'ltr'}>
  <header className="work-heading"><div><small>{user.organization_name}</small><h1>{names[ar?'ar':'en'][kind]}</h1><p>{tr('أنشئ روابط استقبال خارجية وتابع الحالات من مكان واحد.')}</p></div></header>
  {error&&<p role="alert" className="work-error">{displayError(error)}</p>}{notice&&<p role="status" className="intake-notice">{notice}</p>}
  <section className="intake-admin-card"><h2>{linkHeadings[ar?'ar':'en'][kind]}</h2>{canManage&&<div className="intake-link-create"><input aria-label={tr('اسم الرابط')} placeholder={tr('اسم الرابط، مثل فرع الرياض')} value={label} maxLength={100} onChange={e=>setLabel(e.target.value)}/><button className="work-primary" onClick={createLink}>{tr('إنشاء رابط ونسخه')}</button></div>}<p className="work-muted">{tr(canManage?'يمكنك نسخ كل رابط لاحقاً أو تعطيله عند الحاجة.':'يمكنك عرض الروابط ونسخها.')}</p>
   {links.map(x=><div className="intake-link-row" key={x.id}><span><b>{x.label}</b><small>{formatDate(x.created_at)}</small><a className="intake-short-url" href={x.url} target="_blank" rel="noreferrer">{x.url}</a></span><button onClick={()=>navigator.clipboard.writeText(x.url).then(()=>setNotice(tr('تم نسخ الرابط'))).catch(()=>setNotice(x.url))}>{tr('نسخ الرابط')}</button>{canManage&&<button onClick={()=>act(async()=>{await api('PATCH','admin',{action:'link',id:x.id,active:!x.active});setNotice(tr(x.active?'تم تعطيل الرابط':'تم تفعيل الرابط'))})}>{tr(x.active?'تعطيل':'تفعيل')}</button>}<em>{tr(x.active?'نشط':'معطل')}</em></div>)}
  </section>
  <div className="work-metrics">{[['الإجمالي',list.length],['جديد',list.filter(x=>x.status==='جديد').length],['قيد المتابعة',list.filter(x=>!['جديد','مغلق','مرفوض','تم الحل','تم التسليم'].includes(x.status)).length],['مغلق',list.filter(x=>x.status==='مغلق').length]].map(([name,n])=><section key={name}><span>{tr(name)}</span><strong>{n}</strong></section>)}</div>
  <div className="work-filters"><input aria-label={tr('بحث')} placeholder={tr('بحث بالرقم أو الموظف أو الوصف')} value={query} onChange={e=>setQuery(e.target.value)}/><select aria-label={tr('الحالة')} value={status} onChange={e=>setStatus(e.target.value)}><option value="">{tr('كل الحالات')}</option>{statuses[kind].map(x=><option key={x} value={x}>{tr(x)}</option>)}</select><select aria-label={tr('القسم')} value={department} onChange={e=>setDepartment(e.target.value)}><option value="">{tr('كل الأقسام')}</option>{[...new Set(list.map(x=>x.department))].sort().map(x=><option key={x}>{x}</option>)}</select><label>{tr('من')}<input type="date" value={from} onChange={e=>setFrom(e.target.value)}/></label><label>{tr('إلى')}<input type="date" value={to} onChange={e=>setTo(e.target.value)}/></label><button onClick={()=>{setQuery('');setStatus('');setDepartment('');setFrom('');setTo('')}}>{tr('مسح')}</button></div>
  <div className="work-grid"><table><thead><tr><th>{tr('الرقم')}</th><th>{tr('الموظف')}</th><th>{tr('القسم')}</th><th>{tr(kind==='report'?'المشكلة':'الجهاز')}</th><th>{tr('الحالة')}</th><th>{tr('التاريخ')}</th><th></th></tr></thead><tbody>{filtered.map(x=><tr key={x.id}><td>{x.reference}</td><td>{x.employee_name}</td><td>{x.department}</td><td>{x.issue_type||x.device_type}</td><td><span className="work-badge status">{tr(x.status)}</span></td><td>{formatDate(x.created_at)}</td><td><button onClick={()=>open(x)}>{tr('عرض')}</button></td></tr>)}</tbody></table>{!loading&&!filtered.length&&<p className="work-empty">{tr('لا توجد حالات مطابقة.')}</p>}{loading&&<p className="work-empty">{tr('جارٍ التحميل…')}</p>}</div>
  {detail&&<div className="work-overlay"><section className="work-details intake-details" role="dialog" aria-modal="true" aria-label={tr('تفاصيل الحالة')}><header><h2>{detail.record.reference}</h2><button onClick={()=>{setDetail(null);setSelected(null)}} aria-label={tr('إغلاق')}>×</button></header><dl>{[['الاسم',detail.record.employee_name],['الرقم الوظيفي',detail.record.employee_number],['البريد',detail.record.email],['القسم',detail.record.department],[kind==='report'?'نوع المشكلة':'نوع الجهاز',detail.record.issue_type||detail.record.device_type],['الوصف',detail.record.description]].map(([k,v])=><div key={k}><dt>{tr(k)}</dt><dd>{v}</dd></div>)}</dl>
   {detail.imageUrl&&<div className="intake-image"><h3>{tr('الصورة المرفقة')}</h3><a href={detail.imageUrl} target="_blank" rel="noreferrer" aria-label={tr('فتح الصورة بحجمها الكامل')}><img src={detail.imageUrl} alt={`${tr('الصورة المرفقة')} ${detail.record.reference}`}/></a><a href={detail.imageUrl} target="_blank" rel="noreferrer">{tr('فتح الصورة بحجمها الكامل')}</a></div>}
   {detail.imageUnavailable&&<p role="alert" className="work-error">{tr('تعذر عرض الصورة حالياً. أعد فتح البلاغ لتجديد الرابط.')}</p>}
   <label>{tr('الحالة')}<select value={detail.record.status} disabled={!canManage} onChange={e=>updateStatus(e.target.value)}>{statuses[kind].map(x=><option key={x} value={x}>{tr(x)}</option>)}</select></label><h3>{tr('الملاحظات والتغييرات')}</h3>{detail.notes.map(x=><p className="intake-note" key={x.id}><small>{new Date(x.created_at).toLocaleString(locale)}</small>{x.body}</p>)}{canManage&&<><textarea rows={3} maxLength={3000} placeholder={tr('ملاحظة داخلية')} value={note} onChange={e=>setNote(e.target.value)}/><button className="work-primary" disabled={!note.trim()} onClick={addNote}>{tr('إضافة ملاحظة')}</button></>}</section></div>}
 </div>;
}
