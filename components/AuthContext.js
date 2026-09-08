import { createContext, useContext, useState, useEffect } from 'react';

// ── بيانات الدخول الثابتة — تشتغل على أي جهاز ──────────────
const USERS = [
  { id:1, username:'Badr',    password:'BADR050982538', role:'admin',  name:'Badr',         email:'admin@netexpert.com' },
  { id:2, username:'viewer1', password:'view123',       role:'viewer', name:'موظف التقنية', email:'it@netexpert.com'    },
];

const SESSION_KEY = 'ne_session_v4';
const EXTRA_USERS_KEY = 'ne_extra_users';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user,       setUser]       = useState(null);
  const [extraUsers, setExtraUsers] = useState([]);
  const [ready,      setReady]      = useState(false);

  useEffect(() => {
    try {
      // تحميل الجلسة الحالية
      const raw = localStorage.getItem(SESSION_KEY);
      if (raw) setUser(JSON.parse(raw));
      // تحميل المستخدمين المضافين يدوياً
      const extra = localStorage.getItem(EXTRA_USERS_KEY);
      if (extra) setExtraUsers(JSON.parse(extra));
    } catch { /* ignore */ }
    setReady(true);
  }, []);

  // كل المستخدمين = الثابتين + المضافين
  const allUsers = [...USERS, ...extraUsers];

  const login = (username, password) => {
    const found = allUsers.find(
      u => u.username === username && u.password === password
    );
    if (!found) return false;
    const safe = { id:found.id, username:found.username, name:found.name, role:found.role, email:found.email||'' };
    setUser(safe);
    try { localStorage.setItem(SESSION_KEY, JSON.stringify(safe)); } catch {}
    return true;
  };

  const logout = () => {
    setUser(null);
    try { localStorage.removeItem(SESSION_KEY); } catch {}
  };

  const addUser = (u) => {
    const newUser = { ...u, id: Date.now() };
    const next = [...extraUsers, newUser];
    setExtraUsers(next);
    try { localStorage.setItem(EXTRA_USERS_KEY, JSON.stringify(next)); } catch {}
  };

  const removeUser = (id) => {
    // لا يمكن حذف المستخدمين الأساسيين
    if (USERS.find(u => u.id === id)) return;
    const next = extraUsers.filter(u => u.id !== id);
    setExtraUsers(next);
    try { localStorage.setItem(EXTRA_USERS_KEY, JSON.stringify(next)); } catch {}
  };

  const updatePassword = (id, newPassword) => {
    // تحديث كلمة المرور للمستخدمين المضافين
    const next = extraUsers.map(u => u.id === id ? { ...u, password: newPassword } : u);
    setExtraUsers(next);
    try { localStorage.setItem(EXTRA_USERS_KEY, JSON.stringify(next)); } catch {}
    // تحديث الجلسة لو كان هو المستخدم الحالي
    if (user?.id === id) {
      const updated = { ...user };
      setUser(updated);
      try { localStorage.setItem(SESSION_KEY, JSON.stringify(updated)); } catch {}
    }
  };

  return (
    <AuthContext.Provider value={{
      user, users: allUsers, login, logout,
      addUser, removeUser, updatePassword, ready,
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
