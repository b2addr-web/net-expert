export function summarizeMonitorRows(rows,period='1d',interval=5){
 const count=rows.reduce((n,x)=>n+Number(x.check_count),0);
 const available=rows.reduce((n,x)=>n+Number(x.available_count),0);
 const weighted=rows.reduce((n,x)=>n+Number(x.avg_response_ms||0)*Number(x.response_count),0);
 const responseCount=rows.reduce((n,x)=>n+Number(x.response_count),0);
 const minutes=period==='1d'?1440:period==='7d'?10080:43200;
 const minimum=Math.max(2,Math.ceil(minutes/Math.max(1,interval)*0.5));
 return {count,minimum,uptime:count>=minimum?Math.round(available/count*10000)/100:null,average:responseCount?Math.round(weighted/responseCount):null,peak:responseCount?Math.max(...rows.map(x=>Number(x.max_response_ms||0))):null};
}
