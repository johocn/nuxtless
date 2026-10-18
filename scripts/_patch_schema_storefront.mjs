// 临时脚本：本地 graphql.schema.json 补齐尚未部署的租户券店字段
// （Channel.customFields.storefrontMode / storefrontHomeLayout，Task 1 部署后可用真实 schema 替换）
// 用法：node scripts/_patch_schema_storefront.mjs
import { readFileSync, writeFileSync } from "node:fs";

const p = new URL("../graphql.schema.json", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1");
const schema = JSON.parse(readFileSync(p, "utf8"));

function cloneField(f, newName) {
  return JSON.parse(JSON.stringify(f).replace(`"${f.name}"`, `"${newName}"`));
}

let touched = 0;
for (const tp of schema.__schema.types) {
  if (tp.name !== "ChannelCustomFields" || !tp.fields) continue;
  const ref = tp.fields.find(f => f.name === "shopIntro");
  if (!ref) continue;
  for (const name of ["storefrontMode", "storefrontHomeLayout"]) {
    if (!tp.fields.some(f => f.name === name)) {
      tp.fields.push(cloneField(ref, name));
      touched++;
    }
  }
}

writeFileSync(p, JSON.stringify(schema, null, 2) + "\n");
console.log(`patched ${touched} locations`);
