import { test, expect } from '@playwright/test';
import { randomUUID } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';

const apiUrl = process.env.SUPABASE_LOCAL_URL;
const appUrl = process.env.NETEXPERT_LOCAL_APP_URL;
if (process.env.NEXT_PUBLIC_SECURITY_TEST_MODE !== '1'
  || !/^http:\/\/127\.0\.0\.1:55431$/.test(apiUrl || '')
  || !/^http:\/\/127\.0\.0\.1:3013$/.test(appUrl || '')
  || !process.env.SUPABASE_LOCAL_SERVICE_ROLE_KEY) {
  throw new Error('Real Auth browser tests require the guarded local Supabase runner.');
}

const service = createClient(apiUrl, process.env.SUPABASE_LOCAL_SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
const suffix = randomUUID().slice(0, 8);
const password = `Phase4H-${randomUUID()}!`;
const state = { users: {}, organizations: {}, items: {} };

test.beforeAll(async () => {
  for (const name of ['adminA', 'viewerA', 'adminB']) {
    const created = await service.auth.admin.createUser({ email: `phase4h-browser-${name}-${suffix}@example.test`, password, email_confirm: true });
    expect(created.error).toBeNull(); state.users[name] = created.data.user;
    const own = await service.from('organizations').select('id').eq('created_by', created.data.user.id).single();
    expect(own.error).toBeNull(); state.organizations[name] = own.data.id;
  }
  const membership = await service.from('organization_members').insert({ organization_id: state.organizations.adminA, user_id: state.users.viewerA.id, role: 'viewer', status: 'active' });
  expect(membership.error).toBeNull();
  const preference = await service.from('user_workspace_preferences').upsert({ user_id: state.users.viewerA.id, organization_id: state.organizations.adminA });
  expect(preference.error).toBeNull();
  const permission = await service.from('member_permissions').upsert({ organization_id: state.organizations.adminA, user_id: state.users.viewerA.id, section: 'inventory', allowed: true });
  expect(permission.error).toBeNull();
  for (const [name, organization] of [['a', state.organizations.adminA], ['b', state.organizations.adminB]]) {
    const item = await service.from('inventory_items').insert({ organization_id: organization, name: `Phase4H browser item ${name} ${suffix}`, category: 'Test', brand: 'Test', quantity: 1 }).select('id').single();
    expect(item.error).toBeNull(); state.items[name] = item.data.id;
  }
});

test.afterAll(async () => {
  const owned = await service.from('organizations').select('id').in('created_by', Object.values(state.users).map(user => user.id));
  if (!owned.error) for (const row of owned.data || []) await service.from('organizations').delete().eq('id', row.id);
  for (const user of Object.values(state.users)) if (user?.id) await service.auth.admin.deleteUser(user.id);
});

test('real local browser login enforces viewer read-only, tenant isolation, admin edit, and logout', async ({ page }) => {
  test.setTimeout(60000);
  const attemptedExternal = [];
  await page.route('**/*', route => {
    const target = new URL(route.request().url());
    if (target.protocol === 'data:' || target.protocol === 'blob:' || target.hostname === '127.0.0.1' || target.hostname === 'localhost') return route.continue();
    attemptedExternal.push(target.origin); return route.abort();
  });
  await page.goto(`${appUrl}/?auth=login&module=inventory`);
  await page.getByLabel('Email address').fill(state.users.viewerA.email);
  await page.getByLabel('Password', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page.locator('.workspace-app')).toBeVisible({ timeout: 30000 });
  await expect(page.getByText(`Phase4H browser item a ${suffix}`, { exact: true })).toBeVisible();
  await expect(page.getByText(`Phase4H browser item b ${suffix}`, { exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: /Add item/ })).toHaveCount(0);
  await page.goto(`${appUrl}/?module=administration`);
  await expect(page.getByRole('heading', { name: 'Not authorized' })).toBeVisible();

  await page.locator('.enterprise-account-trigger').click();
  await page.getByRole('menu').getByRole('button', { name: 'Sign out', exact: true }).click();
  await page.goto(`${appUrl}/?auth=login&module=inventory`);
  await expect(page.getByLabel('Email address')).toBeVisible({ timeout: 30000 });
  await page.getByLabel('Email address').fill(state.users.adminA.email);
  await page.getByLabel('Password', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page.getByRole('button', { name: /Add item/ })).toBeVisible({ timeout: 30000 });
  await page.getByRole('button', { name: /Add item/ }).click();
  await page.getByLabel('Item name').fill(`Phase4H browser created ${suffix}`);
  await page.getByLabel('Manufacturer').fill('Local Test');
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(page.getByText(`Phase4H browser created ${suffix}`, { exact: true })).toBeVisible();
  const created = await service.from('inventory_items').select('organization_id').eq('name', `Phase4H browser created ${suffix}`).single();
  expect(created.error).toBeNull(); expect(created.data.organization_id).toBe(state.organizations.adminA);
  expect(attemptedExternal.filter(origin => origin.includes('supabase.co'))).toEqual([]);
});
