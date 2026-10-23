import { chromium } from '/usr/local/lib/node_modules/playwright/index.mjs';
const b = await chromium.launch();
const ctx = await b.newContext({ viewport: { width: 390, height: 780 } });
await ctx.addInitScript(() => { for (const k of ['heychat_token','token','hc_token','session']) localStorage.setItem(k,'t'); });
const p = await ctx.newPage();
const logs = [];
p.on('pageerror', (e) => logs.push('pageerror ' + e.message));
p.on('console', (m) => logs.push(m.type() + ' ' + m.text()));
await p.route('**/api/**', async (route) => {
  const u = new URL(route.request().url());
  logs.push('mock ' + u.pathname);
  const body = u.pathname === '/api/setup' ? { firstRun: false } : u.pathname === '/api/me' ? { id: 1, name: 'Alex', isAdmin: true } : [];
  await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
});
await p.goto('http://localhost:4174/', { waitUntil: 'load' });
await p.waitForTimeout(3000);
console.log((await p.evaluate(() => document.body.innerText)).slice(0, 300));
console.log(logs.slice(0, 40).join('\n'));
await b.close();
