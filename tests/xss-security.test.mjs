import test from 'node:test';
import assert from 'node:assert/strict';
import {JSDOM} from 'jsdom';
import {RICH_PREFIX,noteHtml,serializeNote} from '../lib/note-rich-text.js';
import {generateExport} from '../lib/export.js';

const payload='<img src=x onerror="window.__xssExecuted=true"><svg onload="window.__xssExecuted=true"></svg><a href="javascript:window.__xssExecuted=true" onclick="window.__xssExecuted=true">رابط</a>';

test('rich and legacy notes retain permitted formatting but remove executable HTML',()=>{
 for(const body of [payload,`${RICH_PREFIX}<p><strong>عريض</strong> <em>مائل</em> <u>مسطر</u></p>${payload}`]){
  const rendered=noteHtml(body);
  const dom=new JSDOM(rendered);
  assert.equal(dom.window.document.querySelector('img,svg,script,[onerror],[onload],[onclick],a[href^="javascript:"]'),null);
  dom.window.close();
 }
 const stored=serializeNote(`<p><strong>نص</strong></p>${payload}`);
 assert.match(noteHtml(stored),/<strong>نص<\/strong>/);
 const savedDom=new JSDOM(noteHtml(stored));
 assert.equal(savedDom.window.document.querySelector('img,svg,script,[onerror],[onload],[onclick],a[href^="javascript:"]'),null);
 savedDom.window.close();
});

test('print export escapes every untrusted field before document.write',async()=>{
 let html='';
 const originalWindow=globalThis.window;
 globalThis.window={open:()=>({document:{write(value){html=value},close(){}}})};
 try{
  await generateExport({rows:[{[payload]:payload}],format:'pdf',fileName:'local-test',includeAttachments:false,organization:payload,user:payload,title:payload,rtl:true});
  const dom=new JSDOM(html,{url:'https://example.invalid',runScripts:'dangerously'});
  assert.equal(dom.window.document.querySelector('img,svg,[onerror],[onclick],a[href^="javascript:"]'),null);
  assert.equal(dom.window.__xssExecuted,undefined);
  dom.window.close();
 }finally{if(originalWindow===undefined)delete globalThis.window;else globalThis.window=originalWindow}
});
