const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');

// Allow override: TARGET_URL=http://localhost:20128/ node bot.js
// or: node bot.js http://localhost:20128/
const TARGET_URL = (process.argv[2] || process.env.TARGET_URL || 'http://localhost:20128/').replace(/\/?$/, '/');
const AKUN_FILE = path.join(__dirname, 'akun.txt');
const HEADLESS = process.env.HEADLESS === 'true' || process.env.HEADLESS === '1';

const PROVIDER_SELECTOR = 'a[href="/dashboard/providers"]';
const ANTIGRAVITY_SELECTOR = 'a[href="/dashboard/providers/antigravity"]';
const ANTIGRAVITY_DIRECT_PATH = 'dashboard/providers/antigravity';

// Latest 9Router shows a "Risk Notice" ConfirmModal ("I Understand, Continue")
// the first time you add an antigravity connection (gated by localStorage
// key ag_risk_confirmed). Handle it if present, skip if already confirmed.
const RISK_STORAGE_KEY = 'ag_risk_confirmed';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function readAccounts() {
  if (!fs.existsSync(AKUN_FILE)) return [];
  const content = fs.readFileSync(AKUN_FILE, 'utf-8').trim();
  if (!content) return [];
  return content.split('\n').map((line) => {
    const [email, password] = line.trim().split('|');
    return { email: (email || '').trim(), password: (password || '').trim(), raw: line.trim() };
  }).filter((a) => a.email && a.password);
}

function removeAccount(rawLine) {
  const content = fs.readFileSync(AKUN_FILE, 'utf-8');
  const lines = content.split('\n');
  let removed = false;
  const kept = lines.filter((l) => {
    if (!removed && l.trim() === rawLine.trim() && l.trim() !== '') {
      removed = true;
      return false;
    }
    return true;
  });
  // Drop trailing empty lines, keep one newline at EOF if anything remains.
  while (kept.length && kept[kept.length - 1].trim() === '') kept.pop();
  fs.writeFileSync(AKUN_FILE, kept.length ? kept.join('\n') + '\n' : '');
}

// Click a <button> whose visible text matches one of the given patterns.
// Works regardless of Tailwind class changes. Throws on timeout.
async function clickButtonWithText(page, patterns, { timeout = 15000, logName = 'button' } = {}) {
  const list = Array.isArray(patterns) ? patterns : [patterns];
  const sources = list.map((p) => (p instanceof RegExp ? p.source : String(p)));
  const flags = list[0] instanceof RegExp ? list[0].flags : 'i';
  await page.waitForFunction(
    (srcs, fl) => {
      const res = srcs.map((s) => new RegExp(s, fl));
      return Array.from(document.querySelectorAll('button')).some((b) => {
        if (b.disabled) return false;
        const text = ((b.innerText || b.textContent) || '').trim().replace(/\s+/g, ' ');
        if (!text) return false;
        const r = b.getBoundingClientRect();
        if (r.width === 0 && r.height === 0) return false;
        return res.some((re) => re.test(text));
      });
    },
    { timeout },
    sources,
    flags
  );
  await page.evaluate(
    (srcs, fl) => {
      const res = srcs.map((s) => new RegExp(s, fl));
      const btn = Array.from(document.querySelectorAll('button')).find((b) => {
        if (b.disabled) return false;
        const text = ((b.innerText || b.textContent) || '').trim().replace(/\s+/g, ' ');
        if (!text) return false;
        const r = b.getBoundingClientRect();
        if (r.width === 0 && r.height === 0) return false;
        return res.some((re) => re.test(text));
      });
      if (!btn) throw new Error('button vanished between wait and click');
      btn.scrollIntoView({ block: 'center' });
      btn.click();
    },
    sources,
    flags
  );
  console.log('Clicked ' + logName + '.');
}

// Same as above but returns true/false instead of throwing (for optional modals).
async function tryClickButtonWithText(page, patterns, { timeout = 5000, logName = 'button' } = {}) {
  try {
    await clickButtonWithText(page, patterns, { timeout, logName });
    return true;
  } catch {
    return false;
  }
}

// Wait for the OAuth popup opened from `openerPage`. Resolves with the Page.
async function waitForPopup(browser, openerPage, timeout = 20000) {
  const openerTarget = openerPage.target();
  const target = await browser.waitForTarget(
    (t) => t.opener() === openerTarget,
    { timeout }
  );
  const popup = await target.page();
  if (!popup) throw new Error('popup target has no page (blocked?)');
  await popup.bringToFront().catch(() => {});
  return popup;
}

async function waitForVisible(page, selector, timeout = 15000) {
  await page.waitForSelector(selector, { visible: true, timeout });
}

// ---- Google login helpers (resilient to Google's ever-changing classes) ----

async function fillEmail(popup, email) {
  console.log('Typing email: ' + email);
  // Account chooser ("Choose an account" / "Use another account") support.
  try {
    await popup.waitForFunction(
      () => /use another account/i.test(document.body.innerText || ''),
      { timeout: 3000 }
    );
    await popup.evaluate(() => {
      const el = Array.from(document.querySelectorAll('div[role="button"], button, a')).find((n) =>
        /use another account/i.test((n.innerText || n.textContent || '').trim())
      );
      if (el) el.click();
    });
    await sleep(1500);
  } catch {
    // No chooser — normal email-first flow.
  }

  await popup.waitForFunction(
    () => !!document.querySelector('#identifierId, input[type="email"]'),
    { timeout: 20000 }
  );
  const sel = (await popup.$('#identifierId')) ? '#identifierId' : 'input[type="email"]';
  await waitForVisible(popup, sel, 15000);
  await popup.click(sel, { clickCount: 3 }).catch(() => {});
  // Clear prefilled value then type fresh.
  await popup.evaluate((s) => {
    const el = document.querySelector(s);
    if (el) el.value = '';
  }, sel);
  await popup.type(sel, email, { delay: 30 });

  console.log('Clicking Next (email)...');
  // #identifierNext markup changes; fall back to any "Next" button.
  if (await popup.$('#identifierNext')) {
    await popup.click('#identifierNext').catch(() => {});
    // The clickable node is sometimes the inner span.
    await popup.evaluate(() => {
      const n = document.querySelector('#identifierNext button, #identifierNext');
      if (n) n.click();
    }).catch(() => {});
  } else {
    await clickButtonWithText(popup, [/^next$/i], { timeout: 10000, logName: 'Next (email)' });
  }
}

async function fillPassword(popup, password) {
  console.log('Waiting for password field...');
  await popup.waitForFunction(
    () => !!document.querySelector('input[type="password"], #password input, input[name="Passwd"]'),
    { timeout: 25000 }
  );
  await sleep(1200);
  const sel = (await popup.$('input[type="password"]'))
    ? 'input[type="password"]'
    : 'input[name="Passwd"]';
  await waitForVisible(popup, sel, 15000);
  await popup.click(sel, { clickCount: 3 }).catch(() => {});
  await popup.evaluate((s) => {
    const el = document.querySelector(s);
    if (el) el.value = '';
  }, sel);
  await popup.type(sel, password, { delay: 30 });

  console.log('Clicking Next (password)...');
  if (await popup.$('#passwordNext')) {
    await popup.click('#passwordNext').catch(() => {});
    await popup.evaluate(() => {
      const n = document.querySelector('#passwordNext button, #passwordNext');
      if (n) n.click();
    }).catch(() => {});
  } else {
    await clickButtonWithText(popup, [/^next$/i], { timeout: 10000, logName: 'Next (password)' });
  }
}

// After password: Google may show recovery-challenge, 2FA, captcha, or go
// straight to the OAuth consent screen ("Allow" / "Continue" / "I understand").
// Keep clicking consent buttons until we land back on 9Router (callback) or timeout.
async function handleConsentLoop(popup, { timeoutMs = 90000 } = {}) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const url = popup.url();
    // Landed back on 9Router or Google closed the loop: success signal.
    if (/\/callback/i.test(url) || /[?&](code|access_token)=/i.test(url) || url.startsWith(TARGET_URL)) {
      console.log('Consent complete, popup at: ' + url);
      return;
    }
    if (popup.isClosed()) {
      console.log('Popup closed by site (OAuth likely complete).');
      return;
    }
    const bodyText = await popup.evaluate(() => document.body ? document.body.innerText || '' : '').catch(() => '');
    // Hard failures — bail out so the account stays in akun.txt for review.
    if (/couldn.?t find your google account|wrong password|incorrect password/i.test(bodyText)) {
      throw new Error('Google rejected credentials (see popup text).');
    }
    if (/verify it.?s you|2-step verification|enter.*verification code|check your phone/i.test(bodyText)) {
      throw new Error('Google asks for 2FA / phone verification — needs manual login, skipping.');
    }
    if (/this browser or app may not be secure|can.?t sign you in/i.test(bodyText)) {
      throw new Error('Google blocked the automated browser ("browser may not be secure"). Try headed mode with your own Chrome profile.');
    }
    // Click whichever consent button is currently visible, in priority order.
    const clicked = await popup.evaluate(() => {
      const norm = (s) => (s || '').trim().replace(/\s+/g, ' ').toLowerCase();
      const buttons = Array.from(document.querySelectorAll('button, div[role="button"]')).filter((b) => {
        const r = b.getBoundingClientRect();
        return r.width > 0 && r.height > 0 && !b.disabled;
      });
      const priority = ['i understand', 'continue', 'allow', 'next', 'confirm', 'got it', 'accept'];
      for (const want of priority) {
        const btn = buttons.find((b) => norm(b.innerText || b.textContent) === want);
        if (btn) {
          btn.scrollIntoView({ block: 'center' });
          btn.click();
          return want;
        }
      }
      return null;
    }).catch(() => null);
    if (clicked) console.log('Clicked consent "' + clicked + '", waiting...');
    await sleep(clicked ? 2500 : 2000);
  }
  throw new Error('Timed out waiting for Google consent / callback.');
}

async function loginAccount(account, index, total) {
  const { email, password } = account;
  console.log('\n=== Account ' + (index + 1) + '/' + total + ': ' + email + ' ===');

  console.log('Launching browser... (target ' + TARGET_URL + ')');
  const browser = await puppeteer.launch({
    headless: HEADLESS ? 'shell' : false,
    defaultViewport: null,
    protocolTimeout: 120000,
    args: [
      '--start-maximized',
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-blink-features=AutomationControlled',
    ],
  });

  let success = false;
  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 1366, height: 900 });

    console.log('Navigating to ' + TARGET_URL);
    await page.goto(TARGET_URL, { waitUntil: 'networkidle2', timeout: 60000 });

    // Pre-confirm the antigravity risk notice so the modal never blocks us.
    // (If the app version has no such gate, this is a harmless no-op.)
    await page.evaluate((k) => {
      try { window.localStorage.setItem(k, 'true'); } catch {}
    }, RISK_STORAGE_KEY).catch(() => {});

    // Go straight to the antigravity provider page; fall back to clicking
    // through the sidebar if direct navigation doesn't render it.
    const directUrl = new URL(ANTIGRAVITY_DIRECT_PATH, TARGET_URL).toString();
    await page.goto(directUrl, { waitUntil: 'networkidle2', timeout: 60000 }).catch(() => {});

    const hasAddButton = await page.evaluate(() => {
      return Array.from(document.querySelectorAll('button')).some((b) =>
        /add/i.test((b.innerText || b.textContent || '').trim())
      );
    }).catch(() => false);

    if (!hasAddButton) {
      console.log('Direct page has no Add button, navigating via sidebar...');
      await page.goto(TARGET_URL, { waitUntil: 'networkidle2', timeout: 60000 });
      console.log('Clicking Provider...');
      await page.waitForSelector(PROVIDER_SELECTOR, { timeout: 20000 });
      await page.click(PROVIDER_SELECTOR);
      console.log('Clicking Antigravity...');
      await page.waitForSelector(ANTIGRAVITY_SELECTOR, { timeout: 20000 });
      await Promise.all([
        page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 30000 }).catch(() => {}),
        page.click(ANTIGRAVITY_SELECTOR),
      ]);
      await page.evaluate((k) => {
        try { window.localStorage.setItem(k, 'true'); } catch {}
      }, RISK_STORAGE_KEY).catch(() => {});
    }

    console.log('Clicking Add...');
    await clickButtonWithText(
      page,
      [/^add connection$/i, /^add$/i, /^\+?\s*add\s*account$/i, /add/],
      { timeout: 20000, logName: 'Add' }
    );

    // Risk-notice modal (older/newer builds): click through if it appears.
    // NOTE: previously `button ::-p-text(...)` (with a space) which is an
    // invalid P-selector and always threw — replaced with text matching.
    await tryClickButtonWithText(
      page,
      [/^i understand,? continue$/i],
      { timeout: 6000, logName: '"I Understand, Continue"' }
    );

    console.log('Waiting for OAuth popup...');
    const popup = await waitForPopup(browser, page, 25000);
    console.log('Popup opened: ' + popup.url());

    await fillEmail(popup, email);
    await fillPassword(popup, password);
    await handleConsentLoop(popup, { timeoutMs: 120000 });

    // Give 9Router a moment to exchange the code and save the connection,
    // then verify via its own API instead of assuming success.
    await sleep(4000);
    if (!popup.isClosed()) {
      const pUrl = popup.url();
      console.log('Popup still open at: ' + pUrl);
      await popup.close().catch(() => {});
    }
    await page.bringToFront().catch(() => {});
    await page.reload({ waitUntil: 'networkidle2', timeout: 60000 }).catch(() => {});
    await sleep(2000);

    const verified = await page.evaluate(async (wantEmail) => {
      try {
        const res = await fetch('/api/providers', { cache: 'no-store' });
        if (!res.ok) return false;
        const data = await res.json();
        const list = data.connections || [];
        return list.some((c) => {
          if ((c.provider || '').toLowerCase() !== 'antigravity') return false;
          const blob = JSON.stringify(c).toLowerCase();
          return blob.includes(String(wantEmail).toLowerCase());
        });
      } catch { return false; }
    }, email).catch(() => false);

    if (verified) {
      console.log('Verified: ' + email + ' is now connected.');
      success = true;
    } else {
      // Fall back: OAuth modal may show success without the API reflecting
      // the email yet (eventual consistency). Treat callback-reached as
      // success only if we actually saw the callback URL below.
      console.log('Warning: could not verify ' + email + ' via /api/providers — keeping it in akun.txt.');
    }
  } catch (err) {
    console.error('FAILED ' + email + ': ' + (err && err.message ? err.message : err));
  } finally {
    await browser.close().catch(() => {});
    console.log('Browser closed.');
  }

  if (success) {
    removeAccount(account.raw);
    console.log('Removed from akun.txt: ' + email);
  } else {
    console.log('Kept in akun.txt for retry: ' + email);
  }
  return success;
}

(async () => {
  const accounts = readAccounts();
  console.log('Total accounts: ' + accounts.length + ' | target: ' + TARGET_URL);

  let ok = 0;
  for (let i = 0; i < accounts.length; i++) {
    const done = await loginAccount(accounts[i], i, accounts.length);
    if (done) ok++;

    if (i < accounts.length - 1) {
      console.log('Delay 3 seconds before next account...');
      await sleep(3000);
    }
  }

  console.log('\nDone: ' + ok + '/' + accounts.length + ' accounts added successfully.');
})();
