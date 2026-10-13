import {useEffect,useState} from 'react';
import {supabase} from '../lib/supabase';

const statuses={report:['جديد','قيد المعالجة','بانتظار إجراء','تم الحل','مغلق'],device_request:['جديد','قيد المراجعة','بانتظار الموافقة','تمت الموافقة','مرفوض','قيد التجهيز','تم التسليم','مغلق']};
const labels={report:'البلاغات',device_request:'طلبات الأجهزة'};

export default function IntakeDashboard({kind,user}){
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
 const load=async()=>{setLoading(true);setError('');try{setData(await api('GET','admin'))}catch(e){setError(e.message)}finally{setLoading(false)}};
 useEffect(()=>{load()},[kind,user.organization_id]);
 const act=async(action)=>{setError('');setNotice('');try{await action();await load()}catch(e){setError(e.message)}};
 const createLink=()=>act(async()=>{
  const result=await api('POST','admin',{action:'create_link',kind,label:label.trim()||labels[kind]});
  setLabel('');let copied=false;
  try{await navigator.clipboard.writeText(result.url);copied=true}catch{}
  setNotice((copied?'أُنشئ الرابط ونُسخ: ':'أُنشئ الرابط. انسخه الآن: ')+result.url);
 });
 const open=async record=>{setSelected(record);setError('');try{setDetail(await api('GET',`details?id=${encodeURIComponent(record.id)}`))}catch(e){setError(e.message)}};
 const updateStatus=value=>act(async()=>{
  const result=await api('PATCH','admin',{action:'status',caseId:selected.id,status:value});
  setNotice(result.emailSent?'تم تحديث الحالة وإرسال تنبيه للموظف.':'تم تحديث الحالة، لكن تعذر إرسال التنبيه.');
  setDetail(await api('GET',`details?id=${encodeURIComponent(selected.id)}`));
 });
 const addNote=()=>act(async()=>{await api('POST','admin',{action:'note',caseId:selected.id,note});setNote('');setDetail(await api('GET',`details?id=${encodeURIComponent(selected.id)}`))});
 const list=data.cases.filter(x=>x.kind===kind),links=data.links.filter(x=>x.kind===kind);
 const filtered=list.filter(x=>(!query||[x.reference,x.employee_name,x.employee_number,x.email,x.description].some(v=>String(v||'').toLowerCase().includes(query.toLowerCase())))&&(!status||x.status===status)&&(!department||x.department===department)&&(!from||x.created_at.slice(0,10)>=from)&&(!to||x.created_at.slice(0,10)<=to));
 return <div className="work-page intake-dashboard" dir="rtl">
  <header className="work-heading"><div><small>{user.organization_name}</small><h1>{labels[kind]}</h1><p>أنشئ روابط استقبال خارجية وتابع الحالات من مكان واحد.</p></div></header>
  {error&&<p role="alert" className="work-error">{error}</p>}{notice&&<p role="status" className="intake-notice">{notice}</p>}
  <section className="intake-admin-card"><h2>روابط استقبال {labels[kind]}</h2><div className="intake-link-create"><input aria-label="اسم الرابط" placeholder="اسم الرابط، مثل فرع الرياض" value={label} maxLength={100} onChange={e=>setLabel(e.target.value)}/><button className="work-primary" onClick={createLink}>إنشاء رابط ونسخه</button></div><p className="work-muted">يمكنك نسخ كل رابط لاحقاً أو تعطيله عند الحاجة.</p>
   {links.map(x=><div className="intake-link-row" key={x.id}><span><b>{x.label}</b><small>{new Date(x.created_at).toLocaleDateString('ar-SA')}</small><a className="intake-short-url" href={x.url} target="_blank" rel="noreferrer">{x.url}</a></span><button onClick={()=>navigator.clipboard.writeText(x.url).then(()=>setNotice('تم نسخ الرابط')).catch(()=>setNotice(x.url))}>نسخ الرابط</button><button onClick={()=>act(async()=>{await api('PATCH','admin',{action:'link',id:x.id,active:!x.active});setNotice(x.active?'تم تعطيل الرابط':'تم تفعيل الرابط')})}>{x.active?'تعطيل':'تفعيل'}</button><em>{x.active?'نشط':'معطل'}</em></div>)}
  </section>
  <div className="work-metrics">{[['الإجمالي',list.length],['جديد',list.filter(x=>x.status==='جديد').length],['قيد المتابعة',list.filter(x=>!['جديد','مغلق','مرفوض','تم الحل','تم التسليم'].includes(x.status)).length],['مغلق',list.filter(x=>x.status==='مغلق').length]].map(([name,n])=><section key={name}><span>{name}</span><strong>{n}</strong></section>)}</div>
  <div className="work-filters"><input aria-label="بحث" placeholder="بحث بالرقم أو الموظف أو الوصف" value={query} onChange={e=>setQuery(e.target.value)}/><select aria-label="الحالة" value={status} onChange={e=>setStatus(e.target.value)}><option value="">كل الحالات</option>{statuses[kind].map(x=><option key={x}>{x}</option>)}</select><select aria-label="القسم" value={department} onChange={e=>setDepartment(e.target.value)}><option value="">كل الأقسام</option>{[...new Set(list.map(x=>x.department))].sort().map(x=><option key={x}>{x}</option>)}</select><label>من<input type="date" value={from} onChange={e=>setFrom(e.target.value)}/></label><label>إلى<input type="date" value={to} onChange={e=>setTo(e.target.value)}/></label><button onClick={()=>{setQuery('');setStatus('');setDepartment('');setFrom('');setTo('')}}>مسح</button></div>
  <div className="work-grid"><table><thead><tr><th>الرقم</th><th>الموظف</th><th>القسم</th><th>{kind==='report'?'المشكلة':'الجهاز'}</th><th>الحالة</th><th>التاريخ</th><th></th></tr></thead><tbody>{filtered.map(x=><tr key={x.id}><td>{x.reference}</td><td>{x.employee_name}</td><td>{x.department}</td><td>{x.issue_type||x.device_type}</td><td><span className="work-badge status">{x.status}</span></td><td>{new Date(x.created_at).toLocaleDateString('ar-SA')}</td><td><button onClick={()=>open(x)}>عرض</button></td></tr>)}</tbody></table>{!loading&&!filtered.length&&<p className="work-empty">لا توجد حالات مطابقة.</p>}{loading&&<p className="work-empty">جارٍ التحميل…</p>}</div>
  {detail&&<div className="work-overlay"><section className="work-details intake-details" role="dialog" aria-modal="true" aria-label="تفاصيل الحالة"><header><h2>{detail.record.reference}</h2><button onClick={()=>{setDetail(null);setSelected(null)}} aria-label="إغلاق">×</button></header><dl>{[['الاسم',detail.record.employee_name],['الرقم الوظيفي',detail.record.employee_number],['البريد',detail.record.email],['القسم',detail.record.department],[kind==='report'?'نوع المشكلة':'نوع الجهاز',detail.record.issue_type||detail.record.device_type],['الوصف',detail.record.description]].map(([k,v])=><div key={k}><dt>{k}</dt><dd>{v}</dd></div>)}</dl>
   {detail.imageUrl&&<div className="intake-image"><h3>الصورة المرفقة</h3><a href={detail.imageUrl} target="_blank" rel="noreferrer" aria-label="فتح الصورة المرفقة بحجمها الكامل"><img src={detail.imageUrl} alt={`الصورة المرفقة بالبلاغ ${detail.record.reference}`}/></a><a href={detail.imageUrl} target="_blank" rel="noreferrer">فتح الصورة بحجمها الكامل</a></div>}
   {detail.imageUnavailable&&<p role="alert" className="work-error">تعذر عرض الصورة حالياً. أعد فتح البلاغ لتجديد الرابط.</p>}
   <label>الحالة<select value={detail.record.status} onChange={e=>updateStatus(e.target.value)}>{statuses[kind].map(x=><option key={x}>{x}</option>)}</select></label><h3>الملاحظات والتغييرات</h3>{detail.notes.map(x=><p className="intake-note" key={x.id}><small>{new Date(x.created_at).toLocaleString('ar-SA')}</small>{x.body}</p>)}<textarea rows={3} maxLength={3000} placeholder="ملاحظة داخلية" value={note} onChange={e=>setNote(e.target.value)}/><button className="work-primary" disabled={!note.trim()} onClick={addNote}>إضافة ملاحظة</button></section></div>}
 </div>;
}
