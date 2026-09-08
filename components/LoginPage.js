import { useState } from 'react';
import { useAuth } from './AuthContext';

export default function LoginPage({ t }) {
  const { login } = useAuth();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError]       = useState('');
  const [loading, setLoading]   = useState(false);
  const [showPass, setShowPass] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    await new Promise(r => setTimeout(r, 600));
    const ok = login(username, password);
    if (!ok) setError(t.wrongCreds);
    setLoading(false);
  };

  return (
    <div className="min-h-screen bg-[#060d1a] flex items-center justify-center px-4" dir={t.dir}>
      {/* Animated background */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="absolute inset-0 opacity-[0.03]"
          style={{ backgroundImage: 'linear-gradient(to right,#3b82f6 1px,transparent 1px),linear-gradient(to bottom,#3b82f6 1px,transparent 1px)', backgroundSize: '48px 48px' }} />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] rounded-full"
          style={{ background: 'radial-gradient(circle, rgba(6,182,212,0.08) 0%, transparent 70%)' }} />
        <div className="absolute top-20 right-20 w-32 h-32 rounded-full border border-cyan-500/10 spin-slow" />
        <div className="absolute bottom-20 left-20 w-48 h-48 rounded-full border border-violet-500/10 spin-slow" style={{ animationDirection: 'reverse', animationDuration: '12s' }} />
      </div>

      <div className="relative w-full max-w-md fade-up">
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-cyan-500/10 border border-cyan-500/25 mb-4 mx-auto">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" className="w-8 h-8 text-cyan-400">
              <circle cx="12" cy="12" r="3"/>
              <path d="M12 1v4M12 19v4M4.22 4.22l2.83 2.83M16.95 16.95l2.83 2.83M1 12h4M19 12h4M4.22 19.78l2.83-2.83M16.95 7.05l2.83-2.83"/>
            </svg>
          </div>
          <h1 className="text-2xl font-bold text-white shimmer-text">{t.appName}</h1>
          <p className="text-slate-500 text-sm mt-1">{t.appSub}</p>
        </div>

        {/* Card */}
        <div className="glass bg-slate-800/40 border border-slate-700/50 rounded-2xl p-8 shadow-2xl">
          <h2 className="text-white font-semibold text-lg mb-6">{t.login}</h2>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-slate-400 text-xs font-medium mb-1.5">{t.username}</label>
              <input
                value={username} onChange={e => setUsername(e.target.value)}
                className="w-full bg-slate-900/70 border border-slate-700/60 text-slate-100 rounded-xl px-4 py-3 text-sm outline-none focus:border-cyan-500/60 transition-colors placeholder-slate-600"
                placeholder="admin"
                autoComplete="username"
              />
            </div>
            <div>
              <label className="block text-slate-400 text-xs font-medium mb-1.5">{t.password}</label>
              <div className="relative">
                <input
                  type={showPass ? 'text' : 'password'}
                  value={password} onChange={e => setPassword(e.target.value)}
                  className="w-full bg-slate-900/70 border border-slate-700/60 text-slate-100 rounded-xl px-4 py-3 text-sm outline-none focus:border-cyan-500/60 transition-colors placeholder-slate-600"
                  placeholder="••••••••"
                  autoComplete="current-password"
                />
                <button type="button" onClick={() => setShowPass(v => !v)}
                  className={`absolute top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300 ${t.dir === 'rtl' ? 'left-3' : 'right-3'}`}>
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-4 h-4">
                    {showPass
                      ? <><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"/><path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"/><path d="M1 1l22 22"/></>
                      : <><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></>
                    }
                  </svg>
                </button>
              </div>
            </div>
            {error && (
              <div className="bg-red-500/10 border border-red-500/25 text-red-400 text-xs rounded-lg px-3 py-2.5">
                {error}
              </div>
            )}
            <button type="submit" disabled={loading}
              className="w-full py-3 rounded-xl bg-cyan-500 hover:bg-cyan-400 disabled:opacity-60 text-white font-semibold transition-all shadow-lg shadow-cyan-500/25 active:scale-95 mt-2">
              {loading
                ? <span className="inline-flex items-center gap-2 justify-center">
                    <svg className="w-4 h-4 animate-spin" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83"/>
                    </svg>
                    ...
                  </span>
                : t.loginBtn
              }
            </button>
          </form>

        </div>
      </div>
    </div>
  );
}
