// 更新租户名（Channel.customFields.shopName），改名后可选同步前端租户映射 tenant-channels.json。
// 用法:
//   node scripts/update-tenant-name.mjs <code|id> <新名称> [--sync]   # 改单个租户名
//   node scripts/update-tenant-name.mjs --list                         # 列出全部租户 code/id/当前名
// 环境变量: ADMIN_API(默认 https://e.joho.cn/admin-api) ADMIN_EMAIL(默认 superadmin) ADMIN_PASSWORD(默认 z123123)
// 说明: name 由后端 updateChannel 合并写入 customFields.shopName（只覆盖该字段，不动其它）。
//       --sync 会重新生成 layers/base/data/tenant-channels.json（name=shopName），
//       前端站点名依赖该文件，部署后生效（node scripts/deploy.mjs）。
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

/** 生成前端租户映射（与 scripts/generate-tenant-map.mjs 同源逻辑）。 */
async function writeTenantMap() {
  const { tenants } = await gql(`query{ tenants(options:{take:200}){ items{ id code token customFields{ shopName tenantNo isOfficial enabled } } } }`);
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
  console.log(`[sync] 已重写 ${out}（${map.tenants.length} 个租户）`);
}

async function listTenants() {
  const { tenants } = await gql(`query{ tenants(options:{take:200}){ items{ id code token customFields{ shopName enabled } } } }`);
  const rows = (tenants?.items || [])
    .filter((t) => t.code !== "__default_channel__")
    .sort((a, b) => a.code.localeCompare(b.code));
  console.log(`${"code".padEnd(24)} ${"id".padEnd(6)} 名称`);
  for (const t of rows) {
    console.log(`${t.code.padEnd(24)} ${String(t.id).padEnd(6)} ${t.customFields?.shopName || "(未命名)"}`);
  }
  return rows;
}

async function main() {
  const args = process.argv.slice(2);
  if (args.length === 0) {
    console.log("用法: node scripts/update-tenant-name.mjs <code|id> <新名称> [--sync] | --list");
    process.exit(1);
  }
  const login = await gql(`mutation($u:String!,$p:String!){ login(username:$u password:$p rememberMe:true){ __typename ...on ErrorResult{message} } }`, { u: ADMIN_EMAIL, p: ADMIN_PASSWORD });
  if (!tok) throw new Error("login failed: " + JSON.stringify(login?.login || login));

  if (args[0] === "--list") {
    await listTenants();
    return;
  }

  const key = args[0];
  const name = args[1];
  if (!name) throw new Error("缺少新名称参数");
  const sync = args.includes("--sync");

  const tenants = await listTenants();
  const target = tenants.find((t) => t.code === key) || tenants.find((t) => String(t.id) === key);
  if (!target) throw new Error(`未找到租户 ${key}（用 --list 查看可用 code/id）`);

  const oldName = target.customFields?.shopName || "(未命名)";
  const { updateTenant } = await gql(
    `mutation($id:ID!,$input:UpdateTenantInput!){ updateTenant(id:$id input:$input){ id code token customFields{ shopName enabled } } }`,
    { id: target.id, input: { name } },
  );
  const newName = updateTenant?.customFields?.shopName ?? name;
  console.log(`\n✅ 租户 ${target.code} (id=${target.id}) 名称已更新: ${oldName} → ${newName}`);

  if (sync) await writeTenantMap();
  console.log(`\n提示: 前端站点名取自 tenant-channels.json 的 name（=shopName），${sync ? "已同步，" : "如需同步请运行 node scripts/generate-tenant-map.mjs，"}再部署生效（node scripts/deploy.mjs）。`);
}

main().catch((e) => {
  console.error("错误:", e.message);
  process.exit(1);
});