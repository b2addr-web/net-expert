import {useEffect,useState} from 'react';
import {intakeRequest} from '../lib/intake-client';

export default function IntakeNotificationBell({ar,onOpenCase}) {
 const [inbox,setInbox]=useState({rows:[],unread:0});
 const [open,setOpen]=useState(false),[error,setError]=useState(false);
 useEffect(()=>{
  let active=true;
  async function refresh(){
   try{const result=await intakeRequest('notifications');if(active){setInbox(result);setError(false)}}
   catch{if(active)setError(true)}
  }
  refresh();
  const interval=setInterval(refresh,20000);
  window.addEventListener('focus',refresh);
  return ()=>{active=false;clearInterval(interval);window.removeEventListener('focus',refresh)};
 },[open]);
 async function mark(payload){
  try{await intakeRequest('notifications','PATCH',payload);setInbox(await intakeRequest('notifications'))}
  catch{setError(true)}
 }
 const label=ar?'الإشعارات':'Notifications';
 return <div className="intake-bell" onKeyDown={e=>{if(e.key==='Escape')setOpen(false)}}>
  <button type="button" className="enterprise-language" aria-label={label+' ('+inbox.unread+')'} aria-expanded={open} onClick={()=>setOpen(!open)}>
   <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true"><path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M9 20a3 3 0 0 0 6 0"/></svg>
   {inbox.unread>0&&<span className="intake-bell-count">{inbox.unread>99?'99+':inbox.unread}</span>}
  </button>
  {open&&<section className="workspace-account intake-inbox" aria-label={label}>
   <div className="operations-section-head"><strong>{label}</strong>
    <button disabled={!inbox.unread} onClick={()=>mark({all:true})}>{ar?'قراءة الكل':'Mark all read'}</button></div>
   {error&&<p role="alert">{ar?'تعذر تحديث الإشعارات.':'Could not refresh notifications.'}</p>}
   {!inbox.rows.length&&<p>{ar?'لا توجد إشعارات.':'No notifications.'}</p>}
   {inbox.rows.map(row=><article key={row.id} className={row.readAt?'':'intake-unread'}>
    <a href={row.href} onClick={e=>{
     if(e.button!==0||e.metaKey||e.ctrlKey||e.shiftKey||e.altKey)return;
     e.preventDefault();if(!row.readAt)void mark({id:row.id});setOpen(false);onOpenCase(row.href);
    }}>
     <b>{row.event!=='created'?(ar?'تم إسناد بلاغ إليك':'Report assigned to you'):row.kind==='report'?(ar?'بلاغ تقني جديد':'New technical report'):(ar?'طلب جهاز جديد':'New device request')} · {row.reference}</b>
     <small>{[row.employee,row.department,row.topic].filter(Boolean).join(' · ')}</small>
     <time dateTime={row.createdAt}>{new Date(row.createdAt).toLocaleString(ar?'ar-SA':'en',{dateStyle:'medium',timeStyle:'short'})}</time>
    </a>
    {!row.readAt&&<button onClick={()=>mark({id:row.id})}>{ar?'تحديد كمقروء':'Mark read'}</button>}
   </article>)}
  </section>}
 </div>;
}
