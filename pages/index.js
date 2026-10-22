import {useEffect,useState} from 'react';
import Head from 'next/head';
import {useRouter} from 'next/router';
import {useAuth} from '../components/AuthContext';
import LoginPage from '../components/LoginPage';
import UsersPanel from '../components/UsersPanel';
import WorkspaceModule from '../components/WorkspaceModule';
import GlobalEmployeeSearch from '../components/GlobalEmployeeSearch';
import ExportCenter from '../components/ExportCenter';
import IntakeDashboard from '../components/IntakeDashboard';
import SubscriptionsPanel from '../components/SubscriptionsPanel';
import MonitoringPanel from '../components/MonitoringPanel';
import InventoryPanel from '../components/InventoryPanel';
import WorkspaceSidebar from '../components/WorkspaceSidebar';
import WorkspaceTopbar from '../components/WorkspaceTopbar';
import HomePanel from '../components/HomePanel';
import NotesPanel from '../components/NotesPanel';
import FilesPanel from '../components/FilesPanel';
import {T} from '../lib/data';
import {canAccessPage} from '../lib/rbac';
import {storageGet,storageSet} from '../lib/browserStorage';
import {supabase} from '../lib/supabase';
import {clearHomeCache} from '../lib/home-cache';
const navigation=[['home','Home','الصفحة الرئيسية'],['report','Technical Reports','البلاغات'],['device_request','Device Requests','طلبات الأجهزة'],['purchasing','Purchasing','المشتريات'],['assets','Devices','الأجهزة التقنية'],['sim','SIM Cards','شرائح الاتصال'],['inventory','IT Inventory','المخزون التقني'],['subscriptions','Subscriptions','إدارة الاشتراكات'],['monitoring','Website Monitoring','مراقبة المواقع'],['notes','Notes','الملاحظات'],['files','Files','الملفات'],['reports','Reports','التقارير'],['exports','Export Center','مركز التصدير'],['administration','Administration','الإدارة']];
export default function NetExpert(){
 const {user,ready,recoveryMode,profileError,retryProfile,logout,logoutAll}=useAuth(),router=useRouter();const [lang,setLang]=useState('en'),[menu,setMenu]=useState(false),[mobileOpen,setMobileOpen]=useState(false),[workspaces,setWorkspaces]=useState([]),[users,setUsers]=useState(false),[searchOpen,setSearchOpen]=useState(false),[error,setError]=useState('');const ar=lang==='ar',t=T[lang],page=typeof router.query.module==='string'?router.query.module:'sim';
 useEffect(()=>{const stored=storageGet('localStorage','ne_language');if(stored==='ar')setLang(stored)},[]);
 useEffect(()=>{if(!menu||!user?.id)return;let active=true;supabase.rpc('list_my_workspaces').then(({data,error})=>{if(error)throw error;if(active)setWorkspaces(data||[])}).catch(e=>{if(active)setError(e.message)});return()=>{active=false}},[menu,user?.id]);
 const allowed=user?navigation.filter(([key])=>key==='home'?user.status==='active':canAccessPage(user,key)):[];const accessible=allowed.some(([key])=>key===page);
 const go=key=>{setMobileOpen(false);return router.push({pathname:'/',query:{module:key}},undefined,{shallow:true})};
 const signout=async all=>{setError('');try{await(all?logoutAll():logout())}catch(e){setError(e.message)}};
 const switchWorkspace=async e=>{setError('');const {error}=await supabase.rpc('select_my_workspace',{workspace_id:e.target.value});if(error){setError(error.message);return}clearHomeCache();window.location.assign('/')};
 if(!ready)return <div className="work-empty" role="status">Loading workspace…</div>;
 if(!user||recoveryMode)return <LoginPage t={t}/>;
 if(user.accountLoading)return <div className="work-empty" dir={ar?'rtl':'ltr'}>{profileError?<><p role="alert">{ar?'تعذر تحميل صلاحيات الحساب. تحقق من الاتصال ثم حاول مجددًا.':'Could not load account permissions. Check your connection and try again.'}</p><button onClick={()=>retryProfile().catch(()=>{})}>{ar?'إعادة المحاولة':'Try again'}</button></>:<p role="status">{ar?'جارٍ تحميل حسابك وصلاحياتك…':'Loading your account and permissions…'}</p>}</div>;
return <div className="workspace-app" dir={ar?'rtl':'ltr'}><Head><title>Net Expert — IT Asset Management</title></Head><WorkspaceSidebar ar={ar} page={page} organizationName={user.organization_name} navigation={navigation} onNavigate={go} mobileOpen={mobileOpen}/>{mobileOpen&&<button type="button" className="workspace-mobile-scrim" aria-label={ar?'إغلاق القائمة':'Close menu'} onClick={()=>setMobileOpen(false)}/>}<div className="workspace-main"><WorkspaceTopbar ar={ar} user={user} pageLabel={navigation.find(n=>n[0]===page)?.[ar?2:1]||'—'} menu={menu} workspaces={workspaces} onSearch={()=>{setMenu(false);setSearchOpen(true)}} onLanguage={()=>{const next=ar?'en':'ar';setLang(next);storageSet('localStorage','ne_language',next)}} onMenu={()=>setMenu(!menu)} onMobileMenu={()=>setMobileOpen(value=>!value)} onWorkspace={switchWorkspace} onLogout={signout} onLogoutAll={signout}/>{error&&<p role="alert" className="work-error">{error}</p>}<main>{!accessible?<div className="work-page"><h1>{ar?'غير مصرح لك':'Not authorized'}</h1><p>{ar?'غير مصرح لك بدخول هذا القسم.':'You are not authorized to access this section.'}</p>{allowed[0]&&<button onClick={()=>go(allowed[0][0])}>{ar?'فتح مساحة العمل':'Open workspace'}</button>}</div>:page==='home'?<HomePanel user={user} ar={ar} navigation={allowed.filter(([key])=>key!=='home')} onNavigate={go}/>:page==='notes'?<NotesPanel user={user} ar={ar}/>:page==='files'?<FilesPanel user={user} ar={ar}/>:['sim','assets','purchasing'].includes(page)?<WorkspaceModule key={`${user.organization_id}-${page}`} module={page} user={user} ar={ar}/>:['report','device_request'].includes(page)?<IntakeDashboard key={`${user.organization_id}-${page}`} kind={page} user={user} ar={ar}/>:page==='subscriptions'?<SubscriptionsPanel user={user} ar={ar}/>:page==='monitoring'?<MonitoringPanel user={user} ar={ar}/>:page==='inventory'?<InventoryPanel user={user} ar={ar}/>:page==='exports'||page==='reports'?<ExportCenter key={page} t={t} reports={page==='reports'}/>:<div className="work-page"><header className="work-heading"><div><small>{user.organization_name}</small><h1>{ar?'الإدارة':'Administration'}</h1><p>{ar?'إدارة أعضاء الشركة وصلاحيات الوصول.':'Manage company members and access permissions.'}</p></div></header><section className="work-admin"><h2>{ar?'المستخدمون والصلاحيات':'Users & permissions'}</h2><p>{ar?'امنح الوصول للأقسام حسب مسؤوليات الموظف.':'Grant section access according to each employee’s responsibilities.'}</p><button className="work-primary" onClick={()=>setUsers(true)}>{ar?'إدارة المستخدمين':'Manage users'}</button></section></div>}</main></div>{searchOpen&&<GlobalEmployeeSearch key={user.organization_id} user={user} ar={ar} allowedModules={allowed.map(([key])=>key)} onClose={()=>setSearchOpen(false)}/>} {users&&<UsersPanel t={t} onClose={()=>setUsers(false)}/>}</div>
}
