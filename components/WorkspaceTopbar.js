function HeaderIcon({name}){
 const shapes={
  menu:<path d="M4 7h16M4 12h16M4 17h16"/>,
  search:<><circle cx="11" cy="11" r="7"/><path d="m16 16 5 5"/></>,
  chevron:<path d="m6 9 6 6 6-6"/>,
 };
 return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{shapes[name]}</svg>;
}

export default function WorkspaceTopbar({ar,user,pageLabel,menu,workspaces,onSearch,onLanguage,onMenu,onMobileMenu,onWorkspace,onLogout,onLogoutAll}){
 const initial=(user.name||user.email||'N').trim().slice(0,1).toUpperCase();
 return <header className="workspace-top enterprise-topbar">
  <div className="enterprise-topbar-start">
   <button type="button" className="enterprise-mobile-menu" aria-label={ar?'فتح القائمة':'Open menu'} aria-controls="workspace-navigation" onClick={onMobileMenu}><HeaderIcon name="menu"/></button>
   <div className="enterprise-workspace-name"><strong>{user.organization_name||'NetExpert'}</strong><small>{ar?'مساحة العمل':'Workspace'} / {pageLabel}</small></div>
  </div>
  <button type="button" className="workspace-search-button enterprise-search" onClick={onSearch} aria-label={ar?'بحث شامل':'Search all'}><HeaderIcon name="search"/><span>{ar?'بحث شامل في مساحة العمل':'Search workspace'}</span><kbd>Ctrl K</kbd></button>
  <div className="enterprise-topbar-actions">
   <button type="button" className="enterprise-language" onClick={onLanguage} aria-label={ar?'Change language':'تغيير اللغة'}>{ar?'EN':'ع'}</button>
   <button type="button" className="enterprise-account-trigger" onClick={onMenu} aria-expanded={menu} aria-haspopup="menu"><span className="enterprise-avatar">{initial}</span><span className="enterprise-account-name"><strong>{user.name||user.email}</strong><small>{user.email}</small></span><HeaderIcon name="chevron"/></button>
  </div>
  {menu&&<div className="workspace-account enterprise-account-menu" role="menu"><strong>{user.name||user.email}</strong><small>{user.email}</small>{workspaces.length>1&&<label className="workspace-switch-label">{ar?'الشركة':'Workspace'}<select aria-label={ar?'اختيار مساحة العمل':'Select workspace'} value={user.organization_id} onChange={onWorkspace}>{workspaces.map(workspace=><option key={workspace.organization_id} value={workspace.organization_id}>{workspace.organization_name}</option>)}</select></label>}<button type="button" onClick={()=>onLogout(false)}>{ar?'تسجيل الخروج':'Sign out'}</button><button type="button" onClick={()=>onLogoutAll(true)}>{ar?'إنهاء جميع الجلسات':'Sign out all sessions'}</button></div>}
 </header>;
}
