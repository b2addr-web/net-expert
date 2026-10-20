import {useEffect,useState} from 'react';
import {custodyState,employeeCustody,returnCustody} from '../lib/custody';

const message=(error,ar)=>({CUSTODY_ALREADY_PROCESSED:ar?'عولجت هذه العهدة سابقًا. حدّث القائمة.':'This custody was already processed. Refresh the list.',RECORD_CHANGED_OR_ACCESS_DENIED:ar?'تغيّر أحد السجلات أو ليست لديك صلاحية عليه. حدّث القائمة.':'A record changed or is outside your permissions. Refresh the list.',MISSING_IDENTIFIER:ar?'أكمل الرقم التسلسلي قبل تأكيد الاستلام.':'Add the serial number before confirming receipt.'})[error.message]||error.message;

export default function CustodyReturnDialog({record,ar,onClose,onSaved}){
 const [items,setItems]=useState([]),[selected,setSelected]=useState({}),[loading,setLoading]=useState(true),[busy,setBusy]=useState(false),[error,setError]=useState('');
 useEffect(()=>{let active=true;employeeCustody(record.employee_id).then(rows=>{if(active)setItems(rows)}).catch(e=>{if(active)setError(message(e,ar))}).finally(()=>{if(active)setLoading(false)});return()=>{active=false}},[record.employee_id,ar]);
 const chosen=items.filter(item=>selected[item.id]);
 const toggle=(item)=>setSelected(previous=>{const next={...previous};if(next[item.id])delete next[item.id];else next[item.id]='received';return next});
 const submit=async()=>{if(!chosen.length)return;setBusy(true);setError('');try{
  const saved=await returnCustody(record.employee_id,chosen.map(item=>({id:item.id,version:item.version,received:selected[item.id]==='received'})));
  onSaved(saved);onClose();
 }catch(e){setError(message(e,ar))}finally{setBusy(false)}};
 return <div className="work-overlay"><section className="work-details custody-dialog" role="dialog" aria-modal="true" aria-labelledby="custody-title" dir={ar?'rtl':'ltr'}>
  <header><div><small>{ar?'إدارة عهد الموظف':'Employee custody'}</small><h2 id="custody-title">{ar?'إنهاء العهدة':'End custody'}</h2></div><button onClick={onClose} disabled={busy} aria-label={ar?'إغلاق':'Close'}>×</button></header>
  <div className="custody-employee"><strong>{record.employee_name||'—'}</strong><span>{ar?'الرقم الوظيفي':'Employee ID'}: {record.employee_id}</span><span>{ar?'القسم':'Department'}: {record.department||'—'}</span></div>
  <p className="work-muted">{ar?'حدد العهدة وحالة استلامها الفعلية. غير المستلمة تبقى بانتظار الاسترجاع ولا تدخل المخزون.':'Select each item and whether it was physically received. Pending items stay out of available stock.'}</p>
  {error&&<p className="work-error" role="alert">{error}</p>}
  {loading?<p role="status">{ar?'جارٍ تحميل عهد الموظف…':'Loading employee custody…'}</p>:items.length?<div className="custody-list">{items.map(item=>{const type=item.module;const state=custodyState(item);return <div className="custody-list-item" key={item.id}>
    <label><input type="checkbox" checked={!!selected[item.id]} disabled={busy} onChange={()=>toggle(item)}/><span><b>{type==='sim'?(ar?'شريحة':'SIM'):(ar?'جهاز':'Device')} · {type==='sim'?item.sim_number:item.serial_number||'—'}</b><small>{type==='sim'?item.sim_package:[item.hardware,item.model].filter(Boolean).join(' · ')} · {state==='pending_return'?(ar?'بانتظار الاسترجاع':'Pending return'):(ar?'مستخدم':'Assigned')}</small></span></label>
    {selected[item.id]&&<select aria-label={`${ar?'حالة الاستلام':'Receipt status'} ${type==='sim'?item.sim_number:item.serial_number}`} value={selected[item.id]} disabled={busy} onChange={e=>setSelected(previous=>({...previous,[item.id]:e.target.value}))}><option value="received">{ar?'تم الاستلام':'Received'}</option>{state!=='pending_return'&&<option value="pending">{ar?'بانتظار الاسترجاع':'Pending return'}</option>}</select>}
   </div>})}</div>:<p className="work-empty">{ar?'لا توجد عهد مرتبطة بهذا الرقم الوظيفي.':'No custody linked to this employee ID.'}</p>}
  <footer><button onClick={onClose} disabled={busy}>{ar?'إلغاء':'Cancel'}</button><button className="work-primary" onClick={submit} disabled={busy||!chosen.length}>{busy?(ar?'جارٍ التحديث…':'Updating…'):(ar?`تأكيد ${chosen.length} عهدة`:`Confirm ${chosen.length} items`)}</button></footer>
 </section></div>;
}
