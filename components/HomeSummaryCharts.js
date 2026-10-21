import {useEffect,useState} from 'react';
import {Bar,BarChart,Cell,Pie,PieChart,ResponsiveContainer,Tooltip,XAxis,YAxis} from 'recharts';
import {NavIcon} from './WorkspaceSidebar';

const palette=['#2475e8','#4a8bea','#6b9ff0','#91b7f2'];
const reportColors={'جديد':'#2474e7','قيد المعالجة':'#e7a23b','بانتظار إجراء':'#e27d54','تم الحل':'#19a879','مغلق':'#8a9bb0'};
const reportEnglish={'جديد':'New','قيد المعالجة':'In progress','بانتظار إجراء':'Awaiting action','تم الحل':'Resolved','مغلق':'Closed'};
const t=(ar,arabic,english)=>ar?arabic:english;
const n=(value,ar)=>Number(value).toLocaleString(ar?'ar-SA':'en-US');

function useReducedMotion(){
 const [reduced,setReduced]=useState(false);
 useEffect(()=>{const media=window.matchMedia('(prefers-reduced-motion: reduce)');const update=()=>setReduced(media.matches);update();media.addEventListener?.('change',update);return()=>media.removeEventListener?.('change',update)},[]);
 return reduced;
}

function EmptyChart({ar,source,icon}){
 const message=source===undefined?t(ar,'جارٍ تحميل الرسم…','Loading chart…'):source===null?t(ar,'تعذر تحميل بيانات الرسم.','Chart data could not be loaded.'):t(ar,'لا توجد بيانات كافية لعرض الرسم.','Not enough data to display this chart.');
 return <div className="enterprise-home-chart-empty" role="status"><span aria-hidden="true"><NavIcon name={icon}/></span><p>{message}</p></div>;
}

function ChartTooltip({active,payload,ar,total,report=false}){
 if(!active||!payload?.length)return null;
 const item=payload[0]?.payload||{};
 const count=Number(item.count||0);
 return <div className="enterprise-home-chart-tooltip" dir={ar?'rtl':'ltr'}><strong>{report&&!ar?reportEnglish[item.name]||item.name:item.name}</strong><span>{t(ar,'العدد','Count')}: {n(count,ar)}</span>{report&&total>0&&<span>{t(ar,'النسبة','Share')}: {new Intl.NumberFormat(ar?'ar-SA':'en-US',{style:'percent',maximumFractionDigits:1}).format(count/total)}</span>}</div>;
}

export function HomeBarChart({title,values,ar,source}){
 const reduced=useReducedMotion();
 const total=values.reduce((sum,[,count])=>sum+count,0);
 const max=Math.max(1,...values.map(([,count])=>count));
 return <section className="enterprise-home-panel enterprise-home-chart enterprise-home-bar-chart" aria-label={title}>
  <header><div className="enterprise-home-chart-title"><span className="enterprise-home-chart-icon" aria-hidden="true"><NavIcon name="assets"/></span><div><h3>{title}</h3>{total>0&&<small>{t(ar,`إجمالي ${n(total,ar)} جهاز`,`Total ${n(total,ar)} devices`)}</small>}</div></div></header>
  {values.length?<div className="enterprise-home-chart-scroll"><div className="enterprise-home-bar-rows">{values.map(([name,count],index)=><div className="enterprise-home-bar-row" key={name}>
   <span className="enterprise-home-bar-name">{name}</span>
   <div className="enterprise-home-bar-graphic" role="img" aria-label={`${name}: ${n(count,ar)}`}><ResponsiveContainer width="100%" height={30}>
    <BarChart data={[{name,count}]} layout="vertical" margin={{top:2,right:2,bottom:2,left:2}}>
     <XAxis type="number" domain={[0,max]} hide/><YAxis type="category" dataKey="name" hide/>
     <Tooltip content={<ChartTooltip ar={ar}/>} cursor={false} offset={14} allowEscapeViewBox={{x:true,y:true}} isAnimationActive={!reduced}/>
     <Bar dataKey="count" fill={palette[Math.min(index,palette.length-1)]} stroke="none" barSize={17} radius={[5,5,5,5]} isAnimationActive={!reduced} maxBarSize={17}/>
    </BarChart>
   </ResponsiveContainer></div><b>{n(count,ar)}</b>
  </div>)}</div></div>:<EmptyChart ar={ar} source={source} icon="assets"/>}
 </section>;
}

export function HomeReportDonut({values,ar,source}){
 const reduced=useReducedMotion();
 const total=values.reduce((sum,[,count])=>sum+count,0);
 const rows=values.map(([name,count],index)=>({name,count,color:reportColors[name]||palette[index%palette.length]}));
 return <section className={`enterprise-home-panel enterprise-home-chart enterprise-home-report-chart${total?'':' is-empty'}`} aria-label={t(ar,'البلاغات حسب الحالة','Reports by status')}>
  <header><div className="enterprise-home-chart-title"><span className="enterprise-home-chart-icon" aria-hidden="true"><NavIcon name="report"/></span><div><h3>{t(ar,'البلاغات حسب الحالة','Reports by status')}</h3>{total>0&&<small>{t(ar,`إجمالي ${n(total,ar)} بلاغ`,`Total ${n(total,ar)} reports`)}</small>}</div></div></header>
  {total>0?<div className="enterprise-home-report-layout"><div className="enterprise-home-pie-wrap" role="img" aria-label={t(ar,`${n(total,ar)} بلاغ`,`Total ${n(total,ar)} reports`)}>
   <ResponsiveContainer width="100%" height="100%"><PieChart><Pie data={rows} dataKey="count" nameKey="name" innerRadius="70%" outerRadius="94%" paddingAngle={rows.length>1?2:0} stroke="none" isAnimationActive={!reduced}>{rows.map(row=><Cell key={row.name} fill={row.color}/>)}</Pie><Tooltip content={<ChartTooltip ar={ar} total={total} report/>} isAnimationActive={!reduced}/></PieChart></ResponsiveContainer>
   <div className="enterprise-home-pie-center" aria-hidden="true"><strong>{n(total,ar)}</strong><small>{t(ar,'بلاغ','Reports')}</small></div>
  </div><ul className="enterprise-home-report-legend">{rows.map(row=><li key={row.name}><i style={{background:row.color}}/><span>{ar?row.name:reportEnglish[row.name]||row.name}</span><b>{n(row.count,ar)}</b></li>)}</ul></div>:<EmptyChart ar={ar} source={source} icon="report"/>}
 </section>;
}
