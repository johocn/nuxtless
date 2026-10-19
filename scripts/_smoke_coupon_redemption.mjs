// FR-A 生产冒烟截图（390×844 dpr=2）
// 05 生产 code 页（query 占位模式） / 06 生产详情页 / 07 生产券包页
import { mkdirSync } from 'node:fs';
import { createRequire } from 'node:module';

const req = createRequire('d:/zhao/vendure/package.json');
const { chromium } = req('playwright');

const BASE = 'https://www.youshop.cn';
const OUT = 'docs/manual/shots/2026-10-19-coupon-redemption-flow';
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch();
const ctx = await browser.newContext({
  viewport: { width: 390, height: 844 },
  deviceScaleFactor: 2,
  userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
});
const page = await ctx.newPage();

async function shot(url, file, settle = 3000) {
  await page.goto(url, { waitUntil: 'networkidle', timeout: 30000 }).catch(() => {});
  await page.waitForTimeout(settle);
  await page.screenshot({ path: `${OUT}/${file}.png` });
  console.log('shot', file);
}

await shot(
  `${BASE}/t1/coupon/code?code=SMOKE-TEST-OK&name=${encodeURIComponent('餐饮买单优惠券')}&expiresAt=2026-12-31T15:59:59.000Z&discount=${encodeURIComponent('8折')}`,
  '05-prod-code-active',
);
await shot(`${BASE}/t1/coupon/83`, '06-prod-detail');
await shot(`${BASE}/t1/coupon`, '07-prod-wallet-anon');

await browser.close();
console.log('done');
