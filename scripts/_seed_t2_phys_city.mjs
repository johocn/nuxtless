// task2 验收数据：物理仓 serviceCities 三态演示
// W1(id5)=上海(50, 已绑定), 新建 W2=北京(10), 绑定 variant57 到 W1+W2, 镜像虚拟仓=60
const base = "https://e.joho.cn";
let token = null;
async function gql(path, query, vars, raw = false) {
  const headers = { "Content-Type": "application/json" };
  if (token) headers["Authorization"] = "Bearer " + token;
  const r = await fetch(base + path, { method: "POST", headers, body: JSON.stringify({ query, variables: vars || {} }) });
  const nt = r.headers.get("admin-auth-token") || r.headers.get("vendure-auth-token");
  if (nt) token = nt;
  const txt = await r.text();
  if (raw) return { txt, nt };
  let j; try { j = JSON.parse(txt); } catch { j = { raw: txt }; }
  return j;
}
const V = (label, r) => {
  if (r?.errors) { console.log(`[FAIL] ${label}:`, JSON.stringify(r.errors[0]?.message ?? r.errors).slice(0, 200)); return null; }
  const data = r?.data ?? {};
  const val = Object.values(data)[0];
  if (val === undefined || val === null) { console.log(`[FAIL] ${label}: 无返回值`, JSON.stringify(r).slice(0, 200)); return null; }
  console.log(`[OK] ${label}:`, JSON.stringify(val).slice(0, 300));
  return val;
};

(async () => {
  const lr = await gql("/admin-api", `mutation{ login(username:"superadmin", password:"z123123", rememberMe:true){ __typename } }`);
  if (lr?.data?.login?.__typename !== "CurrentUser") { console.log("[FAIL] login"); process.exit(1); }
  console.log("[OK] login");

  // 1) W1(id5) 上海 - 设 serviceCities
  V("setW1 serviceCities", await gql("/admin-api", `mutation($id:ID!){ updateStockLocation(input:{ id:$id, customFields:{ serviceCities:["上海市"] } }){ id name customFields{ kind code serviceCities } } }`, { id: "5" }));

  // 2) 新建 W2 北京前置仓
  const w2 = V("create W2北京", await gql("/admin-api", `mutation{ createStockLocation(input:{ name:"北京前置仓", description:"task2验收 北京物理仓", customFields:{ kind:"physical", code:"__default_channel__-bj", serviceCities:["北京市"], lat:39.9042, lng:116.4074 } }){ id name customFields{ kind code serviceCities lat lng } } }`));
  const w2id = w2?.id;
  if (!w2id) { console.log("[FAIL] 无W2id"); process.exit(1); }

  // 3) 绑定 variant57 → W1(default) + W2
  V("bind 57 to W1+W2", await gql("/admin-api", `mutation($vid:ID!,$locW1:ID!,$locW2:ID!){ setVariantBindings(variantId:$vid, bindings:[{ locationId:$locW1, isDefault:true },{ locationId:$locW2, isDefault:false }]){ id variantId locationId isDefault } }`, { vid: "57", locW1: "5", locW2: w2id }));

  // 4) W2 库存 10；虚拟镜像(id4)同步 60
  V("W2 stock 57=10", await gql("/admin-api", `mutation($v:ID!,$l:ID!){ setVariantStock(productVariantId:$v, stockLocationId:$l, stockOnHand:10) }`, { v: "57", l: w2id }));
  V("mirror(id4)=60", await gql("/admin-api", `mutation($v:ID!,$l:ID!){ setVariantStock(productVariantId:$v, stockLocationId:$l, stockOnHand:60) }`, { v: "57", l: "4" }));

  console.log("\n[DONE] W2id=", w2id);
})().catch(e => { console.error("[ERR]", e.message); process.exit(1); });