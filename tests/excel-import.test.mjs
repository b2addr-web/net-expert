import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import test from 'node:test';
const source=await readFile(new URL('../lib/excel-import.js',import.meta.url),'utf8');
const api=await import('data:text/javascript;base64,'+Buffer.from(source).toString('base64'));
test('matches Arabic and English headers',()=>{const map=api.matchExcelColumns(['الرقم الوظيفي','Employee Name','رقم الشريحة','المزود']);assert.deepEqual(map,{employee_id:0,employee_name:1,sim_number:2,provider:3})});
test('routes mixed rows to SIM and assets',()=>{const headers=['Employee ID','Mobile Number','Provider','Type Of Hardware','Serial Number'];const map=api.matchExcelColumns(headers),rows=api.buildImportRows([['10','0551234567','STC','',''],['11','','','Laptop','SN-1']],map);assert.equal(rows[0].module,'sim');assert.equal(rows[1].module,'assets')});
test('keeps partial records and omits blank fields',()=>{const map=api.matchExcelColumns(['رقم الجوال','اسم الموظف']),rows=api.buildImportRows([['0550000000','Bader']],map);assert.equal(rows[0].module,'sim');assert.equal(rows[0].data.employee_name,'Bader');assert.equal('sim_number' in rows[0].data,false)});
test('parses a table copied from Excel',()=>{const result=api.parseImportText('Employee ID\tEmployee Name\tSIM Number\n100657\tSAMEH KAMIL\t831046001396');assert.deepEqual(result.headers,['Employee ID','Employee Name','SIM Number']);assert.deepEqual(result.rows,[['100657','SAMEH KAMIL','831046001396']]);assert.equal(result.mode,'table')});
test('parses OCR-friendly field and value lines',()=>{const result=api.parseImportText('الرقم الوظيفي: 100657\nاسم الموظف: SAMEH KAMIL\nرقم الشريحة: 831046001396');assert.deepEqual(result.headers,['الرقم الوظيفي','اسم الموظف','رقم الشريحة']);assert.deepEqual(result.rows,[['100657','SAMEH KAMIL','831046001396']]);assert.equal(result.mode,'key-value')});
test('normalizes Arabic digits, dates and SIM status',()=>{const map=api.matchExcelColumns(['رقم الجوال','تاريخ التسليم','الحالة']),rows=api.buildImportRows([['٠٥٥١٢٣٤٥٦٧','24/03/2026','نشط']],map,'sim');assert.equal(rows[0].data.mobile_number,'0551234567');assert.equal(rows[0].data.date_issued,'2026-03-24');assert.equal(rows[0].data.status,'Active')});
test('expands scientific identifiers and allows a forced destination',()=>{const map=api.matchExcelColumns(['Employee ID','Employee Name']),rows=api.buildImportRows([['1.00657E+5','Bader']],map,'assets');assert.equal(rows[0].module,'assets');assert.equal(rows[0].data.employee_id,'100657')});
test('parses quoted CSV values containing commas',()=>{const result=api.parseImportText('Employee ID,Employee Name,Notes\n100657,"Kamil, Sameh","Riyadh, HQ"');assert.deepEqual(result.rows[0],['100657','Kamil, Sameh','Riyadh, HQ'])});

