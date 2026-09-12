#!/usr/bin/env node
/** 查询挂「门店自提配送档案」(profile=1) 且属于默认渠道的可用变体 */
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
await q("variants profile=1", `SELECT v.id, v.sku, v."productId", v.enabled, p.slug, p."featuredAssetId" FROM product_variant v JOIN product p ON p.id = v."productId" WHERE v."customFieldsShippingprofileid" = '1' ORDER BY v.id`);
await q("variant channel map", `SELECT vc."productVariantId", c.code FROM product_variant_channels_channel vc JOIN channel c ON c.id = vc."channelId" WHERE vc."productVariantId" IN (SELECT id FROM product_variant WHERE "customFieldsShippingprofileid" = '1') ORDER BY vc."productVariantId"`);
await q("pickup coords", `SELECT id, name, type, coordinates FROM pickup_location ORDER BY id`);
await client.end();
console.log("\nDONE");
