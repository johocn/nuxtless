// 临时脚本：本地 graphql.schema.json 补齐尚未部署的插件字段
//   1) ChannelCustomFields.themeTokensOverride（五级风格体系 L3 渠道覆盖）
//   2) Query.channelDeliveryCapability + ChannelDeliveryCapability 类型（配送能力派生）
// 依赖：本地后端尚未部署这些字段（快照滞后），与 _patch_schema_delivery.mjs 同一套路。
// 用法：node scripts/_patch_schema_capability_theme.mjs
import { readFileSync, writeFileSync } from "node:fs";

const p = new URL("../graphql.schema.json", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1");
const schema = JSON.parse(readFileSync(p, "utf8"));
const types = schema.__schema.types;

function clone(obj) {
  return JSON.parse(JSON.stringify(obj));
}

let touched = 0;

// 1) ChannelCustomFields.themeTokensOverride（克隆同类型的普通 String 字段）
for (const tp of types) {
  if (tp.name !== "ChannelCustomFields" || !tp.fields) continue;
  if (tp.fields.some((f) => f.name === "themeTokensOverride")) continue;
  const src = tp.fields.find((f) => f.name === "shopName") ?? tp.fields.find((f) => f.type?.name === "String");
  if (!src) continue;
  const f = clone(src);
  f.name = "themeTokensOverride";
  tp.fields.push(f);
  touched++;
}

// 2) ChannelDeliveryCapability 类型
if (!types.some((t) => t.name === "ChannelDeliveryCapability")) {
  types.push({
    kind: "OBJECT",
    name: "ChannelDeliveryCapability",
    description: null,
    fields: [
      {
        name: "modes",
        description: null,
        args: [],
        type: { kind: "LIST", name: null, ofType: { kind: "NON_NULL", name: null, ofType: { kind: "SCALAR", name: "String", ofType: null } } },
        isDeprecated: false,
        deprecationReason: null,
      },
      {
        name: "bothSupported",
        description: null,
        args: [],
        type: { kind: "NON_NULL", name: null, ofType: { kind: "SCALAR", name: "Boolean", ofType: null } },
        isDeprecated: false,
        deprecationReason: null,
      },
      {
        name: "source",
        description: null,
        args: [],
        type: { kind: "NON_NULL", name: null, ofType: { kind: "SCALAR", name: "String", ofType: null } },
        isDeprecated: false,
        deprecationReason: null,
      },
      {
        name: "facetValueIds",
        description: null,
        args: [],
        type: { kind: "SCALAR", name: "JSON", ofType: null },
        isDeprecated: false,
        deprecationReason: null,
      },
    ],
    interfaces: [],
    possibleTypes: null,
    enumValues: null,
    inputFields: null,
  });
  touched++;
}

// 3) Query.channelDeliveryCapability
for (const tp of types) {
  if (tp.name !== "Query" || !tp.fields) continue;
  if (tp.fields.some((f) => f.name === "channelDeliveryCapability")) continue;
  const src = tp.fields.find((f) => f.name === "variantStockInfo");
  if (!src) continue;
  const f = clone(src);
  f.name = "channelDeliveryCapability";
  f.args = [];
  f.type = { kind: "NON_NULL", name: null, ofType: { kind: "OBJECT", name: "ChannelDeliveryCapability", ofType: null } };
  tp.fields.push(f);
  touched++;
}

writeFileSync(p, JSON.stringify(schema, null, 2) + "\n");
console.log(`patched ${touched} locations`);