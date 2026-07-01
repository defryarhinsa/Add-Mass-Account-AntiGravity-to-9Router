const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');

const TARGET_URL = 'http://localhost:20128/';
const AKUN_FILE = path.join(__dirname, 'akun.txt');

const PROVIDER_SELECTOR =
  'body > div.flex.h-screen.w-full.overflow-hidden.bg-bg > div.hidden.lg\\:flex > aside > nav > a:nth-child(2)';

const ANTIGRAVITY_SELECTOR =
  'body > div.flex.h-screen.w-full.overflow-hidden.bg-bg > main > div.flex-1.overflow-y-auto.custom-scrollbar.p-6.lg\\:p-10 > div > div > div:nth-child(2) > div.grid.grid-cols-1.gap-3.sm\\:grid-cols-2.sm\\:gap-4.lg\\:grid-cols-3.xl\\:grid-cols-4 > a:nth-child(2) > div > div > div.flex.min-w-0.items-center.gap-3 > div.min-w-0 > h3';

const ADD_SELECTOR =
  'body > div.flex.h-screen.w-full.overflow-hidden.bg-bg > main > div.flex-1.overflow-y-auto.custom-scrollbar.p-6.lg\\:p-10 > div > div > div:nth-child(3) > div.mt-4.grid.grid-cols-1.gap-2.sm\\:flex > button';

const CONFIRM_SELECTOR =
  'body > div.flex.h-screen.w-full.overflow-hidden.bg-bg > main > div.flex-1.overflow-y-auto.custom-scrollbar.p-6.lg\\:p-10 > div > div > div.fixed.inset-0.z-50.flex.items-center.justify-center.p-4 > div.relative.w-full.bg-surface.border.border-border-subtle.rounded-\\[14px\\].shadow-\\[var\\(--shadow-elev\\)\\].fade-in.max-w-sm > div.flex.items-center.justify-end.gap-3.p-6.border-t.border-border-subtle > button.inline-flex.items-center.justify-center.gap-2.font-semibold.transition-all.duration-150.ease-out.cursor-pointer.active\\:scale-\\[0\\.97\\].disabled\\:opacity-50.disabled\\:cursor-not-allowed.disabled\\:active\\:scale-100.bg-red-500.hover\\:bg-red-600.text-white.shadow-sm.disabled\\:bg-surface-3.disabled\\:text-text-muted.h-9.px-4.text-sm.rounded-\\[10px\\]';

const EMAIL_SELECTOR = '#identifierId';
const EMAIL_NEXT_SELECTOR = '#identifierNext > div > button > span';
const PASSWORD_SELECTOR = '#password > div.aCsJod.oJeWuf > div > div.Xb9hP > input';
const PASSWORD_NEXT_SELECTOR = '#passwordNext > div > button > div.VfPpkd-RLmnJb';
const I_UNDERSTAND_SELECTOR = '#gaplustosNext > div > button > div.VfPpkd-RLmnJb';
const LOGIN_SELECTOR = '#submit_approve_access > div > button > div.VfPpkd-RLmnJb';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function readAccounts() {
  const content = fs.readFileSync(AKUN_FILE, 'utf-8').trim();
  if (!content) return [];
  return content.split('\n').map((line) => {
    const [email, password] = line.trim().split('|');
    return { email, password, raw: line.trim() };
  }).filter((a) => a.email && a.password);
}

function removeAccount(rawLine) {
  const content = fs.readFileSync(AKUN_FILE, 'utf-8');
  const lines = content.split('\n').filter((l) => l.trim() !== rawLine);
  fs.writeFileSync(AKUN_FILE, lines.join('\n'));
}

async function loginAccount(account, index, total) {
  const { email, password } = account;
  console.log('\n=== Account ' + (index + 1) + '/' + total + ': ' + email + ' ===');

  console.log('Launching browser...');
  const browser = await puppeteer.launch({
    headless: false,
    defaultViewport: null,
    args: ['--start-maximized'],
  });

  const page = await browser.newPage();

  console.log('Navigating to ' + TARGET_URL);
  await page.goto(TARGET_URL, { waitUntil: 'networkidle2', timeout: 30000 });

  console.log('Clicking Provider...');
  await page.waitForSelector(PROVIDER_SELECTOR, { timeout: 10000 });
  await page.click(PROVIDER_SELECTOR);

  console.log('Clicking Antigravity...');
  await page.waitForSelector(ANTIGRAVITY_SELECTOR, { timeout: 10000 });
  await page.click(ANTIGRAVITY_SELECTOR);

  console.log('Clicking Add...');
  await page.waitForSelector(ADD_SELECTOR, { timeout: 10000 });
  await page.click(ADD_SELECTOR);

  console.log('Clicking I Understand, Continue...');
  await page.waitForSelector(CONFIRM_SELECTOR, { timeout: 10000 });
  await page.click(CONFIRM_SELECTOR);

  console.log('Waiting for new tab...');
  await sleep(5000);

  const pages = await browser.pages();
  const newTab = pages[pages.length - 1];
  await newTab.bringToFront();

  console.log('Typing email: ' + email);
  await newTab.waitForSelector(EMAIL_SELECTOR, { timeout: 15000 });
  await newTab.type(EMAIL_SELECTOR, email);

  console.log('Clicking Next (email)...');
  await newTab.waitForSelector(EMAIL_NEXT_SELECTOR, { timeout: 10000 });
  await newTab.click(EMAIL_NEXT_SELECTOR);

  console.log('Waiting for password field...');
  await newTab.waitForSelector(PASSWORD_SELECTOR, { visible: true, timeout: 15000 });
  await sleep(1000);
  await newTab.type(PASSWORD_SELECTOR, password);

  console.log('Clicking Next (password)...');
  await newTab.waitForSelector(PASSWORD_NEXT_SELECTOR, { timeout: 10000 });
  await newTab.click(PASSWORD_NEXT_SELECTOR);

  console.log('Clicking I Understand...');
  await newTab.waitForSelector(I_UNDERSTAND_SELECTOR, { visible: true, timeout: 15000 });
  await sleep(1000);
  await newTab.click(I_UNDERSTAND_SELECTOR);

  console.log('Clicking Login...');
  await newTab.waitForSelector(LOGIN_SELECTOR, { visible: true, timeout: 15000 });
  await sleep(1000);
  await newTab.click(LOGIN_SELECTOR);

  console.log('Account ' + (index + 1) + ' login successful!');

  removeAccount(account.raw);
  console.log('Removed from akun.txt: ' + email);

  await sleep(3000);
  await browser.close();
  console.log('Browser closed.');
}

(async () => {
  const accounts = readAccounts();
  console.log('Total accounts: ' + accounts.length);

  for (let i = 0; i < accounts.length; i++) {
    await loginAccount(accounts[i], i, accounts.length);

    if (i < accounts.length - 1) {
      console.log('Delay 3 seconds before next account...');
      await sleep(3000);
    }
  }

  console.log('\nAll ' + accounts.length + ' accounts added successfully!');
})();