/**
 * og 卡预热脚本：遍历全部商品，抓取其 og:image（触发 nuxt-og-image satori 渲染，
 * 结果写入 fs 磁盘持久缓存），使微信任意时刻抓取都命中缓存秒回，避免冷渲染 3-4s 超时。
 *
 * 用法：node scripts/prewarm-og.mjs [--dry]
 * 环境：GQL_HOST / CHANNEL_TOKEN（默认读 .env）
 */
import { readFileSync, existsSync } from "node:fs";
import { spawnSync } from "node:child_process";

const cwd = process.cwd();
// 轻量读 .env（复刻 deploy.mjs 的 loadEnv）
const env = { ...process.env };
const envPath = `${cwd}/.env`;
if (existsSync(envPath)) {
  for (const line of readFileSync(envPath, "utf8").split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const eq = t.indexOf("=");
    if (eq === -1) continue;
    const k = t.slice(0, eq).trim();
    let v = t.slice(eq + 1).trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
    if (!(k in env)) env[k] = v;
  }
}
const GQL = env.GQL_HOST || "https://www.youshop.cn/shop-api";
const BASE = GQL.split("/shop-api")[0];
const TOKEN = env.CHANNEL_TOKEN || "";
const DRY = process.argv.includes("--dry");

async function gql(q, v) {
  const r = await fetch(GQL, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(TOKEN ? { "vendure-token": TOKEN } : {}) },
    body: JSON.stringify({ query: q, variables: v || {} }),
  });
  const j = await r.json();
  if (j.errors) throw new Error(JSON.stringify(j.errors[0].message).slice(0, 200));
  return j.data;
}

async function main() {
  // 1) 枚举全部商品 slug
  const total = (await gql(`query{ products(options:{ take: 1 }){ totalItems } }`)).products.totalItems;
  console.log(`[prewarm] 商品总数: ${total}`);
  const all = [];
  const TAKE = 100;
  for (let skip = 0; skip < total; skip += TAKE) {
    const d = await gql(
      `query($take:Int!,$skip:Int!){ products(options:{ take:$take, skip:$skip }){ items{ slug } } }`,
      { take: TAKE, skip },
    );
    all.push(...d.products.items.map((i) => i.slug));
  }
  console.log(`[prewarm] 已枚举 ${all.length} 个商品`);

  // 2) 预热每个商品 og 卡（请求详情页 SSR → 解析 og:image → 抓取渲染入缓存）
  let ok = 0, fail = 0;
  for (const slug of all) {
    const u = `${BASE}/product/${encodeURIComponent(slug)}`;
    try {
      // 抓详情页，提取 meta og:image content
      const htmlRes = await fetch(u, { headers: { "user-agent": "prewarm-og" } });
      if (htmlRes.status !== 200) throw new Error(`page ${htmlRes.status}`);
      const html = await htmlRes.text();
      // 优先 og:image:secure_url，其次 og:image（属性顺序不定，逐项尝试）
      let ogUrl = null;
      for (const re of [
        /<meta(?:[^>]*)property="og:image:secure_url"[^>]*content="([^"]+)"/i,
        /<meta(?:[^>]*)name="og:image:secure_url"[^>]*content="([^"]+)"/i,
        /<meta(?:[^>]*)property="og:image"[^>]*content="([^"]+)"/i,
        /<meta(?:[^>]*)name="og:image"[^>]*content="([^"]+)"/i,
      ]) {
        ogUrl = html.match(re)?.[1];
        if (ogUrl) break;
      }
      if (!ogUrl) throw new Error("no og:image meta");
      // 相对路径则基于站点域名补全
      if (!/^https?:\/\//i.test(ogUrl)) ogUrl = ogUrl.startsWith("//") ? `https:${ogUrl}` : `${BASE}${ogUrl}`;
      // 抓 og 图：命中 OG的 SWR/fs 缓存（渲染在此发生）
      const imgRes = await fetch(ogUrl);
      if (imgRes.status !== 200) throw new Error(`og ${imgRes.status}`);
      const buf = await imgRes.arrayBuffer();
      ok++; 
      console.log(`[prewarm] OK ${slug} (${Math.round(buf.byteLength/1024)}KB)`);
    } catch (e) {
      fail++;
      console.log(`[prewarm] FAIL ${slug}: ${e.message}`);
    }
    if (DRY) break;
  }
  console.log(`\n[prewarm] 完成: OK=${ok} FAIL=${fail}`);
}

main().catch((e) => { console.error("[prewarm] 错误:", e.message); process.exit(1); });