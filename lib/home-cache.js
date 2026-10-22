const cache=new Map();
const pending=new Map();
const maxAge=45*1000;
let generation=0;

export function homeCacheKey({userId,organizationId,permissions,role,sections}){
 return JSON.stringify([userId,organizationId,permissions||{},role||null,sections||'']);
}
export function homeCacheGeneration(){return generation;}
export function readHomeCache(key){
 const entry=cache.get(key);
 return entry&&Date.now()-entry.updatedAt<maxAge?entry.data:null;
}
export function getHomeRequest(key,loader){
 if(!pending.has(key)){
  const requestGeneration=generation;
  const request=Promise.resolve().then(loader).then(data=>{if(requestGeneration===generation)cache.set(key,{data,updatedAt:Date.now()});return data;}).finally(()=>{if(pending.get(key)===request)pending.delete(key)});
  pending.set(key,request);
 }
 return pending.get(key);
}
export function clearHomeCache(){generation++;cache.clear();pending.clear();}
