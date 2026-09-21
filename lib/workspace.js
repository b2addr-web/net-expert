import {supabase} from './supabase';
import {fieldsFor,validateRecord} from './modules';
export const unpackRecord=r=>({...r.data,id:r.id,created_at:r.created_at,created_by:r.created_by,created_by_name:r.created_by_name,updated_at:r.updated_at,updated_by:r.updated_by,updated_by_name:r.updated_by_name,version:r.version});
export async function recordHistory(id){const {data,error}=await supabase.from('workspace_versions').select('*').eq('record_id',id).order('version',{ascending:false}).order('occurred_at',{ascending:false});if(error)throw error;return data;}
export async function bulkEdit(module,records,patch){const {data,error}=await supabase.rpc('bulk_edit_workspace',{p_module:module,p_records:records.map(r=>({id:r.id,version:r.version})),p_patch:patch});if(error)throw error;return data.map(unpackRecord);}
export async function restoreVersion(record,version){const {data,error}=await supabase.rpc('restore_workspace_version',{p_id:record.id,p_version:version,p_current_version:record.version});if(error)throw error;return unpackRecord(data);}
export async function listRecords(module){
 if(!supabase)throw new Error('Workspace connection unavailable');
 let rows=[];
 for(let offset=0;;offset+=500){const {data,error}=await supabase.from('workspace_records').select('*').eq('module',module).order('id').range(offset,offset+499);if(error)throw error;rows.push(...data.map(unpackRecord));if(data.length<500)return rows;}
}
export async function saveRecord(module,form){
 const problem=validateRecord(module,form);if(problem)throw new Error(problem);
 const data=Object.fromEntries(fieldsFor(module).map(f=>[f.key,String(form[f.key]??'').trim()]));data.attachments=form.attachments||[];
 const {data:result,error}=await supabase.rpc('save_workspace_record',{p_module:module,p_id:form.id||null,p_data:data,p_version:form.version||null});if(error)throw error;return unpackRecord(result);
}
export async function bulkImportRecords(rows,duplicatePolicy='skip'){
 if(!supabase)throw new Error('Workspace connection unavailable');
 if(!['skip','update'].includes(duplicatePolicy))throw new Error('Invalid duplicate policy');
 const {data,error}=await supabase.rpc('import_workspace_records',{p_rows:rows,p_duplicate_policy:duplicatePolicy});
 if(error)throw error;return data;
}
export async function deleteRecord(module,id){const {error}=await supabase.from('workspace_records').delete().eq('module',module).eq('id',id);if(error)throw error;}
export async function uploadAttachment(user,module,file){
 if(file.size>10*1024*1024)throw new Error('Maximum file size is 10 MB');
 const path=`${user.organization_id}/${module}/${crypto.randomUUID()}/${file.name.replace(/[^a-zA-Z0-9.\-_]/g,'_')}`;
 const {error}=await supabase.storage.from('workspace-files').upload(path,file);if(error)throw error;
 return {path,name:file.name,size:file.size};
}
export async function downloadAttachment(file){const {data,error}=await supabase.storage.from('workspace-files').download(file.path);if(error)throw error;const url=URL.createObjectURL(data),a=document.createElement('a');a.href=url;a.download=file.name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
