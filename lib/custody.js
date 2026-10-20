import {supabase} from './supabase';
import {unpackRecord} from './workspace';

async function call(name,args={}){
 const {data,error}=await supabase.rpc(name,args);
 if(error)throw error;
 return data;
}

export const custodyState=record=>record.custody_state||'assigned';
export async function employeeCustody(employeeId){return (await call('list_employee_custody',{p_employee_id:employeeId})).map(row=>({...unpackRecord(row),module:row.module}))}
export async function returnCustody(employeeId,items){return (await call('return_employee_custody',{p_employee_id:employeeId,p_items:items})).map(row=>({...unpackRecord(row),module:row.module}))}
export async function availableCustody(){return call('list_available_custody')}
export async function custodyEmployees(){return call('list_custody_employees')}
export async function custodyHistory(recordId){const {data,error}=await supabase.from('custody_events').select('*').eq('record_id',recordId).order('occurred_at',{ascending:false}).limit(100);if(error)throw error;return data}
export async function assignCustody(item,employee){return unpackRecord(await call('assign_available_custody',{
 p_id:item.id,p_version:item.version,p_employee_id:employee.employee_id,
 p_employee_name:employee.employee_name,p_department:employee.department,
 p_location:employee.assign_location||null
}))}
