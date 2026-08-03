import { chromium } from 'playwright';
import { mkdir } from 'node:fs/promises';
import { dirname } from 'node:path';

const targets = [
  { url: 'http://localhost:1313/',              file: 'screenshots/home.png',          desc: 'Home' },
  { url: 'http://localhost:1313/faq/',          file: 'screenshots/faq.png',           desc: 'FAQ' },
  { url: 'http://localhost:1313/documentation/', file: 'screenshots/documentation.png', desc: 'Documentation' },
  { url: 'http://localhost:1313/community/',    file: 'screenshots/community.png',     desc: 'Community' },
];

const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
const page = await context.newPage();

for (const t of targets) {
  await page.goto(t.url, { waitUntil: 'networkidle' });
  await mkdir(dirname(t.file), { recursive: true });
  await page.screenshot({ path: t.file, fullPage: false });
  console.log(`  ${t.desc.padEnd(15)} ${t.url}  ->  ${t.file}`);
}

await browser.close();
