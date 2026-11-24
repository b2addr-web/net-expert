import {useEffect,useState} from 'react';
import {commerceRequest} from '../lib/commerce-client';

const errors={
 LIMIT_BELOW_ALLOCATED:['الحد أقل من عدد المقاعد الممنوحة.','The limit is below seats already granted.'],
 INVALID_EXTENSION:['اختر تاريخًا بعد انتهاء العرض الحالي، أو اجعل الاشتراك دائمًا.','Choose a later date or make the subscription permanent.'],
 INVALID_PAID_PLAN:['حدّد سعرًا شهريًا وتأكد من تاريخ النهاية.','Set a monthly price and check the end date.'],
 INVALID_TRIAL:['تعذر تصنيف الشركة كتجربة داخلية.','The company cannot be marked as an internal trial.'],
 INVALID_RECEIPT:['راجع تاريخ التحصيل وحالة الاشتراك.','Check the payment date and subscription.'],
 DUPLICATE_RECEIPT:['مرجع التحصيل مسجل لهذه الشركة.','This receipt reference is already recorded for this company.']
};
const metrics=[
 ['registered','الشركات المسجلة','Registered companies'],['active','النشطة','Active'],['suspended','الموقوفة','Suspended'],
 ['pending','دون عضوية نشطة أو إيقاف','Pending'],['free','مجانية','Free'],['paid','مدفوعة','Paid'],
 ['trial','تجريبية','Trial'],['unclassified','غير مصنفة','Unclassified'],['seats_remaining','المقاعد المجانية المتبقية','Free seats left']
];
const statusLabels={active:['نشطة','Active'],suspended:['موقوفة','Suspended'],pending:['قيد الانتظار','Pending']};
const planLabels={free:['مجاني','Free'],paid:['مدفوع','Paid'],trial:['تجريبي','Trial'],unclassified:['غير مصنف','Unclassified']};

export default function PlatformOwnerPanel({ar}){
 const tr=(arabic,english)=>ar?arabic:english;
 const locale=ar?'ar-SA':'en',money=new Intl.NumberFormat(locale,{style:'currency',currency:'SAR'});
 const fmt=value=>value?new Intl.DateTimeFormat(locale,{dateStyle:'medium',calendar:'gregory',timeZone:'Asia/Riyadh'}).format(new Date(value)):'—';
 const [data,setData]=useState(null),[form,setForm]=useState(null),[page,setPage]=useState(0);
 const [selected,setSelected]=useState(null),[action,setAction]=useState(''),[details,setDetails]=useState({});
 const [error,setError]=useState(''),[saved,setSaved]=useState(false),[busy,setBusy]=useState(false);
 const load=()=>commerceRequest('?page='+page).then(setData);
 useEffect(()=>{
  let active=true;
  const refresh=()=>commerceRequest('?page='+page).then(value=>{if(active)setData(value)}).catch(e=>{if(active)setError(e.message)});
  void refresh();
  const timer=setInterval(refresh,25000);
  window.addEventListener('focus',refresh);
  return ()=>{active=false;clearInterval(timer);window.removeEventListener('focus',refresh)};
 },[page]);
 const displayed=form||data?.settings;
 const field=(key,value)=>setForm({...displayed,[key]:value});
 const confirmAction=(company,next)=>{
  setSelected(company);setAction(next);setDetails({endsOn:'',amount:'',receivedOn:data.today,reference:''});setError('');setSaved(false);
 };
 async function save(event,body){
  event.preventDefault();setBusy(true);setError('');setSaved(false);
  try{
   await commerceRequest('',body);await load();
   setForm(null);setSelected(null);setSaved(true);
  }catch(e){setError(e.message)}
  finally{setBusy(false)}
 }
 const updateCompany=event=>save(event,action==='receipt'
  ? {action,organizationId:selected.id,amount:Number(details.amount),receivedOn:details.receivedOn,reference:details.reference}
  : {action,organizationId:selected.id,endsOn:details.endsOn||null});
 const set=(key,value)=>setDetails({...details,[key]:value});
 const submitSettings=event=>save(event,{action:'settings',freeLimit:Number(displayed.free_limit),
  freeDays:displayed.free_days===null?null:Number(displayed.free_days),
  monthlyPrice:Number(displayed.monthly_price),noticeDays:Number(displayed.notice_days)});
 const labels={
  extend:tr('تمديد العرض','Extend offer'),paid:tr('تحويل إلى مدفوع','Convert to paid'),
  trial:tr('تجربة داخلية','Mark internal trial'),receipt:tr('تسجيل مبلغ محصّل','Record payment')
 };
 return <div className="work-page commerce-owner" dir={ar?'rtl':'ltr'}>
  <header className="work-heading"><div><small>NetExpert</small><h1>{tr('لوحة مالك المنصة','Platform owner')}</h1>
   <p>{tr('الشركات والاشتراكات وإيرادات NetExpert','NetExpert companies, subscriptions and revenue')}</p></div></header>
  {error&&<p role="alert" className="work-error">{errors[error]?.[ar?0:1]||tr('تعذر إكمال العملية.','Could not complete the request.')}</p>}
  {saved&&<p role="status" className="intake-notice">{tr('تم الحفظ.','Saved.')}</p>}
  {!data&&!error&&<p className="work-muted" role="status">{tr('جارٍ التحميل…','Loading…')}</p>}
  {data&&<>
   <div className="work-metrics operations-metrics commerce-metrics">
    {metrics.map(([key,a,b])=><section className="operations-metric" key={key}><span>{tr(a,b)}</span><strong>{data.metrics[key]}</strong></section>)}
    <section className="operations-metric"><span>{tr('الإيرادات المحصّلة','Collected revenue')}</span><strong>{money.format(data.metrics.actual_revenue)}</strong></section>
    <section className="operations-metric"><span>{tr('الإيراد الشهري المتوقع','Projected monthly revenue')}</span><strong>{money.format(data.metrics.expected_monthly)}</strong></section>
   </div>
   <div className="commerce-layout">
    <form className="work-admin commerce-form" onSubmit={submitSettings}>
     <h2>{tr('العرض المجاني والتسعير','Free offer and pricing')}</h2>
     <label>{tr('عدد مقاعد العرض المجاني','Free-offer seats')}
      <input type="number" min="0" max="100000" required value={displayed.free_limit} onChange={e=>field('free_limit',e.target.value)}/></label>
     <label className="commerce-check"><input type="checkbox" checked={displayed.free_days===null}
      onChange={e=>field('free_days',e.target.checked?null:30)}/>{tr('عرض دائم','Permanent offer')}</label>
     {displayed.free_days!==null&&<label>{tr('مدة العرض بالأيام','Offer duration in days')}
      <input type="number" min="1" max="36500" required value={displayed.free_days} onChange={e=>field('free_days',e.target.value)}/></label>}
     <label>{tr('سعر الاشتراك الشهري بالريال','Monthly subscription price in SAR')}
      <input type="number" min="0" max="9999999999.99" step=".01" required value={displayed.monthly_price} onChange={e=>field('monthly_price',e.target.value)}/></label>
     <label>{tr('التنبيه قبل الانتهاء بالأيام','Days before expiry to alert')}
      <input type="number" min="1" max="90" required value={displayed.notice_days} onChange={e=>field('notice_days',e.target.value)}/></label>
     <small>{tr('تغييرات السعر والمدة تنطبق على الاشتراكات الجديدة.','Price and duration changes apply to new subscriptions.')}</small>
     <button className="work-primary" disabled={busy}>{tr('حفظ الإعدادات','Save settings')}</button>
    </form>
    <section className="work-admin commerce-alerts" aria-labelledby="commerce-alert-title">
     <h2 id="commerce-alert-title">{tr('تنبيهات المالك','Owner alerts')}</h2>
     <h3>{tr('عروض مجانية تقترب من الانتهاء','Free offers ending soon')}</h3>
     {data.upcoming.length?<ul>{data.upcoming.map(row=><li key={row.id}>{row.name} · <time dateTime={row.ends_on}>{fmt(row.ends_on)}</time></li>)}</ul>:
      <p className="work-muted">{tr('لا توجد عروض تقترب من الانتهاء.','No offers are ending soon.')}</p>}
     <h3>{tr('تسجيلات الشركات الجديدة','Recent company registrations')}</h3>
     {data.registrations.length?<ul>{data.registrations.map(row=><li key={row.id}>{row.name} · <time dateTime={row.created_at}>{fmt(row.created_at)}</time></li>)}</ul>:
      <p className="work-muted">{tr('لا توجد تسجيلات جديدة.','No recent registrations.')}</p>}
    </section>
   </div>
   <section className="work-grid operations-grid">
    <div className="operations-section-head"><h2>{tr('الشركات والاشتراكات','Companies and subscriptions')}</h2></div>
    <div className="operations-table-scroll"><table><thead><tr>
     {[['الشركة','Company'],['الحالة','Status'],['الاشتراك','Plan'],['تاريخ التسجيل','Registered'],['البداية','Starts'],['النهاية','Ends'],
       ['المستخدمون','Users'],['الإجراءات','Actions']].map(([a,b])=><th key={b} scope="col">{tr(a,b)}</th>)}
    </tr></thead><tbody>{data.companies.map(company=><tr key={company.id}>
     <td><b>{company.name}</b></td><td>{tr(...statusLabels[company.status])}</td>
     <td>{tr(...planLabels[company.plan])}{company.internal_trial&&tr(' داخلي',' internal')}</td>
     <td>{fmt(company.created_at)}</td><td>{fmt(company.starts_on)}</td>
     <td>{company.plan==='free'&&!company.ends_on?tr('دائم','Permanent'):fmt(company.ends_on)}</td><td>{company.members}</td>
     <td className="commerce-actions">
      {company.plan==='free'&&<button onClick={()=>confirmAction(company,'extend')}>{labels.extend}</button>}
      {company.plan!=='paid'&&<button onClick={()=>confirmAction(company,'paid')}>{labels.paid}</button>}
      {company.plan!=='paid'&&!company.internal_trial&&<button onClick={()=>confirmAction(company,'trial')}>{labels.trial}</button>}
      {company.plan==='paid'&&<button onClick={()=>confirmAction(company,'receipt')}>{labels.receipt}</button>}
     </td>
    </tr>)}</tbody></table></div>
    <div className="commerce-pagination"> <button disabled={!page} onClick={()=>setPage(page-1)}>{tr('السابق','Previous')}</button>
     <span>{page+1} / {Math.max(1,Math.ceil(data.metrics.registered/50))}</span>
     <button disabled={(page+1)*50>=data.metrics.registered} onClick={()=>setPage(page+1)}>{tr('التالي','Next')}</button></div>
   </section>
  </>}
  {selected&&<div className="work-overlay"><section className="work-details commerce-dialog" role="dialog" aria-modal="true" aria-label={labels[action]}>
   <header><div><h2>{labels[action]}</h2><p>{selected.name}</p></div>
    <button onClick={()=>setSelected(null)} aria-label={tr('إغلاق','Close')}>×</button></header>
   {error&&<p role="alert" className="work-error">{errors[error]?.[ar?0:1]||tr('تعذر حفظ التغيير.','Could not save the change.')}</p>}
   <form className="commerce-form" onSubmit={updateCompany}>
    {action==='receipt'?<>
     <label>{tr('مرجع التحصيل','Payment reference')}<input required maxLength="100" value={details.reference} onChange={e=>set('reference',e.target.value)}/></label>
     <label>{tr('المبلغ المحصّل بالريال','Amount received in SAR')}<input required type="number" min=".01" max="9999999999.99" step=".01"
      value={details.amount} onChange={e=>set('amount',e.target.value)}/></label>
     <label>{tr('تاريخ التحصيل','Payment date')}<input required type="date" max={data.today} value={details.receivedOn} onChange={e=>set('receivedOn',e.target.value)}/></label>
    </>:<>
     <label>{tr('تاريخ النهاية (اختياري)','End date (optional)')}<input type="date" min={data.today} value={details.endsOn} onChange={e=>set('endsOn',e.target.value)}/></label>
     {action==='paid'&&<p>{tr('السعر الشهري','Monthly price')} · {money.format(data.settings.monthly_price)}</p>}
     {action==='trial'&&<p>{tr('التجربة الداخلية خارج حصة العرض المجاني.','Internal trials are outside the free-offer quota.')}</p>}
    </>}
    <button className="work-primary" disabled={busy}>{tr('حفظ','Save')}</button>
   </form>
  </section></div>}
 </div>;
}
