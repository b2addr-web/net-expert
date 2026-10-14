import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizeMonitorUrl,pinnedLookup} from '../lib/monitor-probe.js';

test('accepts only public website origins',()=>{
 assert.deepEqual(normalizeMonitorUrl('https://example.com'),{url:'https://example.com/',domain:'example.com'});
 assert.deepEqual(normalizeMonitorUrl('http://example.com/'),{url:'http://example.com/',domain:'example.com'});
 for(const value of ['http://127.0.0.1','http://169.254.169.254','http://10.0.0.1','http://localhost','http://host.internal','file:///etc/passwd','https://user:pass@example.com','https://example.com:444','https://example.com/path','https://example.com/?redirect=http://127.0.0.1'])assert.throws(()=>normalizeMonitorUrl(value));
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
