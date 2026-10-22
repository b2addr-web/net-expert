import {useEffect,useState} from 'react';
import Head from 'next/head';
import {useRouter} from 'next/router';
import LoginPage from '../components/LoginPage';
import AccountShell from '../components/AccountShell';
import {useAuth} from '../components/AuthContext';
import {storageGet} from '../lib/browserStorage';
import {T} from '../lib/data';

export default function ResetPasswordPage(){
  const router=useRouter(),{ready,recoveryMode}=useAuth();
  const [lang,setLang]=useState('en');
  useEffect(()=>{if(storageGet('localStorage','ne_language')==='ar')setLang('ar')},[]);
  if(!ready)return <AccountShell ar={lang==='ar'}><div className="login-heading"><h2>{lang==='ar'?'جارٍ فتح الحساب…':'Opening your account…'}</h2></div><p role="status" className="login-flow-message">{lang==='ar'?'جارٍ التحقق من الرابط.':'Checking your link.'}</p></AccountShell>;
  if(!recoveryMode)return <><Head><title>Reset password — NetExpert</title></Head><AccountShell ar={lang==='ar'}><div className="login-heading"><p className="login-step-label">NetExpert</p><h2>{lang==='ar'?'رابط الاستعادة غير صالح أو منتهي':'Recovery link is invalid or expired'}</h2></div><button className="login-submit" onClick={()=>router.replace('/')}>{lang==='ar'?'العودة لتسجيل الدخول':'Back to sign in'}</button></AccountShell></>;
  return <><Head><title>Reset password — NetExpert</title></Head><LoginPage t={T[lang]} initialMode="newPassword" onPasswordUpdated={()=>router.replace('/')}/></>;
}
