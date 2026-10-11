import {supabase} from './supabase';

const bucket='report-logos';
const path=userId=>`${userId}/logo.png`;

export async function loadReportLogo(userId){
 const {data,error}=await supabase.storage.from(bucket).download(path(userId));
 if(error){if(error.statusCode==='404'||error.statusCode===404||/not found/i.test(error.message))return '';throw error}
 return await new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result);reader.onerror=()=>reject(reader.error);reader.readAsDataURL(data)});
}

export async function saveReportLogo(userId,file){
 if(!['image/png','image/jpeg','image/webp'].includes(file.type))throw new Error('LOGO_FORMAT');
 if(file.size>2*1024*1024)throw new Error('LOGO_SIZE');
 const image=await createImageBitmap(file);
 try{
  const scale=Math.min(1,600/image.width,300/image.height),canvas=document.createElement('canvas');
  canvas.width=Math.max(1,Math.round(image.width*scale));canvas.height=Math.max(1,Math.round(image.height*scale));
  canvas.getContext('2d').drawImage(image,0,0,canvas.width,canvas.height);
  const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/png'));
  if(!blob)throw new Error('LOGO_PROCESS');
  const {error}=await supabase.storage.from(bucket).upload(path(userId),blob,{contentType:'image/png',upsert:true,cacheControl:'60'});
  if(error)throw error;
 }finally{image.close()}
 return loadReportLogo(userId);
}

export async function removeReportLogo(userId){
 const {error}=await supabase.storage.from(bucket).remove([path(userId)]);
 if(error)throw error;
}
