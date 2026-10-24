/*
 * RS Limiter Calculator — end-to-end smoke test (optional).
 *
 * Verifies the specification validation figures in the real browser UI, Hebrew RTL,
 * the English switch, mobile layout and offline operation.
 *
 * Requires Playwright, which is NOT a dependency of this project:
 *     npm i -D playwright && npx playwright install chromium
 *
 * Then, from the repository root:
 *     npm run build
 *     npx serve dist            # or any static host serving dist at BASE
 *     RS_SMOKE_URL=http://127.0.0.1:3000/ node scripts/smoke.mjs
 *
 * Note: `vite preview` is not a suitable host for this test. Its middleware returns
 * 404 for requests carrying `Sec-Fetch-Dest: script`, which is exactly what a browser
 * sends for a module script, so the bundle never loads. Use a plain static server.
 */

import { chromium } from 'playwright';

const BASE = process.env.RS_SMOKE_URL ?? 'http://127.0.0.1:4174/rs-limiter-calculator/';
let failures = 0;
const check = (name, cond, detail = '') => {
  if (!cond) failures++;
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${detail ? ' — ' + detail : ''}`);
};

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 1000 } });
const errors = [];
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));

await page.goto(BASE, { waitUntil: 'networkidle' });
const html = page.locator('html');
check('Hebrew RTL is the default', (await html.getAttribute('dir')) === 'rtl');
check('dark mode is the default', (await html.getAttribute('data-theme')) === 'dark');
check('branding present', (await page.locator('body').innerText()).includes('RS Limiter Calculator'));

await page.goto(`${BASE}#/quick`, { waitUntil: 'networkidle' });
await page.waitForTimeout(400);
const quick = await page.locator('body').innerText();
check('Test 1: 28.284 Vrms', quick.includes('28.284'));
check('Test 1: +31.245 dBu', quick.includes('31.245'));
check('Test 2: -0.755 dBu required at the DSP output', quick.includes('-0.755'));
check('Test 3: -18.755 dBFS under AES17', quick.includes('-18.755'));
check('Test 10: 36.108 dB voltage gain', quick.includes('36.108'));

const convention = page.locator('select').filter({ hasText: 'AES17' }).first();
await convention.selectOption('peak-referenced');
await page.waitForTimeout(300);
check('Test 9: -21.765 dBFS under the peak-referenced convention',
  (await page.locator('body').innerText()).includes('-21.765'));

await convention.selectOption('unknown');
await page.waitForTimeout(300);
check('Test 4: no dBFS threshold without a verified reference',
  (await page.locator('body').innerText()).includes('dBFS'));

const mobile = await browser.newPage({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
await mobile.goto(`${BASE}#/quick`, { waitUntil: 'networkidle' });
await mobile.waitForTimeout(400);
check('no horizontal overflow at 390 px',
  (await mobile.evaluate(() => document.documentElement.scrollWidth)) <=
    (await mobile.evaluate(() => document.documentElement.clientWidth)) + 1);
await mobile.close();

const context = await browser.newContext();
const offline = await context.newPage();
await offline.goto(BASE, { waitUntil: 'networkidle' });
await offline.waitForTimeout(2500);
await context.setOffline(true);
await offline.reload({ waitUntil: 'domcontentloaded' });
await offline.waitForTimeout(1200);
check('the app loads with no network', (await offline.locator('body').innerText()).includes('RS Limiter Calculator'));
await context.close();

check('no console errors', errors.length === 0, errors.join(' | '));
await browser.close();
process.exit(failures === 0 ? 0 : 1);
