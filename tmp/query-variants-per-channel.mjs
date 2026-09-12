#!/usr/bin/env node
/** 查各渠道可用变体 + 其配送档案引用 */
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
await q("variant profile refs", `SELECT "customFieldsShippingprofileid" AS profile_id, count(*) FROM product_variant GROUP BY 1 ORDER BY 1`);
await q("t1(7) variants", `SELECT v.id, v.enabled, v."customFieldsShippingprofileid" FROM product_variant v JOIN product_variant_channels_channel c ON c."productVariantId"=v.id WHERE c."channelId"=7 AND v.enabled=true ORDER BY v.id LIMIT 20`);
await q("t2(37) variants", `SELECT v.id, v.enabled, v."customFieldsShippingprofileid" FROM product_variant v JOIN product_variant_channels_channel c ON c."productVariantId"=v.id WHERE c."channelId"=37 AND v.enabled=true ORDER BY v.id LIMIT 20`);
await q("t3(38) variants", `SELECT v.id, v.enabled, v."customFieldsShippingprofileid" FROM product_variant v JOIN product_variant_channels_channel c ON c."productVariantId"=v.id WHERE c."channelId"=38 AND v.enabled=true ORDER BY v.id LIMIT 20`);
await client.end();
