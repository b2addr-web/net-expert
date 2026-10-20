import {useEffect,useState} from 'react';
import {storageGet,storageSet} from '../lib/browserStorage';

export const sidebarGroups=[
 {key:'operations',en:'Operations',ar:'العمليات',icon:'operations',items:['report','device_request','purchasing']},
 {key:'assets',en:'Assets & inventory',ar:'الأصول والمخزون',icon:'assets',items:['assets','sim','inventory']},
 {key:'services',en:'Services & monitoring',ar:'الخدمات والمتابعة',icon:'services',items:['subscriptions','monitoring']},
 {key:'knowledge',en:'Knowledge & documentation',ar:'المعرفة والتوثيق',icon:'knowledge',items:['notes']},
 {key:'management',en:'Reports & administration',ar:'التقارير والإدارة',icon:'management',items:['reports','exports','administration']},
];

const iconPaths={
 home:<><path d="m3 10 9-7 9 7v10a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1z"/><path d="M9 21v-8h6v8"/></>,
 operations:<><rect x="4" y="4" width="16" height="16" rx="2"/><path d="M8 9h8M8 13h8M8 17h5"/></>,
 assets:<><rect x="3" y="4" width="18" height="13" rx="2"/><path d="M8 21h8M12 17v4M7 8h10"/></>,
 services:<><path d="M3 12h3l2-5 4 10 2-5h7"/><circle cx="12" cy="12" r="9"/></>,
 knowledge:<><path d="M12 6c-2-1-5-2-9-1v15c4-1 7 0 9 1 2-1 5-2 9-1V5c-4-1-7 0-9 1ZM12 6v15"/></>,
 management:<><path d="M4 20V10M9 20V4M14 20v-7M19 20V8M2 20h20"/></>,
 report:<><path d="M7 3h10l4 4v14H3V3h4ZM17 3v5h4M7 12h10M7 16h7"/></>,
 device_request:<><rect x="3" y="4" width="18" height="13" rx="2"/><path d="M8 21h8M12 17v4M12 8v5M9.5 10.5h5"/></>,
 purchasing:<><path d="M3 5h2l2 11h12l2-8H6M9 20h.01M17 20h.01"/></>,
 sim:<><rect x="5" y="2" width="14" height="20" rx="2"/><path d="M9 7h6M9 11h6M9 15h6"/></>,
 inventory:<><path d="m3 7 9-4 9 4v10l-9 4-9-4zM3 7l9 4 9-4M12 11v10"/></>,
 subscriptions:<><path d="M4 7h16v13H4zM8 3v8M16 3v8M4 11h16M8 15h4"/></>,
 monitoring:<><circle cx="12" cy="12" r="9"/><path d="M3 12h4l2-3 3 6 2-3h7"/></>,
 notes:<><path d="M5 3h10l4 4v14H5zM15 3v4h4M8 12h8M8 16h6"/></>,
 reports:<><path d="M4 20V9M10 20V4M16 20v-8M22 20H2"/></>,
 exports:<><path d="M12 3v12m-4-4 4 4 4-4M4 17v4h16v-4"/></>,
 administration:<><circle cx="12" cy="8" r="3"/><path d="M5 21v-2a7 7 0 0 1 14 0v2z"/></>,
};

function NavIcon({name}){return <svg className="sidebar-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{iconPaths[name]||iconPaths.operations}</svg>}

export default function WorkspaceSidebar({ar,page,organizationName,navigation,onNavigate}){
 const labels=Object.fromEntries(navigation.map(([key,en,arabic])=>[key,ar?arabic:en]));
 const activeGroup=sidebarGroups.find(group=>group.items.includes(page))?.key;
 const [open,setOpen]=useState(()=>activeGroup?{[activeGroup]:true}:{});
 const [collapsed,setCollapsed]=useState(false);
 const [mobile,setMobile]=useState(false);
 useEffect(()=>{setCollapsed(storageGet('localStorage','ne_sidebar_collapsed')==='true')},[]);
 useEffect(()=>{const query=window.matchMedia('(max-width:700px)');const sync=()=>setMobile(query.matches);sync();query.addEventListener('change',sync);return()=>query.removeEventListener('change',sync)},[]);
 useEffect(()=>{if(activeGroup)setOpen(current=>({...current,[activeGroup]:true}))},[activeGroup]);
 const toggleCollapse=()=>{const next=!collapsed;setCollapsed(next);storageSet('localStorage','ne_sidebar_collapsed',String(next))};
 const visibleGroups=sidebarGroups.filter(group=>group.items.some(item=>labels[item]));
 const compact=collapsed&&!mobile;
 return <aside className={`workspace-sidebar sidebar-organized${compact?' sidebar-collapsed':''}`}>
  <a href="/?module=home" className="workspace-brand" title="Net Expert"><b>NE</b><span>Net Expert<small>{organizationName}</small></span></a>
  <nav aria-label={ar?'التنقل':'Workspace navigation'}>
   {labels.home&&<button type="button" className={`sidebar-home${page==='home'?' active':''}`} aria-current={page==='home'?'page':undefined} title={ar?'الصفحة الرئيسية':'Home'} onClick={()=>onNavigate('home')}><NavIcon name="home"/><span className="sidebar-text">{labels.home}</span></button>}
   {visibleGroups.map(group=>{const active=group.key===activeGroup,expanded=open[group.key]||active,children=group.items.filter(item=>labels[item]);return <div className={`sidebar-group${active?' has-active':''}`} key={group.key}>
    <button type="button" className="sidebar-group-toggle" aria-expanded={expanded} aria-controls={`sidebar-group-${group.key}`} title={ar?group.ar:group.en} onClick={()=>{if(compact){setCollapsed(false);storageSet('localStorage','ne_sidebar_collapsed','false')}setOpen(current=>({...current,[group.key]:active?true:!current[group.key]}))}}><NavIcon name={group.icon}/><span className="sidebar-text">{ar?group.ar:group.en}</span><span className="sidebar-chevron" aria-hidden="true">⌄</span></button>
    <div id={`sidebar-group-${group.key}`} className={`sidebar-children${expanded?' is-open':''}`} aria-hidden={compact||!expanded}><div className="sidebar-children-inner">{children.map(item=><button type="button" key={item} tabIndex={compact||!expanded?-1:0} aria-current={page===item?'page':undefined} className={`sidebar-child${page===item?' active':''}`} onClick={()=>onNavigate(item)}><NavIcon name={item}/><span>{labels[item]}</span></button>)}</div></div>
   </div>})}
  </nav>
  <button type="button" className="sidebar-collapse-control" aria-label={collapsed?(ar?'توسيع القائمة':'Expand sidebar'):(ar?'طي القائمة':'Collapse sidebar')} title={collapsed?(ar?'توسيع القائمة':'Expand sidebar'):(ar?'طي القائمة':'Collapse sidebar')} onClick={toggleCollapse}><span aria-hidden="true">{collapsed?'»':'«'}</span><span className="sidebar-text">{ar?'طي القائمة':'Collapse sidebar'}</span></button>
 </aside>
}
