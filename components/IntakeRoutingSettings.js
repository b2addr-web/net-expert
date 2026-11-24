import {useEffect,useState} from 'react';
import {intakeRequest} from '../lib/intake-client';

const suggestions=['الشبكات والإنترنت','أجهزة الكمبيوتر واللابتوب','الطابعات','البريد الإلكتروني','الأنظمة والبرامج','الهواتف والاتصالات','الأجهزة التقنية الأخرى','أخرى'];
const emptyCategory={id:null,name:'',active:true,recipients:[]};
const defaults={enabled:true,email_enabled:true,bell_enabled:true,default_recipient:null,device_recipients:[]};

function Recipients({label,members,selected,onChange}) {
 const visible=new Set(members.map(member=>member.id));
 const unavailable=selected.filter(id=>!visible.has(id));
 return <fieldset className="intake-routing-members"><legend>{label}</legend>
  {members.map(({id,name})=><label key={id}><input type="checkbox" checked={selected.includes(id)}
   onChange={e=>onChange(e.target.checked?[...selected,id]:selected.filter(item=>item!==id))}/>{name}</label>)}
  {unavailable.length>0&&<button type="button" onClick={()=>onChange(selected.filter(id=>visible.has(id)))}>إزالة المستلمين غير المؤهلين / Remove ineligible recipients</button>}
 </fieldset>;
}

export default function IntakeRoutingSettings({ar}) {
 const tr=(arabic,english)=>ar?arabic:english;
 const [data,setData]=useState(null),[settings,setSettings]=useState(defaults);
 const [category,setCategory]=useState(emptyCategory),[busy,setBusy]=useState(false);
 const [result,setResult]=useState(null);
 async function load(){
  const payload=await intakeRequest('routing?mode=settings');
  setData(payload);setSettings(payload.settings||defaults);
 }
 useEffect(()=>{load().catch(()=>setResult('LOAD_FAILED'))},[]);
 async function save(event,body){
  event.preventDefault();setBusy(true);setResult(null);
  try{
   await intakeRequest('routing','POST',body);
   if(body.action==='category')setCategory(emptyCategory);
   await load();setResult('SAVED');
  }catch(error){setResult(error.message)}
  finally{setBusy(false)}
 }
 const messages={
  SAVED:tr('تم الحفظ.','Saved.'),INVALID_RECIPIENT:tr('أزل المستخدمين الذين فقدوا صلاحياتهم ثم أعد الحفظ.','Remove ineligible recipients and save again.'),
  DUPLICATE_CATEGORY:tr('يوجد تصنيف بهذا الاسم.','A category with this name already exists.')
 };
 return <section className="work-admin intake-routing" aria-labelledby="intake-routing-heading">
  <h2 id="intake-routing-heading">{tr('الإشعارات وتوزيع البلاغات','Notifications and report routing')}</h2>
  {result&&<p role={result==='SAVED'?'status':'alert'}>{messages[result]||tr('تعذر إكمال العملية.','Could not complete the operation.')}</p>}
  {data?<div className="intake-routing-grid">
   <form onSubmit={event=>save(event,{...settings,action:'settings',recipients:settings.device_recipients})}>
    <h3>{tr('قنوات الإشعار والمستلمون','Channels and recipients')}</h3>
    {[['enabled','تفعيل إشعارات الفريق','Enable staff notifications'],['email_enabled','البريد الإلكتروني','Email'],['bell_enabled','جرس الإشعارات','Notification bell']].map(([key,a,b])=>
     <label className="intake-routing-check" key={key}><input type="checkbox" checked={settings[key]} onChange={e=>setSettings({...settings,[key]:e.target.checked})}/>{tr(a,b)}</label>)}
    <label>{tr('المستلم الافتراضي للبلاغات','Default report recipient')}<select value={settings.default_recipient||''}
     onChange={e=>setSettings({...settings,default_recipient:e.target.value||null})}>
     <option value="">{tr('مديرو الشركة عند عدم وجود مستلم','Company admins when no recipient is set')}</option>
     {settings.default_recipient&&!data.reportMembers.some(m=>m.id===settings.default_recipient)&&
      <option value={settings.default_recipient}>{tr('مستخدم غير مؤهل','Ineligible user')}</option>}
     {data.reportMembers.map(({id,name})=><option key={id} value={id}>{name}</option>)}
    </select></label>
    <Recipients label={tr('مستلمو طلبات الأجهزة','Device request recipients')} members={data.deviceMembers}
     selected={settings.device_recipients} onChange={device_recipients=>setSettings({...settings,device_recipients})}/>
    <button className="work-primary" disabled={busy}>{tr('حفظ الإعدادات','Save settings')}</button>
   </form>
   <form onSubmit={event=>save(event,{...category,action:'category'})}>
    <h3>{tr('تصنيفات البلاغات','Report categories')}</h3>
    <label>{tr('اختيار تصنيف للتعديل','Category to edit')}<select value={category.id||''}
     onChange={e=>setCategory(data.categories.find(x=>x.id===e.target.value)||emptyCategory)}>
     <option value="">{tr('تصنيف جديد','New category')}</option>
     {data.categories.map(x=><option key={x.id} value={x.id}>{x.name}{x.active?'':tr(' (معطّل)',' (disabled)')}</option>)}
    </select></label>
    <label>{tr('اسم التصنيف','Category name')}<input required maxLength={120} list="intake-category-suggestions"
     value={category.name} onChange={e=>setCategory({...category,name:e.target.value})}/></label>
    <datalist id="intake-category-suggestions">{suggestions.map(name=><option key={name} value={name}/>)}</datalist>
    <label className="intake-routing-check"><input type="checkbox" checked={category.active}
     onChange={e=>setCategory({...category,active:e.target.checked})}/>{tr('التصنيف نشط','Category active')}</label>
    <Recipients label={tr('مستلمو إشعارات التصنيف','Category notification recipients')} members={data.reportMembers}
     selected={category.recipients} onChange={recipients=>setCategory({...category,recipients})}/>
    <button className="work-primary" disabled={busy}>{tr('حفظ التصنيف','Save category')}</button>
   </form>
  </div>:!result&&<p role="status">{tr('جارٍ التحميل…','Loading…')}</p>}
 </section>;
}
