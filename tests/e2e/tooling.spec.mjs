import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

test('Chromium and axe run against an isolated local page', async ({ page }) => {
  await page.setContent(`<!doctype html>
    <html lang="ar" dir="rtl"><head><title>Tooling smoke test</title></head>
    <body><main><h1>اختبار الأدوات</h1><label for="name">الاسم</label>
    <input id="name" type="text"><button type="button">حفظ</button></main></body></html>`);

  await expect(page.getByRole('heading', { name: 'اختبار الأدوات' })).toBeVisible();
  const result = await new AxeBuilder({ page }).analyze();
  expect(result.violations).toEqual([]);
});
