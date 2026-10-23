
import { chromium } from '/usr/local/lib/node_modules/playwright/index.mjs';
const BASE = 'http://localhost:4174';
const out = { results: {}, consoleErrors: [] };
// The session key comes from the app's own db.js so the probe seeds the same key the app reads.
import { readFileSync } from 'node:fs';
const TOKEN_KEY = readFileSync(new URL('../src/lib/db.js', import.meta.url), 'utf8').match(/TOKEN_KEY\s*=\s*['"]([^'"]+)['"]/)[1];

// 3 reels: portrait-ish, landscape-ish and one with no video (filtered out by isVideoPost)
// A real 1s 360x640 H.264 clip, so autoplay/pause checks measure real playback.
const VIDEO = 'data:video/mp4;base64,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';
const me = { id: 1, name: 'Alex', isAdmin: true, avatar: null };
function reel(id, user, body) {
  return { id, body, user_id: user, author_name: user === 1 ? 'Alex' : 'Sam', author: user === 1 ? 'Alex' : 'Sam',
    video: VIDEO, created_at: new Date().toISOString(), reactions: { like: { mine: false, count: 4 } },
    comments: [], saved: false, saves: 2, views: 9, followed: false };
}
const feedPosts = [reel(3, 2, 'third #fun reel'), reel(2, 2, 'second reel'), reel(1, 1, 'first reel #test')];

async function runAt(name, vp, isMobile) {
  const ctx = await browser.newContext({ viewport: vp, isMobile, hasTouch: isMobile });
  await ctx.addInitScript((key) => { localStorage.setItem(key, 'test-token'); }, TOKEN_KEY);
  const page = await ctx.newPage();
  const errs = [];
  page.on('pageerror', (e) => errs.push('pageerror ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error') errs.push('console ' + m.text()); });
  const calls = [];
  await page.route('**/api/**', async (route) => {
    const req = route.request();
    const url = req.url();
    calls.push(req.method() + ' ' + url.replace(BASE, ''));
    const json = (b, s = 200) => route.fulfill({ status: s, contentType: 'application/json', body: JSON.stringify(b) });
    if (url.endsWith('/api/setup')) return json({ firstRun: false });
    if (url.endsWith('/api/me')) return json({ id: 1, name: 'Alex', isAdmin: true, email: null });
    if (url.includes('/api/feed')) return json({ posts: feedPosts, hasMore: false });
    if (/\/api\/posts\/\d+\/like/.test(url)) return json({ ok: true, liked: true, count: 5 });
    if (/\/api\/posts\/\d+\/comments/.test(url) && req.method() === 'POST') return json({ id: 99, body: 'hi', author: 'Alex', user_id: 1 });
    if (/\/api\/posts\/\d+\/view/.test(url)) return json({ ok: true });
    // Load-time endpoints the shell calls must return their real shapes (arrays for lists).
    if (url.endsWith('/api/statuses')) return json([]);
    if (url.endsWith('/api/users')) return json([]);
    if (url.endsWith('/api/gifts')) return json([{ id: 1, name: 'Rose', tier: 'popular', coin_cost: 10, emoji: '🌹', category: 'Popular' }]);
    if (url.endsWith('/api/notifications') || url.includes('/api/notifications')) return json([]);
    if (url.includes('/api/')) return json({ ok: true });
    return route.continue();
  });
  await page.goto(BASE + '/?tab=reels', { waitUntil: 'networkidle' });
  await page.waitForTimeout(800);
  const r = {};
  r.region = await page.locator('[aria-label="Reels feed"]').count();
  r.slides = await page.locator('section[aria-label^="Reel by"]').count();
  const vh = await page.evaluate(() => innerHeight);
  r.fullScreen = await page.evaluate(() => {
    const s = document.querySelector('section[aria-label^="Reel by"]');
    return s ? Math.round(s.getBoundingClientRect().height) : 0;
  });
  r.viewportH = vh;
  r.playingCount = await page.evaluate(() => [...document.querySelectorAll('video')].filter((v) => !v.paused).length);
  r.playingBefore = r.playingCount;
  // Swipe to the next reel with a real mouse drag (wheel gesture), then verify the scroll moved and only one video plays.
  r.scrollTopBefore = await page.evaluate(() => document.querySelector('[aria-label="Reels feed"]').scrollTop);
  // Real touch swipe via CDP (phones send touch, not mouse). Finger moves up 60% of the viewport.
  const box = await page.locator('[aria-label="Reels feed"]').boundingBox();
  const cdp = await page.context().newCDPSession(page);
  const x = box.x + box.width / 2;
  const y0 = box.y + box.height * 0.8;
  const y1 = box.y + box.height * 0.2;
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y: y0 }] });
  for (let i = 1; i <= 10; i++) {
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x, y: y0 + ((y1 - y0) * i) / 10 }] });
  }
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await page.waitForTimeout(900);
  r.scrollTopAfter = await page.evaluate(() => document.querySelector('[aria-label="Reels feed"]').scrollTop);
  r.swipeMoved = r.scrollTopAfter > r.scrollTopBefore;
  r.playingAfterSwipe = await page.evaluate(() => [...document.querySelectorAll('video')].filter((v) => !v.paused).length);
  // like via rail button on active reel
  const activeLike = page.locator('section').nth(0);
  // Only count calls made AFTER the interaction, so the initial feed load does not count as a refetch.
  const feedBeforeLike = calls.filter((c) => c.includes('/api/feed')).length;
  const likeBefore = calls.filter((c) => /\/like$/.test(c)).length;
  const likeLabel = () => page.getByRole('button', { name: /^Like,/ }).first().getAttribute('aria-label');
  r.likeLabelBefore = await likeLabel();
  await page.getByRole('button', { name: /^Like,/ }).first().click().catch(() => {});
  await page.waitForTimeout(400);
  r.likeCalls = calls.filter((c) => /\/like$/.test(c)).length - likeBefore;
  r.feedRefetchAfterLike = calls.filter((c) => c.includes('/api/feed')).length - feedBeforeLike;
  r.likeLabelAfter = await likeLabel();
  r.likeCountChanged = r.likeLabelBefore !== r.likeLabelAfter;
  // mute toggle: read the label before and after the click
  const muteBtn = page.getByRole('button', { name: /^(Mute|Unmute) sound$/ }).first();
  r.muteLabelBefore = await muteBtn.getAttribute('aria-label').catch(() => null);
  await muteBtn.click().catch(() => {});
  await page.waitForTimeout(200);
  r.muteLabelAfter = await page.getByRole('button', { name: /^(Mute|Unmute) sound$/ }).first().getAttribute('aria-label').catch(() => null);
  // Tap-to-pause: a single tap on the active reel toggles paused state.
  const tapZone = page.getByRole('button', { name: 'Tap to play or pause' }).first();
  r.tapZoneCount = await page.getByRole('button', { name: 'Tap to play or pause' }).count();
  // Wait until the active video is actually playing, so the tap is compared against a real playing state.
  await page.waitForFunction(() => [...document.querySelectorAll('video')].some((v) => !v.paused), null, { timeout: 5000 }).catch(() => {});
  // Measure the ACTIVE reel's video only (the section that is in the viewport), not any video on the page.
  const activePaused = () => page.evaluate(() => {
    const feed = document.querySelector('[aria-label="Reels feed"]');
    const idx = Math.round(feed.scrollTop / feed.clientHeight);
    const sec = feed.querySelectorAll('section[aria-label^="Reel by"]')[idx];
    const v = sec && sec.querySelector('video');
    return v ? v.paused : null;
  });
  const pausedBeforeTap = await activePaused();
  r.pausedBeforeTap = pausedBeforeTap;
  r.videoStateBeforeTap = await page.evaluate(() => [...document.querySelectorAll('video')].map((v) => ({ paused: v.paused, readyState: v.readyState, t: +v.currentTime.toFixed(2), muted: v.muted })));
  // Diagnostic: which element sits at the tap point (the tap only works if it is the tap target, not a control on top).
  // Ground truth: does the active <video> flip paused on a real pointer tap at its centre?
  r.videoPausedBeforeRealTap = await activePaused();
  // Tap the centre of the active reel's own box (on desktop the reel is a centred 9:16 column, so a fixed x would miss it).
  const centre = await page.evaluate(() => {
    const feed = document.querySelector('[aria-label="Reels feed"]');
    const idx = Math.round(feed.scrollTop / feed.clientHeight);
    const b = feed.querySelectorAll('section[aria-label^="Reel by"]')[idx].querySelector('button[aria-label="Tap to play or pause"]').getBoundingClientRect();
    return { x: b.left + b.width / 2, y: b.top + b.height / 2 };
  });
  await page.mouse.click(centre.x, centre.y);
  await page.waitForTimeout(450);
  r.videoPausedAfterRealTap = await activePaused();
  r.tapButtonCount = await page.evaluate(() => document.querySelectorAll('button[aria-label="Tap to play or pause"]').length);
  r.tapButtonInDomCount = await page.evaluate(() => document.querySelectorAll('button[aria-label="Tap to play or pause"]').length);
  r.topAtTap = await page.evaluate(() => {
    const feed = document.querySelector('[aria-label="Reels feed"]');
    const idx = Math.round(feed.scrollTop / feed.clientHeight);
    const sec = feed.querySelectorAll('section[aria-label^="Reel by"]')[idx];
    const b = sec.getBoundingClientRect();
    const el = document.elementFromPoint(b.left + 200, b.top + 300);
    return el ? (el.tagName + ' ' + (el.getAttribute('aria-label') || '') + ' ' + (el.className || '').toString().slice(0, 60)) : null;
  });
  await tapZone.click({ position: { x: 40, y: 40 } }).catch(() => {});
  await page.waitForTimeout(350);
  r.tapPauseToggled = (await activePaused()) !== pausedBeforeTap;
  // Double-tap-to-like: two taps inside the window add one like on the active reel.
  const likeBeforeDouble = calls.filter((c) => /\/like$/.test(c)).length;
  // Double-tap needs an UNLIKED reel (the viewer never unlikes on double tap). Swipe to the next reel first.
  const feedBox = await page.locator('[aria-label="Reels feed"]').boundingBox();
  const cdp2 = await page.context().newCDPSession(page);
  const fx = feedBox.x + feedBox.width / 2;
  await cdp2.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: fx, y: feedBox.y + feedBox.height * 0.8 }] });
  for (let i = 1; i <= 10; i++) await cdp2.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: fx, y: feedBox.y + feedBox.height * (0.8 - 0.6 * i / 10) }] });
  await cdp2.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await page.waitForTimeout(900);
  r.doubleTapReelUnliked = await page.evaluate(() => {
    const feed = document.querySelector('[aria-label="Reels feed"]');
    const idx = Math.round(feed.scrollTop / feed.clientHeight);
    return feed.querySelectorAll('section[aria-label^="Reel by"]')[idx].querySelector('button[aria-label^="Like,"]')?.getAttribute('aria-pressed');
  });
  // Two taps inside DOUBLE_TAP_MS (280ms). Dispatch both in one page evaluation so the gap is well under the window.
  await page.evaluate(() => {
    const feed = document.querySelector('[aria-label="Reels feed"]');
    const idx = Math.round(feed.scrollTop / feed.clientHeight);
    const sec = feed.querySelectorAll('section[aria-label^="Reel by"]')[idx];
    const btn = sec.querySelector('button[aria-label="Tap to play or pause"]');
    btn.click();
    btn.click();
  });
  await page.waitForTimeout(500);
  r.doubleTapLikeCalls = calls.filter((c) => /\/like$/.test(c)).length - likeBeforeDouble;
  // Gift sheet opens from the gift rail button on the active reel.
  await page.getByRole('button', { name: /^Send a gift to/ }).first().click().catch(() => {});
  await page.waitForTimeout(500);
  r.giftSheetOpened = (await page.locator('[role="dialog"]').count()) > 0;
  if (r.giftSheetOpened) await page.keyboard.press('Escape').catch(() => {});
  r.errors = errs;
  r.calls = calls.length;
  out.results[name] = r;
  await ctx.close();
}
const browser = await chromium.launch();
await runAt('mobile', { width: 390, height: 780 }, true);
await runAt('tablet', { width: 834, height: 1112 }, false);
await runAt('desktop', { width: 1440, height: 900 }, false);
console.log(JSON.stringify(out, null, 2));
await browser.close();
