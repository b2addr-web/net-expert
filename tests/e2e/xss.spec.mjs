import {test,expect} from '@playwright/test';
import {RICH_PREFIX,noteHtml} from '../../lib/note-rich-text.js';

test('untrusted note markup stays inert in Chromium while permitted formatting remains',async({page})=>{
 const unsafe='<img src=x onerror="window.__xssExecuted=true"><a href="javascript:window.__xssExecuted=true" onclick="window.__xssExecuted=true">bad link</a>';
 const rendered=noteHtml(`${RICH_PREFIX}<p><strong>Safe text</strong></p>${unsafe}`);
 await page.setContent(`<!doctype html><html lang="ar" dir="rtl"><body><main>${rendered}</main></body></html>`);
 await expect(page.locator('strong')).toHaveText('Safe text');
 await expect(page.locator('img,script,svg,[onerror],[onclick],a[href^="javascript:"]')).toHaveCount(0);
 expect(await page.evaluate(()=>window.__xssExecuted)).toBeUndefined();
});
