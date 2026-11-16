import {PDFDocument} from 'pdf-lib';
import {sha256Hex} from './serverSupabase';

function rotatedBox(page,box){
  const w=page.getWidth(),h=page.getHeight(),x=Number(box.x),yTop=Number(box.y),bw=Number(box.width),bh=Number(box.height),angle=((page.getRotation()?.angle||0)%360+360)%360;
  if(angle===90)return {x:yTop,y:x,width:bh,height:bw};
  if(angle===180)return {x:w-x-bw,y:yTop,width:bw,height:bh};
  if(angle===270)return {x:h-yTop-bh,y:w-x-bw,width:bh,height:bw};
  return {x,y:h-yTop-bh,width:bw,height:bh};
}

export async function archiveSignedRequest({db,request,signatureBytes}){
  const template=request.signature_templates;
  const {data:creatorRow}=await db.from('signature_requests').select('created_by').eq('id',request.id).maybeSingle();
  const creatorId=creatorRow?.created_by||request.created_by||template?.created_by;
  const {data:existing}=await db.from('knowledge_items').select('id,file_path').eq('organization_id',request.organization_id).eq('file_path',`${request.organization_id}/signature-requests/${request.id}/signed.pdf`).maybeSingle();
  const {data:source,error:sourceError}=await db.storage.from('knowledge-files').download(template.original_file_path);if(sourceError)throw sourceError;
  const sourceBytes=new Uint8Array(await source.arrayBuffer()),sourceHash=await sha256Hex(sourceBytes);if(sourceHash!==template.original_sha256)throw new Error('ORIGINAL_TEMPLATE_HASH_MISMATCH');
  const pdf=await PDFDocument.load(sourceBytes,{updateMetadata:false});const page=pdf.getPages()[Math.max(0,Number(template.signature_page)-1)];if(!page)throw new Error('SIGNATURE_PAGE_NOT_FOUND');
  const image=await pdf.embedPng(signatureBytes);const box=rotatedBox(page,{x:template.signature_x,y:template.signature_y,width:template.signature_width,height:template.signature_height});page.drawImage(image,{x:box.x,y:box.y,width:box.width,height:box.height});
  const bytes=await pdf.save({useObjectStreams:false}),hash=await sha256Hex(bytes),path=`${request.organization_id}/signature-requests/${request.id}/signed.pdf`;
  const verifyStored = async () => {
    const {data: stored, error} = await db.storage.from('knowledge-files').download(path);
    if (error || !stored || await sha256Hex(new Uint8Array(await stored.arrayBuffer())) !== hash) {
      throw new Error('FINAL_ARCHIVE_HASH_MISMATCH');
    }
  };
  if (existing) {
    await verifyStored();
    return { id: existing.id, path, sha256: hash };
  }
  const {error:uploadError}=await db.storage.from('knowledge-files').upload(path,bytes,{upsert:false,contentType:'application/pdf'});
  if (uploadError) {
    if (String(uploadError.statusCode) !== '409') throw uploadError;
    await verifyStored();
  }
  const title=`${request.employee_name} — ${template.name} — الإصدار ${template.version}`;
  if(!creatorId)throw new Error('ARCHIVE_CREATOR_NOT_FOUND');
  const {data:item,error:itemError}=await db.from('knowledge_items').insert({organization_id:request.organization_id,created_by:creatorId,item_type:'file',title,body:`الموظف: ${request.employee_name}\nالرقم الوظيفي: ${request.employee_id||'—'}\nالنموذج: ${template.name}\nالإصدار: ${template.version}\nطلب التوقيع: ${request.id}\nتاريخ التوقيع: ${request.signed_at}`,file_name:`${title}.pdf`,file_path:path,file_size:bytes.length,shared_with_team:false}).select('id,file_path').maybeSingle();
  if(itemError&&itemError.code!=='23505')throw itemError;
  if(!item) {const {data:found}=await db.from('knowledge_items').select('id,file_path').eq('organization_id',request.organization_id).eq('file_path',path).maybeSingle();if(!found)throw new Error('KNOWLEDGE_ITEM_NOT_CREATED');return {id:found.id,path,sha256:hash}}
  return {id:item.id,path,sha256:hash};
}
