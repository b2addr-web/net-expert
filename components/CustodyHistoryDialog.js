import {useEffect,useState} from 'react';
import {custodyHistory} from '../lib/custody';

export default function CustodyHistoryDialog({item,ar,onClose}){
 const [events,setEvents]=useState([]),[error,setError]=useState(''),[loading,setLoading]=useState(true);
 useEffect(()=>{let active=true;custodyHistory(item.id).then(rows=>{if(active)setEvents(rows)}).catch(e=>{if(active)setError(e.message)}).finally(()=>{if(active)setLoading(false)});return()=>{active=false}},[item.id]);
 const label=action=>({pending_return:ar?'بانتظار الاسترجاع':'Pending return',returned:ar?'تم الاسترجاع':'Returned',assigned:ar?'أعيد التخصيص':'Reassigned'})[action]||action;
 const state=value=>({assigned:ar?'مستخدم':'Assigned',pending_return:ar?'بانتظار الاسترجاع':'Pending return',available:ar?'متوفر':'Available'})[value]||value;
 return <div className="work-overlay"><section className="work-details custody-dialog" role="dialog" aria-modal="true" aria-label={ar?'سجل العهدة':'Custody history'} dir={ar?'rtl':'ltr'}>
  <header><h2>{ar?'سجل العهدة':'Custody history'} · {item.identifier||item.serial_number||item.sim_number||'—'}</h2><button onClick={onClose} aria-label={ar?'إغلاق':'Close'}>×</button></header>
  {error&&<p className="work-error" role="alert">{error}</p>}
  {loading?<p role="status">{ar?'جارٍ التحميل…':'Loading…'}</p>:events.length?<div className="custody-history">{events.map(event=><article key={event.id}><strong>{label(event.action)}</strong><time>{new Date(event.occurred_at).toLocaleString(ar?'ar-SA-u-ca-gregory':'en-GB',{timeZone:'Asia/Riyadh'})}</time><span>{ar?'من':'From'}: {event.previous_employee_name||'—'} ({event.previous_employee_id||'—'}) → {ar?'إلى':'To'}: {event.new_employee_name||'—'} ({event.new_employee_id||'—'})</span><span>{ar?'الحالة':'Status'}: {state(event.previous_state)} → {state(event.new_state)}</span><small>{ar?'نفذها':'By'}: {event.actor_name||event.actor_id||'—'}</small></article>)}</div>:<p className="work-empty">{ar?'لا توجد عمليات استرجاع أو تخصيص بعد.':'No return or assignment history yet.'}</p>}
  <footer><button onClick={onClose}>{ar?'إغلاق':'Close'}</button></footer>
 </section></div>;
}
