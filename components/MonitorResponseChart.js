import {useEffect,useRef,useState} from 'react';

const PERIOD_MS={
 '1d':24*60*60*1000,
 '7d':7*24*60*60*1000,
 '30d':30*24*60*60*1000
};
const BUCKET_MS={'1d':60*60*1000,'7d':6*60*60*1000,'30d':24*60*60*1000};
const locale=ar=>ar?'ar-SA-u-ca-gregory-nu-latn':'en-GB';

function axisDate(value,period){
 const date=new Date(value);
 return new Intl.DateTimeFormat('en-GB',{timeZone:'Asia/Riyadh',day:'2-digit',month:'2-digit',...(period==='1d'?{hour:'2-digit',minute:'2-digit',hourCycle:'h23'}:{})}).formatToParts(date).reduce((parts,item)=>{if(item.type!=='literal')parts[item.type]=item.value;return parts},{});
}

function niceScale(value){
 const maximum=Math.max(10,value);
 const power=10**Math.floor(Math.log10(maximum/4));
 const step=[1,2,5,10].map(n=>n*power).find(n=>n>=maximum/4)||10*power;
 return {step,maximum:Math.ceil(maximum/step)*step};
}

export default function MonitorResponseChart({rows=[],period='1d',ar=false,label,empty}){
 const host=useRef(null);
 const [width,setWidth]=useState(720),[hovered,setHovered]=useState(null);
 const valid=rows.filter(row=>row.avg_response_ms!==null&&Number(row.response_count||0)>0&&Number.isFinite(Number(row.avg_response_ms)));
 useEffect(()=>{
  const element=host.current;if(!element)return;
  const observer=new ResizeObserver(entries=>setWidth(Math.max(200,Math.round(entries[0].contentRect.width))));
  observer.observe(element);return()=>observer.disconnect();
 },[valid.length>=2]);
 useEffect(()=>setHovered(null),[period,rows]);

 if(valid.length<2)return <p className="work-muted monitor-chart-empty" role="status">{empty}</p>;

 const narrow=width<480,height=narrow?244:272;
 const margin={left:narrow?52:60,right:narrow?12:24,top:26,bottom:58};
 const innerWidth=width-margin.left-margin.right,innerHeight=height-margin.top-margin.bottom;
 const end=Date.now(),start=end-(PERIOD_MS[period]||PERIOD_MS['1d']);
 const largest=Math.max(...valid.map(row=>Number(row.max_response_ms??row.avg_response_ms)));
 const scale=niceScale(largest);
 const x=time=>margin.left+Math.max(0,Math.min(1,(time-start)/(end-start)))*innerWidth;
 const y=value=>margin.top+innerHeight-Number(value)/scale.maximum*innerHeight;
 const tickCount=narrow?3:5;
 const ticks=Array.from({length:tickCount},(_,index)=>start+(end-start)*index/(tickCount-1));
 const lines=[];let segment=[];let previous=null;
 for(const row of rows){
  const current=Number(new Date(row.bucket));
  const usable=row.avg_response_ms!==null&&Number(row.response_count||0)>0&&Number.isFinite(current);
  if(!usable){if(segment.length>1)lines.push(segment);segment=[];previous=null;continue}
  if(previous!==null&&current-previous>BUCKET_MS[period]*1.5){if(segment.length>1)lines.push(segment);segment=[]}
  segment.push(`${x(current)},${y(row.avg_response_ms)}`);previous=current;
 }
 if(segment.length>1)lines.push(segment);
 const active=hovered===null?null:valid[hovered];
 const activeX=active?x(Date.parse(active.bucket)):0,activeY=active?y(active.avg_response_ms):0;
 const tooltipLeft=Math.max(6,Math.min(width-194,activeX-94));
 const tooltipTop=activeY<112?activeY+12:activeY-104;
 const dateFormatter=new Intl.DateTimeFormat(locale(ar),{timeZone:'Asia/Riyadh',day:'2-digit',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit',hourCycle:'h23'});

 return <div className="monitor-plot" ref={host} dir="ltr">
  <svg width="100%" height={height} viewBox={`0 0 ${width} ${height}`} role="img" aria-label={label}>
   <text className="monitor-axis-title" x={margin.left} y="14">ms</text>
   {Array.from({length:Math.round(scale.maximum/scale.step)+1},(_,index)=>{
    const value=index*scale.step,position=y(value);
    return <g key={value}><line className="monitor-grid-line" x1={margin.left} x2={width-margin.right} y1={position} y2={position}/><text className="monitor-axis-label" x={margin.left-9} y={position+4} textAnchor="end">{value}</text></g>
   })}
   {ticks.map((value,index)=>{
    const parts=axisDate(value,period),position=x(value);
    return <g key={index}><line className="monitor-tick-line" x1={position} x2={position} y1={margin.top+innerHeight} y2={margin.top+innerHeight+5}/><text className="monitor-axis-label" x={position} y={height-34} textAnchor={index===0?'start':index===ticks.length-1?'end':'middle'}><tspan x={position}>{period==='1d'?`${parts.hour}:${parts.minute}`:`${parts.day}/${parts.month}`}</tspan>{period==='1d'&&<tspan x={position} dy="15">{parts.day}/{parts.month}</tspan>}</text></g>
   })}
   {lines.map((points,index)=><polyline key={index} className="monitor-line" points={points.join(' ')}/>)}
   {valid.map((row,index)=>{
    const cx=x(Date.parse(row.bucket)),cy=y(row.avg_response_ms);
    return <g key={row.bucket} tabIndex="0" role="button" aria-label={`${dateFormatter.format(new Date(row.bucket))}: ${row.avg_response_ms} ms`} onMouseEnter={()=>setHovered(index)} onMouseLeave={()=>setHovered(null)} onFocus={()=>setHovered(index)} onBlur={()=>setHovered(null)} onClick={()=>setHovered(index)}><circle className="monitor-point-hit" cx={cx} cy={cy} r="14"/><circle className={`monitor-point${hovered===index?' active':''}`} cx={cx} cy={cy} r="4"/></g>
   })}
  </svg>
  {active&&<div className="monitor-tooltip" role="tooltip" dir={ar?'rtl':'ltr'} style={{left:tooltipLeft,top:tooltipTop}}><strong>{dateFormatter.format(new Date(active.bucket))}</strong><span>{ar?'المتوسط':'Average'}: {active.avg_response_ms} ms</span><span>{ar?'الأعلى':'Peak'}: {active.max_response_ms??'—'} ms · {active.check_count} {ar?'فحص':'checks'}</span></div>}
  <div className="monitor-chart-caption">{ar?'التوقيت: السعودية (Asia/Riyadh)':'Time: Saudi Arabia (Asia/Riyadh)'}</div>
 </div>;
}
