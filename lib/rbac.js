/**
 * rbac.js — نظام التحكم في الوصول بناءً على الأدوار والأقسام
 * Role-Based Access Control
 */

// ── تعريف الصلاحيات ──────────────────────────────────────────────────────────
export const PERMISSIONS = {
  // الصفحات المسموح بها لكل قسم
  pages: {
    admin:   ['dashboard', 'inventory', 'finance', 'audit', 'users', 'settings', 'account'],
    it:      ['dashboard', 'inventory', 'audit', 'account'],
    finance: ['dashboard', 'finance', 'audit', 'account'],
  },

  // العمليات المسموح بها
  actions: {
    admin:   ['read', 'write', 'delete', 'export', 'manage_users', 'change_password'],
    it:      ['read', 'write', 'delete', 'export', 'change_password'],
    finance: ['read', 'write', 'delete', 'export', 'change_password'],
  },
};

// ── دالة التحقق من الصلاحية ──────────────────────────────────────────────────
export function can(user, action) {
  if (!user) return false;
  const dept = user.role === 'admin' ? 'admin' : (user.department || 'it');
  return PERMISSIONS.actions[dept]?.includes(action) ?? false;
}

// ── دالة التحقق من الوصول للصفحة ────────────────────────────────────────────
export function canAccessPage(user, page) {
  if (!user) return false;
  const dept = user.role === 'admin' ? 'admin' : (user.department || 'it');
  return PERMISSIONS.pages[dept]?.includes(page) ?? false;
}

// ── دالة الحصول على القسم المعروض ───────────────────────────────────────────
export function getDeptLabel(dept, t) {
  return t?.departments?.[dept] || dept;
}

// ── Hook للتحقق من الصلاحية ──────────────────────────────────────────────────
export function usePermission(user) {
  return {
    can:           (action) => can(user, action),
    canAccessPage: (page)   => canAccessPage(user, page),
    isAdmin:       user?.role === 'admin',
    isIT:          user?.department === 'it' || user?.role === 'admin',
    isFinance:     user?.department === 'finance' || user?.role === 'admin',
    dept:          user?.role === 'admin' ? 'admin' : (user?.department || 'it'),
  };
}
