// 东利民粮油店（limin）手机视口截图（硬规范：390×844 dpr=2 = 780×1688）
// 用法：node scripts/shot-limin-brand.mjs
import { createRequire } from "node:module";
import { mkdirSync } from "node:fs";

const req = createRequire("d:/zhao/vendure/package.json");
const { chromium } = req("playwright");

const outDir = "C:/Users/lenovo/Documents/Trae-CN/default/donglimin-brand-ops-strategy/shots";
mkdirSync(outDir, { recursive: true });

const shots = [
  { name: "01-home-viewport", url: "https://www.youshop.cn/limin", full: false },
  { name: "02-home-full", url: "https://www.youshop.cn/limin", full: true },
  { name: "03-category-rice", url: "https://www.youshop.cn/limin/category/rice", full: false },
  { name: "04-product-rice", url: "https://www.youshop.cn/limin/product/jilin-xiaoding-rice", full: false },
];

const browser = await chromium.launch();
try {
  const ctx = await browser.newContext({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 2,
    userAgent:
      "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1",
  });
  for (const s of shots) {
    const page = await ctx.newPage();
    await page.goto(s.url, { waitUntil: "networkidle", timeout: 60000 }).catch(() => {});
    await page.waitForTimeout(1200);
    await page.screenshot({ path: `${outDir}/${s.name}.png`, fullPage: s.full });
    console.log(`saved ${s.name}.png`);
    await page.close();
  }
} finally {
  await browser.close();
}
