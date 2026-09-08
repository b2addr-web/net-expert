import { useState } from 'react';
import { useAuth } from './AuthContext';

export default function UsersPanel({ t, onClose }) {
  const { users, addUser, removeUser, user: me } = useAuth();
  const [form, setForm] = useState({ username: '', password: '', name: '', role: 'viewer' });
  const [adding, setAdding] = useState(false);

  const inputCls = 'w-full bg-slate-900/70 border border-slate-700/60 text-slate-100 rounded-xl px-3 py-2 text-sm outline-none focus:border-cyan-500/60 transition-colors';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" dir={t.dir}>
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-lg glass bg-[#0f1929]/95 border border-slate-700/50 rounded-2xl shadow-2xl fade-up overflow-hidden">
        <div className="h-0.5 w-full bg-gradient-to-r from-transparent via-violet-500 to-transparent" />
        <div className="p-6">
          <div className="flex items-center justify-between mb-6">
            <h3 className="text-white font-semibold text-lg">{t.users}</h3>
            <button onClick={onClose} className="text-slate-500 hover:text-slate-300">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-5 h-5">
                <path d="M18 6L6 18M6 6l12 12"/>
              </svg>
            </button>
          </div>

          {/* User list */}
          <div className="space-y-2 mb-4 max-h-52 overflow-y-auto">
            {users.map(u => (
              <div key={u.id} className="flex items-center gap-3 p-3 rounded-xl bg-slate-800/40 border border-slate-700/40">
                <div className={`w-8 h-8 rounded-lg flex items-center justify-center text-xs font-bold ${u.role === 'admin' ? 'bg-cyan-500/20 text-cyan-400' : 'bg-slate-700 text-slate-400'}`}>
                  {(u.name || u.username).charAt(0).toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-slate-200 text-sm font-medium truncate">{u.name || u.username}</p>
                  <p className="text-slate-500 text-xs">@{u.username}</p>
                </div>
                <span className={`text-xs px-2 py-0.5 rounded-lg ${u.role === 'admin' ? 'bg-cyan-500/15 text-cyan-400' : 'bg-slate-700 text-slate-400'}`}>
                  {u.role === 'admin' ? t.admin : t.viewer}
                </span>
                {u.id !== me?.id && (
                  <button onClick={() => removeUser(u.id)} className="text-slate-600 hover:text-red-400 transition-colors">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-4 h-4">
                      <path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6"/>
                    </svg>
                  </button>
                )}
              </div>
            ))}
          </div>

          {/* Add user form */}
          {adding ? (
            <div className="space-y-3 p-4 rounded-xl bg-slate-800/30 border border-slate-700/40">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-400 text-xs mb-1">{t.username}</label>
                  <input value={form.username} onChange={e => setForm(p => ({ ...p, username: e.target.value }))} className={inputCls} />
                </div>
                <div>
                  <label className="block text-slate-400 text-xs mb-1">{t.password}</label>
                  <input type="password" value={form.password} onChange={e => setForm(p => ({ ...p, password: e.target.value }))} className={inputCls} />
                </div>
                <div>
                  <label className="block text-slate-400 text-xs mb-1">{t.role}</label>
                  <select value={form.role} onChange={e => setForm(p => ({ ...p, role: e.target.value }))} className={inputCls}>
                    <option value="viewer">{t.viewer}</option>
                    <option value="admin">{t.admin}</option>
                  </select>
                </div>
                <div>
                  <label className="block text-slate-400 text-xs mb-1">{t.dir === 'rtl' ? 'الاسم الكامل' : 'Full Name'}</label>
                  <input value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))} className={inputCls} />
                </div>
              </div>
              <div className={`flex gap-2 ${t.dir === 'rtl' ? 'flex-row-reverse' : ''}`}>
                <button onClick={() => setAdding(false)} className="flex-1 py-2 rounded-lg text-xs bg-slate-700 text-slate-300 hover:bg-slate-600">{t.cancel}</button>
                <button onClick={() => {
                  if (form.username && form.password) { addUser(form); setForm({ username:'',password:'',name:'',role:'viewer' }); setAdding(false); }
                }} className="flex-1 py-2 rounded-lg text-xs bg-cyan-500 text-white hover:bg-cyan-400 font-semibold">{t.save}</button>
              </div>
            </div>
          ) : (
            <button onClick={() => setAdding(true)}
              className="w-full py-2.5 rounded-xl border border-dashed border-slate-600 text-slate-400 hover:border-cyan-500/50 hover:text-cyan-400 text-sm transition-colors flex items-center justify-center gap-2">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-4 h-4">
                <path d="M12 5v14M5 12h14"/>
              </svg>
              {t.addUser}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
