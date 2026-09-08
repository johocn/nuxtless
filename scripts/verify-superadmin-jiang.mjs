// 验证：用 jiang / z123123 登录，确认超管身份、可见渠道（全局）
const ADMIN_API = "https://e.joho.cn/admin-api";
const USERNAME = "jiang", PASS = "z123123";
let tok = null;
async function gql(q, v = {}, t2 = false) {
  const h = { "Content-Type": "application/json" };
  if (tok) h.authorization = "Bearer " + tok;
  const r = await fetch(ADMIN_API, { method: "POST", headers: h, body: JSON.stringify({ query: q, variables: v }) });
  const nt = r.headers.get("vendure-auth-token"); if (nt) tok = nt;
  const j = await r.json().catch(() => ({}));
  if (j.errors) throw new Error("gql: " + JSON.stringify(j.errors).slice(0, 600));
  return { data: j.data, hasTok: !!tok };
}

async function main() {
  // 1) 登录
  const r1 = await gql(`mutation($u:String!,$p:String!){ login(username:$u password:$p rememberMe:true){ __typename ... on CurrentUser{ id identifier channels{ id code } } ... on ErrorResult{ message } } }`, { u: USERNAME, p: PASS });
  console.log("登录结果:", JSON.stringify(r1.data?.login));
  console.log("拿到 token:", r1.hasTok);
  if (!r1.hasTok) { console.error("登录失败"); return; }

  // 2) 超管访问：查信任列表（租户位）
  const r2 = await gql(`query { tenantSlots { used capacity } }`);
  console.log("tenantSlots（超管才可查）:", JSON.stringify(r2.data?.tenantSlots));

  // 3) 全域渠道
  const r3 = await gql(`query { channels(options:{take:100}){ totalItems } }`);
  console.log("channels total:", r3.data?.channels?.totalItems);

  // 4) 全局角色池（超管专属）
  const r4 = await gql(`query { globalRoles { id code } }`);
  console.log("globalRoles（超管专属）:", JSON.stringify(r4.data?.globalRoles?.map(r=>({id:r.id,code:r.code}))));
}
main().then(() => console.log("\nDONE")).catch(e => { console.error("FAIL:", e.message); process.exit(1); });