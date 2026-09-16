export const SECTIONS = ['sim','assets','purchasing','reports','exports','administration'];

export function canAccessPage(user, section) {
  if (!user || user.status !== 'active' || !SECTIONS.includes(section)) return false;
  if (user.role === 'company_admin') return true;
  return user.permissions?.[section] === true;
}

export function can(user, action, section = 'sim') {
  if (!canAccessPage(user, section)) return false;
  if (user.role === 'company_admin') return true;
  return action === 'read' || (['operator','manager'].includes(user.role) && ['write','export'].includes(action));
}

export function usePermission(user) {
  return {
    can: (action, section) => can(user, action, section),
    canAccessPage: section => canAccessPage(user, section),
    isAdmin: user?.role === 'company_admin',
    organizationId: user?.organization_id,
    organizationName: user?.organization_name,
  };
}
