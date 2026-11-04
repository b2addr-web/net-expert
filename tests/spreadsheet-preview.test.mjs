import test from 'node:test';
import assert from 'node:assert/strict';
import XLSX from 'xlsx';
import {renderSpreadsheetPreview, validateSpreadsheetInput} from '../lib/spreadsheet-preview.js';

const workbookBuffer = (bookType='xlsx', sheets=[['Name','Value'],['عربي',1]]) => {
  const book=XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(book,XLSX.utils.aoa_to_sheet(sheets), 'Data');
  return XLSX.write(book,{type:'buffer',bookType});
};

test('valid XLSX and multiple sheets render safely', async()=>{
  const book=XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(book,XLSX.utils.aoa_to_sheet([['<script>','عربي'],['safe',1]]),'One');
  XLSX.utils.book_append_sheet(book,XLSX.utils.aoa_to_sheet([['Second']]),'Two');
  const html=await renderSpreadsheetPreview(XLSX.write(book,{type:'buffer',bookType:'xlsx'}),'report.xlsx');
  assert.match(html,/One/); assert.match(html,/Two/); assert.doesNotMatch(html,/<script>/i);
});

test('valid XLS renders and empty workbook remains valid', async()=>{
  const html=await renderSpreadsheetPreview(workbookBuffer('xls'),'legacy.xls');
  assert.match(html,/Data/);
  const empty=XLSX.utils.book_new(); XLSX.utils.book_append_sheet(empty,XLSX.utils.aoa_to_sheet([]),'Empty');
  assert.match(await renderSpreadsheetPreview(XLSX.write(empty,{type:'buffer',bookType:'xlsx'}),'empty.xlsx'),/Empty/);
});

test('random text, non-spreadsheet ZIP, and truncated XLSX are rejected', async()=>{
  await assert.rejects(()=>validateSpreadsheetInput(new TextEncoder().encode('plain text'),'bad.xlsx'));
  await assert.rejects(()=>validateSpreadsheetInput(new Uint8Array([80,75,3,4,1,2,3,4]),'bad.xlsx'));
  const valid=workbookBuffer(); await assert.rejects(()=>validateSpreadsheetInput(valid.subarray(0,20),'bad.xlsx'));
});

test('resource limits reject oversized spreadsheets', async()=>{
  const valid=workbookBuffer();
  await assert.rejects(()=>validateSpreadsheetInput(valid,'large.xlsx',{maxBytes:10,maxSheets:50,maxRows:20,maxCells:100}),/SPREADSHEET_TOO_LARGE/);
});
