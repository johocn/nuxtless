// C35/C36 登录态端到端冒烟：登录 smoke 客户 → 详情页「立即使用」→ 用券页（服务端 verified）→ 消息中心
import { mkdirSync } from 'node:fs';
import { createRequire } from 'node:module';

const req = createRequire('d:/zhao/vendure/package.json');
const { chromium } = req('playwright');

const OUT = 'D:/zhao/nshop/docs/manual/shots/2026-10-19-coupon-redemption-flow';
mkdirSync(OUT, { recursive: true });
const API = 'https://www.youshop.cn/shop-api';
const T1 = 'https://www.youshop.cn/t1';

const browser = await chromium.launch();
const ctx = await browser.newContext({
  viewport: { width: 390, height: 844 },
  deviceScaleFactor: 2,
  userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
});
const page = await ctx.newPage();

// 1. 落地 t1 页（建立 origin，cookie 同域）
await page.goto(`${T1}/coupon/83`, { waitUntil: 'domcontentloaded', timeout: 30000 });
await page.waitForTimeout(2000);

// 2. 页面上下文内 fetch 登录（session cookie 自动落 youshop.cn 域）
const loginRes = await page.evaluate(async () => {
  const r = await fetch('https://www.youshop.cn/shop-api', {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', 'vendure-token': 'a6fn474hhiqasmyiyrfl' },
    body: JSON.stringify({
      query: `mutation { login(username: "smoke-order@yourbao.cn", password: "smoke123456", rememberMe: true) { __typename ... on CurrentUser { id identifier } ... on ErrorResult { errorCode message } } }`,
    }),
  });
  return r.json();
});
console.log('login:', JSON.stringify(loginRes?.data?.login));

// 3. 详情页：应出现「立即使用」
await page.goto(`${T1}/coupon/83`, { waitUntil: 'networkidle', timeout: 30000 }).catch(() => {});
await page.waitForTimeout(3000);
const hasUseNow = await page.evaluate(() => document.body.innerText.includes('立即使用'));
console.log('hasUseNow:', hasUseNow);
await page.screenshot({ path: `${OUT}/09-prod-detail-use-now.png`, fullPage: true });
console.log('shot 09-prod-detail-use-now');

// 4. 点击「立即使用」→ 券码页（服务端 verified：券名+使用说明）
if (hasUseNow) {
  await page.evaluate(() => {
    const btns = [...document.querySelectorAll('button, uni-button')];
    btns.find((b) => b.innerText.includes('立即使用'))?.click();
  });
  await page.waitForTimeout(3500);
  console.log('after click url:', page.url());
  await page.screenshot({ path: `${OUT}/10-prod-code-verified.png`, fullPage: true });
  console.log('shot 10-prod-code-verified');
}

// 5. 消息中心：coupon_expire 站内信
await page.goto(`${T1}/messages`, { waitUntil: 'networkidle', timeout: 30000 }).catch(() => {});
await page.waitForTimeout(2500);
const hasMsg = await page.evaluate(() => document.body.innerText.includes('优惠券 3 天后过期'));
console.log('hasExpireMsg:', hasMsg);
await page.screenshot({ path: `${OUT}/11-prod-inbox-expire-msg.png`, fullPage: true });
console.log('shot 11-prod-inbox-expire-msg');

await browser.close();
console.log('done');
