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
await q("pickup_location_channels_channel", `SELECT * FROM pickup_location_channels_channel ORDER BY "pickupLocationId"`);
await q("channel", `SELECT id, code FROM channel ORDER BY id`);
await q("shipping_profile_method cols", `SELECT column_name FROM information_schema.columns WHERE table_name='shipping_profile_method' ORDER BY ordinal_position`);
await q("shipping_method", `SELECT id, code, "fulfillmentHandlerCode" FROM shipping_method ORDER BY id`);
await client.end();
