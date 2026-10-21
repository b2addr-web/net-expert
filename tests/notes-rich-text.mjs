import assert from 'node:assert/strict';
import {JSDOM} from 'jsdom';

const dom=new JSDOM('<!doctype html><html><body></body></html>',{url:'https://www.netexpert.dev'});
for(const name of ['window','document','navigator','Node','HTMLElement','Element','getComputedStyle'])Object.defineProperty(globalThis,name,{configurable:true,value:dom.window[name]});
globalThis.requestAnimationFrame=callback=>setTimeout(callback,0);
const [{Editor},{default:StarterKit},{default:Underline},{default:Link},rich]=await Promise.all([
 import('@tiptap/core'),import('@tiptap/starter-kit'),import('@tiptap/extension-underline'),import('@tiptap/extension-link'),import('../lib/note-rich-text.js')
]);
const editor=new Editor({extensions:[StarterKit,Underline,Link.configure({openOnClick:false,autolink:false,linkOnPaste:false})],content:'<p>نص تجريبي</p>'});
const select=()=>editor.commands.setTextSelection({from:1,to:11});
select();editor.chain().focus().toggleBold().run();assert.match(editor.getHTML(),/<strong>/);
select();editor.chain().focus().toggleItalic().run();assert.match(editor.getHTML(),/<em>/);
select();editor.chain().focus().toggleUnderline().run();assert.match(editor.getHTML(),/<u>/);
editor.commands.setContent('<p></p>');editor.chain().focus().toggleBold().insertContent('لاحق').run();assert.match(editor.getHTML(),/<strong>لاحق<\/strong>/);
editor.commands.setContent('<p>عنصر</p>');editor.chain().focus().toggleBulletList().run();assert.match(editor.getHTML(),/<ul>/);
editor.commands.setContent('<p>عنصر</p>');editor.chain().focus().toggleOrderedList().run();assert.match(editor.getHTML(),/<ol>/);
editor.commands.setContent('<p>رابط</p>');editor.commands.setTextSelection({from:1,to:5});editor.chain().focus().setLink({href:'https://example.com'}).run();assert.match(editor.getHTML(),/href="https:\/\/example.com"/);
const stored=rich.serializeNote(editor.getHTML());assert.match(rich.noteHtml(stored),/https:\/\/example.com/);
assert.equal(rich.notePlainText(stored),'رابط');
assert.match(rich.noteHtml('قديم **عريض**'),/<strong>عريض<\/strong>/);
assert.doesNotMatch(rich.noteHtml(`${rich.RICH_PREFIX}<img src=x onerror=alert(1)><p onclick=alert(1)>safe</p><a href="javascript:alert(1)">bad</a>`),/<img|onclick|javascript:/);
editor.destroy();dom.window.close();
console.log('Rich text formatting, legacy content, persistence, and sanitization passed.');
