// 方案1 seed：为样例商品回填 deliveryMethods（首页过滤验收数据）
//  A) id71 国信南山温泉门票 → 仅自提，belongCity=长春（北京隐藏/长春显示/邮寄隐藏）
//  B) id75 黄金珠宝 → 仅邮寄，全国可寄（邮寄可见/自提隐藏）
//  C) id59 温泉门票 → 仅邮寄，仅长春/吉林可寄（区间品）
const base = "https://e.joho.cn";
let token = null;
async function gql(path, query, vars) {
  const headers = { "Content-Type": "application/json" };
  if (token) headers["Authorization"] = "Bearer " + token;
  const r = await fetch(base + path, { method: "POST", headers, body: JSON.stringify({ query, variables: vars || {} }) });
  const nt = r.headers.get("admin-auth-token") || r.headers.get("vendure-auth-token");
  if (nt) token = nt;
  const j = await r.json();
  if (j?.errors) console.log(`[FAIL] ${path}:`, JSON.stringify(j.errors[0]?.message ?? j.errors).slice(0, 200));
  return j;
}
const V = (label, r) => {
  if (r?.errors) { console.log(`[FAIL] ${label}:`, JSON.stringify(r.errors[0]?.message ?? r.errors).slice(0, 200)); return null; }
  const data = r?.data ?? {};
  const val = Object.values(data)[0];
  console.log(`[OK] ${label}:`, JSON.stringify(val).slice(0, 300));
  return val;
};
(async () => {
  const lr = await gql("/admin-api", `mutation{ login(username:"superadmin", password:"z123123", rememberMe:true){ __typename } }`);
  if (lr?.data?.login?.__typename !== "CurrentUser") { console.log("[FAIL] login"); process.exit(1); }

  const targets = [
    { id: "71", cf: { deliveryMethods: ["SELF_PICKUP"], belongCity: "长春", serviceCities: [] } },
    { id: "75", cf: { deliveryMethods: ["MAIL"], belongCity: null, serviceCities: [] } },
    { id: "59", cf: { deliveryMethods: ["MAIL"], belongCity: null, serviceCities: ["长春", "吉林"] } },
  ];
  for (const t of targets) {
    V(`updateProduct ${t.id}`, await gql("/admin-api", `mutation($id:ID!,$cf:UpdateProductCustomFieldsInput!){ updateProduct(input:{ id:$id, customFields:$cf }){ id slug customFields{ belongCity serviceCities deliveryMethods } } }`, { id: t.id, cf: t.cf }));
  }
  console.log("\n[DONE]");
})().catch(e => { console.error("[ERR]", e.message); process.exit(1); });
