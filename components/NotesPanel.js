import {useCallback,useEffect,useMemo,useState} from 'react';
import {supabase} from '../lib/supabase';
import {NavIcon} from './WorkspaceSidebar';

const fields='id,organization_id,created_by,title,body,file_path,file_name,file_size,shared_with_team,created_at,updated_at';
const allowedTypes=['application/pdf','image/png','image/jpeg','image/webp','text/plain','text/csv','application/vnd.openxmlformats-officedocument.wordprocessingml.document','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet','application/msword','application/vnd.ms-excel'];
const maxFileSize=10485760;
const dateText=(date,ar)=>date?new Intl.DateTimeFormat(ar?'ar-SA-u-ca-gregory':'en-GB',{timeZone:'Asia/Riyadh',dateStyle:'medium',timeStyle:'short'}).format(new Date(date)):'—';
const sizeText=n=>n>=1048576?(n/1048576).toFixed(1)+' MB':Math.max(1,Math.ceil(n/1024))+' KB';
const extOf=name=>(name||'').split('.').pop().toLowerCase();
const fileKind=name=>['jpg','jpeg','png','webp'].includes(extOf(name))?'images':['xls','xlsx','csv'].includes(extOf(name))?'sheets':['pdf','doc','docx','txt'].includes(extOf(name))?'documents':'other';
const fileBadge=name=>({pdf:'PDF',doc:'W',docx:'W',xls:'X',xlsx:'X',csv:'CSV',jpg:'IMG',jpeg:'IMG',png:'IMG',webp:'IMG',txt:'TXT'}[extOf(name)]||'FILE');
const language={
 ar:{notes:'الملاحظات',files:'الملفات',notesDesc:'توثيق الملاحظات والمعلومات المهمة للفريق',filesDesc:'إدارة الملفات والمستندات ومشاركتها مع الفريق',newNote:'ملاحظة جديدة',newFile:'رفع ملف',newFolder:'مجلد جديد',searchNotes:'ابحث في الملاحظات...',searchFiles:'ابحث في الملفات...',all:'الكل',mine:'خاص بي',team:'مشاركة مع الفريق',title:'العنوان',body:'محتوى الملاحظة',excerpt:'المحتوى المختصر',author:'الكاتب',created:'تاريخ الإنشاء',updated:'آخر تعديل',sharing:'المشاركة',actions:'الإجراءات',save:'حفظ',cancel:'إلغاء',delete:'حذف',edit:'تعديل',download:'تنزيل',open:'فتح',preview:'معاينة',private:'خاص بي',shared:'مشاركة مع الفريق',privateHint:'تظهر لك فقط',sharedHint:'تظهر لأعضاء الفريق المصرح لهم',allFiles:'كل الملفات',folders:'المجلدات',folder:'المجلد',folderName:'اسم المجلد',noFolder:'بدون مجلد',chooseFile:'اختر ملفًا أو اسحبه إلى هنا',fileHint:'PDF، صور، Word، Excel، نصوص — حتى 10 ميجابايت',kind:'نوع الملف',sort:'الترتيب',newest:'الأحدث أولًا',oldest:'الأقدم أولًا',grid:'بطاقات',list:'قائمة',fileSize:'الحجم',move:'نقل إلى مجلد',loading:'جارٍ التحميل...',emptyNotes:'لا توجد ملاحظات تطابق البحث',emptyFiles:'لا توجد ملفات تطابق البحث',noteSaved:'تم حفظ الملاحظة',fileSaved:'تم رفع الملف',folderSaved:'تم حفظ المجلد',deleted:'تم الحذف',confirm:'هل تريد حذف هذا العنصر نهائيًا؟',confirmFolder:'حذف المجلد؟ ستبقى ملفاته محفوظة ضمن كل الملفات.',invalidFile:'ملف غير مدعوم أو حجمه أكبر من 10 ميجابايت.',needFile:'اختر ملفًا للرفع',needBody:'اكتب محتوى الملاحظة',editFolder:'تعديل المجلد',folderUnavailable:'إدارة المجلدات تحتاج تطبيق ترحيل قاعدة البيانات المعتمد. الملفات الحالية محفوظة ومتاحة.',noData:'لا توجد بيانات حاليًا',timestamp:'يظهر الوقت تلقائيًا بتوقيت السعودية، ويُسجل تاريخ الإنشاء عند الحفظ',authorAuto:'من حساب المستخدم الحالي',legacyAttachment:'الملف المرفق',noteDetails:'تفاصيل الملاحظة',fileDetails:'تفاصيل الملف',uploading:'جارٍ الحفظ...',privateFile:'ملف خاص',owned:'أنت',unknown:'عضو بالفريق'},
 en:{notes:'Notes',files:'Files',notesDesc:'Capture notes and knowledge for your authorized team',filesDesc:'Organize documents and share them securely',newNote:'New note',newFile:'Upload file',newFolder:'New folder',searchNotes:'Search notes...',searchFiles:'Search files...',all:'All',mine:'Private',team:'Shared with team',title:'Title',body:'Note content',excerpt:'Preview',author:'Author',created:'Created',updated:'Last edited',sharing:'Sharing',actions:'Actions',save:'Save',cancel:'Cancel',delete:'Delete',edit:'Edit',download:'Download',open:'Open',preview:'Preview',private:'Private',shared:'Shared with team',privateHint:'Only visible to you',sharedHint:'Visible to authorized teammates',allFiles:'All files',folders:'Folders',folder:'Folder',folderName:'Folder name',noFolder:'Unfiled',chooseFile:'Select or drop a file',fileHint:'PDF, images, Word, Excel, text — up to 10 MB',kind:'File type',sort:'Sort',newest:'Newest first',oldest:'Oldest first',grid:'Grid',list:'List',fileSize:'Size',move:'Move to folder',loading:'Loading...',emptyNotes:'No matching notes',emptyFiles:'No matching files',noteSaved:'Note saved',fileSaved:'File uploaded',folderSaved:'Folder saved',deleted:'Deleted',confirm:'Delete this item permanently?',confirmFolder:'Delete this folder? Its files will stay in All files.',invalidFile:'Unsupported file or over 10 MB.',needFile:'Select a file',needBody:'Write your note',editFolder:'Edit folder',folderUnavailable:'Folder management needs the reviewed database migration. Existing files remain available.',noData:'No data yet',timestamp:'Riyadh time shown automatically; creation time recorded when saved',authorAuto:'Your signed-in account',legacyAttachment:'Attachment',noteDetails:'Note details',fileDetails:'File details',uploading:'Saving...',privateFile:'Private file',owned:'You',unknown:'Team member'}
};

export default function NotesPanel({user,ar,section='notes'}){
 const t=language[ar?'ar':'en'],isFiles=section==='files';
 const canManage=['company_admin','operator','manager'].includes(user.role);
 const [items,setItems]=useState([]),[folderList,setFolderList]=useState([]),[foldersReady,setFoldersReady]=useState(false);
 const [loading,setLoading]=useState(true),[busy,setBusy]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState('');
 const [query,setQuery]=useState(''),[visibility,setVisibility]=useState('all'),[kind,setKind]=useState('all'),[order,setOrder]=useState('new');
 const [folderFilter,setFolderFilter]=useState('all'),[display,setDisplay]=useState('grid');
 const [form,setForm]=useState(null),[selectedFile,setSelectedFile]=useState(null),[folderForm,setFolderForm]=useState(null),[detail,setDetail]=useState(null),[previewUrl,setPreviewUrl]=useState('');
 const [owners,setOwners]=useState({});
 const [nowOnOpen,setNowOnOpen]=useState(null);
 const ownerLabel=item=>item.created_by===user.id?user.name||t.owned:owners[item.created_by]||t.unknown;
 const load=useCallback(async()=>{
  setLoading(true);
  try{
   let ready=true;
   let response=await supabase.from('knowledge_items').select(fields+',folder_id').eq('organization_id',user.organization_id).order('created_at',{ascending:false}).limit(500);
   if(response.error&&(response.error.code==='42703'||response.error.code==='PGRST204')){
    ready=false;
    response=await supabase.from('knowledge_items').select(fields).eq('organization_id',user.organization_id).order('created_at',{ascending:false}).limit(500);
   }
   if(response.error)throw response.error;
   setItems(response.data||[]);
   if(ready){
    const folderResult=await supabase.from('knowledge_folders').select('id,name,created_by,shared_with_team').eq('organization_id',user.organization_id).order('name');
    if(folderResult.error){ready=false;setFolderList([])}else setFolderList(folderResult.data||[]);
   }else setFolderList([]);
   setFoldersReady(ready);
   setError('');
   const ids=[...new Set((response.data||[]).map(x=>x.created_by).filter(id=>id!==user.id))];
   if(ids.length){
    const profiles=await supabase.from('profiles').select('id,full_name').in('id',ids.slice(0,100));
    if(!profiles.error)setOwners(Object.fromEntries((profiles.data||[]).filter(x=>x.full_name).map(x=>[x.id,x.full_name])));
   }
  }catch(e){setError(e.message||String(e))}
  finally{setLoading(false)}
 },[user.organization_id,user.id]);
 useEffect(()=>{load()},[load]);
 useEffect(()=>{if(!form&&!detail)return;const onKey=e=>{if(e.key==='Escape'&&!busy){setForm(null);setSelectedFile(null);setDetail(null)}};window.addEventListener('keydown',onKey);return()=>window.removeEventListener('keydown',onKey)},[form,detail,busy]);
 useEffect(()=>()=>{if(previewUrl)URL.revokeObjectURL(previewUrl)},[previewUrl]);
 const notes=useMemo(()=>items.filter(x=>!x.file_path||Boolean(x.body&&x.body.trim())),[items]);
 const files=useMemo(()=>items.filter(x=>Boolean(x.file_path)),[items]);
 const visible=useMemo(()=>{
  const term=query.trim().toLocaleLowerCase();
  return (isFiles?files:notes).filter(x=>
   (!term||(x.title+' '+x.body+' '+(x.file_name||'')).toLocaleLowerCase().includes(term))&&
   (visibility==='all'||(visibility==='mine'?!x.shared_with_team:x.shared_with_team))&&
   (!isFiles||kind==='all'||fileKind(x.file_name)===kind)&&
   (!isFiles||folderFilter==='all'||(folderFilter==='unfiled'?!x.folder_id:x.folder_id===folderFilter))
  ).sort((a,b)=>order==='old'?new Date(a.created_at)-new Date(b.created_at):new Date(b.created_at)-new Date(a.created_at));
 },[isFiles,notes,files,query,visibility,kind,folderFilter,order]);
 const startNote=item=>{setError('');setNotice('');setNowOnOpen(new Date());setSelectedFile(null);setForm(item?{...item}:{title:'',body:'',shared_with_team:false})};
 const startFile=()=>{setError('');setNotice('');setSelectedFile(null);setNowOnOpen(new Date());setForm({title:'',body:'',shared_with_team:false,folder_id:folderFilter!=='all'&&folderFilter!=='unfiled'?folderFilter:null})};
 const validFile=file=>file&&file.size>0&&file.size<=maxFileSize&&allowedTypes.includes(file.type)&&file.name.length<=255;
 const onFile=file=>{if(!file)return;if(!validFile(file)){setError(t.invalidFile);return}setError('');setSelectedFile(file);setForm(x=>({...x,title:x.title||file.name}))};
 const save=async e=>{
  e.preventDefault();if(busy)return;setError('');setNotice('');
  if(isFiles&&!selectedFile){setError(t.needFile);return}
  if(!isFiles&&!form.body.trim()&&!form.file_path){setError(t.needBody);return}
  if(selectedFile&&!validFile(selectedFile)){setError(t.invalidFile);return}
  setBusy(true);let uploaded='';
  try{
   if(isFiles){
    const safe=selectedFile.name.replace(/[^a-zA-Z0-9._-]/g,'_').slice(-100)||'file';
    uploaded=user.organization_id+'/'+user.id+'/'+crypto.randomUUID()+'/'+safe;
    const result=await supabase.storage.from('knowledge-files').upload(uploaded,selectedFile,{upsert:false,contentType:selectedFile.type});
    if(result.error)throw result.error;
   }
   const payload={title:form.title.trim(),body:form.body.trim(),shared_with_team:form.shared_with_team,updated_at:new Date().toISOString()};
   if(form.id){
    const result=await supabase.from('knowledge_items').update(payload).eq('id',form.id).eq('organization_id',user.organization_id).eq('created_by',user.id).select('id').single();
    if(result.error)throw result.error;
   }else{
    const record={...payload,organization_id:user.organization_id,created_by:user.id,file_path:uploaded||null,file_name:selectedFile?selectedFile.name:null,file_size:selectedFile?selectedFile.size:null};
    if(isFiles&&foldersReady&&form.folder_id)record.folder_id=form.folder_id;
    const result=await supabase.from('knowledge_items').insert(record).select('id').single();
    if(result.error)throw result.error;
   }
   setForm(null);setSelectedFile(null);setNotice(isFiles?t.fileSaved:t.noteSaved);await load();
  }catch(ex){
   if(uploaded)await supabase.storage.from('knowledge-files').remove([uploaded]);
   setError(ex.message||String(ex));
  }finally{setBusy(false)}
 };
 const remove=async item=>{
  if(!window.confirm(t.confirm))return;
  setBusy(true);setError('');
  try{
   const response=await supabase.from('knowledge_items').delete().eq('id',item.id).eq('organization_id',user.organization_id).eq('created_by',user.id).select('id').single();
   if(response.error)throw response.error;
   if(item.file_path){const cleaned=await supabase.storage.from('knowledge-files').remove([item.file_path]);if(cleaned.error)setError(cleaned.error.message)}
   setDetail(null);setNotice(t.deleted);await load();
  }catch(e){setError(e.message||String(e))}finally{setBusy(false)}
 };
 const download=async item=>{
  setError('');
  try{
   const result=await supabase.storage.from('knowledge-files').download(item.file_path);
   if(result.error)throw result.error;
   const url=URL.createObjectURL(result.data),a=document.createElement('a');
   a.href=url;a.download=item.file_name||'file';document.body.appendChild(a);a.click();a.remove();
   window.setTimeout(()=>URL.revokeObjectURL(url),2000);
  }catch(e){setError(e.message||String(e))}
 };
 const showDetail=async item=>{
  setDetail(item);setError('');setPreviewUrl('');
  if(!item.file_path||!(fileKind(item.file_name)==='images'||extOf(item.file_name)==='pdf'))return;
  const result=await supabase.storage.from('knowledge-files').download(item.file_path);
  if(result.error){setError(result.error.message);return}
  setPreviewUrl(URL.createObjectURL(result.data));
 };
 const moveFile=async(item,folderId)=>{
  setBusy(true);setError('');
  try{
   const result=await supabase.from('knowledge_items').update({folder_id:folderId||null,updated_at:new Date().toISOString()}).eq('id',item.id).eq('organization_id',user.organization_id).eq('created_by',user.id);
   if(result.error)throw result.error;
   await load();
  }catch(e){setError(e.message||String(e))}finally{setBusy(false)}
 };
 const saveFolder=async e=>{
  e.preventDefault();if(!folderForm?.name.trim()||busy)return;
  setBusy(true);setError('');
  try{
   const payload={name:folderForm.name.trim(),shared_with_team:Boolean(folderForm.shared_with_team)};
   const query=folderForm.id?supabase.from('knowledge_folders').update(payload).eq('id',folderForm.id).eq('created_by',user.id):supabase.from('knowledge_folders').insert({...payload,organization_id:user.organization_id,created_by:user.id});
   const res=await query;if(res.error)throw res.error;
   setFolderForm(null);setNotice(t.folderSaved);await load();
  }catch(e){setError(e.message||String(e))}finally{setBusy(false)}
 };
 const deleteFolder=async folder=>{
  if(!window.confirm(t.confirmFolder))return;setBusy(true);setError('');
  try{
   const result=await supabase.from('knowledge_folders').delete().eq('id',folder.id).eq('organization_id',user.organization_id).eq('created_by',user.id);
   if(result.error)throw result.error;
   setFolderFilter('all');setNotice(t.deleted);await load();
  }catch(e){setError(e.message||String(e))}finally{setBusy(false)}
 };
 const permission=(item)=>canManage&&item.created_by===user.id;
 return <div className="work-page knowledge-panel knowledge-v2" dir={ar?'rtl':'ltr'}>
  <header className="knowledge-heading">
   <div><small>{user.organization_name}</small><h1><NavIcon name={isFiles?'files':'notes'}/>{isFiles?t.files:t.notes}</h1><p>{isFiles?t.filesDesc:t.notesDesc}</p></div>
   {canManage&&<button type="button" className="work-primary knowledge-add" onClick={isFiles?startFile:()=>startNote()}>＋ {isFiles?t.newFile:t.newNote}</button>}
  </header>
  {error&&<p className="work-error" role="alert">{error}</p>}
  {notice&&<p className="knowledge-success" role="status">{notice}</p>}
  <div className="knowledge-toolbar"><div className="knowledge-search"><span aria-hidden="true">⌕</span><input aria-label={isFiles?t.searchFiles:t.searchNotes} placeholder={isFiles?t.searchFiles:t.searchNotes} value={query} onChange={e=>setQuery(e.target.value)}/></div><div className="knowledge-filter-pills">{[['all',t.all],['mine',t.mine],['team',t.team]].map(([key,label])=><button key={key} type="button" className={visibility===key?'active':''} aria-pressed={visibility===key} onClick={()=>setVisibility(key)}>{label}</button>)}</div><select aria-label={t.sort} value={order} onChange={e=>setOrder(e.target.value)}><option value="new">{t.newest}</option><option value="old">{t.oldest}</option></select></div>
  {isFiles&&<div className="knowledge-file-filters"><div>{[['all',t.all],['documents',ar?'المستندات':'Documents'],['sheets',ar?'الجداول':'Spreadsheets'],['images',ar?'الصور':'Images']].map(([value,label])=><button type="button" key={value} className={kind===value?'active':''} onClick={()=>setKind(value)}>{label}</button>)}</div><div className="knowledge-view-switch"><button type="button" aria-label={t.grid} className={display==='grid'?'active':''} onClick={()=>setDisplay('grid')}>▦</button><button type="button" aria-label={t.list} className={display==='list'?'active':''} onClick={()=>setDisplay('list')}>☷</button></div></div>}
  {isFiles?<div className="knowledge-file-layout">
   <aside className="knowledge-folders"><div className="knowledge-folders-title"><h2>{t.folders}</h2>{canManage&&foldersReady&&<button type="button" title={t.newFolder} onClick={()=>setFolderForm({name:'',shared_with_team:false})}>＋</button>}</div>
    <button type="button" className={folderFilter==='all'?'active':''} onClick={()=>setFolderFilter('all')}><span>▣ {t.allFiles}</span><b>{files.length}</b></button>
    <button type="button" className={folderFilter==='unfiled'?'active':''} onClick={()=>setFolderFilter('unfiled')}><span>▤ {t.noFolder}</span><b>{files.filter(x=>!x.folder_id).length}</b></button>
    {folderList.map(folder=><div key={folder.id} className="knowledge-folder-row"><button type="button" className={folderFilter===folder.id?'active':''} onClick={()=>setFolderFilter(folder.id)}><span>▱ {folder.name}</span><b>{files.filter(x=>x.folder_id===folder.id).length}</b></button>{permission({created_by:folder.created_by})&&<div className="knowledge-folder-actions"><button type="button" title={t.editFolder} onClick={()=>setFolderForm({...folder})}>✎</button><button type="button" title={t.delete} onClick={()=>deleteFolder(folder)}>×</button></div>}</div>)}
    {!foldersReady&&<p className="knowledge-hint">{t.folderUnavailable}</p>}
   </aside>
   <section className="knowledge-file-content" aria-label={t.files}>
    {loading?<p className="knowledge-empty">{t.loading}</p>:!visible.length?<p className="knowledge-empty">{t.emptyFiles}</p>:<div className={'knowledge-file-grid '+(display==='list'?'is-list':'')}>
    {visible.map(item=><article className="knowledge-file-card" key={item.id}>
      <div className="knowledge-card-top"><span className={'knowledge-format '+fileKind(item.file_name)}>{fileBadge(item.file_name)}</span><span className="knowledge-card-actions"><button type="button" title={t.preview} onClick={()=>showDetail(item)}>⋯</button></span></div>
      <button type="button" className="knowledge-card-title" title={item.file_name} onClick={()=>showDetail(item)}>{item.file_name}</button>
      <div className="knowledge-card-meta"><span>{sizeText(item.file_size||0)}</span><span>{dateText(item.created_at,ar)}</span><span>{ownerLabel(item)}</span></div>
      <div className="knowledge-card-footer"><span className={'knowledge-status '+(item.shared_with_team?'team':'private')}>{item.shared_with_team?t.team:t.private}</span><button type="button" onClick={()=>download(item)} title={t.download}>↓</button></div>
      {foldersReady&&permission(item)&&<label className="knowledge-move">{t.move}<select value={item.folder_id||''} onChange={e=>moveFile(item,e.target.value)} disabled={busy}><option value="">{t.noFolder}</option>{folderList.filter(folder=>folder.created_by===user.id).map(folder=><option value={folder.id} key={folder.id}>{folder.name}</option>)}</select></label>}
    </article>)}
    </div>}
   </section>
  </div>:<section className="knowledge-notes-table"><div className="knowledge-table-scroll"><table><thead><tr><th>{t.title}</th><th>{t.excerpt}</th><th>{t.author}</th><th>{t.updated}</th><th>{t.sharing}</th><th>{t.actions}</th></tr></thead><tbody>{loading?<tr><td colSpan={6} className="knowledge-empty">{t.loading}</td></tr>:visible.length===0?<tr><td colSpan={6} className="knowledge-empty">{t.emptyNotes}</td></tr>:visible.map(item=><tr key={item.id}><td><button type="button" className="knowledge-note-link" onClick={()=>showDetail(item)}><span className="knowledge-note-symbol">▤</span>{item.title}</button></td><td className="knowledge-preview-cell">{item.body||'—'}</td><td>{ownerLabel(item)}</td><td>{dateText(item.updated_at||item.created_at,ar)}</td><td><span className={'knowledge-status '+(item.shared_with_team?'team':'private')}>{item.shared_with_team?t.team:t.private}</span></td><td><div className="knowledge-row-actions"><button type="button" onClick={()=>showDetail(item)} title={t.open}>⋯</button>{permission(item)&&<button type="button" title={t.edit} onClick={()=>startNote(item)}>✎</button>}</div></td></tr>)}</tbody></table></div></section>}
  {form&&<div className="work-overlay knowledge-overlay" onMouseDown={e=>{if(e.target===e.currentTarget&&!busy){setForm(null);setSelectedFile(null)}}}><form className="knowledge-editor" role="dialog" aria-modal="true" aria-label={isFiles?t.newFile:t.newNote} onSubmit={save}><header><div><small>{isFiles?t.files:t.notes}</small><h2>{form.id?t.edit:isFiles?t.newFile:t.newNote}</h2></div><button type="button" aria-label={t.cancel} disabled={busy} onClick={()=>{setForm(null);setSelectedFile(null)}}>×</button></header><div className="knowledge-editor-body">
   <div className="knowledge-editor-info"><span>▦ {dateText(form.created_at||nowOnOpen,ar)}</span><span>◉ {form.id?ownerLabel(form):user.name||t.authorAuto}</span><small>{t.timestamp}</small></div>
   <label>{t.title}<input autoFocus required maxLength={160} value={form.title} onChange={e=>setForm({...form,title:e.target.value})} placeholder={t.title}/></label>
   {!isFiles&&<label>{t.body}<textarea rows={10} maxLength={10000} value={form.body} onChange={e=>setForm({...form,body:e.target.value})} placeholder={t.body}/><small className="knowledge-character-count">{form.body.length} / 10000</small></label>}
   {isFiles&&<><div className="knowledge-dropzone" onDragOver={e=>e.preventDefault()} onDrop={e=>{e.preventDefault();onFile(e.dataTransfer.files?.[0])}}><div className="knowledge-dropicon">⇧</div><p>{selectedFile?.name||t.chooseFile}</p><small>{selectedFile?sizeText(selectedFile.size):t.fileHint}</small><input type="file" accept={allowedTypes.join(',')} aria-label={t.newFile} onChange={e=>onFile(e.target.files?.[0])}/></div>{foldersReady&&<label>{t.folder}<select value={form.folder_id||''} onChange={e=>setForm({...form,folder_id:e.target.value||null})}><option value="">{t.noFolder}</option>{folderList.filter(x=>x.created_by===user.id).map(x=><option key={x.id} value={x.id}>{x.name}</option>)}</select></label>}</>}
   <fieldset className="knowledge-share-options"><legend>{t.sharing}</legend><label className={!form.shared_with_team?'selected':''}><input type="radio" checked={!form.shared_with_team} onChange={()=>setForm({...form,shared_with_team:false})}/><span>▣ <strong>{t.private}</strong><small>{t.privateHint}</small></span></label><label className={form.shared_with_team?'selected':''}><input type="radio" checked={form.shared_with_team} onChange={()=>setForm({...form,shared_with_team:true})}/><span>♧ <strong>{t.shared}</strong><small>{t.sharedHint}</small></span></label></fieldset>
  </div><footer><button type="button" disabled={busy} onClick={()=>{setForm(null);setSelectedFile(null)}}>{t.cancel}</button><button type="submit" className="work-primary" disabled={busy}>{busy?t.uploading:t.save}</button></footer></form></div>}
  {folderForm&&<div className="work-overlay knowledge-overlay" onMouseDown={e=>{if(e.target===e.currentTarget&&!busy)setFolderForm(null)}}><form role="dialog" aria-modal="true" aria-label={t.newFolder} className="knowledge-folder-form" onSubmit={saveFolder}><header><h2>{folderForm.id?t.editFolder:t.newFolder}</h2><button type="button" onClick={()=>setFolderForm(null)}>×</button></header><label>{t.folderName}<input autoFocus required maxLength={90} value={folderForm.name} onChange={e=>setFolderForm({...folderForm,name:e.target.value})}/></label><label className="knowledge-folder-share"><input type="checkbox" checked={folderForm.shared_with_team} onChange={e=>setFolderForm({...folderForm,shared_with_team:e.target.checked})}/>{t.shared}</label><footer><button type="button" onClick={()=>setFolderForm(null)}>{t.cancel}</button><button className="work-primary" disabled={busy}>{t.save}</button></footer></form></div>}
  {detail&&<div className="work-overlay knowledge-overlay" onMouseDown={e=>{if(e.target===e.currentTarget)setDetail(null)}}><section role="dialog" aria-modal="true" aria-label={isFiles?t.fileDetails:t.noteDetails} className="knowledge-detail"><header><div><small>{isFiles?t.fileDetails:t.noteDetails}</small><h2>{detail.title}</h2></div><button type="button" aria-label={t.cancel} onClick={()=>setDetail(null)}>×</button></header><div className="knowledge-detail-body"><div className="knowledge-detail-meta"><span>{t.author}: {ownerLabel(detail)}</span><span>{t.created}: {dateText(detail.created_at,ar)}</span><span>{t.updated}: {dateText(detail.updated_at,ar)}</span><span className={'knowledge-status '+(detail.shared_with_team?'team':'private')}>{detail.shared_with_team?t.team:t.private}</span></div>{detail.body&&<p className="knowledge-detail-text">{detail.body}</p>}{detail.file_path&&<><div className="knowledge-detail-file"><span className={'knowledge-format '+fileKind(detail.file_name)}>{fileBadge(detail.file_name)}</span><strong>{detail.file_name}</strong><span>{sizeText(detail.file_size||0)}</span><button type="button" onClick={()=>download(detail)}>{t.download} ↓</button></div>{previewUrl&&fileKind(detail.file_name)==='images'&&<img className="knowledge-image-preview" src={previewUrl} alt={detail.file_name}/>}{previewUrl&&extOf(detail.file_name)==='pdf'&&<iframe className="knowledge-pdf-preview" src={previewUrl} title={detail.file_name}/>}</>}</div><footer>{permission(detail)&&<><button type="button" onClick={()=>remove(detail)} disabled={busy}>{t.delete}</button><button type="button" onClick={()=>{setDetail(null);startNote(detail)}} disabled={busy}>{t.edit}</button></>}<button type="button" className="work-primary" onClick={()=>setDetail(null)}>{t.cancel}</button></footer></section></div>}
 </div>;
}
