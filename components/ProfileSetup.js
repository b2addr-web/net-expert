import { useState } from 'react';
import { useAuth } from './AuthContext';

export default function ProfileSetup({ t }) {
  const { user, completeProfile, logout } = useAuth();
  const [fullName, setFullName] = useState('');
  const [department, setDepartment] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const isAr = t.dir === 'rtl';

  const submit = async (event) => {
    event.preventDefault();
    setLoading(true);
    setError('');
    try {
      await completeProfile({ fullName: fullName.trim(), department });
    } catch {
      setError(isAr ? 'تعذر حفظ الملف الشخصي. حاول مجددًا.' : 'Could not save your profile. Try again.');
    } finally {
      setLoading(false);
    }
  };

  return <main className="profile-setup" dir={t.dir}>
    <section>
      <header><span className="profile-mark">NE</span><b>Net Expert</b></header>
      <div className="profile-heading"><p>{isAr?'خطوة أخيرة':'ONE LAST STEP'}</p><h1>{isAr?'أكمل ملفك الشخصي':'Complete your profile'}</h1><span>{isAr?'سنستخدم هذه المعلومات لتنظيم المسؤوليات وسير العمل.':'We use this information to organize ownership and workflows.'}</span></div>
      <form onSubmit={submit}>
        <div className="login-field"><label htmlFor="profile-email">{isAr?'البريد الإلكتروني':'Email'}</label><input id="profile-email" value={user.email||''} disabled/></div>
        <div className="login-field"><label htmlFor="full-name">{isAr?'الاسم الكامل':'Full name'}</label><input id="full-name" value={fullName} onChange={e=>setFullName(e.target.value)} autoComplete="name" autoFocus required/></div>
        <div className="login-field"><label htmlFor="department">{isAr?'القسم':'Department'}</label><select id="department" value={department} onChange={e=>setDepartment(e.target.value)} required><option value="">{isAr?'اختر القسم':'Select department'}</option><option value="it">Information Technology</option><option value="network">Network Operations</option><option value="systems">Systems Engineering</option><option value="finance">Finance</option><option value="asset_control">Asset Control</option></select></div>
        {error&&<div className="login-error" role="alert">{error}</div>}
        <div className="profile-actions"><button type="button" onClick={logout}>{isAr?'تسجيل الخروج':'Sign out'}</button><button className="login-submit" disabled={loading||!fullName.trim()||!department}>{loading?(isAr?'جارٍ الحفظ…':'Saving…'):(isAr?'الدخول إلى مساحة العمل':'Continue to workspace')}</button></div>
      </form>
      <footer>{isAr?'سيكون دورك الافتراضي «مشاهد». يمكن للمشرف فقط تغيير الصلاحيات.':'Your default role is Viewer. Only an administrator can change access.'}</footer>
    </section>
  </main>;
}
