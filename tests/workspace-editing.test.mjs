import {readFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
import test from 'node:test';
const moduleSource=await readFile(new URL('../lib/modules.js',import.meta.url),'utf8');
const source=(await readFile(new URL('../lib/workspace.js',import.meta.url),'utf8')).replace("import {supabase} from './supabase';",'const supabase=globalThis.__workspaceTestClient;').replace("import {fieldsFor,validateRecord} from './modules';",moduleSource);
const calls=[];let response;
globalThis.__workspaceTestClient={rpc:async(name,args)=>{calls.push({name,args});return response}};
const api=await import('data:text/javascript;base64,'+Buffer.from(source).toString('base64'));
const data={employee_id:'001',employee_name:'Test',department:'IT',assign_location:'Riyadh',mobile_number:'0550000000',sim_number:'00123',provider:'STC',date_issued:'2026-09-16',status:'Active',attachments:[]};
test('editing sends existing identity and version, preserving actor metadata',async()=>{
 response={data:{id:'record-id',version:3,data,created_by:'creator',updated_by:'editor',updated_by_name:'Bader'}};
 const result=await api.saveRecord('sim',{...data,id:'record-id',version:2});
 assert.equal(calls.at(-1).args.p_id,'record-id');assert.equal(calls.at(-1).args.p_version,2);
 assert.equal(result.updated_by_name,'Bader');assert.equal(result.created_by,'creator');assert.equal(result.mobile_number,'0550000000');
});
test('bulk edit sends all expected versions in a single RPC',async()=>{
 response={data:[{id:'a',version:2,data},{id:'b',version:6,data}]};
 const result=await api.bulkEdit('sim',[{id:'a',version:1},{id:'b',version:5}],{status:'Returned'});
 assert.equal(calls.at(-1).name,'bulk_edit_workspace');assert.deepEqual(calls.at(-1).args.p_records,[{id:'a',version:1},{id:'b',version:5}]);assert.equal(result.length,2);
});
test('restore carries target and current version; conflicts are not swallowed',async()=>{
 response={data:{id:'a',version:7,data}};await api.restoreVersion({id:'a',version:6},2);
 assert.deepEqual(calls.at(-1).args,{p_id:'a',p_version:2,p_current_version:6});
 response={error:{message:'Record changed',code:'P0001'}};
 await assert.rejects(api.saveRecord('sim',{...data,id:'a',version:1}),e=>e.code==='P0001');
});

