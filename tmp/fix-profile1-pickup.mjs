#!/usr/bin/env node
/**
 * 修复门店自提配送档案(id=1)自提点：删除档案级残留绑定 pickupLocationId=1(自由大路店)，
 * 自提点仅由方式配置指定（国信南山温泉酒店 id=13）。
 * 先备份到 /www/apps/_dbbackup/，再删除，最后验证。
 */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
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

const PROFILE_ID = 1; // 门店自提配送档案
const STALE_PICKUP_ID = 1; // 自由大路店（残留错误绑定）

await client.connect();

// 1. 备份待删行
const bak = await client.query(
  `SELECT * FROM shipping_profile_pickup_locations_pickup_location WHERE "shippingProfileId" = $1`,
  [PROFILE_ID],
);
const dir = "/www/apps/_dbbackup";
mkdirSync(dir, { recursive: true });
const bakFile = `${dir}/profile1_pickup_binding_${new Date().toISOString().slice(0, 10)}.json`;
writeFileSync(bakFile, JSON.stringify(bak.rows, null, 2));
console.log(`[backup] ${bak.rows.length} 行已备份 → ${bakFile}`);

// 2. 删除档案1 的档案级自提点绑定（自由大路店）
const del = await client.query(
  `DELETE FROM shipping_profile_pickup_locations_pickup_location WHERE "shippingProfileId" = $1`,
  [PROFILE_ID],
);
console.log(`[delete] 删除档案${PROFILE_ID} 档案级自提点绑定 ${del.rowCount} 行`);

// 3. 验证
const after = await client.query(
  `SELECT * FROM shipping_profile_pickup_locations_pickup_location ORDER BY "shippingProfileId"`,
);
console.log("\n===== 删除后档案级绑定 =====");
console.log(JSON.stringify(after.rows, null, 1));

const cfg = await client.query(
  `SELECT "profileId", "shippingMethodId", mode, options FROM shipping_profile_method WHERE "profileId" = $1`,
  [PROFILE_ID],
);
console.log("\n===== 档案1 方式配置（唯一自提点来源）=====");
console.log(JSON.stringify(cfg.rows, null, 1));

await client.end();
console.log("\nDONE");
