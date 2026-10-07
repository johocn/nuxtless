// 临时脚本：本地 graphql.schema.json 补售后三期字段（后端部署完成前 codegen 用）
// - AfterSalesState 枚举追加 ExchangeShipped
// - AfterSalesRequest 追加 exchangeTrackingNo / exchangeCarrier / messageCount
// - 新类型 AfterSalesMessage / AfterSalesMessageList / AfterSalesMessageListOptions（含 skip/take）
// - Query.afterSalesMessages；Mutation.addAfterSalesMessage / exchangeReceiveAfterSalesRequest
// 用法：node scripts/_patch_schema_aftersales3.mjs
import { readFileSync, writeFileSync } from "node:fs";

const p = new URL("../graphql.schema.json", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1");
const schema = JSON.parse(readFileSync(p, "utf8"));

const nonNull = (kind, name) => ({ kind: "NON_NULL", name: null, ofType: { kind, name, ofType: null } });
const nullable = (kind, name) => ({ kind, name, ofType: null });
const listOfString = { kind: "LIST", name: null, ofType: { kind: "NON_NULL", name: null, ofType: { kind: "SCALAR", name: "String", ofType: null } } };

const field = (name, type, args = []) => ({
  name, description: null, args, isDeprecated: false, deprecationReason: null, type,
});
const arg = (name, type) => ({ name, description: null, type, defaultValue: null, isDeprecated: false, deprecationReason: null });

let touched = 0;
for (const tp of schema.__schema.types) {
  if (tp.name === "AfterSalesState" && tp.kind === "ENUM" && tp.enumValues) {
    if (!tp.enumValues.some((v) => v.name === "ExchangeShipped")) {
      tp.enumValues.push({ name: "ExchangeShipped", description: null, isDeprecated: false, deprecationReason: null });
      touched++;
    }
  }
  if (tp.name === "AfterSalesRequest" && tp.fields) {
    let added = false;
    if (!tp.fields.some((f) => f.name === "exchangeTrackingNo")) { tp.fields.push(field("exchangeTrackingNo", nullable("SCALAR", "String"))); added = true; }
    if (!tp.fields.some((f) => f.name === "exchangeCarrier")) { tp.fields.push(field("exchangeCarrier", nullable("SCALAR", "String"))); added = true; }
    if (!tp.fields.some((f) => f.name === "messageCount")) { tp.fields.push(field("messageCount", nonNull("SCALAR", "Int"))); added = true; }
    if (added) touched++;
  }
  if (tp.name === "Query" && tp.fields && !tp.fields.some((f) => f.name === "afterSalesMessages")) {
    tp.fields.push(
      field("afterSalesMessages", nonNull("OBJECT", "AfterSalesMessageList"), [
        arg("id", nonNull("SCALAR", "ID")),
        arg("options", nullable("INPUT_OBJECT", "AfterSalesMessageListOptions")),
      ]),
    );
    touched++;
  }
  if (tp.name === "Mutation" && tp.fields && !tp.fields.some((f) => f.name === "addAfterSalesMessage")) {
    tp.fields.push(
      field("addAfterSalesMessage", nonNull("OBJECT", "AfterSalesMessage"), [
        arg("id", nonNull("SCALAR", "ID")),
        arg("content", nonNull("SCALAR", "String")),
        arg("images", listOfString),
      ]),
    );
    touched++;
  }
  if (tp.name === "Mutation" && tp.fields && !tp.fields.some((f) => f.name === "exchangeReceiveAfterSalesRequest")) {
    tp.fields.push(
      field("exchangeReceiveAfterSalesRequest", nonNull("OBJECT", "AfterSalesRequest"), [
        arg("id", nonNull("SCALAR", "ID")),
      ]),
    );
    touched++;
  }
}

if (!schema.__schema.types.some((tp) => tp.name === "AfterSalesMessage")) {
  schema.__schema.types.push(
    {
      kind: "OBJECT",
      name: "AfterSalesMessage",
      description: null,
      fields: [
        field("id", nonNull("SCALAR", "ID")),
        field("requestId", nonNull("SCALAR", "ID")),
        field("senderType", nonNull("SCALAR", "String")),
        field("senderUserId", nullable("SCALAR", "ID")),
        field("senderName", nonNull("SCALAR", "String")),
        field("content", nonNull("SCALAR", "String")),
        field("images", listOfString),
        field("createdAt", nonNull("SCALAR", "DateTime")),
      ],
      inputFields: null,
      interfaces: [],
      enumValues: null,
      possibleTypes: null,
    },
    {
      kind: "OBJECT",
      name: "AfterSalesMessageList",
      description: null,
      fields: [
        field("items", { kind: "NON_NULL", name: null, ofType: { kind: "LIST", name: null, ofType: { kind: "NON_NULL", name: null, ofType: { kind: "OBJECT", name: "AfterSalesMessage", ofType: null } } } }),
        field("totalItems", nonNull("SCALAR", "Int")),
      ],
      inputFields: null,
      interfaces: [],
      enumValues: null,
      possibleTypes: null,
    },
    {
      kind: "INPUT_OBJECT",
      name: "AfterSalesMessageListOptions",
      description: null,
      fields: null,
      inputFields: [
        { name: "skip", description: null, type: nullable("SCALAR", "Int"), defaultValue: null, isDeprecated: false, deprecationReason: null },
        { name: "take", description: null, type: nullable("SCALAR", "Int"), defaultValue: null, isDeprecated: false, deprecationReason: null },
      ],
      interfaces: null,
      enumValues: null,
      possibleTypes: null,
    },
  );
  touched++;
}

writeFileSync(p, JSON.stringify(schema, null, 2) + "\n");
console.log(`patched ${touched} locations`);
