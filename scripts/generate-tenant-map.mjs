// 生成 nshop 前端租户 code→channel token 映射文件 layers/base/data/tenant-channels.json
// 用法: node scripts/generate-tenant-map.mjs
// 环境变量: ADMIN_API(默认 https://e.joho.cn/admin-api) ADMIN_EMAIL ADMIN_PASSWORD
import { writeFileSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dir = dirname(fileURLToPath(import.meta.url));
const ADMIN_API = process.env.ADMIN_API || "https://e.joho.cn/admin-api";
const ADMIN_EMAIL = process.env.ADMIN_EMAIL || "superadmin";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "z123123";
let tok = null;

async function gql(q, v = {}) {
  const h = { "Content-Type": "application/json" };
  if (tok) h.authorization = "Bearer " + tok;
  const r = await fetch(ADMIN_API, { method: "POST", headers: h, body: JSON.stringify({ query: q, variables: v }) });
  const nt = r.headers.get("vendure-auth-token");
  if (nt) tok = nt;
  const j = await r.json().catch(() => ({}));
  if (j.errors) throw new Error("gql error: " + JSON.stringify(j.errors));
  return j.data;
}
const login = await gql(`mutation($u:String!,$p:String!){ login(username:$u password:$p rememberMe:true){ __typename ...on ErrorResult{message} } }`, { u: ADMIN_EMAIL, p: ADMIN_PASSWORD });
if (!tok) throw new Error("login failed: " + JSON.stringify(login?.login || login));
const { tenants } = await gql(`query{ tenants(options:{take:100}){ items{ id code token customFields{ shopName tenantNo isOfficial enabled } } } }`);
const exclude = new Set(["__default_channel__"]);
const map = {
  tenants: (tenants?.items || [])
    .filter((t) => !exclude.has(t.code) && t.customFields?.enabled !== false)
    .map((t) => ({ code: t.code, token: t.token, name: t.customFields?.shopName || t.code }))
    .sort((a, b) => a.code.localeCompare(b.code)),
};
const out = resolve(__dir, "../layers/base/data/tenant-channels.json");
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, JSON.stringify(map, null, 2) + "\n");
console.log(`written ${out} with ${map.tenants.length} tenants`);