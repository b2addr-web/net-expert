export const SECTIONS = ['dashboard','assets','operations','contracts','procurement','reports','users','settings'];

export function canAccessPage(user, section) {
  if (!user || user.status !== 'active') return false;
  if (user.role === 'company_admin') return true;
  return user.permissions?.[section] === true;
}

export function can(user, action, section = 'dashboard') {
  if (!canAccessPage(user, section)) return false;
  if (user.role === 'company_admin') return true;
  return action === 'read' || (user.role === 'operator' && ['write','export'].includes(action));
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
