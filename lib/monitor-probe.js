import dns from 'node:dns/promises';
import https from 'node:https';
import http from 'node:http';
import net from 'node:net';

const blockedV4 = value => {
 const p=value.split('.').map(Number);
 if(p.length!==4||p.some(x=>!Number.isInteger(x)||x<0||x>255))return true;
 return p[0]===0||p[0]===10||p[0]===127||p[0]>=224||p[0]===169&&p[1]===254||p[0]===172&&p[1]>=16&&p[1]<=31||p[0]===192&&p[1]===168||p[0]===100&&p[1]>=64&&p[1]<=127||p[0]===192&&p[1]===0||p[0]===192&&p[1]===0&&p[2]===2||p[0]===198&&p[1]>=18&&p[1]<=19||p[0]===198&&p[1]===51&&p[2]===100||p[0]===203&&p[1]===0&&p[2]===113;
};
const tlsError=error=>/CERT|TLS|SSL|UNABLE_TO_VERIFY|DEPTH_ZERO|SELF_SIGNED|ERR_OSSL/.test(error.code||'');
export const pinnedLookup=address=>(_host,options,callback)=>{
 if(options?.all)callback(null,[{address,family:4}]);
 else callback(null,address,4);
};

export function normalizeMonitorUrl(input){
 if(typeof input!=='string'||input.length>2048)throw new Error('INVALID_URL');
 let url;try{url=new URL(input.trim())}catch{throw new Error('INVALID_URL')}
 if(!['http:','https:'].includes(url.protocol)||url.username||url.password||url.hash||url.search||url.pathname!=='/'||url.port&&url.port!==(url.protocol==='https:'?'443':'80'))throw new Error('INVALID_URL');
 const host=url.hostname.toLowerCase();
 if(host.length>253||host==='localhost'||host.endsWith('.localhost')||host.endsWith('.local')||host.endsWith('.internal')||host.endsWith('.test')||host.endsWith('.invalid')||net.isIP(host)||!host.includes('.')||!host.split('.').every(label=>/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(label)))throw new Error('INVALID_URL');
 return {url:`${url.protocol}//${host}/`,domain:host};
}

export async function probeWebsite(input,timeoutMs=8000){
 const {url,domain}=normalizeMonitorUrl(input);
 const started=performance.now();
 let addresses;
 try{addresses=await dns.lookup(domain,{all:true,verbatim:true})}catch{return {result:'down',error_type:'dns',http_status:null,response_ms:null,ssl_status:'unknown',ssl_expires_at:null}}
 const publicV4=addresses.filter(a=>a.family===4);
 if(!publicV4.length||publicV4.some(a=>blockedV4(a.address)))return {result:'down',error_type:'unsafe_dns',http_status:null,response_ms:null,ssl_status:'unknown',ssl_expires_at:null};
 const address=publicV4[0].address,secure=url.startsWith('https:');
 return new Promise(resolve=>{
  let settled=false;
  const finish=value=>{if(!settled){settled=true;resolve(value)}};
  const req=(secure?https:http).request(url,{method:'GET',timeout:timeoutMs,headers:{'User-Agent':'NetExpert-Monitor/1.0','Accept':'*/*'},lookup:pinnedLookup(address),maxHeaderSize:16384},response=>{
   const response_ms=Math.round(performance.now()-started);
   const cert=secure?response.socket.getPeerCertificate():null;
   const ssl_expires_at=cert?.valid_to&&Number.isFinite(Date.parse(cert.valid_to))?new Date(cert.valid_to).toISOString():null;
   const http_status=response.statusCode||null;
   response.destroy();
   finish({result:http_status>=500?'down':http_status===429?'degraded':'online',error_type:null,http_status,response_ms,ssl_status:secure?'valid':'unknown',ssl_expires_at});
  });
  req.on('timeout',()=>req.destroy(new Error('timeout')));
  req.on('error',error=>finish({result:'down',error_type:error.code==='ETIMEDOUT'||error.message==='timeout'?'timeout':tlsError(error)?'tls':`connection:${/^[A-Z0-9_]{1,40}$/.test(error.code||'')?error.code:'UNKNOWN'}`,http_status:null,response_ms:null,ssl_status:tlsError(error)?'invalid':'unknown',ssl_expires_at:null}));
  req.end();
 });
}

async function safeRdapGet(location,redirects=0){
 if(redirects>2)throw new Error('RDAP_REDIRECT_LIMIT');
 const target=new URL(location);
 if(target.protocol!=='https:'||target.username||target.password||target.port||target.hostname.includes(':')||net.isIP(target.hostname)||target.hostname==='localhost'||!target.hostname.includes('.'))throw new Error('RDAP_UNSAFE_URL');
 const addresses=await dns.lookup(target.hostname,{all:true,verbatim:true});
 const v4=addresses.filter(a=>a.family===4);
 if(!v4.length||v4.some(a=>blockedV4(a.address)))throw new Error('RDAP_UNSAFE_DNS');
 const response=await new Promise((resolve,reject)=>{
  const req=https.request(target,{method:'GET',timeout:5000,lookup:pinnedLookup(v4[0].address),headers:{Accept:'application/rdap+json, application/json'},maxHeaderSize:16384},res=>{
   let size=0;const chunks=[];
   res.on('data',chunk=>{size+=chunk.length;if(size>1048576)req.destroy(new Error('RDAP_TOO_LARGE'));else chunks.push(chunk)});
   res.on('end',()=>resolve({status:res.statusCode,location:res.headers.location,body:Buffer.concat(chunks).toString('utf8')}));
  });
  req.on('timeout',()=>req.destroy(new Error('RDAP_TIMEOUT')));
  req.on('error',reject);req.end();
 });
 if(response.status>=300&&response.status<400&&response.location)return safeRdapGet(new URL(response.location,target).href,redirects+1);
 if(response.status!==200)throw new Error('RDAP_UNAVAILABLE');
 return JSON.parse(response.body);
}

export async function lookupDomainExpiry(domain){
 try{
  const data=await safeRdapGet(`https://rdap.org/domain/${encodeURIComponent(domain)}`);
  const date=data.events?.find(e=>['expiration','expiry','expiration date'].includes(String(e.eventAction).toLowerCase()))?.eventDate;
  return date&&Number.isFinite(Date.parse(date))?new Date(date).toISOString().slice(0,10):null;
 }catch{return null}
}
