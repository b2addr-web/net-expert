import { useState } from 'react';

export default function SettingsPanel({ t, sheetsUrl, onSave, onClose }) {
  const [url, setUrl] = useState(sheetsUrl || '');

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" dir={t.dir}>
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-lg glass bg-[#0f1929]/95 border border-slate-700/50 rounded-2xl shadow-2xl fade-up overflow-hidden">
        <div className="h-0.5 w-full bg-gradient-to-r from-transparent via-emerald-500 to-transparent" />
        <div className="p-6">
          <div className="flex items-center justify-between mb-6">
            <h3 className="text-white font-semibold text-lg">{t.settings}</h3>
            <button onClick={onClose} className="text-slate-500 hover:text-slate-300">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-5 h-5">
                <path d="M18 6L6 18M6 6l12 12"/>
              </svg>
            </button>
          </div>

          <div className="space-y-4">
            <div>
              <label className="block text-slate-400 text-xs font-medium mb-1.5">{t.sheetsUrl}</label>
              <input value={url} onChange={e => setUrl(e.target.value)}
                placeholder={t.sheetsPlaceholder}
                className="w-full bg-slate-900/70 border border-slate-700/60 text-slate-100 rounded-xl px-4 py-3 text-xs outline-none focus:border-emerald-500/60 transition-colors placeholder-slate-600 font-mono" />
            </div>

            {/* Instructions */}
            <div className="p-4 rounded-xl bg-slate-800/40 border border-slate-700/30 text-xs text-slate-400 space-y-1.5">
              <p className="text-slate-300 font-medium mb-2">
                {t.dir === 'rtl' ? 'كيفية الإعداد:' : 'Setup Instructions:'}
              </p>
              {[
                t.dir === 'rtl' ? '١. افتح Google Sheets وأنشئ جدولاً جديداً' : '1. Open Google Sheets and create a new spreadsheet',
                t.dir === 'rtl' ? '٢. افتح Apps Script (Extensions > Apps Script)' : '2. Open Apps Script (Extensions > Apps Script)',
                t.dir === 'rtl' ? '٣. الصق الكود المرفق في ملف README.md' : '3. Paste the code from README.md',
                t.dir === 'rtl' ? '٤. انشر كـ Web App واضبط الصلاحية على "Anyone"' : '4. Deploy as Web App, access: "Anyone"',
                t.dir === 'rtl' ? '٥. انسخ رابط النشر والصقه هنا' : '5. Copy the deployment URL and paste it here',
              ].map((s, i) => <p key={i}>{s}</p>)}
            </div>
          </div>

          <div className={`flex gap-3 mt-6 ${t.dir === 'rtl' ? 'flex-row-reverse' : ''}`}>
            <button onClick={onClose} className="flex-1 py-2.5 rounded-xl text-sm bg-slate-700/60 text-slate-300 hover:bg-slate-600/70">
              {t.cancel}
            </button>
            <button onClick={() => { onSave(url); onClose(); }}
              className="flex-1 py-2.5 rounded-xl text-sm font-semibold bg-emerald-500 hover:bg-emerald-400 text-white shadow-lg shadow-emerald-500/20 active:scale-95">
              {t.save}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
