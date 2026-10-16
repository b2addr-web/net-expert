const aliases = {
  employee_id: ['employee id','employee no','employee number','emp id','emp no','staff id','الرقم الوظيفي','رقم الموظف','كود الموظف'],
  employee_name: ['employee name','full name','staff name','اسم الموظف','اسم الموظف الكامل','الاسم'],
  department: ['department','dept','القسم','الإدارة','الادارة'],
  assign_location: ['location','assign location','site','branch','الموقع','موقع العهدة','الفرع'],
  sim_number: ['sim serial','sim number','sim no','iccid','رقم الشريحة','سيريال الشريحة','الرقم التسلسلي للشريحة'],
  account_number: ['sim account','account number','account no','حساب الشريحة','رقم الحساب'],
  sim_package: ['package','sim package','plan','الباقة','باقة الشريحة'],
  hardware: ['device type','hardware','hardware type','type of hardware','نوع الجهاز','نوع العتاد'],
  model: ['model','model name','device model','الموديل','موديل الجهاز'],
  serial_number: ['serial','serial number','serial no','s/n','الرقم التسلسلي','السيريال'],
  custody_date: ['custody date','assignment date','date issued','تاريخ العهدة','تاريخ التسليم'],
};
export const importFields = Object.keys(aliases);
const arabicDigits={'٠':'0','١':'1','٢':'2','٣':'3','٤':'4','٥':'5','٦':'6','٧':'7','٨':'8','٩':'9','۰':'0','۱':'1','۲':'2','۳':'3','۴':'4','۵':'5','۶':'6','۷':'7','۸':'8','۹':'9'};
const cleanText=value=>String(value??'').replace(/[٠-٩۰-۹]/g,digit=>arabicDigits[digit]).replace(/[\u200B-\u200F\u202A-\u202E\u2066-\u2069\uFEFF]/g,'').trim();
export const normalizeHeader = value => cleanText(value).toLowerCase().replace(/[أإآ]/g,'ا').replace(/ة/g,'ه').replace(/[ًٌٍَُِّْـ_\-\/\\().:：]+/g,' ').replace(/\s+/g,' ').trim();
export function matchExcelColumns(headers) { const normalized=headers.map(normalizeHeader),allExact=new Set(Object.values(aliases).flat().map(normalizeHeader));return Object.fromEntries(importFields.flatMap(key=>{const options=aliases[key].map(normalizeHeader);let index=normalized.findIndex(header=>options.includes(header));if(index<0)index=normalized.findIndex(header=>!allExact.has(header)&&options.some(option=>option.length>4&&(header.includes(option)||option.includes(header))));return index<0?[]:[[key,index]]})) }
const expandScientific=value=>/^[+-]?\d+(?:\.\d+)?e[+-]?\d+$/i.test(value)&&Number.isFinite(Number(value))?Number(value).toLocaleString('en-US',{useGrouping:false,maximumFractionDigits:0}):value;
const normalizeDate=value=>{const text=cleanText(value);if(!text)return'';if(/^\d{4}-\d{2}-\d{2}$/.test(text))return text;const parts=text.match(/^(\d{1,4})[\/\-.](\d{1,2})[\/\-.](\d{1,4})$/);if(parts){let [,a,b,c]=parts,year,month,day;if(a.length===4){year=a;month=b;day=c}else{day=a;month=b;year=c.length===2?`20${c}`:c}const date=`${year.padStart(4,'0')}-${month.padStart(2,'0')}-${day.padStart(2,'0')}`,parsed=new Date(`${date}T00:00:00Z`);if(!Number.isNaN(parsed.getTime())&&parsed.toISOString().slice(0,10)===date)return date}return text};
const read=(values,mapping,key)=>{if(mapping[key]===undefined)return'';let value=expandScientific(cleanText(values[mapping[key]]));if(key==='custody_date')value=normalizeDate(value);if(['employee_id','sim_number','account_number'].includes(key))value=value.replace(/\.0$/,'').replace(/[\s,]/g,'');return value};
const hardwareWords=/laptop|desktop|workstation|monitor|printer|scanner|server|router|switch|firewall|access point|ups|cctv|barcode|handheld|storage|حاسب|كمبيوتر|طابعة|شاشة|خادم|راوتر/i;
export function detectDestination(values,mapping){const simSignals=['sim_number','account_number','sim_package'].filter(key=>read(values,mapping,key)).length,assetSignals=['serial_number','hardware','custody_date'].filter(key=>read(values,mapping,key)).length,hardware=read(values,mapping,'hardware')||read(values,mapping,'model');if(simSignals&&(!assetSignals||/\bsim\b|شريحة/i.test(hardware)))return'sim';if(assetSignals||hardwareWords.test(hardware))return'assets';return simSignals?'sim':null}
export function combineImportSheets(sheets){const slots=[],slotIndex=new Map(),sheetLayouts=[];for(const sheet of sheets){const layout=[];for(const [index,headerValue] of sheet.headers.entries()){const header=cleanText(headerValue),single=matchExcelColumns([header]),known=Object.keys(single)[0];if(/^(asset tag|asset id|inventory number|رقم الاصل|رمز الاصل)$/i.test(normalizeHeader(header))){layout[index]=-1;continue}const id=known?`field:${known}`:`extra:${normalizeHeader(header)||index}`;if(!slotIndex.has(id)){slotIndex.set(id,slots.length);slots.push({id,label:header||`Column ${index+1}`,known})}layout[index]=slotIndex.get(id)}sheetLayouts.push(layout)}const rows=[],meta=[];sheets.forEach((sheet,sheetIndex)=>sheet.rows.forEach((source,rowIndex)=>{const target=Array(slots.length).fill('');sheetLayouts[sheetIndex].forEach((targetIndex,sourceIndex)=>{if(targetIndex<0)return;const value=source[sourceIndex]??'';if(value!==''&&!target[targetIndex])target[targetIndex]=value});const sourceIndex=rows.length;rows.push(target);meta.push({sheet:sheet.name,row:sheet.headerRow+1+rowIndex,sourceIndex,suggested:detectDestination(target,Object.fromEntries(slots.flatMap((slot,index)=>slot.known?[[slot.known,index]]:[])))})}));const headers=slots.map(slot=>slot.label),mapping=Object.fromEntries(slots.flatMap((slot,index)=>slot.known?[[slot.known,index]]:[]));return{headers,rows,mapping,meta,sheetCount:sheets.length}}
const isLegacySimColumn=header=>/^(mobile number|mobile no|phone number|رقم الجوال|رقم الهاتف|provider|المزود|مزود الخدمه)$/.test(normalizeHeader(header));
export function buildImportRows(rawRows,mapping,forcedModule='auto',rowOffset=2,headers=[],meta=[]){return rawRows.map((values,index)=>{const origin=meta[index]||{},detected=detectDestination(values,mapping),legacySim=headers.some((header,column)=>isLegacySimColumn(header)&&cleanText(values[column])),module=forcedModule==='sim'||forcedModule==='assets'?forcedModule:detected==='assets'&&legacySim&&!read(values,mapping,'serial_number')&&!read(values,mapping,'hardware')?'sim':detected||origin.suggested||(legacySim?'sim':null),allowed=module==='sim'?['employee_id','employee_name','department','sim_number','account_number','sim_package']:['employee_id','employee_name','department','hardware','model','serial_number','custody_date','assign_location'],mapped=new Set(module?allowed.map(key=>mapping[key]).filter(column=>column!==undefined):[]),data={};if(module)for(const key of allowed){const value=read(values,mapping,key);if(value)data[key]=value}const imported_fields={};headers.forEach((header,column)=>{if(!mapped.has(column)&&cleanText(values[column]))imported_fields[header]=cleanText(values[column])});if(Object.keys(imported_fields).length)data.imported_fields=imported_fields;if(origin.sheet)data.source_sheet=origin.sheet;if(origin.row)data.source_row=origin.row;if(module)data.attachments=[];return{row:origin.row||index+rowOffset,sheet:origin.sheet||'',module,data,sourceIndex:origin.sourceIndex??index,error:module?'':'Destination could not be detected'}})}
export const duplicateIdentity=item=>item.module==='sim'?[item.data.employee_id,item.data.sim_number].filter(Boolean):[item.data.employee_id,item.data.serial_number].filter(Boolean);

const splitDelimitedLine=(line,delimiter)=>{const result=[];let value='',quoted=false;for(let index=0;index<line.length;index++){const character=line[index];if(character==='"'){if(quoted&&line[index+1]==='"'){value+='"';index++}else quoted=!quoted}else if(character===delimiter&&!quoted){result.push(value.trim());value=''}else value+=character}result.push(value.trim());return result};
export function parseImportText(value){
 const text=String(value||'').replace(/\r\n?/g,'\n').trim();
 if(!text)return{headers:[],rows:[],mode:'empty'};
 const lines=text.split('\n').map(line=>line.trim()).filter(Boolean);
 const keyValues=lines.map(line=>{const match=line.match(/^(.{2,80}?)[\s]*[:：][\s]*(.+)$/);return match?[match[1].trim(),match[2].trim()]:null}).filter(Boolean);
 if(keyValues.length>=2){
  return{headers:keyValues.map(pair=>pair[0]),rows:[keyValues.map(pair=>pair[1])],mode:'key-value'};
 }
 let delimiter=null;
 if(lines.some(line=>line.includes('\t')))delimiter='\t';
 else if(lines.some(line=>(line.match(/;/g)||[]).length>=1))delimiter=';';
 else if(lines.some(line=>(line.match(/,/g)||[]).length>=1))delimiter=',';
 else if(lines.some(line=>(line.match(/\|/g)||[]).length>=2))delimiter='|';
 const matrix=delimiter?lines.map(line=>splitDelimitedLine(line,delimiter)):lines.map(line=>line.split(/\s{2,}/).map(cell=>cell.trim()));
 if(matrix.length<2||matrix[0].length<2)return{headers:[],rows:[],mode:'unstructured'};
 const width=matrix[0].length;
 return{headers:matrix[0],rows:matrix.slice(1).map(row=>Array.from({length:width},(_,index)=>row[index]??'')),mode:'table'};
}

