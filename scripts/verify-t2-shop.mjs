// 只读 shop 验证：t2 租户结算面可用的配送方式与自提点（用租户 token 请求 shop API）
const SHOP = "https://www.youshop.cn/shop-api";
const T2_TOKEN = "66ruvnhh34svhckaa2i"; // t2 vendure-token

async function gql(q, v = {}) {
  const r = await fetch(SHOP, { method: "POST",
    headers: { "Content-Type": "application/json", "vendure-token": T2_TOKEN, "Accept-Language": "zh_Hans" },
    body: JSON.stringify({ query: q, variables: v }) });
  const j = await r.json().catch(() => ({}));
  if (j.errors) throw new Error("gql: " + JSON.stringify(j.errors).slice(0, 600));
  return j.data;
}

async function main() {
  // 1) t2 结算面：默认档案解析出的配送方式（应含门店自提 id1，mode=store -> pickupLocationIds=[4])
  const d1 = await gql(`query { resolveShippingMethodsForChannel { id code mode pickupLocationIds name } }`);
  console.log("===== resolveShippingMethodsForChannel(t2) =====");
  console.log(JSON.stringify(d1?.resolveShippingMethodsForChannel, null, 2));

  // 2) t2 门店自提点
  const d2 = await gql(`query Q($ids:[ID!]!){ eligiblePickupLocationsByProfile(profileIds:$ids){ id name type address } }`, { ids: ["12"] });
  console.log("\n===== eligiblePickupLocationsByProfile(profile=12) =====");
  console.log(JSON.stringify(d2?.eligiblePickupLocationsByProfile, null, 2));
}
main().then(() => console.log("\nDONE")).catch(e => { console.error("FAIL:", e.message); process.exit(1); });