import { chromium } from '/usr/local/lib/node_modules/playwright/index.mjs';

const BASE = 'http://localhost:4174';
const out = { checks: {}, errors: [] };

const me = { id: 1, name: 'Alex', isAdmin: true };
const posts = Array.from({ length: 14 }, (_, i) => ({
  id: 100 - i,
  body: `post number ${i + 1} for scroll test`,
  user_id: 1,
  author_name: 'Alex',
  created_at: Date.now() - i * 3600e3,
  reactions: {},
  comments: 0,
}));
let profile = { id: 1, name: 'Alex', bio: 'hello there', avatar: null, followers: 3, following: 2, followed: false };
let invites = [{ code: 'ABC123XYZ9', used_by: null }];

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 390, height: 780 }, isMobile: true, hasTouch: true });
await ctx.addInitScript(() => {
  // The app reads its session key via getToken(); seed every key it might use.
  for (const k of ['heychat_token', 'token', 'hc_token', 'session']) localStorage.setItem(k, 'test-token');
});
const page = await ctx.newPage();
page.on('pageerror', (e) => out.errors.push('pageerror: ' + e.message));
page.on('console', (m) => m.type() === 'error' && out.errors.push('console: ' + m.text()));

await page.route('**/api/**', async (route) => {
  const url = new URL(route.request().url());
  const p = url.pathname;
  const method = route.request().method();
  const json = (b, s = 200) => route.fulfill({ status: s, contentType: 'application/json', body: JSON.stringify(b) });
  if (p === '/api/me') return json(me);
  if (p === '/api/setup') return json({ firstRun: false });
  if (p === '/api/feed') return json({ posts, hasMore: false });
  if (p === '/api/users') return json([profile]);
  if (p.startsWith('/api/users/')) return json(profile);
  if (p === '/api/notifications/unread-count') return json({ count: 0 });
  if (p === '/api/conversations/unread-count') return json({ count: 0 });
  if (p === '/api/conversations') return json([]);
  if (p === '/api/wallet') return json({ coins: 42, transactions: [] });
  if (p === '/api/admin/invites' && method === 'GET') return json(invites);
  if (p === '/api/admin/invites' && method === 'POST') {
    const code = 'NEWCODE' + (invites.length + 1);
    invites = [{ code, used_by: null }, ...invites];
    return json({ code });
  }
  if (p === '/api/me/name' && method === 'PUT') {
    const body = JSON.parse(route.request().postData() || '{}');
    profile = { ...profile, name: body.name };
    return json({ ok: true, name: body.name });
  }
  if (p === '/api/me/bio' && method === 'PUT') {
    const body = JSON.parse(route.request().postData() || '{}');
    profile = { ...profile, bio: body.bio };
    return json({ ok: true });
  }
  return json({});
});

// Login screen used when no token: we use the injected token so the app restores the session.
await page.goto(BASE + '/', { waitUntil: 'networkidle' });
await page.waitForSelector('header');

// Header: one line, fixed, no Log out.
const hdr = await page.evaluate(() => {
  const h = document.querySelector('header');
  const r = h.getBoundingClientRect();
  return { top: r.top, height: r.height, position: getComputedStyle(h).position, text: h.innerText, buttons: [...h.querySelectorAll('a,button')].map((b) => b.getAttribute('aria-label')) };
});
out.checks.header = hdr;
out.checks.headerHasLogout = /log out/i.test(hdr.text);
out.checks.headerFixed = hdr.position === 'fixed' && hdr.top === 0;
out.checks.headerOneLine = hdr.height <= 60;

// Scroll the feed and sample header + nav positions.
const samples = [];
for (const y of [0, 200, 500, 900, 1400, 0]) {
  await page.evaluate((yy) => window.scrollTo(0, yy), y);
  await page.waitForTimeout(150);
  samples.push(
    await page.evaluate(() => ({
      y: window.scrollY,
      headerTop: document.querySelector('header').getBoundingClientRect().top,
      navBottom: Math.round(document.querySelector('nav[aria-label="Main"]').getBoundingClientRect().bottom),
      vh: window.innerHeight,
    })),
  );
}
out.checks.scrollSamples = samples;
out.checks.headerStableWhileScrolling = samples.every((s) => s.headerTop === 0);
out.checks.navStableWhileScrolling = samples.every((s) => s.navBottom === s.vh);

// Gear -> settings.
await page.click('a[aria-label="Settings"]');
await page.waitForSelector('text=Settings');
const settingsText = await page.evaluate(() => document.querySelector('main').innerText);
out.checks.settingsHas = {
  editProfile: /Edit profile/.test(settingsText),
  general: /General/.test(settingsText),
  inviteCodes: /Invite codes/.test(settingsText),
  logout: /Log out/.test(settingsText),
  generateButton: /Make a new code/.test(settingsText),
  codeListed: /ABC123XYZ9/.test(settingsText),
};
await page.screenshot({ path: 'qa/settings.png' });

// Generate invite code from Settings.
await page.click('text=Make a new code');
await page.waitForSelector('text=NEWCODE');
out.checks.generateWorks = true;

// Profile: no invite code, has Edit profile.
await page.goto(BASE + '/u/1', { waitUntil: 'networkidle' });
await page.waitForSelector('text=Edit profile');
const prof = await page.evaluate(() => document.querySelector('main').innerText);
out.checks.profileNoInvite = !/ABC123XYZ9|Invite|invite code/i.test(prof);
out.checks.profileNoLogout = !/log out/i.test(prof);
await page.screenshot({ path: 'qa/profile.png' });

// Edit profile.
await page.click('text=Edit profile >> nth=0');
await page.waitForSelector('#display-name');
await page.fill('#display-name', 'Alex Z');
await page.fill('#bio', 'building heychat');
await page.click('button:has-text("Save profile")');
await page.waitForSelector('text=Profile saved.');
out.checks.editProfileSaved = profile.name === 'Alex Z' && profile.bio === 'building heychat';
await page.screenshot({ path: 'qa/edit.png' });

// Logout only from Settings: go to settings and log out.
await page.goto(BASE + '/settings', { waitUntil: 'networkidle' });
await page.click('button:has-text("Log out")');
await page.waitForSelector('text=Log in', { timeout: 5000 }).catch(() => {});
const afterLogout = await page.evaluate(() => ({ token: localStorage.getItem('heychat_token'), hasHeader: !!document.querySelector('header') }));
out.checks.logoutClearsSession = !afterLogout.hasHeader;
out.checks.tokenCleared = afterLogout.token === null || afterLogout.token === '';

await browser.close();
console.log(JSON.stringify(out, null, 2));
