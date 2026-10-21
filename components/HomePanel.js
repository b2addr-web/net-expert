import {useEffect,useMemo,useState} from 'react';
import dynamic from 'next/dynamic';
import {supabase} from '../lib/supabase';
import {listRecords} from '../lib/workspace';
import {remainingDays} from '../lib/platform-client';
import {NavIcon} from './WorkspaceSidebar';
const HomeBarChart=dynamic(()=>import('./HomeSummaryCharts').then(module=>module.HomeBarChart),{ssr:false});
const HomeReportDonut=dynamic(()=>import('./HomeSummaryCharts').then(module=>module.HomeReportDonut),{ssr:false});

const featured=['assets','sim','report','device_request','subscriptions','monitoring'];
const sources=[...featured,'purchasing','inventory'];
const reportEnglish={'جديد':'New','قيد المعالجة':'In progress','بانتظار إجراء':'Awaiting action','تم الحل':'Resolved','مغلق':'Closed'};
const label=(ar,a,b)=>ar?a:b;
const number=(n,ar)=>Number(n).toLocaleString(ar?'ar-SA':'en-US');
const time=(value,ar)=>value?new Intl.DateTimeFormat(ar?'ar-SA-u-ca-gregory':'en-GB',{timeZone:/^\d{4}-\d{2}-\d{2}$/.test(value)?'UTC':'Asia/Riyadh',dateStyle:'medium',...(/^\d{4}-\d{2}-\d{2}$/.test(value)?{}:{timeStyle:'short'})}).format(new Date(value)):'';

async function loadCases(kind){
 const {data}=await supabase.auth.getSession();
 if(!data.session?.access_token)throw new Error('AUTH_REQUIRED');
 const response=await fetch(`/api/intake/admin?kind=${kind}`,{headers:{Authorization:`Bearer ${data.session.access_token}`}});
 if(!response.ok)throw new Error('UNAVAILABLE');
 return (await response.json()).cases||[];
}
async function loadTable(key,org){
 const table={subscriptions:'service_subscriptions',monitoring:'monitor_sites',inventory:'inventory_items'}[key];
 const fields={subscriptions:'id,name,end_date,created_at,updated_at',monitoring:'id,name,status,enabled,ssl_status,ssl_expires_at,domain_expires_on,domain_expires_manual,hosting_expires_on,last_checked_at,created_at,updated_at',inventory:'id,name,quantity,min_quantity,created_at,updated_at'}[key];
 const {data,error}=await supabase.from(table).select(fields).eq('organization_id',org).order('updated_at',{ascending:false}).limit(1000);
 if(error)throw error;
 return data||[];
}
async function loadHome(keys,org){
 const result={};
 await Promise.all(keys.map(async key=>{
  try{const rows=['assets','sim','purchasing'].includes(key)?await listRecords(key):['report','device_request'].includes(key)?await loadCases(key):await loadTable(key,org);result[key]={rows,count:rows.length>=1000&&['report','device_request','subscriptions','monitoring','inventory'].includes(key)?'≥1000':rows.length}}
  catch{result[key]={rows:null,count:null}}
 }));
 return result;
}
function grouped(rows,field,ar){return Object.entries((rows||[]).reduce((result,row)=>{const value=String(row[field]||'').trim()||label(ar,'غير محدد','Unspecified');result[value]=(result[value]||0)+1;return result},{})).sort((a,b)=>b[1]-a[1])}

function recentEvents(data,ar){
 const events=[];
 for(const key of sources)for(const row of data[key]?.rows||[]){
  const changed=row.updated_at&&row.created_at&&Date.parse(row.updated_at)-Date.parse(row.created_at)>60000;
  const when=changed?row.updated_at:row.created_at;
  if(!when||Number.isNaN(Date.parse(when)))continue;
  const title=row.reference||row.employee_name||row.request_number||row.name||row.serial_number||row.sim_number||label(ar,'سجل','Record');
  const kind={assets:['الأجهزة التقنية','Devices'],sim:['شرائح الاتصال','SIM cards'],purchasing:['المشتريات','Purchasing'],report:['البلاغات','Reports'],device_request:['طلبات الأجهزة','Device requests'],subscriptions:['الاشتراكات','Subscriptions'],monitoring:['مراقبة المواقع','Monitoring'],inventory:['المخزون التقني','IT inventory']}[key];
  events.push({id:`${key}-${row.id}`,when,key,title,description:`${kind[ar?0:1]} · ${label(ar,changed?'تحديث':'إضافة',changed?'Updated':'Added')}`,actor:changed?row.updated_by_name:row.created_by_name});
 }
 return events.sort((a,b)=>Date.parse(b.when)-Date.parse(a.when)).slice(0,6);
}
function attentionItems(data,ar){
 const items=[];const add=(key,id,title,description,priority,when)=>items.push({key,id,title,description,priority,when});
 for(const row of data.report?.rows||[])if(!['تم الحل','مغلق'].includes(row.status))add('report',row.id,row.reference||label(ar,'بلاغ','Report'),`${ar?row.status:reportEnglish[row.status]||row.status}${row.issue_type?` · ${row.issue_type}`:''}`,row.status==='بانتظار إجراء'?'high':'medium',row.updated_at||row.created_at);
 for(const row of data.subscriptions?.rows||[]){const days=remainingDays(row.end_date);if(days!==null&&days>=0&&days<=14)add('subscriptions',row.id,row.name,label(ar,`ينتهي خلال ${number(days,ar)} يوم`,`Expires in ${number(days,ar)} days`),'medium',row.end_date)}
 for(const row of data.monitoring?.rows||[]){
  if(!row.enabled)continue;
  if(['down','degraded'].includes(row.status))add('monitoring',`${row.id}-status`,row.name,label(ar,row.status==='down'?'الموقع متعطل':'استجابة الموقع بطيئة',row.status==='down'?'Website down':'Slow response'),row.status==='down'?'high':'medium',row.last_checked_at);
  if(row.ssl_status==='invalid')add('monitoring',`${row.id}-ssl`,row.name,label(ar,'مشكلة في شهادة SSL','SSL certificate issue'),'high',row.last_checked_at);
  for(const [field,arabic,english] of [['ssl_expires_at','شهادة SSL','SSL certificate'],['domain_expires_on','الدومين','Domain'],['hosting_expires_on','الاستضافة','Hosting']]){
   const value=field==='domain_expires_on'?row.domain_expires_manual||row.domain_expires_on:row[field];const days=remainingDays(value);
   if(days!==null&&days>=0&&days<=30)add('monitoring',`${row.id}-${field}`,row.name,label(ar,`${arabic} ينتهي خلال ${number(days,ar)} يوم`,`${english} expires in ${number(days,ar)} days`),'medium',value);
  }
 }
 for(const row of data.inventory?.rows||[])if(Number(row.min_quantity)>0&&Number(row.quantity)<=Number(row.min_quantity))add('inventory',row.id,row.name,label(ar,`الكمية ${number(row.quantity,ar)} · الحد الأدنى ${number(row.min_quantity,ar)}`,`Quantity ${number(row.quantity,ar)} · minimum ${number(row.min_quantity,ar)}`),'medium',row.updated_at);
 return items.sort((a,b)=>(a.priority==='high'?0:1)-(b.priority==='high'?0:1)||Date.parse(b.when||0)-Date.parse(a.when||0)).slice(0,7);
}

export default function HomePanel({user,ar,navigation,onNavigate}){
 const labels=Object.fromEntries(navigation.map(([key,en,arabic])=>[key,ar?arabic:en]));
 const keys=sources.filter(key=>labels[key]);const signature=keys.join(',');
 const [data,setData]=useState({});
 useEffect(()=>{let alive=true;setData({});loadHome(keys,user.organization_id).then(value=>{if(alive)setData(value)});return()=>{alive=false}},[user.organization_id,signature]);
 const departments=useMemo(()=>grouped(data.assets?.rows,'department',ar),[data.assets,ar]);
 const devices=useMemo(()=>grouped(data.assets?.rows,'hardware',ar),[data.assets,ar]);
 const reports=useMemo(()=>grouped(data.report?.rows,'status',ar),[data.report,ar]);
 const activity=useMemo(()=>recentEvents(data,ar),[data,ar]);
 const alerts=useMemo(()=>attentionItems(data,ar),[data,ar]);
 const loading=keys.some(key=>!data[key]);const unavailable=keys.some(key=>data[key]?.rows===null);
 const count=key=>!data[key]?'…':data[key].count===null?'—':typeof data[key].count==='number'?number(data[key].count,ar):data[key].count;
 return <div className="work-page home-panel enterprise-home" dir={ar?'rtl':'ltr'}>
  <div className="enterprise-home-heading"><div><small>{user.organization_name}</small><h1>{label(ar,'الصفحة الرئيسية','Home')}</h1></div><time>{new Intl.DateTimeFormat(ar?'ar-SA-u-ca-gregory':'en-GB',{timeZone:'Asia/Riyadh',dateStyle:'full'}).format(new Date())}</time></div>
  <section className="enterprise-home-banner"><div><small>{label(ar,'مساحة عمل NetExpert','NetExpert workspace')}</small><h2>{label(ar,'مرحبًا بك في مساحة عملك','Welcome to your workspace')}</h2><p>{label(ar,'إدارة أعمال تقنية المعلومات ومتابعة الأجهزة والطلبات والبلاغات، بكل سهولة من مكان واحد.','Manage IT work, devices, requests and reports from one place.')}</p></div></section>
  <section className="enterprise-home-metrics" aria-label={label(ar,'مؤشرات الأقسام','Section totals')}>{featured.filter(key=>labels[key]).map(key=><button type="button" key={key} className="enterprise-home-metric" onClick={()=>onNavigate(key)}><span className="enterprise-home-metric-top"><span>{labels[key]}</span><i><NavIcon name={key}/></i></span><strong>{count(key)}</strong><small>{!data[key]?label(ar,'جارٍ تحميل البيانات','Loading data'):data[key].count===null?label(ar,'البيانات غير متاحة الآن','Data unavailable'):label(ar,'من سجلات القسم الحالية','From current section records')}</small></button>)}</section>
  <section className="enterprise-home-summary" aria-label={label(ar,'ملخص البيانات','Data summary')}><div className="enterprise-home-section-heading"><h2>{label(ar,'ملخص البيانات','Data summary')}</h2><p>{label(ar,'مؤشرات من السجلات المصرّح لك بها','Insights from sections you can access')}</p></div><div className={`enterprise-home-chart-grid${labels.assets&&labels.report&&!reports.length?' has-empty-report':''}`}>{labels.assets&&<HomeBarChart title={label(ar,'الأجهزة التقنية حسب القسم','Devices by department')} values={departments} ar={ar} source={data.assets?.rows}/>} {labels.report&&<HomeReportDonut values={reports} ar={ar} source={data.report?.rows}/>} {labels.assets&&<HomeBarChart title={label(ar,'الأجهزة التقنية حسب النوع','Devices by type')} values={devices} ar={ar} source={data.assets?.rows}/>}</div>{!labels.assets&&!labels.report&&<p className="enterprise-home-empty">{label(ar,'لا تتوفر بيانات رسوم من الأقسام المصرّح لك بها.','No chart data is available from your permitted sections.')}</p>}</section>
  <div className="enterprise-home-feed"><section className="enterprise-home-panel"><header><h2>{label(ar,'النشاط الأخير','Recent activity')}</h2><p>{label(ar,'آخر السجلات والعمليات المتاحة','Latest available records and updates')}</p></header>{activity.length?<ol className="enterprise-home-list">{activity.map(item=><li key={item.id}><span className="enterprise-home-list-icon"><NavIcon name={item.key}/></span><div><strong>{item.title}</strong><p>{item.description}</p><small>{item.actor&&<>{item.actor} · </>}{time(item.when,ar)}</small></div></li>)}</ol>:<p className="enterprise-home-empty">{loading?label(ar,'جارٍ تحميل النشاط…','Loading activity…'):unavailable?label(ar,'تعذر تحميل بعض مصادر النشاط.','Some activity sources are unavailable.'):label(ar,'لا يوجد نشاط مسجل بعد.','No activity recorded yet.')}</p>}</section><section className="enterprise-home-panel"><header><h2>{label(ar,'يتطلب الانتباه','Needs attention')}</h2><p>{label(ar,'حالات وتنبيهات من بياناتك الحالية','Items from your current data')}</p></header>{alerts.length?<ul className="enterprise-home-list enterprise-home-alerts">{alerts.map(item=><li key={`${item.key}-${item.id}`}><span className={`enterprise-home-priority ${item.priority}`}>{label(ar,item.priority==='high'?'عاجل':'متابعة',item.priority==='high'?'High':'Review')}</span><div><strong>{item.title}</strong><p>{item.description}</p><small>{item.when?time(item.when,ar):''}</small></div></li>)}</ul>:<p className="enterprise-home-empty">{loading?label(ar,'جارٍ فحص التنبيهات…','Loading alerts…'):unavailable?label(ar,'لا تظهر تنبيهات حاليًا؛ بعض المصادر غير متاحة.','No alerts shown; some sources are unavailable.'):label(ar,'لا توجد عناصر تتطلب الانتباه حاليًا.','Nothing needs attention right now.')}</p>}</section></div>
 </div>;
}
