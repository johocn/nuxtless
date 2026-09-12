#!/usr/bin/env node
/** 查询档案1/档案8 变体对应商品的 slug 与名称 */
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
await q("variant product + slug", `SELECT v.id, v.sku, v."productId", v.enabled, pt.slug, pt.name, v."customFieldsShippingprofileid" FROM product_variant v LEFT JOIN product_translation pt ON pt."baseId" = v."productId" AND pt.languageCode = 'zh_Hans' WHERE v."customFieldsShippingprofileid" IN ('1','8') ORDER BY v."customFieldsShippingprofileid", v.id`);
await client.end();
console.log("\nDONE");
