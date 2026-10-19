// C35 走真实登录页的端到端：登录表单 → 详情页「立即使用」→ 点按钮 → 券码页（服务端 verified）
import { mkdirSync } from 'node:fs';
import { createRequire } from 'node:module';
const req = createRequire('d:/zhao/vendure/package.json');
const { chromium } = req('playwright');

const BASE = process.env.BASE || 'https://www.youshop.cn';
const OUT = 'D:/zhao/nshop/docs/manual/shots/2026-10-19-coupon-redemption-flow';
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
const page = await ctx.newPage();

// 1. 登录页（手机视口）
const loginResponses = [];
page.on('response', async (r) => {
  if (r.request().postData()?.includes('login')) {
    loginResponses.push(await r.text().catch(() => ''));
  }
});
await page.goto(`${BASE}/t1/account/login`, { waitUntil: 'networkidle', timeout: 30000 }).catch(() => {});
await page.waitForTimeout(2000);
await page.screenshot({ path: `${OUT}/12-login-page.png` });
const inputs = await page.$$('input');
console.log('inputs:', inputs.length);
await inputs[0].fill('smoke-order@yourbao.cn');
await inputs[1].fill('smoke123456');
// form @submit：原生回车提交最可靠
await inputs[1].press('Enter');
await page.waitForTimeout(4000);
console.log('login responses:', JSON.stringify(loginResponses).slice(0, 400));
console.log('after login url:', page.url());

// 2. 详情页
await page.goto(`${BASE}/t1/coupon/83`, { waitUntil: 'networkidle', timeout: 30000 }).catch(() => {});
await page.waitForTimeout(4500);
const hasUseNow = await page.evaluate(() => document.body.innerText.includes('立即使用'));
console.log('hasUseNow:', hasUseNow);
await page.screenshot({ path: `${OUT}/09-prod-detail-use-now.png`, fullPage: true });
console.log('shot 09-prod-detail-use-now');

// 3. 点「立即使用」→ 券码页
if (hasUseNow) {
  await page.evaluate(() => {
    [...document.querySelectorAll('button, uni-button')].find((b) => b.innerText.includes('立即使用'))?.click();
  });
  await page.waitForTimeout(3500);
  console.log('after click url:', page.url());
  await page.screenshot({ path: `${OUT}/10-prod-code-verified.png`, fullPage: true });
  console.log('shot 10-prod-code-verified');
  const state = await page.evaluate(() => ({
    usage: document.body.innerText.includes('使用说明'),
    scene: document.body.innerText.includes('到店出示'),
  }));
  console.log('code page state:', JSON.stringify(state));
}

// 4. 消息中心
await page.goto(`${BASE}/t1/messages`, { waitUntil: 'networkidle', timeout: 30000 }).catch(() => {});
await page.waitForTimeout(2500);
const hasMsg = await page.evaluate(() => document.body.innerText.includes('优惠券 3 天后过期'));
console.log('hasExpireMsg:', hasMsg);
await page.screenshot({ path: `${OUT}/11-prod-inbox-expire-msg.png`, fullPage: true });
console.log('shot 11-prod-inbox-expire-msg');

await browser.close();
console.log('done');
