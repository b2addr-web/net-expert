import {supabase} from './supabase';

export const allowedFileTypes=['application/pdf','image/png','image/jpeg','image/webp','text/plain','text/csv','application/vnd.openxmlformats-officedocument.wordprocessingml.document','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet','application/msword','application/vnd.ms-excel'];
export const maxKnowledgeFileSize=10*1024*1024;
const mimeByExtension={pdf:['application/pdf'],png:['image/png'],jpg:['image/jpeg'],jpeg:['image/jpeg'],webp:['image/webp'],txt:['text/plain'],csv:['text/csv','application/vnd.ms-excel'],doc:['application/msword'],docx:['application/vnd.openxmlformats-officedocument.wordprocessingml.document'],xls:['application/vnd.ms-excel'],xlsx:['application/vnd.openxmlformats-officedocument.spreadsheetml.sheet']};
export const fileExtension=name=>String(name||'').split('.').pop().toLowerCase();
export const fileKind=name=>({pdf:'pdf',doc:'word',docx:'word',xls:'excel',xlsx:'excel',png:'image',jpg:'image',jpeg:'image',webp:'image',txt:'text',csv:'text'})[fileExtension(name)]||'other';
export const knowledgeType=item=>item.item_type||((item.file_path&&!item.body?.trim())?'file':'note');
export const knowledgeTime=(value,ar)=>value?new Intl.DateTimeFormat(ar?'ar-SA-u-ca-gregory':'en-GB',{timeZone:'Asia/Riyadh',dateStyle:'medium',timeStyle:'short'}).format(new Date(value)):'—';
export const fileSize=size=>size>=1048576?`${(size/1048576).toFixed(1)} MB`:`${Math.max(1,Math.ceil(size/1024))} KB`;
export const canEditKnowledge=user=>['company_admin','operator','manager'].includes(user.role);
export async function knowledgeSchemaReady(){
 const {error}=await supabase.from('knowledge_items').select('item_type').limit(1);
 return !error;
}

export async function listKnowledge(organizationId){
 const {data,error}=await supabase.from('knowledge_items').select('*').eq('organization_id',organizationId).order('created_at',{ascending:false}).limit(500);
 if(error)throw error;
 return data||[];
}
export async function listKnowledgeFolders(organizationId){
 const {data,error}=await supabase.from('knowledge_folders').select('id,organization_id,created_by,name,created_at,updated_at').eq('organization_id',organizationId).order('name');
 if(error)throw error;
 return data||[];
}
export function validateKnowledgeFile(file){
 if(!file||file.size<1||file.size>maxKnowledgeFileSize)throw new Error('INVALID_FILE_SIZE');
 if(file.name.length>160)throw new Error('INVALID_FILE_NAME');
 if(!allowedFileTypes.includes(file.type)||!mimeByExtension[fileExtension(file.name)]?.includes(file.type))throw new Error('INVALID_FILE_TYPE');
}
export async function uploadKnowledgeFile(user,file){
 validateKnowledgeFile(file);
 const safe=file.name.replace(/[^a-zA-Z0-9._-]/g,'_').slice(-100)||'file';
 const path=`${user.organization_id}/${user.id}/${crypto.randomUUID()}/${safe}`;
 const {error}=await supabase.storage.from('knowledge-files').upload(path,file,{upsert:false,contentType:file.type});
 if(error)throw error;
 return path;
}
export async function fetchKnowledgeBlob(item){
 const {data,error}=await supabase.storage.from('knowledge-files').download(item.file_path);
 if(error)throw error;
 return data;
}
export async function downloadKnowledgeFile(item){
 const blob=await fetchKnowledgeBlob(item),url=URL.createObjectURL(blob),link=document.createElement('a');
 link.href=url;link.download=item.file_name||item.title;link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
}
export async function deleteKnowledgeItem(item,user){
 const {data,error}=await supabase.from('knowledge_items').delete().eq('organization_id',user.organization_id).eq('id',item.id).eq('created_by',user.id).select('id').maybeSingle();
 if(error||!data)throw error||new Error('DELETE_NOT_ALLOWED');
 if(item.file_path){const {error:blobError}=await supabase.storage.from('knowledge-files').remove([item.file_path]);if(blobError)return false}
 return true;
}
