import test from 'node:test';
import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import {normalizeMonitorUrl,pinnedLookup,probeWebsite,lookupDomainExpiry} from '../lib/monitor-probe.js';
import {deriveMonitorState} from '../lib/monitor-state.js';
import {summarizeMonitorRows} from '../lib/monitor-metrics.js';

test('accepts only public website origins',()=>{
 assert.deepEqual(normalizeMonitorUrl('https://example.com'),{url:'https://example.com/',domain:'example.com'});
 assert.deepEqual(normalizeMonitorUrl('http://example.com/'),{url:'http://example.com/',domain:'example.com'});
 for(const value of ['http://127.0.0.1','http://169.254.169.254','http://10.0.0.1','http://localhost','http://host.internal','file:///etc/passwd','https://user:pass@example.com','https://example.com:444','https://example.com/path','https://example.com/?redirect=http://127.0.0.1'])assert.throws(()=>normalizeMonitorUrl(value));
});

function fakeProbe({status=200,body='Healthy',error=null,certificate='Nov 30 12:00:00 2027 GMT'}={}){
 const request=(_url,_options,callback)=>{
  const req=new EventEmitter();
  req.end=()=>queueMicrotask(()=>{
   if(error){req.emit('error',Object.assign(new Error(error),{code:error}));return}
   const response=new EventEmitter();
   response.statusCode=status;response.socket={getPeerCertificate:()=>({valid_to:certificate})};
   response.destroy=()=>{};response.setEncoding=()=>{};
   callback(response);queueMicrotask(()=>{response.emit('data',body);response.emit('end')});
  });
  req.destroy=()=>{};
  return req;
 };
 return {dnsLookup:async()=>[{family:4,address:'93.184.215.14'}],httpRequest:request,httpsRequest:request};
}

test('normal, slow threshold, HTTP 500 and content mismatch probes',async()=>{
 const online=await probeWebsite('https://example.com',8000,null,fakeProbe());
 assert.equal(online.result,'online');assert.equal(online.http_status,200);assert.ok(online.response_ms>=0);assert.equal(online.ssl_status,'valid');
 const failed=await probeWebsite('https://example.com',8000,null,fakeProbe({status:500}));
 assert.equal(failed.result,'down');assert.equal(failed.error_type,'http_500');
 const missing=await probeWebsite('https://example.com',8000,'Expected text',fakeProbe());
 assert.equal(missing.result,'down');assert.equal(missing.error_type,'content_missing');
 const matched=await probeWebsite('https://example.com',8000,'Healthy',fakeProbe());
 assert.equal(matched.result,'online');
});

test('slow, confirmed outage and confirmed recovery transitions',()=>{
 const initial={status:'online',failure_streak:0,slow_streak:0,recovery_streak:0,slow_threshold_ms:100};
 const slow=deriveMonitorState(initial,{result:'online',response_ms:200});
 assert.equal(slow.result,'degraded');assert.equal(slow.status,'online');
 const confirmedSlow=deriveMonitorState({...initial,slow_streak:slow.slow_streak},{result:'online',response_ms:200});
 assert.equal(confirmedSlow.status,'degraded');
 const firstDown=deriveMonitorState(initial,{result:'down',response_ms:null});
 assert.equal(firstDown.status,'online');
 const down=deriveMonitorState({...initial,failure_streak:firstDown.failure_streak},{result:'down',response_ms:null});
 assert.equal(down.status,'down');
 const firstRecovery=deriveMonitorState({...initial,status:'down'},{result:'online',response_ms:50});
 assert.equal(firstRecovery.status,'down');
 const recovered=deriveMonitorState({...initial,status:'down',recovery_streak:firstRecovery.recovery_streak},{result:'online',response_ms:50});
 assert.equal(recovered.status,'online');
});

test('DNS, timeout, TLS and inaccessible domain information stay distinct',async()=>{
 const dnsFailure=await probeWebsite('https://example.com',8000,null,{dnsLookup:async()=>{throw new Error('DNS')}});
 assert.equal(dnsFailure.error_type,'dns');
 const privateAddress=await probeWebsite('https://example.com',8000,null,{dnsLookup:async()=>[{family:4,address:'169.254.169.254'}]});
 assert.equal(privateAddress.error_type,'unsafe_dns');
 for(const [code,type,ssl] of [['ETIMEDOUT','timeout','unknown'],['CERT_HAS_EXPIRED','tls','invalid']]){
  const result=await probeWebsite('https://example.com',8000,null,fakeProbe({error:code}));
  assert.equal(result.result,'down');assert.equal(result.error_type,type);assert.equal(result.ssl_status,ssl);
 }
});

test('redirects are recorded without following the Location header',async()=>{
 const result=await probeWebsite('http://example.com',8000,null,fakeProbe({status:302}));
 assert.equal(result.result,'online');assert.equal(result.http_status,302);
});

test('no checks never becomes 100% uptime; recorded check ratio is explicit',()=>{
 assert.equal(summarizeMonitorRows([],'1d',5).uptime,null);
 assert.equal(summarizeMonitorRows([{check_count:1,available_count:1,response_count:1,avg_response_ms:120,max_response_ms:120}],'1d',5).uptime,null);
 const enough={check_count:144,available_count:108,response_count:108,avg_response_ms:200,max_response_ms:600};
 assert.equal(summarizeMonitorRows([enough],'1d',5).uptime,75);
 assert.equal(summarizeMonitorRows([enough],'1d',5).average,200);
});

test('domain expiry stays unavailable when RDAP has no expiry event',async()=>{
 assert.equal(await lookupDomainExpiry('example.com',async()=>({events:[{eventAction:'registration',eventDate:'2024-01-01'}]})),null);
 assert.equal(await lookupDomainExpiry('example.com',async()=>{throw new Error('RDAP unavailable')}),null);
});

test('pinned DNS lookup supports Node single and all address callbacks',()=>{
 const lookup=pinnedLookup('93.184.215.14');
 lookup('example.com',{all:false},(error,address,family)=>{
  assert.equal(error,null);assert.equal(address,'93.184.215.14');assert.equal(family,4);
 });
 lookup('example.com',{all:true},(error,addresses)=>{
  assert.equal(error,null);assert.deepEqual(addresses,[{address:'93.184.215.14',family:4}]);
 });
});
