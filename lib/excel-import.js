const aliases = {
  employee_id: ['employee id','employee no','employee number','emp id','emp no','staff id','الرقم الوظيفي','رقم الموظف','كود الموظف'],
  employee_name: ['employee name','full name','staff name','اسم الموظف','اسم الموظف الكامل','الاسم'],
  email_address: ['email','email address','work email','البريد الإلكتروني','البريد الالكتروني','ايميل'],
  department: ['department','dept','القسم','الإدارة','الادارة'],
  assign_location: ['location','assign location','site','branch','الموقع','موقع العهدة','الفرع'],
  mobile_number: ['mobile','mobile number','phone','phone number','msisdn','رقم الجوال','رقم الهاتف','الجوال'],
  sim_number: ['sim number','sim no','sim serial','iccid','رقم الشريحة','رقم شريحة'],
  account_number: ['account number','account no','رقم الحساب'], provider: ['provider','carrier','operator','telecom provider','المزود','مزود الخدمة','شركة الاتصالات'],
  sim_package: ['sim package','package','plan','الباقة','باقة الشريحة'], date_issued: ['date issued','issue date','assignment date','تاريخ التسليم','تاريخ الإصدار','تاريخ الاصدار'],
  date_returned: ['date returned','return date','recovery date','تاريخ الإرجاع','تاريخ الارجاع','تاريخ الاسترداد'], return_status:['return status','recovery status','حالة الاسترداد','حاله الاسترداد'],return_notes:['return notes','recovery notes','ملاحظات الاسترداد'],hardware: ['hardware','hardware type','type of hardware','asset type','device type','نوع الأصل','نوع الاصل','نوع الجهاز','نوع العتاد'],
  brand: ['brand','manufacturer','brand manufacturer','الشركة المصنعة','العلامة التجارية','الماركة'], model: ['model','model name','asset name','device name','اسم الأصل','اسم الاصل','اسم الجهاز','الموديل'],
  serial_number: ['serial','serial number','serial no','s/n','الرقم التسلسلي','السيريال'],
  warranty_start: ['warranty start','warranty start date','بداية الضمان','تاريخ بداية الضمان'], warranty_end: ['warranty end','warranty expiry','warranty expiration','نهاية الضمان','انتهاء الضمان'],
  status: ['status','الحالة'], notes: ['notes','remarks','comments','ملاحظات'],
};
export const importFields = Object.keys(aliases);
const arabicDigits={'٠':'0','١':'1','٢':'2','٣':'3','٤':'4','٥':'5','٦':'6','٧':'7','٨':'8','٩':'9','۰':'0','۱':'1','۲':'2','۳':'3','۴':'4','۵':'5','۶':'6','۷':'7','۸':'8','۹':'9'};
const cleanText=value=>String(value??'').replace(/[٠-٩۰-۹]/g,digit=>arabicDigits[digit]).replace(/[\u200B-\u200F\u202A-\u202E\u2066-\u2069\uFEFF]/g,'').trim();
export const normalizeHeader = value => cleanText(value).toLowerCase().replace(/[أإآ]/g,'ا').replace(/ة/g,'ه').replace(/[ًٌٍَُِّْـ_\-\/\\().:：]+/g,' ').replace(/\s+/g,' ').trim();
export function matchExcelColumns(headers) { const normalized=headers.map(normalizeHeader);return Object.fromEntries(importFields.flatMap(key=>{const options=aliases[key].map(normalizeHeader);let index=normalized.findIndex(header=>options.includes(header));if(index<0)index=normalized.findIndex(header=>options.some(option=>option.length>4&&(header.includes(option)||option.includes(header))));return index<0?[]:[[key,index]]})) }
const canonical={status:{'نشط':'Active','نشطه':'Active','فعال':'Active','موقوف':'Suspended','معلقه':'Suspended','معاد':'Returned','مرتجع':'Returned','مفقود':'Lost','تالف':'Damaged','قيد الاستخدام':'In Use','مستخدم':'In Use','متاح':'Available','تحت الصيانه':'Under Maintenance','متقاعد':'Retired'},provider:{'اس تي سي':'STC','الاتصالات السعوديه':'STC','stc':'STC','mobily':'Mobily','موبايلي':'Mobily','zain':'Zain','زين':'Zain'}};
const expandScientific=value=>/^[+-]?\d+(?:\.\d+)?e[+-]?\d+$/i.test(value)&&Number.isFinite(Number(value))?Number(value).toLocaleString('en-US',{useGrouping:false,maximumFractionDigits:0}):value;
const normalizeDate=value=>{const text=cleanText(value);if(!text)return'';if(/^\d{4}-\d{2}-\d{2}$/.test(text))return text;const parts=text.match(/^(\d{1,4})[\/\-.](\d{1,2})[\/\-.](\d{1,4})$/);if(parts){let [,a,b,c]=parts,year,month,day;if(a.length===4){year=a;month=b;day=c}else{day=a;month=b;year=c.length===2?`20${c}`:c}const date=`${year.padStart(4,'0')}-${month.padStart(2,'0')}-${day.padStart(2,'0')}`,parsed=new Date(`${date}T00:00:00Z`);if(!Number.isNaN(parsed.getTime())&&parsed.toISOString().slice(0,10)===date)return date}return text};
const read=(values,mapping,key)=>{if(mapping[key]===undefined)return'';let value=expandScientific(cleanText(values[mapping[key]]));if(['date_issued','date_returned','warranty_start','warranty_end'].includes(key))value=normalizeDate(value);if(['employee_id','mobile_number','sim_number','account_number'].includes(key))value=value.replace(/\.0$/,'').replace(/[\s,]/g,'');const normalized=normalizeHeader(value);if(canonical[key]?.[normalized])value=canonical[key][normalized];if(key==='email_address')value=value.toLowerCase();return value};
const hardwareWords=/laptop|desktop|workstation|monitor|printer|scanner|server|router|switch|firewall|access point|ups|cctv|barcode|handheld|storage|حاسب|كمبيوتر|طابعة|شاشة|خادم|راوتر/i;
export function detectDestination(values,mapping){const simSignals=['sim_number','mobile_number','provider'].filter(key=>read(values,mapping,key)).length,assetSignals=['serial_number','hardware'].filter(key=>read(values,mapping,key)).length,hardware=read(values,mapping,'hardware')||read(values,mapping,'model');if(simSignals&&(!assetSignals||/\bsim\b|شريحة/i.test(hardware)))return'sim';if(assetSignals||hardwareWords.test(hardware))return'assets';return simSignals?'sim':null}
export function combineImportSheets(sheets){const slots=[],slotIndex=new Map(),sheetLayouts=[];for(const sheet of sheets){const layout=[];for(const [index,headerValue] of sheet.headers.entries()){const header=cleanText(headerValue),single=matchExcelColumns([header]),known=Object.keys(single)[0];if(/^(asset tag|asset id|inventory number|رقم الاصل|رمز الاصل)$/i.test(normalizeHeader(header))){layout[index]=-1;continue}const id=known?`field:${known}`:`extra:${normalizeHeader(header)||index}`;if(!slotIndex.has(id)){slotIndex.set(id,slots.length);slots.push({id,label:header||`Column ${index+1}`,known})}layout[index]=slotIndex.get(id)}sheetLayouts.push(layout)}const rows=[],meta=[];sheets.forEach((sheet,sheetIndex)=>sheet.rows.forEach((source,rowIndex)=>{const target=Array(slots.length).fill('');sheetLayouts[sheetIndex].forEach((targetIndex,sourceIndex)=>{if(targetIndex<0)return;const value=source[sourceIndex]??'';if(value!==''&&!target[targetIndex])target[targetIndex]=value});const sourceIndex=rows.length;rows.push(target);meta.push({sheet:sheet.name,row:sheet.headerRow+1+rowIndex,sourceIndex,suggested:detectDestination(target,Object.fromEntries(slots.flatMap((slot,index)=>slot.known?[[slot.known,index]]:[])))})}));const headers=slots.map(slot=>slot.label),mapping=Object.fromEntries(slots.flatMap((slot,index)=>slot.known?[[slot.known,index]]:[]));return{headers,rows,mapping,meta,sheetCount:sheets.length}}
export function buildImportRows(rawRows,mapping,forcedModule='auto',rowOffset=2,headers=[],meta=[]){const mapped=new Set(Object.values(mapping));return rawRows.map((values,index)=>{const origin=meta[index]||{},module=forcedModule==='sim'||forcedModule==='assets'?forcedModule:detectDestination(values,mapping)||origin.suggested||null,allowed=module==='sim'?['employee_id','employee_name','email_address','department','assign_location','mobile_number','sim_number','account_number','provider','sim_package','date_issued','date_returned','return_status','return_notes','status','notes']:['employee_id','employee_name','email_address','department','assign_location','hardware','brand','model','serial_number','warranty_start','warranty_end','date_returned','return_status','return_notes','status','notes'],data={};if(module)for(const key of allowed){const value=read(values,mapping,key);if(value)data[key]=value}const imported_fields={};headers.forEach((header,column)=>{if(!mapped.has(column)&&cleanText(values[column]))imported_fields[header]=cleanText(values[column])});if(Object.keys(imported_fields).length)data.imported_fields=imported_fields;if(origin.sheet)data.source_sheet=origin.sheet;if(origin.row)data.source_row=origin.row;if(module)data.attachments=[];return{row:origin.row||index+rowOffset,sheet:origin.sheet||'',module,data,sourceIndex:origin.sourceIndex??index,error:module?'':'Destination could not be detected'}})}
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

