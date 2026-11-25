import Head from 'next/head';
import {useEffect,useState} from 'react';
import AccountShell from '../components/AccountShell';
import PlatformOwnerPanel from '../components/PlatformOwnerPanel';
import {commerceRequest,ownerClient} from '../lib/commerce-client';
import {ownerPortalEnabled} from '../lib/owner-portal-host';

export function getServerSideProps({req,res}) {
 res.setHeader('Cache-Control','private, no-store');
 if(!ownerPortalEnabled(req.headers.host))return {notFound:true};
 return {props:{}};
}

export default function OwnerPortal() {
 const [ar,setAr]=useState(true),[phase,setPhase]=useState('loading');
 const [email,setEmail]=useState(''),[password,setPassword]=useState(''),[code,setCode]=useState('');
 const [busy,setBusy]=useState(false),[error,setError]=useState('');
 const [factors,setFactors]=useState([]),[factorId,setFactorId]=useState('');
 const [setup,setSetup]=useState(null);
 const t=(arabic,english)=>ar?arabic:english;

 function clearMfa() {
  setCode('');setSetup(null);setFactors([]);setFactorId('');
 }

 async function checkAccess() {
  try {
   const access=await commerceRequest('?mode=access');
   if(!access.mfaRequired){clearMfa();setPhase('dashboard');return}
   const {data,error}=await ownerClient().auth.mfa.listFactors();
   if(error)throw error;
   const confirmed=(data.totp||[]).filter(factor=>factor.status==='verified');
   setSetup(null);setCode('');setFactors(confirmed);setFactorId(confirmed[0]?.id||'');
   setPhase(confirmed.length?'verify':'setup');
  }catch(e){
   if(e.message==='NOT_AUTHORIZED'){
    await ownerClient().auth.signOut({scope:'local'});
    clearMfa();setError('OWNER_ONLY');
   }else setError('AUTH_UNAVAILABLE');
   setPhase('signIn');
  }
 }

 useEffect(()=>{
  const auth=ownerClient().auth;
  auth.getSession().then(({data})=>data.session?checkAccess():setPhase('signIn')).catch(()=>{
   setError('AUTH_UNAVAILABLE');setPhase('signIn');
  });
  const {data:{subscription}}=auth.onAuthStateChange(event=>{
   if(event==='SIGNED_OUT'){clearMfa();setPhase('signIn')}
  });
  const recheck=()=>{setPhase('loading');void checkAccess()};
  window.addEventListener('netexpert-owner-access-changed',recheck);
  return ()=>{subscription.unsubscribe();window.removeEventListener('netexpert-owner-access-changed',recheck)};
 },[]);

 async function signIn(event) {
  event.preventDefault();setBusy(true);setError('');
  try {
   const {error}=await ownerClient().auth.signInWithPassword({email:email.trim().toLowerCase(),password});
   if(error){setError('BAD_LOGIN');return}
   await checkAccess();
  }catch{setError('AUTH_UNAVAILABLE')}
  finally{setPassword('');setBusy(false)}
 }

 async function enroll() {
  setBusy(true);setError('');
  try {
   const mfa=ownerClient().auth.mfa;
   const previous=await mfa.listFactors();
   if(previous.error)throw previous.error;
   for(const factor of previous.data.all.filter(f=>f.status==='unverified'&&f.friendly_name==='NetExpert Owner Portal')){
    const removed=await mfa.unenroll({factorId:factor.id});
    if(removed.error)throw removed.error;
   }
   const {data,error}=await mfa.enroll({factorType:'totp',friendlyName:'NetExpert Owner Portal'});
   if(error)throw error;
   const uri=data.totp.qr_code;
   setSetup({secret:data.totp.secret,qr:uri.startsWith('data:image/')?uri:'data:image/svg+xml,'+encodeURIComponent(uri)});
   setFactorId(data.id);setCode('');setPhase('verify');
  }catch{setError('MFA_SETUP_FAILED')}
  finally{setBusy(false)}
 }

 async function verify(event) {
  event.preventDefault();setBusy(true);setError('');
  try {
   const {error}=await ownerClient().auth.mfa.challengeAndVerify({factorId,code});
   if(error){setError('INVALID_CODE');return}
   await checkAccess();
  }catch{setError('AUTH_UNAVAILABLE')}
  finally{setCode('');setBusy(false)}
 }

 async function signOut() {
  setError('');setPhase('loading');
  try{
   const {error}=await ownerClient().auth.signOut({scope:'local'});
   if(error)throw error;
   clearMfa();setPhase('signIn');
  }catch{setError('AUTH_UNAVAILABLE');setPhase('signOutFailed')}
 }

 const messages={
  BAD_LOGIN:t('تحقق من البريد وكلمة المرور.','Check your email and password.'),
  OWNER_ONLY:t('هذا الحساب لا يملك صلاحية مالك المنصة.','This account does not have platform owner access.'),
  AUTH_UNAVAILABLE:t('تعذر التحقق من الجلسة. حاول مرة أخرى.','Could not verify the session. Try again.'),
  MFA_SETUP_FAILED:t('تعذر إعداد تطبيق المصادقة. حاول مرة أخرى.','Could not set up the authenticator. Try again.'),
  INVALID_CODE:t('الرمز غير صالح أو منتهي. أدخل أحدث رمز.','The code is invalid or expired. Enter the latest code.')
 };
 return <>
  <Head><title>{t('بوابة المالك','Owner portal')} | NetExpert</title><meta name="robots" content="noindex,nofollow"/></Head>
  {phase==='dashboard'?<main className="owner-portal" dir={ar?'rtl':'ltr'}>
   <header className="enterprise-topbar owner-portal-bar"><strong>NetExpert</strong>
    <div className="enterprise-topbar-actions">
     <button className="enterprise-language" onClick={()=>setAr(!ar)}>{t('EN','ع')}</button>
     <button className="work-primary" onClick={signOut}>{t('تسجيل الخروج','Sign out')}</button>
    </div>
   </header>
   <PlatformOwnerPanel ar={ar}/>
  </main>:<AccountShell ar={ar} onLanguage={()=>setAr(!ar)}>
   <h2>{phase==='verify'||phase==='setup'?t('المصادقة الثنائية','Two-factor authentication'):t('دخول مالك المنصة','Platform owner sign-in')}</h2>
   {error&&<p className="work-error" role="alert">{messages[error]}</p>}
   {phase==='loading'&&<p role="status">{t('جارٍ التحقق من الجلسة…','Checking your session…')}</p>}
   {phase==='signOutFailed'&&<button className="login-submit" onClick={signOut}>{t('إعادة محاولة تسجيل الخروج','Retry sign out')}</button>}
   {phase==='signIn'&&<form onSubmit={signIn}>
    <div className="login-field"><label htmlFor="owner-email">{t('البريد الإلكتروني','Email address')}</label>
     <input id="owner-email" type="email" autoComplete="username" required value={email} onChange={e=>setEmail(e.target.value)}/></div>
    <div className="login-field"><label htmlFor="owner-password">{t('كلمة المرور','Password')}</label>
     <input id="owner-password" type="password" autoComplete="current-password" required value={password} onChange={e=>setPassword(e.target.value)}/></div>
    <button className="login-submit" disabled={busy}>{t('تسجيل الدخول','Sign in')}</button>
   </form>}
   {phase==='setup'&&<>
    <p>{t('أضف تطبيق مصادقة قبل فتح لوحة المالك.','Set up an authenticator app before accessing the dashboard.')}</p>
    <button className="login-submit" disabled={busy} onClick={enroll}>{t('إعداد تطبيق المصادقة','Set up authenticator')}</button>
   </>}
   {phase==='verify'&&<form onSubmit={verify}>
    {setup&&<div className="owner-mfa-setup">
     <p>{t('امسح رمز QR بتطبيق المصادقة، أو أدخل مفتاح الإعداد يدويًا.','Scan the QR code or enter the setup key in your authenticator app.')}</p>
     <img src={setup.qr} width="160" height="160" alt={t('رمز إعداد المصادقة','Authenticator setup QR code')}/>
     <code dir="ltr">{setup.secret}</code>
    </div>}
    {factors.length>1&&<label>{t('تطبيق المصادقة','Authenticator')}<select value={factorId} onChange={e=>setFactorId(e.target.value)}>
     {factors.map((factor,i)=><option key={factor.id} value={factor.id}>{factor.friendly_name||t('تطبيق','Authenticator')+' '+(i+1)}</option>)}
    </select></label>}
    <div className="login-field"><label htmlFor="owner-code">{t('رمز المصادقة','Authenticator code')}</label>
     <input id="owner-code" inputMode="numeric" autoComplete="one-time-code" type="text" required pattern="[0-9]{6}" maxLength={6}
      value={code} onChange={e=>setCode(e.target.value.replace(/\D/g,''))}/></div>
    <button className="login-submit" disabled={busy||code.length!==6}>{t('تحقق','Verify')}</button>
   </form>}
   {['setup','verify'].includes(phase)&&<button className="login-back" disabled={busy} onClick={signOut}>{t('تسجيل الخروج','Sign out')}</button>}
  </AccountShell>}
 </>;
}
OwnerPortal.ownerPortal=true;
