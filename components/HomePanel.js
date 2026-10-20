import {sidebarGroups} from './WorkspaceSidebar';

export default function HomePanel({user,ar,navigation,onNavigate}){
 const labels=Object.fromEntries(navigation.map(([key,en,arabic])=>[key,ar?arabic:en]));
 return <div className="work-page home-panel" dir={ar?'rtl':'ltr'}>
  <header className="work-heading"><div><small>{user.organization_name}</small><h1>{ar?'الصفحة الرئيسية':'Home'}</h1><p>{ar?'انتقل مباشرة إلى الأقسام المتاحة لك.':'Open the sections available to you.'}</p></div></header>
  <div className="home-groups">{sidebarGroups.map(group=>{const items=group.items.filter(key=>labels[key]);return items.length?<section key={group.key}><h2>{ar?group.ar:group.en}</h2><div>{items.map(key=><button key={key} onClick={()=>onNavigate(key)}>{labels[key]} <span aria-hidden="true">←</span></button>)}</div></section>:null})}</div>
 </div>
}
