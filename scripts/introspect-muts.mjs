const ADMIN_API = process.env.ADMIN_API || "https://e.joho.cn/admin-api";
let tok = null;
async function gql(q) {
  const h = { "Content-Type": "application/json" };
  if (tok) h.authorization = "Bearer " + tok;
  const r = await fetch(ADMIN_API, { method: "POST", headers: h, body: JSON.stringify({ query: q }) });
  const nt = r.headers.get("vendure-auth-token"); if (nt) tok = nt;
  return (await r.json()).data;
}
(async () => {
  await gql(`mutation($u:String!,$p:String!){ login(username:$u password:$p rememberMe:true){ __typename } }`);
  // 用 GraphQL >= 2018 标准内省（type(...) on FIELD 需 alignTo2021）+ 简化版
  const fields = ["assignProductsToChannel", "removeProductsFromChannel", "createProductVariants", "createProduct"];
  for (const nm of fields) {
    const d = await gql(`query{ __type(name:"Mutation"){ fields(includeDeprecated:true){ name args{ name type{ kind name ofType{ kind name ofType{ name } } } } type{ kind name ofType{ kind name } } } } }`);
    const f = d?.__type?.fields?.find((x) => x.name === nm);
    const argStr = (f?.args || []).map((a) => `${a.name}:${a.type.name || a.type.ofType?.name}`).join(", ");
    console.log(`Mutation.${nm}(${argStr}) : ${f?.type?.name || (f?.type?.ofType?.name)}`);
  }
  const q = await gql(`query{ __type(name:"Query"){ fields{ name args{ name type{ name } } } } }`);
  const pq = q?.__type?.fields?.find((x) => x.name === "product");
  console.log(`Query.product(${(pq?.args||[]).map(a=>`${a.name}:${a.type.name}`).join(", ")})`);
})();