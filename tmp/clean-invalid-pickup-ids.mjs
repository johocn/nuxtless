#!/usr/bin/env node
/** 清理配送档案方式级配置中失效的自提点 id（指向不存在的 pickup_location） */
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";

const DRY = process.argv.includes('--dry');
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

async function main() {
  await client.connect();
  const rows = await client.query(
    `SELECT spm.id, spm."profileId", sp.name, sp.enabled, spm.mode, spm.options
     FROM shipping_profile_method spm
     JOIN shipping_profile sp ON sp.id = spm."profileId"::int
     WHERE spm.options IS NOT NULL AND spm.options::text LIKE '%pickupLocationIds%'
     ORDER BY spm."profileId"`);
  console.log(`\n===== pickup 类方式配置（${rows.rowCount}） =====`);
  const existing = await client.query(`SELECT id::text FROM pickup_location`);
  const valid = new Set(existing.rows.map(r => r.id));
  let dirty = 0;
  for (const r of rows.rows) {
    let opts = r.options;
    if (typeof opts === 'string') { try { opts = JSON.parse(opts); } catch {} }
    const ids = (opts?.pickupLocationIds ?? []).map(String);
    const invalid = ids.filter(id => !valid.has(id));
    const storeIds = ids.filter(id => valid.has(id));
    console.log(`profile ${r.profileId} [${r.name}] enabled=${r.enabled} mode=${r.mode} raw=${JSON.stringify(r.options)} ids=${JSON.stringify(ids)} invalid=${JSON.stringify(invalid)}`);
    if (invalid.length) {
      dirty++;
      if (DRY) continue;
      // 失效 id 全部移除；保留的有效 id 不变（若无有效 id 则清空数组）
      const fixed = storeIds;
      const newOpts = { ...opts, pickupLocationIds: fixed };
      await client.query(
        `UPDATE shipping_profile_method SET options = $1 WHERE id = $2`,
        [JSON.stringify(newOpts), r.id]);
      console.log(`  -> FIXED pickupLocationIds=${JSON.stringify(fixed)}`);
    }
  }
  if (DRY) console.log(`\n[DRY RUN] 共 ${dirty} 条含失效 id，未执行修改`);
  else console.log(`\n已修正 ${dirty} 条`);
  await client.end();
}
main().catch(e => { console.error('ERR', e.message); process.exit(1); });
