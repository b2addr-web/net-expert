import test from 'node:test';
import assert from 'node:assert/strict';
import {PDFDocument,degrees} from 'pdf-lib';
import {sha256Hex} from '../lib/serverSupabase.js';

const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=','base64');

test('creates a valid multi-page signed PDF without mutating the source',async()=>{
 const source=await PDFDocument.create();source.addPage([595,842]);const rotated=source.addPage([842,595]);rotated.setRotation(degrees(90));const original=await source.save({useObjectStreams:false}),originalHash=await sha256Hex(original);
 const pdf=await PDFDocument.load(original),image=await pdf.embedPng(png);const page=pdf.getPages()[1];page.drawImage(image,{x:100,y:100,width:120,height:45});const finalBytes=await pdf.save({useObjectStreams:false});
 const check=await PDFDocument.load(finalBytes);assert.equal(check.getPageCount(),2);assert.equal(check.getPages()[1].getRotation().angle,90);assert.notEqual(await sha256Hex(finalBytes),originalHash);assert.deepEqual(await PDFDocument.load(original).then(x=>x.getPageCount()),2);
});

test('archive output is deterministic for the same PDF and signature input',async()=>{
 const make=async()=>{const pdf=await PDFDocument.create();const p=pdf.addPage([300,400]);const image=await pdf.embedPng(png);p.drawImage(image,{x:20,y:30,width:50,height:20});return pdf.save({useObjectStreams:false})};
 const a=await make(),b=await make();assert.equal(await sha256Hex(a),await sha256Hex(b));assert.ok((await PDFDocument.load(a)).getPageCount()===1);
});
