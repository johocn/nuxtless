#!/usr/bin/env node
/** 修复：门店自提配送档案(id=1)补绑自由大路店(1) + 自由大路店分配到全部租户渠道 */
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";

const DRY = process.argv.includes("--dry");
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
const log = (label, rows) => console.log(`\n== ${label} (${rows?.length ?? rows}) ==`);

await client.connect();

// 1. 门店自提档案(1) 方式1 选项补绑自由大路店(1)：['13'] -> ['1','13']
const before = await client.query(
  `SELECT options FROM shipping_profile_method WHERE "profileId"='1' AND "shippingMethodId"='1'`
);
console.log("档案1方式1 修复前 options:", JSON.stringify(before.rows));
const opts = JSON.parse(before.rows[0]?.options || "{}");
const ids = Array.isArray(opts.pickupLocationIds) ? [...opts.pickupLocationIds] : [];
for (const id of ["1", "13"]) if (!ids.includes(id)) ids.push(id);
const next = { ...opts, rangeMode: "selected", pickupLocationIds: ids };
console.log("档案1方式1 修复后 options:", JSON.stringify(next));
if (!DRY) {
  await client.query(
    `UPDATE shipping_profile_method SET options=$1 WHERE "profileId"='1' AND "shippingMethodId"='1'`,
    [JSON.stringify(next)]
  );
}

// 2. 自由大路店(1) 分配到全部渠道（除已关联的 1/7 之外的所有 channel）
const linked = await client.query(
  `SELECT "channelId" FROM pickup_location_channels_channel WHERE "pickupLocationId"=1`
);
const linkedIds = new Set(linked.rows.map((r) => String(r.channelId)));
const channels = await client.query(`SELECT id, code FROM channel ORDER BY id`);
const toAdd = channels.rows.filter((c) => !linkedIds.has(String(c.id)));
console.log("自由大路店已关联渠道:", [...linkedIds].join(","));
console.log("将新增关联渠道:", JSON.stringify(toAdd.map((c) => `${c.id}:${c.code}`)));
if (!DRY && toAdd.length) {
  for (const c of toAdd) {
    await client.query(
      `INSERT INTO pickup_location_channels_channel ("pickupLocationId", "channelId") VALUES ($1, $2)`,
      [1, c.id]
    );
  }
}

await client.end();
console.log(DRY ? "\nDRY-RUN 完成（未写库）" : "\n修复完成");
