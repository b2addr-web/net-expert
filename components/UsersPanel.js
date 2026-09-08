import { useEffect, useState } from 'react';
import { useAuth } from './AuthContext';

const roles = ['viewer', 'it', 'finance', 'admin'];

export default function UsersPanel({ t, onClose }) {
  const { users, refreshUsers, updateUserRole, user: me } = useAuth();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState('');
  const [error, setError] = useState('');
  const ar = t.dir === 'rtl';

  useEffect(() => {
    refreshUsers().catch(() => setError(ar ? 'تعذر تحميل الحسابات.' : 'Could not load accounts.')).finally(() => setLoading(false));
  }, []);

  const change = async (id, role) => {
    setSaving(id); setError('');
    try { await updateUserRole(id, role); }
    catch { setError(ar ? 'تعذر تحديث الدور.' : 'Could not update the role.'); }
    finally { setSaving(''); }
  };

  const roleLabel = role => role === 'admin' ? (ar ? 'مسؤول' : 'Administrator') : role === 'finance' ? (ar ? 'المالية' : 'Finance') : role === 'it' ? (ar ? 'تقنية المعلومات' : 'IT staff') : (ar ? 'مشاهد' : 'Viewer');

  return <div className="account-dialog" dir={t.dir}>
    <button className="account-dialog-backdrop" onClick={onClose} aria-label={ar ? 'إغلاق' : 'Close'} />
    <section className="account-panel">
      <header><div><p>{ar ? 'إدارة المؤسسة' : 'ORGANIZATION ADMINISTRATION'}</p><h2>{ar ? 'المستخدمون والصلاحيات' : 'Users and access'}</h2><span>{ar ? 'الحسابات المفعلة والأدوار الممنوحة داخل Net Expert.' : 'Activated accounts and roles granted within Net Expert.'}</span></div><button onClick={onClose} aria-label={ar ? 'إغلاق' : 'Close'}>×</button></header>
      {error && <div className="login-error">{error}</div>}
      <div className="account-table">
        <div className="account-table-head"><span>{ar ? 'المستخدم' : 'User'}</span><span>{ar ? 'الحالة' : 'Status'}</span><span>{ar ? 'الدور' : 'Role'}</span></div>
        {loading ? <p className="account-empty">{ar ? 'جارٍ تحميل الحسابات…' : 'Loading accounts…'}</p> : users.length === 0 ? <p className="account-empty">{ar ? 'لا توجد حسابات متاحة.' : 'No accounts are available.'}</p> : users.map(u => <div className="account-row" key={u.id}>
          <div><i>{(u.full_name || u.email || 'U').slice(0, 2).toUpperCase()}</i><span><b>{u.full_name || (ar ? 'مستخدم بدون اسم' : 'Unnamed user')}</b><small>{u.email}</small></span></div>
          <span className={'account-status ' + u.status}>{u.status === 'suspended' ? (ar ? 'موقوف' : 'Suspended') : (ar ? 'نشط' : 'Active')}</span>
          <select value={u.role} disabled={saving === u.id || u.id === me.id} onChange={e => change(u.id, e.target.value)} aria-label={ar ? 'دور المستخدم' : 'User role'}>{roles.map(role => <option key={role} value={role}>{roleLabel(role)}</option>)}</select>
        </div>)}
      </div>
      <footer><p>{ar ? 'الحسابات الجديدة تبدأ دائماً بدور «مشاهد». لا يستطيع المستخدم تعديل دوره بنفسه.' : 'New accounts always start as Viewer. Users cannot change their own role.'}</p><button onClick={onClose}>{ar ? 'إغلاق' : 'Close'}</button></footer>
    </section>
  </div>;
}
