// 临时脚本：本地 graphql.schema.json 补 deliveryMethods / variantStockInfo.deliveryMethod
// 用法：node scripts/_patch_schema_delivery.mjs
import { readFileSync, writeFileSync } from "node:fs";

const p = new URL("../graphql.schema.json", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1");
const schema = JSON.parse(readFileSync(p, "utf8"));

function cloneField(f, newName) {
  return JSON.parse(JSON.stringify(f).replace(`"${f.name}"`, `"${newName}"`));
}

let touched = 0;
for (const tp of schema.__schema.types) {
  for (const key of ["fields", "inputFields"]) {
    const arr = tp[key];
    if (!arr) continue;
    for (const f of arr) {
      if (f.name === "serviceCities" && !arr.some(x => x.name === "deliveryMethods")) {
        const idx = arr.indexOf(f);
        arr.splice(idx + 1, 0, cloneField(f, "deliveryMethods"));
        touched++;
      }
    }
  }
}

// variantStockInfo 查询补 deliveryMethod 参数（克隆 city）
for (const tp of schema.__schema.types) {
  if (tp.name !== "Query" || !tp.fields) continue;
  for (const f of tp.fields) {
    if (f.name === "variantStockInfo" && f.args && !f.args.some(a => a.name === "deliveryMethod")) {
      const city = f.args.find(a => a.name === "city");
      if (city) {
        const idx = f.args.indexOf(city);
        f.args.splice(idx + 1, 0, cloneField(city, "deliveryMethod"));
        touched++;
      }
    }
  }
}

writeFileSync(p, JSON.stringify(schema, null, 2) + "\n");
console.log(`patched ${touched} locations`);
