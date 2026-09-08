export default function AuditLogPanel({ t, log, onClose }) {
  const isAr = t.dir === 'rtl';

  const actionColor = {
    added:   'bg-emerald-500/15 text-emerald-400 border-emerald-500/25',
    edited:  'bg-blue-500/15 text-blue-400 border-blue-500/25',
    deleted: 'bg-red-500/15 text-red-400 border-red-500/25',
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" dir={t.dir}>
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-3xl glass bg-[#0a1220]/97 border border-slate-700/50 rounded-2xl shadow-2xl fade-up overflow-hidden max-h-[88vh] flex flex-col">
        <div className="h-0.5 w-full bg-gradient-to-r from-transparent via-amber-400 to-transparent shrink-0" />

        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-700/40 shrink-0">
          <div className="flex items-center gap-2">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="w-5 h-5 text-amber-400">
              <path d="M12 20h9M16.5 3.5a2.121 2.121 0 013 3L7 19l-4 1 1-4L16.5 3.5z"/>
            </svg>
            <h3 className="text-white font-semibold text-lg">{t.auditLog}</h3>
            <span className="text-xs px-2 py-0.5 rounded-lg bg-slate-700 text-slate-400">{log.length}</span>
          </div>
          <button onClick={onClose} className="text-slate-500 hover:text-slate-300">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-5 h-5">
              <path d="M18 6L6 18M6 6l12 12"/>
            </svg>
          </button>
        </div>

        <div className="overflow-y-auto flex-1">
          {log.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 text-slate-500 gap-3">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="w-10 h-10 opacity-30">
                <path d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2"/><rect x="9" y="3" width="6" height="4" rx="1"/>
              </svg>
              <span>{t.auditEmpty}</span>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="sticky top-0">
                  <tr className="bg-slate-800/80 text-slate-400 text-xs uppercase tracking-wider backdrop-blur">
                    <th className="px-4 py-3 font-medium text-start">{t.audit.time}</th>
                    <th className="px-4 py-3 font-medium text-start">{t.audit.action}</th>
                    <th className="px-4 py-3 font-medium text-start">{t.audit.device}</th>
                    <th className="px-4 py-3 font-medium text-start">{t.audit.oldVal}</th>
                    <th className="px-4 py-3 font-medium text-start">{t.audit.newVal}</th>
                    <th className="px-4 py-3 font-medium text-start">{t.audit.user}</th>
                  </tr>
                </thead>
                <tbody>
                  {[...log].reverse().map((entry, i) => (
                    <tr key={i} className="border-t border-slate-700/30 hover:bg-slate-700/15 transition-colors">
                      <td className="px-4 py-3 text-xs text-slate-500 whitespace-nowrap font-mono">
                        {new Date(entry.time).toLocaleString(isAr ? 'ar-SA' : 'en-US')}
                      </td>
                      <td className="px-4 py-3">
                        <span className={`text-xs px-2.5 py-1 rounded-lg border font-medium ${actionColor[entry.action] || 'bg-slate-700 text-slate-400 border-slate-600'}`}>
                          {t.audit[entry.action] || entry.action}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-slate-200 font-medium text-sm">{entry.deviceName}</td>
                      <td className="px-4 py-3 text-xs text-slate-500 max-w-[140px]">
                        {entry.oldVal
                          ? <span className="line-through text-red-400/70">{entry.oldVal}</span>
                          : <span className="text-slate-600">—</span>
                        }
                      </td>
                      <td className="px-4 py-3 text-xs text-emerald-400/80 max-w-[140px]">
                        {entry.newVal || <span className="text-slate-600">—</span>}
                      </td>
                      <td className="px-4 py-3">
                        <div>
                          <p className="text-slate-300 text-xs font-medium">{entry.userName}</p>
                          {entry.userEmail && <p className="text-slate-600 text-xs">{entry.userEmail}</p>}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
