import * as XLSX from 'xlsx';
import {matchExcelColumns} from '../lib/excel-import';

const filled=row=>row.filter(value=>String(value??'').trim()).length;
const headerScore=row=>Object.keys(matchExcelColumns(row)).length*100+Math.min(filled(row),30);

function parseSheet(workbook,name){
 const sheet=workbook.Sheets[name],range=XLSX.utils.decode_range(sheet['!fullref']||sheet['!ref']||'A1');
 if(range.e.c>149)throw new Error('Maximum 150 columns');
 const matrix=XLSX.utils.sheet_to_json(sheet,{header:1,defval:'',raw:false,dateNF:'yyyy-mm-dd',blankrows:true});
 let headerIndex=0,best=-1;
 for(let index=0;index<Math.min(matrix.length,50);index++){
  const score=headerScore(matrix[index]||[]);
  if(score>best){best=score;headerIndex=index}
 }
 const sourceHeaders=matrix[headerIndex]||[],sample=matrix.slice(headerIndex+1,headerIndex+101),lastColumn=Math.max(sourceHeaders.length,...sample.map(row=>row.length)),keep=Array.from({length:lastColumn},(_,index)=>index).filter(index=>String(sourceHeaders[index]??'').trim()||sample.some(row=>String(row[index]??'').trim()));
 const headers=keep.map((index,position)=>String(sourceHeaders[index]??'').trim()||`Column ${position+1}`),rows=matrix.slice(headerIndex+1).filter(row=>filled(row)).map(row=>keep.map(index=>String(row[index]??'')));
 return{name,headers,rows,headerIndex,score:best};
}

self.onmessage=({data})=>{try{
 const workbook=XLSX.read(data,{type:'array',cellDates:true,dateNF:'yyyy-mm-dd',sheetRows:20052});
 if(!workbook.SheetNames.length)throw new Error('No worksheet found');
 const candidates=workbook.SheetNames.map(name=>parseSheet(workbook,name)).filter(candidate=>candidate.headers.length),selected=candidates.sort((a,b)=>b.score-a.score||b.rows.length-a.rows.length)[0];
 if(!selected)throw new Error('No readable table found');
 if(selected.rows.length>20000)throw new Error('Maximum 20,000 data rows');
 self.postMessage({sheetName:selected.name,headers:selected.headers,rows:selected.rows,headerRow:selected.headerIndex+1,availableSheets:workbook.SheetNames});
}catch(error){self.postMessage({error:error.message||'Unable to read this workbook'})}};

