import {useEditor,EditorContent} from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Underline from '@tiptap/extension-underline';
import Link from '@tiptap/extension-link';
import {noteHtml,sanitizeNoteHtml} from '../lib/note-rich-text';

const safeUrl=value=>{try{const url=new URL(value);return ['http:','https:'].includes(url.protocol)?url.href:null}catch{return null}};

export default function RichNoteEditor({initialBody,ar,onChange,editorRef}){
 const editor=useEditor({
  extensions:[StarterKit,Underline,Link.configure({openOnClick:false,autolink:false,linkOnPaste:false,protocols:['http','https'],isAllowedUri:url=>Boolean(safeUrl(url)),HTMLAttributes:{target:'_blank',rel:'noopener noreferrer'}})],
  content:noteHtml(initialBody),immediatelyRender:false,
  editorProps:{attributes:{dir:ar?'rtl':'ltr',lang:ar?'ar':'en','aria-label':ar?'محتوى الملاحظة':'Note content'}},
  onUpdate:({editor:current})=>onChange(sanitizeNoteHtml(current.getHTML()),current.getText().length),
 },[initialBody,ar]);
 editorRef.current=editor;
 if(!editor)return <p role="status">{ar?'جارٍ تحميل المحرر…':'Loading editor…'}</p>;
 const action=(label,command,active)=> <button type="button" aria-label={label} aria-pressed={Boolean(active)} className={active?'active':''} onMouseDown={event=>event.preventDefault()} onClick={command}>{label}</button>;
 const link=()=>{const existing=editor.getAttributes('link').href||'';const entered=window.prompt(ar?'رابط HTTPS أو HTTP':'HTTP or HTTPS link',existing);if(entered===null)return;if(!entered.trim()){editor.chain().focus().unsetLink().run();return}const href=safeUrl(entered.trim());if(!href){window.alert(ar?'الرابط يجب أن يبدأ بـ https:// أو http://':'The link must start with https:// or http://');return}editor.chain().focus().extendMarkRange('link').setLink({href}).run()};
 return <><div className="knowledge-rich-toolbar" role="toolbar" aria-label={ar?'تنسيق الملاحظة':'Note formatting'}>
  {action('B',()=>editor.chain().focus().toggleBold().run(),editor.isActive('bold'))}
  {action('I',()=>editor.chain().focus().toggleItalic().run(),editor.isActive('italic'))}
  {action('U',()=>editor.chain().focus().toggleUnderline().run(),editor.isActive('underline'))}
  {action(ar?'قائمة نقطية':'Bullet list',()=>editor.chain().focus().toggleBulletList().run(),editor.isActive('bulletList'))}
  {action(ar?'قائمة مرقمة':'Numbered list',()=>editor.chain().focus().toggleOrderedList().run(),editor.isActive('orderedList'))}
  {action(ar?'إضافة رابط':'Insert link',link,editor.isActive('link'))}
 </div><EditorContent editor={editor} className="knowledge-rich-content"/></>;
}
