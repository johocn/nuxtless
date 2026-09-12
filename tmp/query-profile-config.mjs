#!/usr/bin/env node
/** 查询门店自提档案(id=1)的方式配置与档案级自提点绑定 */
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
await q("shipping_profile_method cols", `SELECT column_name, data_type FROM information_schema.columns WHERE table_name='shipping_profile_method' ORDER BY ordinal_position`);
await q("shipping_profile_method rows", `SELECT * FROM shipping_profile_method ORDER BY "shippingProfileId", "shippingMethodId"`);
await q("profile_pickup cols", `SELECT column_name, data_type FROM information_schema.columns WHERE table_name='shipping_profile_pickup_locations_pickup_location' ORDER BY ordinal_position`);
await q("profile_pickup rows", `SELECT * FROM shipping_profile_pickup_locations_pickup_location ORDER BY "shippingProfileId"`);
await client.end();
console.log("\nDONE");
