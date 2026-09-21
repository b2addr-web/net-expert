import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import test from 'node:test';
const source=await readFile(new URL('../lib/excel-import.js',import.meta.url),'utf8');
const api=await import('data:text/javascript;base64,'+Buffer.from(source).toString('base64'));
test('matches Arabic and English headers',()=>{const map=api.matchExcelColumns(['الرقم الوظيفي','Employee Name','رقم الشريحة','المزود']);assert.deepEqual(map,{employee_id:0,employee_name:1,sim_number:2,provider:3})});
test('routes mixed rows to SIM and assets',()=>{const headers=['Employee ID','Mobile Number','Provider','Type Of Hardware','Serial Number'];const map=api.matchExcelColumns(headers),rows=api.buildImportRows([['10','0551234567','STC','',''],['11','','','Laptop','SN-1']],map);assert.equal(rows[0].module,'sim');assert.equal(rows[1].module,'assets')});
test('keeps partial records and omits blank fields',()=>{const map=api.matchExcelColumns(['رقم الجوال','اسم الموظف']),rows=api.buildImportRows([['0550000000','Bader']],map);assert.equal(rows[0].module,'sim');assert.equal(rows[0].data.employee_name,'Bader');assert.equal('sim_number' in rows[0].data,false)});
