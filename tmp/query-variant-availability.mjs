#!/usr/bin/env node
/** 查变体 48/47 商品渠道归属，确认 t1/t3 可购性 */
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
const client = new Client({ host: env.DATABASE_HOST || "127.0.0.1", port: Number(env.DATABASE_PORT || 5432), database: "vendure", user: env.DATABASE_USERNAME, password: env.DATABASE_PASSWORD });
const q = async (label, sql) => { try { const r = await client.query(sql); console.log(`\n== ${label} ==`); console.log(JSON.stringify(r.rows, null, 1)); } catch (e) { console.log(`\n== ${label} ERROR: ${e.message}`); } };
await client.connect();
await q("variant 48/47/56/58", `SELECT id, enabled, "customFieldsShippingprofileid" FROM product_variant WHERE id IN (48,47,56,58)`);
await q("variant->product", `SELECT v.id AS variant_id, p.id AS product_id, p.enabled AS product_enabled, p.slug FROM product p JOIN product_variant v ON v."productId"=p.id WHERE v.id IN (48,47)`);
await q("t1(7) product links", `SELECT "productId" FROM product_channels_channel WHERE "channelId"=7`);
await q("t1(7) variant links", `SELECT "productVariantId" FROM product_variant_channels_channel WHERE "channelId"=7`);
await q("t3(38) product links", `SELECT "productId" FROM product_channels_channel WHERE "channelId"=38`);
await q("t3(38) variant links", `SELECT "productVariantId" FROM product_variant_channels_channel WHERE "channelId"=38`);
await client.end();
