import {readFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
import test from 'node:test';

const source=(await readFile(new URL('../lib/knowledge.js',import.meta.url),'utf8')).replace("import {supabase} from './supabase';",'');
const {validateKnowledgeFile,knowledgeType,fileKind,maxKnowledgeFileSize}=await import('data:text/javascript;base64,'+Buffer.from(source).toString('base64'));

test('note attachments accept supported images and documents up to 10 MB',()=>{
 for(const [name,type] of [['a.png','image/png'],['a.pdf','application/pdf'],['a.docx','application/vnd.openxmlformats-officedocument.wordprocessingml.document'],['a.xlsx','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'],['a.txt','text/plain']])assert.doesNotThrow(()=>validateKnowledgeFile({name,type,size:123}));
 assert.doesNotThrow(()=>validateKnowledgeFile({name:'large.pdf',type:'application/pdf',size:maxKnowledgeFileSize}));
});
test('note attachment validation rejects oversized, empty and mismatched files',()=>{
 for(const file of [{name:'bad.pdf',type:'application/pdf',size:maxKnowledgeFileSize+1},{name:'empty.png',type:'image/png',size:0},{name:'bad.exe',type:'application/pdf',size:50},{name:'fake.png',type:'text/plain',size:50}])assert.throws(()=>validateKnowledgeFile(file));
});
test('legacy note attachment remains classified as a note',()=>{
 assert.equal(knowledgeType({item_type:'note',file_path:'org/user/file',body:'Content'}),'note');
 assert.equal(fileKind('photo.webp'),'image');
});
test('attachment availability checks the table even when no notes exist',async()=>{
 const mock=`let calls=0;const supabase={from(name){calls++;if(name!=='knowledge_attachments')throw Error('wrong table');return {select(){return {limit(){return Promise.resolve({error:new Error('missing table')})}}}}}};`;
 const module=await import('data:text/javascript;base64,'+Buffer.from(`${mock}\n${source}\nexport const callsMade=()=>calls;`).toString('base64'));
 await assert.rejects(module.listNoteAttachments([]),/missing table/);
 assert.equal(module.callsMade(),1);
});
