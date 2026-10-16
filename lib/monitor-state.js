export function deriveMonitorState(site,observed){
 const result=observed.result==='online'&&observed.response_ms>site.slow_threshold_ms?'degraded':observed.result;
 const failure_streak=result==='down'?site.failure_streak+1:0;
 const slow_streak=result==='degraded'?site.slow_streak+1:0;
 const recovery_streak=site.status==='down'&&result!=='down'?(site.recovery_streak||0)+1:0;
 const status=result==='down'&&failure_streak<2?site.status:site.status==='down'&&result!=='down'&&recovery_streak<2?'down':result==='degraded'&&slow_streak<2?'online':result;
 return {result,status,failure_streak,slow_streak,recovery_streak};
}
