import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const source=await readFile(new URL('../lib/home-cache.js',import.meta.url),'utf8');
const {homeCacheKey,readHomeCache,getHomeRequest,clearHomeCache}=await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);
const deferred=()=>{let resolve,reject;const promise=new Promise((yes,no)=>{resolve=yes;reject=no});return {promise,resolve,reject}};

test('scope separates users, organizations and permissions',()=>{
 const base={userId:'a',organizationId:'one',permissions:{assets:true},role:'member',sections:'assets'};
 for(const change of [{userId:'b'},{organizationId:'two'},{permissions:{assets:false}},{role:'admin'},{sections:'report'}])assert.notEqual(homeCacheKey(base),homeCacheKey({...base,...change}));
});
test('identical pending requests are deduplicated and cached',async()=>{
 clearHomeCache();let calls=0;const wait=deferred();
 const loader=()=>{calls++;return wait.promise};
 const a=getHomeRequest('same',loader),b=getHomeRequest('same',loader);
 await Promise.resolve();assert.equal(calls,1);wait.resolve({count:4});
 assert.deepEqual(await a,await b);assert.equal(readHomeCache('same').count,4);
});
test('clearing prevents old requests from restoring data or replacing a newer request',async()=>{
 clearHomeCache();const old=deferred(),next=deferred();
 const a=getHomeRequest('scope',()=>old.promise);await Promise.resolve();clearHomeCache();
 const b=getHomeRequest('scope',()=>next.promise);await Promise.resolve();old.resolve('old');await a;
 assert.equal(readHomeCache('scope'),null);
 assert.equal(getHomeRequest('scope',()=>{throw Error('duplicate')}),b);
 next.resolve('new');await b;assert.equal(readHomeCache('scope'),'new');
});
test('a failing source does not block a fast independent source',async()=>{
 clearHomeCache();const slow=deferred(),fast=deferred();
 const slowResult=getHomeRequest('slow',()=>slow.promise).catch(()=>null);
 const fastResult=getHomeRequest('fast',()=>fast.promise);
 fast.resolve({count:3});assert.equal((await fastResult).count,3);
 slow.reject(Error('unavailable'));assert.equal(await slowResult,null);
 assert.equal(readHomeCache('fast').count,3);assert.equal(readHomeCache('slow'),null);
});
