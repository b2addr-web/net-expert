import {useEffect,useState} from 'react';
import Head from 'next/head';
import {useRouter} from 'next/router';
import LoginPage from '../components/LoginPage';
import {useAuth} from '../components/AuthContext';
import {T} from '../lib/data';

export default function ResetPasswordPage(){
  const router=useRouter(),{ready,recoveryMode}=useAuth();
  const [lang,setLang]=useState('en');
  useEffect(()=>{if(localStorage.getItem('ne_language')==='ar')setLang('ar')},[]);
  if(!ready)return <div className="work-empty" role="status">Loading…</div>;
  if(!recoveryMode)return <main className="work-empty" dir={lang==='ar'?'rtl':'ltr'}><Head><title>Reset password — Net Expert</title></Head><h1>{lang==='ar'?'رابط الاستعادة غير صالح أو منتهي':'Recovery link is invalid or expired'}</h1><button onClick={()=>router.replace('/')}>{lang==='ar'?'العودة لتسجيل الدخول':'Back to sign in'}</button></main>;
  return <><Head><title>Reset password — Net Expert</title></Head><LoginPage t={T[lang]} initialMode="newPassword" onPasswordUpdated={()=>router.replace('/')}/></>;
}
