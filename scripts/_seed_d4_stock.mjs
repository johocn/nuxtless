// 方案2-D 回归数据准备：主站开物理库存 → 物理仓 → 绑定变体57 → 双仓库存；变体58 纯虚拟库存
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
const V = (label, r, min = 1) => {
  if (r?.errors) { console.log(`[FAIL] ${label}:`, JSON.stringify(r.errors[0]?.message ?? r.errors)); process.exit(1); }
  if (min === 0) return;
  const data = r?.data ?? {};
  const val = Object.values(data)[0];
  if (val === undefined || val === null) { console.log(`[FAIL] ${label}: 无返回值`, JSON.stringify(r).slice(0, 300)); process.exit(1); }
  console.log(`[OK] ${label}:`, JSON.stringify(val).slice(0, 400));
};

(async () => {
  const lr = await gql("/admin-api", `mutation{ login(username:"superadmin", password:"z123123", rememberMe:true){ __typename ...on ErrorResult{ errorCode message } } }`);
  if (lr?.data?.login?.__typename !== "CurrentUser") { console.log("[FAIL] login"); process.exit(1); }
  console.log("[OK] login");

  // 1) 开启主站物理库存开关
  const ch = await gql("/admin-api", `mutation($id:ID!){ updateChannel(input:{ id:$id, customFields:{ physicalStockEnabled:true } }){ ... on Channel { id code customFields{ physicalStockEnabled } } ... on ErrorResult{ errorCode message } } }`, { id: "1" });
  V("开启 physicalStockEnabled", ch);

  // 2) 创建物理仓（默认仓 code=__default_channel__）
  const loc = await gql("/admin-api", `mutation($n:String!,$d:String!){ createStockLocation(input:{ name:$n, description:$d, customFields:{ kind:"physical", code:"__default_channel__" } }){ id name customFields{ kind code } } }`, { n: "主站默认物理仓", d: "方案2-D 回归用物理仓" });
  V("createStockLocation", loc);
  const locId = String(loc.data.createStockLocation.id);

  // 3) 绑定变体 57（温泉工作日门票）→ 物理驱动变体
  const bd = await gql("/admin-api", `mutation($vid:ID!,$loc:ID!){ setVariantBindings(variantId:$vid, bindings:[{ locationId:$loc, isDefault:true }]){ id variantId locationId isDefault } }`, { vid: "57", loc: locId });
  V("setVariantBindings(57)", bd);

  // 4) 物理仓库存 50 + 虚拟仓镜像 50（手动同步=Σ物理）
  const vloc = "4"; // __default_channel__ 虚拟仓
  const s1 = await gql("/admin-api", `mutation($v:ID!,$l:ID!){ setVariantStock(productVariantId:$v, stockLocationId:$l, stockOnHand:50) }`, { v: "57", l: locId });
  V("物理仓库存57=50", s1);
  const s2 = await gql("/admin-api", `mutation($v:ID!,$l:ID!){ setVariantStock(productVariantId:$v, stockLocationId:$l, stockOnHand:50) }`, { v: "57", l: vloc });
  V("虚拟仓镜像57=50", s2);

  // 5) 变体 58 纯虚拟库存 30（开物理租户·未绑定变体）
  const s3 = await gql("/admin-api", `mutation($v:ID!,$l:ID!){ setVariantStock(productVariantId:$v, stockLocationId:$l, stockOnHand:30) }`, { v: "58", l: vloc });
  V("虚拟仓58=30", s3);

  console.log("\n[DONE] locId=", locId);
})().catch(e => { console.error("[ERR]", e.message); process.exit(1); });
