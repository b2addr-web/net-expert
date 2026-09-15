import { useEffect, useState } from 'react';
import { useAuth } from './AuthContext';

const BLANK={employee_id:'',employee_name:'',email_address:'',department:'',assign_location:'',sim_number:'',mobile_number:'',account_number:'',provider:'',sim_package:'',date_issued:'',date_returned:'',status:'',notes:''};
const DEPARTMENTS=['Sales','Finance','HR','IT','Operations','Production','Management'];
const LOCATIONS=['Riyadh','Jeddah','Dammam','Factory','Head Office'];
const PROVIDERS=['STC','Mobily','Zain'];
const PACKAGES=['20GB','50GB','100GB','Unlimited'];
const STATUSES=['Excellent','Active','Returned','Damaged','Lost','Suspended'];

function Field({label,required,children}){return <label className="sim-field"><span>{label}{required&&<b aria-hidden="true"> *</b>}</span>{children}</label>}
function Select({value,onChange,options,placeholder}){return <select value={value} onChange={onChange}><option value="">{placeholder}</option>{options.map(x=><option key={x} value={x}>{x}</option>)}</select>}

export default function DeviceModal({t,device,onSave,onClose}){
 const {user}=useAuth(),ar=t.dir==='rtl';
 const [form,setForm]=useState(BLANK),[error,setError]=useState(''),[saving,setSaving]=useState(false);
 useEffect(()=>{setForm(device?{...BLANK,...device}:{...BLANK});setError('')},[device]);
 const set=(key,value)=>setForm(p=>({...p,[key]:value}));
 const save=async()=>{
  const required=['employee_id','employee_name','department','sim_number','mobile_number','provider','date_issued','status'];
  if(required.some(key=>!String(form[key]||'').trim())){setError(ar?'أكمل جميع الحقول المطلوبة قبل الحفظ.':'Complete all required fields before saving.');return}
  if(form.email_address&&!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email_address)){setError(ar?'أدخل عنوان بريد إلكتروني صالحاً.':'Enter a valid email address.');return}
  if(form.date_returned&&form.date_returned<form.date_issued){setError(ar?'تاريخ الإرجاع لا يمكن أن يسبق تاريخ التسليم.':'Return date cannot precede issue date.');return}
  const now=new Date().toISOString();
  setSaving(true);setError('');
  try{await onSave({...form,addedBy:device?.addedBy||user?.name||user?.email||'unknown',addedAt:device?.addedAt||now,updatedBy:user?.name||user?.email||'unknown',updatedByEmail:user?.email||'',updatedAt:now});onClose()}
  catch(e){console.error('SIM assignment save failed',{message:e?.message,code:e?.code,error:e});setError(e?.code==='23505'?(ar?'رقم الشريحة مسجل مسبقاً في مساحة العمل.':'This SIM number already exists in the workspace.'):(e?.message|| (ar?'تعذر حفظ عهدة SIM.':'Could not save the SIM assignment.')));setSaving(false)}
 };
 return <div className="sim-modal-layer" dir={t.dir} role="dialog" aria-modal="true" aria-labelledby="sim-modal-title">
  <button className="sim-modal-backdrop" onClick={onClose} aria-label={ar?'إغلاق':'Close'}/>
  <section className="sim-modal">
   <header className="sim-modal-header"><div><small>{ar?'سجل عهد الموظفين':'Employee custody record'}</small><h2 id="sim-modal-title">{device?(ar?'تعديل عهدة SIM':'Edit SIM assignment'):(ar?'إضافة عهدة SIM جديدة':'Add new SIM assignment')}</h2><p>{ar?'سجّل بيانات الموظف والشريحة وحالة العهدة.':'Record the employee, SIM and custody details.'}</p></div><button onClick={onClose} aria-label={ar?'إغلاق':'Close'}>×</button></header>
   <div className="sim-modal-body">
    <fieldset><legend><b>01</b>{ar?'بيانات الموظف':'Employee details'}</legend><div className="sim-form-grid">
     <Field label="Employee ID" required><input value={form.employee_id} onChange={e=>set('employee_id',e.target.value)} placeholder="100657" autoFocus/></Field>
     <Field label="Employee Name" required><input value={form.employee_name} onChange={e=>set('employee_name',e.target.value)} placeholder="SAMEH KAMIL"/></Field>
     <Field label="Email Address"><input type="email" value={form.email_address} onChange={e=>set('email_address',e.target.value)} placeholder="name@company.com"/></Field>
     <Field label="Department" required><Select value={form.department} onChange={e=>set('department',e.target.value)} options={DEPARTMENTS} placeholder={ar?'اختر القسم':'Select department'}/></Field>
     <Field label="Assign Location"><Select value={form.assign_location} onChange={e=>set('assign_location',e.target.value)} options={LOCATIONS} placeholder={ar?'اختر الموقع':'Select location'}/></Field>
    </div></fieldset>
    <fieldset><legend><b>02</b>{ar?'بيانات الشريحة':'SIM details'}</legend><div className="sim-form-grid">
     <Field label="SIM Number" required><input value={form.sim_number} onChange={e=>set('sim_number',e.target.value)} inputMode="numeric" placeholder="831046001396"/></Field>
     <Field label="Mobile Number" required><input value={form.mobile_number} onChange={e=>set('mobile_number',e.target.value)} inputMode="tel" placeholder="0551234567"/></Field>
     <Field label="Account Number"><input value={form.account_number} onChange={e=>set('account_number',e.target.value)} placeholder="Account reference"/></Field>
     <Field label="Provider" required><Select value={form.provider} onChange={e=>set('provider',e.target.value)} options={PROVIDERS} placeholder={ar?'اختر المزود':'Select provider'}/></Field>
     <Field label="SIM Package"><Select value={form.sim_package} onChange={e=>set('sim_package',e.target.value)} options={PACKAGES} placeholder={ar?'اختر الباقة':'Select package'}/></Field>
    </div></fieldset>
    <fieldset><legend><b>03</b>{ar?'بيانات العهدة':'Custody details'}</legend><div className="sim-form-grid">
     <Field label="Date Issued" required><input type="date" value={form.date_issued} onChange={e=>set('date_issued',e.target.value)}/></Field>
     <Field label="Date Returned"><input type="date" value={form.date_returned} min={form.date_issued} onChange={e=>set('date_returned',e.target.value)}/></Field>
     <Field label="Status" required><Select value={form.status} onChange={e=>set('status',e.target.value)} options={STATUSES} placeholder={ar?'اختر الحالة':'Select status'}/></Field>
     <Field label="Notes"><textarea rows="4" value={form.notes} onChange={e=>set('notes',e.target.value)} placeholder={ar?'ملاحظات التسليم أو الإرجاع…':'Issue or return notes…'}/></Field>
    </div></fieldset>
    {error&&<div className="sim-form-error" role="alert">{error}</div>}
   </div>
   <footer className="sim-modal-footer"><span>{ar?'الحقول المميزة بعلامة * مطلوبة':'Fields marked * are required'}</span><div><button className="sim-cancel" onClick={onClose} disabled={saving}>{ar?'إلغاء':'Cancel'}</button><button className="sim-save" onClick={save} disabled={saving}>{saving?(ar?'جاري الحفظ…':'Saving…'):device?(ar?'حفظ التعديلات':'Save changes'):(ar?'حفظ عهدة SIM':'Save SIM assignment')}</button></div></footer>
  </section>
 </div>
}

