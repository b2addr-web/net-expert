/* SheetJS Community Edition, pinned to an explicit official release. */
self.importScripts('https://cdn.sheetjs.com/xlsx-0.20.3/package/dist/xlsx.full.min.js');
const XLSX=self.XLSX;
const headerTokens=['employee id','employee name','email','department','location','mobile','phone','sim number','iccid','account number','provider','carrier','package','date issued','date returned','return status','return notes','hardware','asset type','brand','manufacturer','model','serial number','warranty','status','notes','الرقم الوظيفي','رقم الموظف','اسم الموظف','البريد','القسم','الاداره','الموقع','رقم الجوال','رقم الهاتف','رقم الشريحه','رقم الحساب','المزود','الاتصالات','الباقه','تاريخ التسليم','تاريخ الاسترداد','حاله الاسترداد','ملاحظات الاسترداد','نوع الاصل','نوع الجهاز','الشركه المصنعه','الماركه','الموديل','الرقم التسلسلي','الضمان','الحاله','ملاحظات'];
const normalize=value=>String(value??'').trim().toLowerCase().replace(/[أإآ]/g,'ا').replace(/ة/g,'ه').replace(/[ًٌٍَُِّْـ_\-\/\\().:：]+/g,' ').replace(/\s+/g,' ');

const filled=row=>row.filter(value=>String(value??'').trim()).length;
const headerScore=row=>row.reduce((score,value)=>{const header=normalize(value);return score+(headerTokens.some(token=>header===token||header.includes(token))?100:0)},0)+Math.min(filled(row),30);

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
 const candidates=workbook.SheetNames.map(name=>parseSheet(workbook,name)).filter(candidate=>candidate.headers.length&&candidate.rows.length),totalRows=candidates.reduce((sum,sheet)=>sum+sheet.rows.length,0);
 if(!candidates.length)throw new Error('No readable table found');
 if(totalRows>20000)throw new Error('Maximum 20,000 data rows across all sheets');
 self.postMessage({sheets:candidates.map(sheet=>({name:sheet.name,headers:sheet.headers,rows:sheet.rows,headerRow:sheet.headerIndex+1})),availableSheets:workbook.SheetNames,totalRows});
}catch(error){self.postMessage({error:error.message||'Unable to read this workbook'})}};

