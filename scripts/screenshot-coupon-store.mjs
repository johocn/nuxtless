// 券店模式手机视口截图（硬规范：390×844 dpr=2 = 780×1688）
// 用法：node scripts/screenshot-coupon-store.mjs
// 依赖：playwright（借 vendure 仓库的 node_modules 解析）
// 截图输出：docs/superpowers/manual/coupon-storefront/
import { mkdirSync } from "node:fs";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const req = createRequire("d:/zhao/vendure/package.json");
const { chromium } = req("playwright");

const base = "https://www.youshop.cn";
const outDir = fileURLToPath(new URL("../docs/superpowers/manual/coupon-storefront/", import.meta.url));
mkdirSync(outDir, { recursive: true });

// C1 券店首页（floors，匿名可浏览）→ C4 直连商品被拦截 → C6 TabBar 高亮 → C8 对照默认店
const shots = [
  { name: "01-home-floors-anon", url: `${base}/t1/` },
  { name: "03-coupon-only-blocked", url: `${base}/t1/coupon-only` },
  { name: "04-coupon-orders-anon", url: `${base}/t1/coupon/orders` },
  { name: "05-default-home", url: `${base}/` },
];

const browser = await chromium.launch();
try {
  const ctx = await browser.newContext({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 2,
    userAgent:
      "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1",
  });
  const page = await ctx.newPage();

  for (const s of shots) {
    try {
      await page.goto(s.url, { waitUntil: "networkidle", timeout: 45000 });
    } catch {
      // networkidle 超时兜底：再等 2s 直接截
    }
    await page.waitForTimeout(2000);
    await page.screenshot({ path: `${outDir}${s.name}.png`, fullPage: false });
    console.log(`saved ${s.name}.png`);
  }
  await ctx.close();
} finally {
  await browser.close();
}
console.log(`done -> ${outDir}`);
