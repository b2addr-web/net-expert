import {useEffect,useState} from 'react';
import {supabase} from '../lib/supabase';
import {sidebarGroups,NavIcon} from './WorkspaceSidebar';

const featured=['assets','sim','report','device_request','subscriptions','monitoring'];

async function loadCounts(keys){
 const counts={};
 await Promise.all(keys.filter(key=>['assets','sim'].includes(key)).map(async key=>{
  try{const {count,error}=await supabase.from('workspace_records').select('id',{count:'exact',head:true}).eq('module',key);if(error)throw error;counts[key]=count}
  catch{counts[key]=null}
 }));
 const intakeKeys=keys.filter(key=>['report','device_request'].includes(key));
 if(intakeKeys.length){
  const session=await supabase.auth.getSession().catch(()=>({data:null}));
  const token=session.data?.session?.access_token;
  await Promise.all(intakeKeys.map(async key=>{
   if(!token){counts[key]=null;return}
   try{const response=await fetch(`/api/intake/admin?kind=${encodeURIComponent(key)}`,{headers:{Authorization:`Bearer ${token}`}});if(!response.ok)throw new Error('UNAVAILABLE');const result=await response.json();const size=result.cases?.length;counts[key]=typeof size==='number'?(size>=1000?'≥1000':size):null}
   catch{counts[key]=null}
  }));
 }
 await Promise.all(keys.filter(key=>['subscriptions','monitoring'].includes(key)).map(async key=>{
  try{const table=key==='subscriptions'?'service_subscriptions':'monitor_sites';const {count,error}=await supabase.from(table).select('id',{count:'exact',head:true});if(error)throw error;counts[key]=count}
  catch{counts[key]=null}
 }));
 return counts;
}

export default function HomePanel({user,ar,navigation,onNavigate}){
 const labels=Object.fromEntries(navigation.map(([key,en,arabic])=>[key,ar?arabic:en]));
 const available=featured.filter(key=>labels[key]);
 const [counts,setCounts]=useState({});
 useEffect(()=>{let alive=true;setCounts({});loadCounts(available).then(value=>{if(alive)setCounts(value)}).catch(()=>{if(alive)setCounts(Object.fromEntries(available.map(key=>[key,null])))});return()=>{alive=false}},[user.organization_id,navigation.map(([key])=>key).join(',')]);
 const format=value=>value===undefined?'…':value===null?'—':typeof value==='number'?value.toLocaleString(ar?'ar-SA':'en-US'):value;
 return <div className="work-page home-panel enterprise-home" dir={ar?'rtl':'ltr'}>
  <div className="enterprise-home-heading"><div><small>{user.organization_name}</small><h1>{ar?'الصفحة الرئيسية':'Home'}</h1></div><time>{new Intl.DateTimeFormat(ar?'ar-SA-u-ca-gregory':'en-GB',{timeZone:'Asia/Riyadh',dateStyle:'full'}).format(new Date())}</time></div>
  <section className="enterprise-home-banner"><div><small>{ar?'مساحة عمل NetExpert':'NetExpert workspace'}</small><h2>{ar?'مرحبًا بك في مساحة عملك':'Welcome to your workspace'}</h2><p>{ar?'إدارة أعمال تقنية المعلومات ومتابعة الأجهزة والطلبات والبلاغات، بكل سهولة من مكان واحد.':'Manage IT work, devices, requests and reports from one place.'}</p></div></section>
  {available.length>0&&<section className="enterprise-home-metrics" aria-label={ar?'مؤشرات الأقسام':'Section totals'}>{available.map(key=><button type="button" key={key} className="enterprise-home-metric" onClick={()=>onNavigate(key)}><span className="enterprise-home-metric-top"><span>{labels[key]}</span><i><NavIcon name={key}/></i></span><strong>{format(counts[key])}</strong><small>{counts[key]===undefined?(ar?'جارٍ تحميل البيانات':'Loading data'):counts[key]===null?(ar?'البيانات غير متاحة الآن':'Data unavailable'):(ar?'من سجلات القسم الحالية':'From current section records')}</small></button>)}</section>}
  <div className="enterprise-home-panels"><section className="enterprise-home-panel"><header><h2>{ar?'أقسام مساحة العمل':'Workspace sections'}</h2><p>{ar?'تظهر الأقسام المصرّح لك بها فقط.':'Only sections you can access are shown.'}</p></header><div className="enterprise-home-links">{sidebarGroups.map(group=>{const items=group.items.filter(key=>labels[key]);return items.length?<div key={group.key}><h3>{ar?group.ar:group.en}</h3>{items.map(key=><button type="button" key={key} onClick={()=>onNavigate(key)}><NavIcon name={key}/><span>{labels[key]}</span><span aria-hidden="true">←</span></button>)}</div>:null})}</div></section><section className="enterprise-home-panel enterprise-home-chart-guide"><header><h2>{ar?'لوحات المؤشرات':'Dashboards'}</h2><p>{ar?'الرسوم مرتبطة بسجلات الأقسام الفعلية.':'Charts use the sections’ existing records.'}</p></header><div><NavIcon name="reports"/><p>{ar?'افتح شرائح الاتصال أو الأجهزة التقنية أو المشتريات لعرض الرسوم والمؤشرات الحالية.':'Open SIM cards, IT devices, or Purchasing to view their existing charts and metrics.'}</p></div></section></div>
 </div>;
}
