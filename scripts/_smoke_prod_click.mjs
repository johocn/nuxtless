// 生产站冒烟：热销卡点击直达详情（无需代理，同源）
import { writeFileSync } from "node:fs";
import { createRequire } from "node:module";
const req = createRequire("d:/zhao/vendure/package.json");
const { chromium } = req("playwright");
const log = [];
const ok = (n, c, e = "") => log.push(`${c ? "PASS" : "FAIL"} ${n}${e ? " | " + e : ""}`);
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
const page = await ctx.newPage();
page.setDefaultTimeout(25000);
await page.goto("https://www.youshop.cn/t1/", { waitUntil: "domcontentloaded", timeout: 30000 });
await page.waitForFunction(() => !!(document.querySelector("#__nuxt")?.__vue_app__), { timeout: 25000 });
await page.waitForTimeout(3000);
const card = page.locator(".sale-card").first();
ok("热销卡存在", (await card.count()) > 0);
if ((await card.count()) > 0) {
  ok("卡面额=8折", ((await card.locator(".deal").textContent()) ?? "").trim() === "8折", ((await card.locator(".deal").textContent()) ?? "").trim());
  await card.click({ position: { x: 40, y: 20 } });
  await page.waitForTimeout(2000);
  ok("点击跳详情页", /\/t1\/coupon\/\d+/.test(page.url()), page.url());
  await page.waitForTimeout(1000);
  ok("详情页=8折", ((await page.locator(".deal").first().textContent()) ?? "").trim() === "8折");
  await page.screenshot({ path: "D:/zhao/nshop/docs/manual/shots/2026-10-19-coupon-store-click-fix/05-prod-click-detail.png" });
}
writeFileSync("D:/zhao/nshop/docs/manual/shots/2026-10-19-coupon-store-click-fix/prod-smoke-log.txt", log.join("\n"), "utf8");
console.log(log.join("\n"));
await browser.close();
