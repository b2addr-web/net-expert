const cache=new Map();
const pending=new Map();
const maxAge=45*1000;

export function homeCacheKey({userId,organizationId,permissions}){
 return `${userId||''}:${organizationId||''}:${JSON.stringify(permissions||{})}`;
}
export function readHomeCache(key){
 const entry=cache.get(key);
 return entry&&Date.now()-entry.updatedAt<maxAge?entry.data:null;
}
export function writeHomeCache(key,data){cache.set(key,{data,updatedAt:Date.now()});}
export function getHomeRequest(key,loader){
 if(!pending.has(key))pending.set(key,Promise.resolve().then(loader).finally(()=>pending.delete(key)));
 return pending.get(key);
}
export function clearHomeCache(){cache.clear();pending.clear();}
