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
  date_returned: ['date returned','return date','تاريخ الإرجاع','تاريخ الارجاع'], hardware: ['hardware','hardware type','type of hardware','asset type','device type','نوع الأصل','نوع الاصل','نوع الجهاز','نوع العتاد'],
  brand: ['brand','manufacturer','brand manufacturer','الشركة المصنعة','العلامة التجارية','الماركة'], model: ['model','model name','asset name','device name','اسم الأصل','اسم الاصل','اسم الجهاز','الموديل'],
  serial_number: ['serial','serial number','serial no','s/n','الرقم التسلسلي','السيريال'], asset_tag: ['asset tag','asset id','inventory number','رقم الأصل','رقم الاصل','رمز الأصل','رمز الاصل'],
  warranty_start: ['warranty start','warranty start date','بداية الضمان','تاريخ بداية الضمان'], warranty_end: ['warranty end','warranty expiry','warranty expiration','نهاية الضمان','انتهاء الضمان'],
  status: ['status','الحالة'], notes: ['notes','remarks','comments','ملاحظات'],
};
export const importFields = Object.keys(aliases);
export const normalizeHeader = value => String(value ?? '').trim().toLowerCase().replace(/[ـ_\-\/\\().:]+/g, ' ').replace(/\s+/g, ' ');
export function matchExcelColumns(headers) { const normalized=headers.map(normalizeHeader);return Object.fromEntries(importFields.flatMap(key=>{const options=aliases[key].map(normalizeHeader);let index=normalized.findIndex(header=>options.includes(header));if(index<0)index=normalized.findIndex(header=>options.some(option=>option.length>4&&(header.includes(option)||option.includes(header))));return index<0?[]:[[key,index]]})) }
const read=(values,mapping,key)=>mapping[key]===undefined?'':String(values[mapping[key]]??'').trim();
const hardwareWords=/laptop|desktop|workstation|monitor|printer|scanner|server|router|switch|firewall|access point|ups|cctv|barcode|handheld|storage|حاسب|كمبيوتر|طابعة|شاشة|خادم|راوتر/i;
export function detectDestination(values,mapping){const simSignals=['sim_number','mobile_number','provider'].filter(key=>read(values,mapping,key)).length,assetSignals=['serial_number','asset_tag','hardware'].filter(key=>read(values,mapping,key)).length,hardware=read(values,mapping,'hardware')||read(values,mapping,'model');if(simSignals&&(!assetSignals||/\bsim\b|شريحة/i.test(hardware)))return'sim';if(assetSignals||hardwareWords.test(hardware))return'assets';return simSignals?'sim':null}
export function buildImportRows(rawRows,mapping){return rawRows.map((values,index)=>{const module=detectDestination(values,mapping),allowed=module==='sim'?['employee_id','employee_name','email_address','department','assign_location','mobile_number','sim_number','account_number','provider','sim_package','date_issued','date_returned','status','notes']:['employee_id','employee_name','email_address','department','assign_location','hardware','brand','model','serial_number','asset_tag','warranty_start','warranty_end','status','notes'],data={};if(module)for(const key of allowed){const value=read(values,mapping,key);if(value)data[key]=value}if(module)data.attachments=[];return{row:index+2,module,data}}).filter(item=>item.module||Object.values(item.data).some(Boolean))}
export const duplicateIdentity=item=>item.module==='sim'?[item.data.employee_id,item.data.sim_number].filter(Boolean):[item.data.asset_tag,item.data.employee_id,item.data.serial_number].filter(Boolean);

const splitDelimitedLine=(line,delimiter)=>line.split(delimiter).map(value=>value.trim().replace(/^['\"]|['\"]$/g,''));
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
 const matrix=delimiter?lines.map(line=>splitDelimitedLine(line,delimiter)):lines.map(line=>line.split(/\s{2,}/).map(cell=>cell.trim()));
 if(matrix.length<2||matrix[0].length<2)return{headers:[],rows:[],mode:'unstructured'};
 const width=matrix[0].length;
 return{headers:matrix[0],rows:matrix.slice(1).map(row=>Array.from({length:width},(_,index)=>row[index]??'')),mode:'table'};
}

