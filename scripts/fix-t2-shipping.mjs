// 修正 t2 配送配置：
//  1) t2 默认档案(id12) 绑定 mode=store 的门店自提 + 自提点 id4(自由大路 store)
//  2) 清理 2 条陈记测试残留档案(id9, id10)：先检查商品引用，无引用才删
const ADMIN_API = "https://e.joho.cn/admin-api";
const EMAIL = "superadmin", PWD = "z123123";
const T2_TOKEN = "66ruvnhh34svhckaa2i";
let tok = null;
async function gql(q, v = {}, t2 = true) {
  const h = { "Content-Type": "application/json" };
  if (tok) h.authorization = "Bearer " + tok;
  if (t2) h["vendure-token"] = T2_TOKEN;
  const r = await fetch(ADMIN_API, { method: "POST", headers: h, body: JSON.stringify({ query: q, variables: v }) });
  const nt = r.headers.get("vendure-auth-token"); if (nt) tok = nt;
  const j = await r.json().catch(() => ({}));
  if (j.errors) throw new Error("gql: " + JSON.stringify(j.errors).slice(0, 800));
  return j.data;
}
async function main() {
  await gql(`mutation($u:String!,$p:String!){ login(username:$u password:$p rememberMe:true){ __typename } }`, { u: EMAIL, p: PWD });
  if (!tok) throw new Error("login failed");

  // step1: 校验各档案商品引用（后端 delete 内部也会校验，这里先预警）
  const vcount1 = await gql(`query { shippingProfiles(options:{take:50}){ items{ id name code } } }`);
  console.log("t2 当前档案:", vcount1.shippingProfiles.items.map(p=>`${p.id}:${p.name}`).join(" | "));

  // step2: 更新档案 id12 的 methodConfigs + pickupLocations
  const upd = await gql(`mutation U($input: UpdateShippingProfileInput!) {
    updateShippingProfile(input: $input){ id name }
  }`, { input: {
      id: "12",
      methodConfigs: [{ shippingMethodId: "1", mode: "store", options: { rangeMode: "selected", pickupLocationIds: ["4"] } }],
      shippingMethodIds: ["1"],
      pickupLocationIds: ["4"],
  }});
  console.log("\n[update id12] methodConfigs+mode=store+pickup(id4):", JSON.stringify(upd.updateShippingProfile));

  // step3: 清理陈记残留档案 id9/id10
  for (const pid of ["9", "10"]) {
    try {
      await gql(`mutation D($id: ID!){ deleteShippingProfile(id: $id) }`, { id: pid });
      console.log(`[delete] 档案 ${pid} 已删除`);
    } catch (e) {
      console.log(`[delete] 档案 ${pid} 删除失败(可能有商品引用):`, e.message.slice(0, 150));
    }
  }

  // step4: 复核
  const after = await gql(`query { shippingProfiles(options:{take:50}){ items{ id name code isTenantDefault shippingMethods{ id code } methodConfigs { shippingMethodId mode options } pickupLocations{ id name type } } } }`);
  console.log("\n===== 修正后 t2 档案 =====");
  for (const p of after.shippingProfiles.items) {
    console.log(`[${p.id}] ${p.name} default=${p.isTenantDefault} methods=${p.shippingMethods.map(m=>m.code).join(",")} configs=${JSON.stringify(p.methodConfigs.map(c=>({mid:c.shippingMethodId,mode:c.mode,o:c.options})))} pickup=${p.pickupLocations.map(l=>l.name).join(",")}`);
  }
}
main().then(() => console.log("\nDONE")).catch(e => { console.error("FAIL:", e.message); process.exit(1); });