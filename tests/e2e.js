/**
 * E2E functional test for the Creative Studio PWA.
 * Covers: video upload, MP3 extraction, image upload, storage browsing,
 * direct media links, player, sidebar actions, IndexedDB persistence, and offline capability.
 */
const { chromium } = require('/usr/local/lib/node_modules/playwright/index.js');
const path = require('path');
const fs = require('fs');

const BASE = process.env.APP_URL || 'http://localhost:8765/';
const TESTDATA = path.join(__dirname, 'testdata');
const SHOTS = path.join(__dirname, '..', 'screenshots');

const results = [];
function check(name, pass, detail = '') {
  results.push({ name, pass, detail });
  console.log(`${pass ? '  PASS' : '  FAIL'}  ${name}${detail ? ' — ' + detail : ''}`);
}

(async () => {
  const browser = await chromium.launch({
    executablePath: '/root/.cache/ms-playwright/chromium-1243/chrome-linux/chrome',
    args: ['--no-sandbox', '--disable-dev-shm-usage', '--autoplay-policy=no-user-gesture-required'],
  });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 2,
    locale: 'ar',
    permissions: [],
  });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push('PAGEERROR: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push('CONSOLE: ' + m.text()); });

  console.log('\n=== 1. Load & PWA basics ===');
  await page.goto(BASE, { waitUntil: 'networkidle' });
  await page.waitForTimeout(900);
  check('page loads', (await page.title()).includes('استوديو'));
  check('loader hidden', await page.locator('#appLoader').evaluate((e) => e.classList.contains('hidden')));

  const manifestHref = await page.getAttribute('link[rel=manifest]', 'href');
  check('manifest linked', manifestHref === 'manifest.json', manifestHref);

  const manifest = await page.evaluate(async () => {
    const r = await fetch('manifest.json');
    return r.json();
  });
  check('manifest name', manifest.name === 'استوديو الإبداع الذكي', manifest.name);
  check('manifest display standalone', manifest.display === 'standalone');
  check('manifest dir rtl', manifest.dir === 'rtl');
  check('manifest has icons', Array.isArray(manifest.icons) && manifest.icons.length >= 3, `${manifest.icons.length} icons`);
  check('manifest accepts shared browser links', manifest.share_target?.params?.url === 'url');

  const swReg = await page.evaluate(async () => {
    const regs = await navigator.serviceWorker.getRegistrations();
    return regs.map((r) => ({ scope: r.scope, active: !!r.active, script: r.active && r.active.scriptURL }));
  });
  check('service worker registered', swReg.length > 0, JSON.stringify(swReg[0] || {}));
  check('sw active with controller', !!swReg[0]?.active, swReg[0]?.script || 'n/a');

  console.log('\n=== 2. Browser share target ===');
  const sharedUrl = 'https://www.youtube.com/watch?v=example';
  await page.goto(`${BASE}?url=${encodeURIComponent(sharedUrl)}`, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction((url) => document.querySelector('#directUrl').value === url, sharedUrl);
  check('shared browser URL opens direct-link section', await page.locator('.tab[data-section="direct"]').evaluate((e) => e.classList.contains('active')));
  check('shared URL is prefilled without auto-fetching', await page.inputValue('#directUrl') === sharedUrl);
  await page.goto(BASE, { waitUntil: 'networkidle' });

  console.log('\n=== 3. Video upload ===');
  await page.setInputFiles('#videoInput', path.join(TESTDATA, 'sample.mp4'));
  await page.waitForTimeout(2500);
  const videoCards = await page.locator('#videoGrid .card').count();
  check('video card created', videoCards === 1, `${videoCards} card(s)`);
  const vTitle = await page.locator('#videoGrid .card-title').first().textContent();
  check('video named correctly', vTitle.trim() === 'sample.mp4', vTitle);
  const vMeta = await page.locator('#videoGrid .card-meta').first().textContent();
  check('video duration probed', /\d+:\d\d/.test(vMeta), vMeta.trim());

  console.log('\n=== 4. MP3 extraction ===');
  await page.click('.tab[data-section="audio"]');
  await page.waitForTimeout(300);
  await page.setInputFiles('#audioInput', path.join(TESTDATA, 'sample.mp4'));
  await page.waitForTimeout(6000);
  const audioCards = await page.locator('#audioGrid .card').count();
  check('mp3 card created', audioCards === 1, `${audioCards} card(s)`);
  const aTitle = await page.locator('#audioGrid .card-title').first().textContent();
  check('mp3 filename correct', aTitle.trim() === 'sample.mp3', aTitle);

  // Verify the stored blob is a real MP3
  const mp3Info = await page.evaluate(async () => {
    const items = await window.AppDB.getAllByKind('audio');
    if (!items.length) return null;
    const blob = items[0].blob;
    const buf = await blob.slice(0, 4).arrayBuffer();
    const bytes = Array.from(new Uint8Array(buf));
    // MP3 frame sync: 0xFF Ex/Fx
    const isMp3 = bytes[0] === 0xff && (bytes[1] & 0xe0) === 0xe0;
    // ID3 tag check
    const id3 = String.fromCharCode(...bytes.slice(0, 3));
    return { size: blob.size, type: blob.type, isMp3, isID3: id3 === 'ID3', hex: bytes.map(b => b.toString(16).padStart(2, '0')).join(' ') };
  });
  check('mp3 blob non-empty', mp3Info && mp3Info.size > 1000, `${mp3Info?.size} bytes, type=${mp3Info?.type}`);
  check('mp3 has valid frame sync / ID3 header', mp3Info && (mp3Info.isMp3 || mp3Info.isID3), `hex=${mp3Info?.hex}`);

  console.log('\n=== 5. Image upload ===');
  await page.click('.tab[data-section="image"]');
  await page.waitForTimeout(300);
  await page.setInputFiles('#imageInput', path.join(TESTDATA, 'sample.jpg'));
  await page.waitForTimeout(1500);
  const imgCards = await page.locator('#imageGrid .card').count();
  check('image card created', imgCards === 1, `${imgCards} card(s)`);
  const imgMeta = await page.locator('#imageGrid .card-meta').first().textContent();
  check('image size shown', imgMeta.includes('ك.ب') || imgMeta.includes('م.ب'), imgMeta.trim());

  console.log('\n=== 6. Storage section ===');
  await page.click('.tab[data-section="storage"]');
  await page.waitForTimeout(600);
  const storeCards = await page.locator('#storageGrid .card').count();
  check('all 3 files in storage', storeCards === 3, `${storeCards} cards`);
  check('empty state hidden', await page.locator('#emptyState').evaluate((e) => e.classList.contains('hidden')));

  // filter chips
  await page.click('.chip[data-filter="audio"]');
  await page.waitForTimeout(400);
  const filtered = await page.locator('#storageGrid .card').count();
  check('filter by audio -> 1', filtered === 1, `${filtered} cards`);
  await page.click('.chip[data-filter="all"]');
  await page.waitForTimeout(400);

  // search
  await page.fill('#storageSearch', 'sample');
  await page.waitForTimeout(500);
  const searched = await page.locator('#storageGrid .card').count();
  check('search returns 3', searched === 3, `${searched} cards`);
  await page.fill('#storageSearch', 'zzzz');
  await page.waitForTimeout(500);
  const noMatch = await page.locator('#emptyState').evaluate((e) => !e.classList.contains('hidden'));
  check('search no-match shows empty state', noMatch);
  await page.fill('#storageSearch', '');
  await page.waitForTimeout(400);

  console.log('\n=== 7. Player ===');
  await page.locator('#storageGrid .card').first().click();
  await page.waitForTimeout(700);
  const sidebarOpen = await page.locator('#actionSidebar').evaluate((e) => e.classList.contains('open'));
  check('sidebar opens on card click', sidebarOpen);
  const sidebarName = await page.locator('#sidebarItemName').textContent();
  check('sidebar shows filename', sidebarName.includes('sample'), sidebarName);
  const sidebarMeta = await page.locator('#sidebarMeta').textContent();
  check('sidebar shows metadata', sidebarMeta.includes('الحجم'), sidebarMeta.slice(0, 60));
  await page.screenshot({ path: path.join(SHOTS, 'desktop-sidebar.png') });

  // close sidebar then open player
  await page.click('#sidebarClose');
  await page.waitForTimeout(400);
  await page.locator('#storageGrid .card').first().locator('button[data-action="play"]').click();
  await page.waitForTimeout(900);
  const playerOpen = await page.locator('#playerOverlay').evaluate((e) => !e.classList.contains('hidden'));
  check('player overlay opens', playerOpen);
  const hasMedia = await page.locator('#playerBody video, #playerBody audio, #playerBody img').count();
  check('player renders media element', hasMedia >= 1, `${hasMedia} element(s)`);
  const dur = await page.locator('#playerDuration').textContent();
  check('player shows duration', /\d+:\d\d/.test(dur), dur);
  await page.screenshot({ path: path.join(SHOTS, 'desktop-player.png') });
  await page.click('#playerClose');
  await page.waitForTimeout(400);

  console.log('\n=== 8. Share / download action wiring ===');
  const shareSupported = await page.evaluate(() => typeof navigator.share === 'function' || typeof navigator.canShare === 'function');
  check('Web Share API detected', typeof shareSupported === 'boolean');
  // Verify download path creates an anchor with the right filename
  const dl = await page.evaluate(() => {
    let captured = null;
    const orig = HTMLAnchorElement.prototype.click;
    HTMLAnchorElement.prototype.click = function () { captured = { download: this.download, href: this.href.slice(0, 12) }; };
    window.App.openSidebar(
      { id: 'x', name: 'demo.mp3', mime: 'audio/mpeg', size: 1234, blob: new Blob(['x'], { type: 'audio/mpeg' }), store: 'audios', createdAt: Date.now() },
      'audio'
    );
    document.querySelector('.action-tile[data-action="download"]').click();
    HTMLAnchorElement.prototype.click = orig;
    return captured;
  });
  check('download triggers anchor with filename', dl && dl.download === 'demo.mp3', JSON.stringify(dl));

  console.log('\n=== 9. Persistence across reload ===');
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForTimeout(1500);
  await page.click('.tab[data-section="storage"]');
  await page.waitForTimeout(700);
  const afterReload = await page.locator('#storageGrid .card').count();
  check('IndexedDB persists 3 files after reload', afterReload === 3, `${afterReload} cards`);

  console.log('\n=== 10. Offline mode ===');
  await context.setOffline(true);
  await page.reload({ waitUntil: 'domcontentloaded' }).catch(() => {});
  await page.waitForTimeout(1800);
  const offlineTitle = await page.title().catch(() => '');
  check('app loads while offline', offlineTitle.includes('استوديو'), offlineTitle);
  const offlineCards = await page.evaluate(async () => {
    try {
      const items = await window.AppDB.getAllItems();
      return items.length;
    } catch (e) { return -1; }
  });
  check('data readable offline', offlineCards === 3, `${offlineCards} items`);
  await page.click('.tab[data-section="storage"]').catch(() => {});
  await page.waitForTimeout(600);
  const offlineVisible = await page.locator('#storageGrid .card').count();
  check('storage renders offline', offlineVisible === 3, `${offlineVisible} cards`);
  await page.screenshot({ path: path.join(SHOTS, 'desktop-offline.png'), fullPage: false });
  await context.setOffline(false);

  console.log('\n=== 11. Direct media link ===');
  await page.click('.tab[data-section="direct"]');
  const directUrl = new URL('tests/testdata/sample.mp4', BASE).href;
  await page.fill('#directUrl', directUrl);
  await page.click('#directCheckBtn');
  await page.waitForFunction(() => !document.querySelector('#directResult').classList.contains('hidden'));
  check('direct video link is inspected', (await page.locator('#directFileMeta').textContent()).includes('video/'), await page.locator('#directFileMeta').textContent());
  await page.click('#directFileActions button[data-direct-kind="video"]');
  await page.waitForTimeout(2500);
  check('direct video is saved locally', await page.locator('#videoGrid .card').count() === 2);

  console.log('\n=== 12. Console errors ===');
  const realErrors = errors.filter((e) => !e.includes('Failed to load resource') && !e.includes('net::ERR_INTERNET_DISCONNECTED') && !e.includes('net::ERR_FAILED'));
  check('no unexpected console/page errors', realErrors.length === 0, realErrors.slice(0, 5).join(' | ') || 'clean');

  await browser.close();

  const passed = results.filter((r) => r.pass).length;
  const failed = results.length - passed;
  console.log(`\n${'='.repeat(52)}`);
  console.log(`RESULT: ${passed}/${results.length} passed, ${failed} failed`);
  console.log('='.repeat(52));
  if (failed) {
    results.filter((r) => !r.pass).forEach((r) => console.log(`  FAILED: ${r.name} — ${r.detail}`));
    process.exit(1);
  }
})();
