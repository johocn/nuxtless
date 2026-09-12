#!/usr/bin/env node
/** 查询自提点/配送档案/方式配置/渠道关联全量现状 */
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
await q("pickup_location all", `SELECT id, name, type, "isPublic", "ownerChannelId", enabled, city, address FROM pickup_location ORDER BY id`);
await q("channel all", `SELECT id, code, name FROM channel ORDER BY id`);
await q("shipping_profile all", `SELECT id, code, name, "isGlobal", "ownerChannelId", enabled, "isTenantDefault" FROM shipping_profile ORDER BY id`);
await q("profile_method rows", `SELECT "profileId", "shippingMethodId", mode, options FROM shipping_profile_method ORDER BY "profileId", "shippingMethodId"`);
await q("profile_pickup rows", `SELECT * FROM shipping_profile_pickup_locations_pickup_location ORDER BY "shippingProfileId"`);
await q("pickup_channel rows", `SELECT * FROM pickup_location_channels_channel ORDER BY "pickupLocationId"`);
await q("shipping_method cols", `SELECT column_name FROM information_schema.columns WHERE table_name='shipping_method' ORDER BY ordinal_position`);
await q("shipping_method all", `SELECT id, code FROM shipping_method ORDER BY id`);
await q("variant profile refs", `SELECT "customFieldsShippingprofileid", COUNT(*) FROM product_variant GROUP BY "customFieldsShippingprofileid" ORDER BY 1`);
await client.end();
console.log("\nDONE");
