import { chromium } from '/usr/local/lib/node_modules/playwright/index.mjs';
const b = await chromium.launch();
const ctx = await b.newContext({ viewport: { width: 390, height: 780 } });
const p = await ctx.newPage();
const logs = [];
p.on('pageerror', (e) => logs.push('pageerror ' + e.message));
p.on('console', (m) => logs.push(m.type() + ' ' + m.text()));
await p.route('**/api/**', async (route) => {
  const u = new URL(route.request().url());
  logs.push('mock ' + route.request().method() + ' ' + u.pathname);
  const body = u.pathname === '/api/setup' ? { firstRun: false } : u.pathname === '/api/me' ? { id: 1, name: 'Alex', isAdmin: true } : [];
  await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
});
await p.goto('http://localhost:4174/', { waitUntil: 'load' });
// Write a session via the app's own setToken: sign in path is not reachable without a real call, so copy whichever key the app wrote.
await p.evaluate(() => { const before = Object.keys(localStorage); localStorage.setItem('__before', JSON.stringify(before)); });
const keysBefore = await p.evaluate(() => Object.keys(localStorage));
console.log('keys before:', keysBefore);
await p.evaluate(() => { for (const k of Object.keys(localStorage)) {} });
await p.reload({ waitUntil: 'load' });
await p.waitForTimeout(2500);
console.log((await p.evaluate(() => document.body.innerText)).slice(0, 200));
console.log(logs.slice(0, 30).join('\n'));
await b.close();
