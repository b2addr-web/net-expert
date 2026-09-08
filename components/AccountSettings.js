import { useState } from 'react';
import { useAuth } from './AuthContext';
import { addAuditEntry } from '../lib/db';

export default function AccountSettings({ t, onClose }) {
  const { user, users, updatePassword } = useAuth();
  const [oldPw,  setOldPw]  = useState('');
  const [newPw,  setNewPw]  = useState('');
  const [confPw, setConfPw] = useState('');
  const [msg,    setMsg]    = useState('');
  const [loading, setLoading] = useState(false);
  const [showOld, setShowOld] = useState(false);
  const [showNew, setShowNew] = useState(false);

  const isAr = t.dir === 'rtl';

  const inputCls = `w-full rounded-xl px-4 py-3 text-sm outline-none transition-colors
    dark:bg-slate-900/70 dark:border-slate-700/60 dark:text-slate-100 dark:placeholder-slate-600 dark:focus:border-cyan-500/60
    bg-white border-slate-200 text-slate-800 placeholder-slate-400 focus:border-cyan-500
    border`;

  const handleChange = async () => {
    setMsg('');
    if (!newPw || newPw.length < 6) { setMsg(t.passwordShort); return; }
    if (newPw !== confPw) { setMsg(t.passwordMismatch); return; }

    setLoading(true);

    // التحقق من كلمة المرور القديمة
    const currentUser = users.find(u => u.id === user.id);
    if (!currentUser || currentUser.password !== oldPw) {
      setMsg(t.passwordError);
      setLoading(false);
      return;
    }

    try {
      // تحديث كلمة المرور
      updatePassword(user.id, newPw);

      // سجل العمليات
      await addAuditEntry({
        time: new Date().toISOString(), action: 'passwordChanged',
        deviceName: user.username, deviceId: String(user.id),
        oldVal: '••••••••', newVal: '••••••••',
        userName: user.name || user.username, userEmail: user.email || '',
      });

      setMsg(t.passwordChanged);
      setOldPw(''); setNewPw(''); setConfPw('');
    } catch (e) {
      setMsg('✗ ' + e.message);
    }
    setLoading(false);
  };

  const EyeBtn = ({ show, onToggle }) => (
    <button type="button" onClick={onToggle}
      className={`absolute top-1/2 -translate-y-1/2 dark:text-slate-500 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 ${isAr ? 'left-3' : 'right-3'}`}>
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-4 h-4">
        {show
          ? <><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"/><path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"/><path d="M1 1l22 22"/></>
          : <><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></>
        }
      </svg>
    </button>
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" dir={t.dir}>
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-md dark:bg-[#0a1220]/97 bg-white border dark:border-slate-700/50 border-slate-200 rounded-2xl shadow-2xl fade-up overflow-hidden">
        <div className="h-0.5 w-full bg-gradient-to-r from-transparent via-violet-500 to-transparent" />

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b dark:border-slate-700/40 border-slate-100">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl dark:bg-violet-500/15 bg-violet-50 border dark:border-violet-500/25 border-violet-200 flex items-center justify-center">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="w-5 h-5 text-violet-400">
                <circle cx="12" cy="8" r="4"/><path d="M4 20c0-4 3.6-7 8-7s8 3 8 7"/>
              </svg>
            </div>
            <div>
              <h3 className="dark:text-white text-slate-800 font-semibold">{t.accountSettings}</h3>
              <p className="dark:text-slate-500 text-slate-400 text-xs">{user?.name || user?.username}</p>
            </div>
          </div>
          <button onClick={onClose} className="dark:text-slate-500 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-5 h-5">
              <path d="M18 6L6 18M6 6l12 12"/>
            </svg>
          </button>
        </div>

        {/* User info card */}
        <div className="px-6 pt-5">
          <div className="p-3 rounded-xl dark:bg-slate-800/40 bg-slate-50 border dark:border-slate-700/30 border-slate-200 flex items-center gap-3 mb-5">
            <div className="w-9 h-9 rounded-lg dark:bg-cyan-500/15 bg-cyan-50 border dark:border-cyan-500/25 border-cyan-200 flex items-center justify-center">
              <span className="text-cyan-400 font-bold text-sm">{(user?.name || user?.username || 'U').charAt(0).toUpperCase()}</span>
            </div>
            <div className="flex-1 min-w-0">
              <p className="dark:text-slate-200 text-slate-700 text-sm font-medium truncate">{user?.name || user?.username}</p>
              <p className="dark:text-slate-500 text-slate-400 text-xs">{user?.email || '—'}</p>
            </div>
            <span className={`text-xs px-2 py-0.5 rounded-lg font-medium ${user?.role==='admin' ? 'dark:bg-cyan-500/15 bg-cyan-50 text-cyan-400 border dark:border-cyan-500/20 border-cyan-200' : 'dark:bg-slate-700 bg-slate-100 dark:text-slate-400 text-slate-500'}`}>
              {user?.role==='admin' ? t.admin : t.viewer}
            </span>
          </div>
        </div>

        {/* Change Password form */}
        <div className="px-6 pb-6 space-y-3">
          <h4 className="dark:text-slate-300 text-slate-600 text-sm font-semibold flex items-center gap-2">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-4 h-4 text-violet-400">
              <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>
            </svg>
            {t.changePassword}
          </h4>

          {/* Old password */}
          <div className="relative">
            <input type={showOld ? 'text' : 'password'} value={oldPw} onChange={e => setOldPw(e.target.value)}
              placeholder={t.oldPassword} className={`${inputCls} ${isAr ? 'ps-4 pe-10' : 'ps-4 pe-10'}`} />
            <EyeBtn show={showOld} onToggle={() => setShowOld(v => !v)} />
          </div>

          {/* New password */}
          <div className="relative">
            <input type={showNew ? 'text' : 'password'} value={newPw} onChange={e => setNewPw(e.target.value)}
              placeholder={t.newPassword} className={inputCls} />
            <EyeBtn show={showNew} onToggle={() => setShowNew(v => !v)} />
          </div>

          {/* Confirm */}
          <div className="relative">
            <input type={showNew ? 'text' : 'password'} value={confPw} onChange={e => setConfPw(e.target.value)}
              placeholder={t.confirmPassword} className={inputCls} />
          </div>

          {/* Password strength indicator */}
          {newPw && (
            <div className="space-y-1">
              <div className="flex gap-1">
                {[1,2,3,4].map(i => (
                  <div key={i} className={`flex-1 h-1 rounded-full transition-colors ${
                    newPw.length >= i * 3
                      ? i <= 1 ? 'bg-red-400' : i <= 2 ? 'bg-amber-400' : i <= 3 ? 'bg-yellow-400' : 'bg-emerald-400'
                      : 'dark:bg-slate-700 bg-slate-200'
                  }`} />
                ))}
              </div>
              <p className="text-xs dark:text-slate-500 text-slate-400">
                {newPw.length < 6 ? (isAr ? 'ضعيفة جداً' : 'Too short') :
                 newPw.length < 8 ? (isAr ? 'ضعيفة' : 'Weak') :
                 newPw.length < 12 ? (isAr ? 'متوسطة' : 'Medium') : (isAr ? 'قوية' : 'Strong')}
              </p>
            </div>
          )}

          {/* Message */}
          {msg && (
            <div className={`text-xs px-3 py-2.5 rounded-lg border ${
              msg.startsWith('✓')
                ? 'dark:bg-emerald-500/10 bg-emerald-50 dark:border-emerald-500/20 border-emerald-200 text-emerald-500'
                : 'dark:bg-red-500/10 bg-red-50 dark:border-red-500/20 border-red-200 text-red-500'
            }`}>{msg}</div>
          )}

          <div className={`flex gap-3 pt-1 ${isAr ? 'flex-row-reverse' : ''}`}>
            <button onClick={onClose} className="flex-1 py-2.5 rounded-xl text-sm dark:bg-slate-700/60 bg-slate-100 dark:hover:bg-slate-600/70 hover:bg-slate-200 dark:text-slate-300 text-slate-600 transition-colors">
              {t.cancel}
            </button>
            <button onClick={handleChange} disabled={loading}
              className="flex-1 py-2.5 rounded-xl text-sm font-semibold bg-violet-500 hover:bg-violet-400 disabled:opacity-60 text-white transition-all shadow-lg shadow-violet-500/20 active:scale-95">
              {loading ? '...' : t.save}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
