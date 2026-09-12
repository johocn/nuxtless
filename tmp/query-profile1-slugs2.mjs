#!/usr/bin/env node
/** 查询 product_translation 列名 + 档案1/8 商品信息 */
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";

const envPath = "/www/apps/strapi/.env";
const env = {};
for (const line of readFileSync(envPath, "utf8").split(/\r?\n/)) {
  const t = line.trim();
  if (!t || t.startsWith("#")) continue;
  const i = t.indexOf("=");
  if (i === -1) continue;
  env[t.slice(0, i).trim()] = t.slice(i + 1).trim().replace(/^["']|["']$/g, "");
}
const require = createRequire("/www/apps/strapi/");
const { Client } = require("pg");
const client = new Client({
  host: env.DATABASE_HOST || "127.0.0.1",
  port: Number(env.DATABASE_PORT || 5432),
  database: "vendure",
  user: env.DATABASE_USERNAME,
  password: env.DATABASE_PASSWORD,
  ssl: env.DATABASE_SSL === "true" ? { rejectUnauthorized: false } : false,
});
const q = async (label, sql, params) => {
  try {
    const r = await client.query(sql, params);
    console.log(`\n===== ${label} (${r.rowCount}) =====`);
    console.log(JSON.stringify(r.rows, null, 1));
  } catch (e) {
    console.log(`\n===== ${label} ERROR: ${e.message}`);
  }
};
await client.connect();
await q("product_translation cols", `SELECT column_name FROM information_schema.columns WHERE table_name='product_translation' ORDER BY ordinal_position`);
await q("profile variants + product", `SELECT v.id, v.sku, v.enabled, v."productId", v."customFieldsShippingprofileid", p.id AS pid, p.enabled AS penabled FROM product_variant v JOIN product p ON p.id = v."productId" WHERE v."customFieldsShippingprofileid" IN ('1','8') ORDER BY v."customFieldsShippingprofileid", v.id`);
await q("zh titles", `SELECT "baseId", slug, name FROM product_translation WHERE "languageCode" = 'zh_Hans' AND "baseId" IN (SELECT "productId" FROM product_variant WHERE "customFieldsShippingprofileid" IN ('1','8'))`);
await client.end();
console.log("\nDONE");
