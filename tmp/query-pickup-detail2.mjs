#!/usr/bin/env node
/** 查询配送方式 calculator 与渠道表结构 */
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
await q("shipping_method calculator", `SELECT id, code, calculator FROM shipping_method WHERE id IN (1, 30) ORDER BY id`);
await q("channel cols", `SELECT column_name FROM information_schema.columns WHERE table_name='channel' ORDER BY ordinal_position`);
await q("channel all", `SELECT id, code FROM channel ORDER BY id`);
await q("pickup cols", `SELECT column_name FROM information_schema.columns WHERE table_name='pickup_location' ORDER BY ordinal_position`);
await client.end();
console.log("\nDONE");
