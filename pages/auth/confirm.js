import { useEffect, useRef, useState } from 'react';
import Head from 'next/head';
import { useRouter } from 'next/router';
import { useAuth } from '../../components/AuthContext';
import AccountShell from '../../components/AccountShell';
import { storageGet } from '../../lib/browserStorage';

export default function ConfirmRecoveryPage() {
  const router = useRouter();
  const { ready, confirmEmailLink } = useAuth();
  const token = useRef(null);
  const tokenType = useRef(null);
  const loaded = useRef(false);
  const [lang, setLang] = useState('en');
  const [state, setState] = useState('loading');

  useEffect(() => {
    if (loaded.current) return;
    loaded.current = true;
    if (storageGet('localStorage', 'ne_language') === 'ar') setLang('ar');
    const params = new URLSearchParams(window.location.hash.slice(1) || window.location.search);
    const value = params.get('token_hash');
    const type = params.get('type');
    window.history.replaceState(window.history.state, '', window.location.pathname);
    if (['recovery', 'invite'].includes(type)) tokenType.current = type;
    if (['recovery', 'invite'].includes(type) && value && value.length <= 2048) {
      token.current = value;
      setState('ready');
    } else setState('invalid');
  }, []);

  const confirm = async () => {
    if (!token.current || !ready) return;
    setState('verifying');
    try {
      await confirmEmailLink(token.current, tokenType.current);
      token.current = null;
      tokenType.current = null;
      await router.replace('/reset-password');
    } catch {
      token.current = null;
      setState('invalid');
    }
  };

  const ar = lang === 'ar';
  return <><Head><title>{tokenType.current === 'invite' ? (ar ? 'تأكيد دعوة الموظف' : 'Confirm employee invitation') : (ar ? 'تأكيد استعادة كلمة المرور' : 'Confirm password recovery')} — NetExpert</title><meta name="robots" content="noindex,nofollow"/></Head>
    <AccountShell ar={ar}><div className="login-heading"><p className="login-step-label">NetExpert</p><h2>{tokenType.current === 'invite' ? (ar ? 'قبول دعوة NetExpert' : 'Accept your NetExpert invitation') : (ar ? 'استعادة كلمة المرور' : 'Password recovery')}</h2></div>
      {state === 'loading' && <p role="status" className="login-flow-message">{ar ? 'جارٍ فتح الرابط…' : 'Opening the link…'}</p>}
      {state === 'ready' && <><p className="login-flow-message">{ar ? 'اضغط لتأكيد الرابط وفتح نموذج كلمة المرور الجديدة.' : 'Confirm this link to choose a new password.'}</p><button className="login-submit" disabled={!ready} onClick={confirm}>{tokenType.current === 'invite' ? (ar ? 'قبول الدعوة' : 'Accept invitation') : (ar ? 'تأكيد الاستعادة' : 'Confirm recovery')}</button></>}
      {state === 'verifying' && <p role="status" className="login-flow-message">{ar ? 'جارٍ التحقق…' : 'Verifying…'}</p>}
      {state === 'invalid' && <><p role="alert" className="login-error">{ar ? 'الرابط غير صالح أو منتهي الصلاحية أو استُخدم من قبل. اطلب رابطًا جديدًا.' : 'This link is invalid, expired, or already used. Request a new link.'}</p><button className="login-submit" onClick={() => router.replace('/')}>{ar ? 'العودة لتسجيل الدخول' : 'Back to sign in'}</button></>}
    </AccountShell></>;
}
