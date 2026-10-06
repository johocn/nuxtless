// 临时脚本：本地 graphql.schema.json 补售后二期字段（后端部署完成前 codegen 用）
// - AfterSalesRequest.history: [AfterSalesStateHistoryEntry!]!
// - Query.afterSalesReturnAddress: String!
// - 新类型 AfterSalesStateHistoryEntry
// 用法：node scripts/_patch_schema_aftersales2.mjs
import { readFileSync, writeFileSync } from "node:fs";

const p = new URL("../graphql.schema.json", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1");
const schema = JSON.parse(readFileSync(p, "utf8"));

const listNonNullEntry = {
  kind: "NON_NULL", name: null, ofType: {
    kind: "LIST", name: null, ofType: {
      kind: "NON_NULL", name: null, ofType: { kind: "OBJECT", name: "AfterSalesStateHistoryEntry", ofType: null },
    },
  },
};
const nonNull = (kind, name) => ({ kind: "NON_NULL", name: null, ofType: { kind, name, ofType: null } });
const plain = (kind, name) => ({ kind, name, ofType: null });

const field = (name, type) => ({
  name, description: null, args: [], isDeprecated: false, deprecationReason: null, type,
});

let touched = 0;
for (const tp of schema.__schema.types) {
  if (tp.name === "AfterSalesRequest" && tp.fields) {
    if (!tp.fields.some((f) => f.name === "history")) {
      tp.fields.push(field("history", listNonNullEntry));
      touched++;
    }
  }
  if (tp.name === "Query" && tp.fields) {
    if (!tp.fields.some((f) => f.name === "afterSalesReturnAddress")) {
      tp.fields.push(field("afterSalesReturnAddress", nonNull("SCALAR", "String")));
      touched++;
    }
  }
}

if (!schema.__schema.types.some((tp) => tp.name === "AfterSalesStateHistoryEntry")) {
  schema.__schema.types.push({
    kind: "OBJECT",
    name: "AfterSalesStateHistoryEntry",
    description: null,
    fields: [
      field("fromState", plain("ENUM", "AfterSalesState")),
      field("toState", nonNull("ENUM", "AfterSalesState")),
      field("operatorUserId", plain("SCALAR", "ID")),
      field("createdAt", nonNull("SCALAR", "DateTime")),
    ],
    inputFields: null,
    interfaces: [],
    enumValues: null,
    possibleTypes: null,
  });
  touched++;
}

writeFileSync(p, JSON.stringify(schema, null, 2) + "\n");
console.log(`patched ${touched} locations`);
