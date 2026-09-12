#!/usr/bin/env node
/**
 * 查询配送档案 / 自提点 / 方式配置（诊断「自由大路 vs 国信南山温泉酒店」显示问题）
 * 用法：scp 到服务器 /tmp 后 node 运行（复用 strapi node_modules/pg，读 strapi .env 跨库连 vendure）
 */
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
    console.log(`\n===== ${label} (${r.rowCount} rows) =====`);
    console.log(JSON.stringify(r.rows, null, 1));
  } catch (e) {
    console.log(`\n===== ${label} ERROR =====`);
    console.log(e.message);
  }
};

await client.connect();

// 1. 配送档案
await q("shipping_profile", `SELECT id, name, code, "requiresAddress", "requiresContact" FROM shipping_profile ORDER BY id`);

// 2. 自提点
await q("pickup_location", `SELECT id, name, type, address, coordinates, enabled FROM pickup_location ORDER BY id`);

// 3. 配送方式
await q("shipping_method", `SELECT id, code, enabled FROM shipping_method ORDER BY id`);

// 4. 档案-方式关联
await q("profile_methods", `SELECT * FROM shipping_profile_shipping_methods_shipping_method ORDER BY "shippingProfileId"`);

// 5. methodConfig 表结构（探测）
await q("method_config cols", `SELECT column_name FROM information_schema.columns WHERE table_name LIKE '%method_config%' ORDER BY ordinal_position`);

await client.end();
console.log("\nDONE");
