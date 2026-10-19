// FR-B 线上冒烟截图：t1 首页楼层（10 张券分组）+ 满减券详情 + 购买面板
import { mkdirSync } from 'node:fs';
import { createRequire } from 'node:module';
const req = createRequire('d:/zhao/vendure/package.json');
const { chromium } = req('playwright');

const OUT = 'D:/zhao/nshop/docs/manual/shots/2026-10-19-coupon-redemption-flow';
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch();
const ctx = await browser.newContext({
  viewport: { width: 390, height: 844 },
  deviceScaleFactor: 2,
  userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
});
const page = await ctx.newPage();

// 01 t1 首页（楼层分组渲染）
await page.goto('https://www.youshop.cn/t1/', { waitUntil: 'networkidle', timeout: 30000 }).catch(() => {});
await page.waitForTimeout(3000);
await page.screenshot({ path: `${OUT}/13-prod-t1-home.png`, fullPage: true });
console.log('shot 13-prod-t1-home');
const homeText = await page.evaluate(() => document.body.innerText);
console.log('home floors:', ['餐饮', '台球', 'KTV', '茶饮', '影院', '超市', '烘焙'].filter((k) => homeText.includes(k)).join('/'));
console.log('full-count cards:', (homeText.match(/买单优惠券|减10券|减30券|减60券/g) || []).length);

// 02 满50减10券详情（B1 可购：详情+购买面板）
await page.goto('https://www.youshop.cn/t1/coupon/85', { waitUntil: 'networkidle', timeout: 30000 }).catch(() => {});
await page.waitForTimeout(3000);
await page.screenshot({ path: `${OUT}/14-prod-full50-detail.png`, fullPage: true });
console.log('shot 14-prod-full50-detail');
await page.evaluate(() => {
  [...document.querySelectorAll('button, uni-button')].find((b) => b.innerText.includes('抢购') || b.innerText.includes('立即购买'))?.click();
});
await page.waitForTimeout(2000);
await page.screenshot({ path: `${OUT}/15-prod-full50-buysheet.png`, fullPage: true });
console.log('shot 15-prod-full50-buysheet');

await browser.close();
console.log('done');
