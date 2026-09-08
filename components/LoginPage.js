import { useEffect, useState } from 'react';
import { useAuth } from './AuthContext';

const capabilities = [
  { en: 'Managed Assets', ar: 'إدارة الأصول' },
  { en: 'Active Contracts', ar: 'العقود والتغطية' },
  { en: 'Maintenance Tasks', ar: 'أعمال الصيانة' },
];

function ProductMark() {
  return <span className="login-product-mark" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M5 7.5 12 3.5l7 4v8l-7 4-7-4v-8Z"/><path d="m5 7.5 7 4 7-4M12 11.5v8"/></svg></span>;
}

function formatTime(seconds) {
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
}

export default function LoginPage({ t }) {
  const { requestOtp, verifyOtp, configured } = useAuth();
  const [step, setStep] = useState('email');
  const [email, setEmail] = useState('');
  const [otp, setOtp] = useState('');
  const [remember, setRemember] = useState(true);
  const [seconds, setSeconds] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const isAr = t.dir === 'rtl';

  useEffect(() => {
    if (!seconds) return undefined;
    const timer = window.setInterval(() => setSeconds((value) => Math.max(0, value - 1)), 1000);
    return () => window.clearInterval(timer);
  }, [seconds]);

  const messageFor = (exception) => {
    if (exception?.message === 'AUTH_NOT_CONFIGURED') return isAr ? 'لم يتم إعداد خدمة تسجيل الدخول بعد.' : 'Authentication has not been configured.';
    if (exception?.status === 429) return isAr ? 'طلبات كثيرة. انتظر قليلًا ثم حاول مجددًا.' : 'Too many attempts. Wait before trying again.';
    return isAr ? 'تعذر إكمال الطلب. تحقق من البيانات وحاول مجددًا.' : 'We could not complete the request. Check your details and try again.';
  };

  const sendCode = async (event) => {
    event?.preventDefault();
    setError('');
    setLoading(true);
    try {
      await requestOtp(email.trim().toLowerCase(), remember);
      setStep('otp');
      setOtp('');
      setSeconds(60);
    } catch (exception) {
      setError(messageFor(exception));
    } finally {
      setLoading(false);
    }
  };

  const confirmCode = async (event) => {
    event.preventDefault();
    setError('');
    setLoading(true);
    try {
      await verifyOtp(email.trim().toLowerCase(), otp);
    } catch (exception) {
      setError(messageFor(exception));
    } finally {
      setLoading(false);
    }
  };

  return <main className="login-shell" dir="ltr">
    <section className="login-product" dir={t.dir} aria-labelledby="product-title">
      <div className="login-product-inner">
        <header className="login-brand"><ProductMark/><span>Net Expert</span></header>
        <div className="login-proposition">
          <p className="login-eyebrow">ENTERPRISE ASSET OPERATIONS</p>
          <h1 id="product-title">Net Expert</h1>
          <p className="login-subtitle">Asset Operations Platform</p>
          <p className="login-description">{isAr?'مساحة موحدة لإدارة دورة حياة الأصول التقنية والعقود وأعمال الصيانة عبر المؤسسة.':'One operational system for technology assets, contracts, and maintenance across your organization.'}</p>
        </div>
        <ul className="login-capabilities" aria-label={isAr?'قدرات المنصة':'Platform capabilities'}>
          {capabilities.map((item,index)=><li key={item.en}><span>0{index+1}</span>{isAr?item.ar:item.en}</li>)}
        </ul>
        <footer className="login-product-footer"><span>{isAr?'بيئة المؤسسة':'Enterprise workspace'}</span><span>{isAr?'وصول آمن بدون كلمة مرور':'Secure passwordless access'}</span></footer>
      </div>
    </section>

    <section className="login-access" dir={t.dir} aria-labelledby="login-title">
      <div className="login-access-inner">
        <div className="login-mobile-brand"><ProductMark/><span>Net Expert</span></div>
        <div className="login-card">
          <div className="login-heading">
            <p className="login-step-label">{isAr?'حساب المؤسسة':'ORGANIZATION ACCOUNT'}</p>
            <h2 id="login-title">{step==='email'?(isAr?'تسجيل الدخول':'Sign in'):(isAr?'تحقق من بريدك':'Check your email')}</h2>
            <p>{step==='email'?(isAr?'أدخل بريد العمل وسنرسل إليك رمز تحقق لمرة واحدة.':'Enter your work email and we will send a one-time verification code.'):(isAr?`أرسلنا رمزًا إلى ${email}`:`We sent a verification code to ${email}`)}</p>
          </div>

          {step==='email'?<form onSubmit={sendCode} noValidate>
            <div className="login-field"><label htmlFor="email">{isAr?'البريد الإلكتروني للعمل':'Work email'}</label><input id="email" type="email" inputMode="email" value={email} onChange={e=>setEmail(e.target.value)} autoComplete="email" placeholder="name@company.com" autoFocus required/></div>
            <label className="login-remember"><input type="checkbox" checked={remember} onChange={e=>setRemember(e.target.checked)}/><span>{isAr?'تذكر هذا الجهاز':'Remember this device'}</span></label>
            {error&&<div className="login-error" role="alert">{error}</div>}
            <button className="login-submit" type="submit" disabled={loading||!email.includes('@')}>{loading?(isAr?'جارٍ إرسال الرمز…':'Sending code…'):(isAr?'متابعة':'Continue')}</button>
          </form>:<form onSubmit={confirmCode} noValidate>
            <div className="login-field"><label htmlFor="otp">{isAr?'رمز التحقق':'Verification code'}</label><input id="otp" className="login-otp" inputMode="numeric" autoComplete="one-time-code" maxLength="6" value={otp} onChange={e=>setOtp(e.target.value.replace(/\D/g,'').slice(0,6))} placeholder="000000" autoFocus required/></div>
            <div className="login-code-actions"><button type="button" onClick={()=>{setStep('email');setError('')}}>{isAr?'تغيير البريد':'Change email'}</button><span>{seconds?`${isAr?'إعادة الإرسال خلال':'Resend in'} ${formatTime(seconds)}`:<button type="button" onClick={sendCode} disabled={loading}>{isAr?'إرسال رمز جديد':'Send new code'}</button>}</span></div>
            {error&&<div className="login-error" role="alert">{error}</div>}
            <button className="login-submit" type="submit" disabled={loading||otp.length!==6}>{loading?(isAr?'جارٍ التحقق…':'Verifying…'):(isAr?'تحقق وتابع':'Verify and continue')}</button>
          </form>}

          {!configured&&<p className="login-config-note">{isAr?'وضع الإعداد: أضف متغيرات Supabase لتفعيل إرسال الرموز.':'Setup mode: add Supabase environment variables to enable email codes.'}</p>}
          <p className="login-support">{isAr?'يخضع الوصول لسياسات الأمان المعتمدة في مؤسستك.':'Access is governed by your organization security policies.'}</p>
        </div>
        <footer className="login-access-footer"><span>© {new Date().getFullYear()} Net Expert</span><span>{isAr?'الخصوصية والأمان':'Privacy & security'}</span></footer>
      </div>
    </section>
  </main>;
}
