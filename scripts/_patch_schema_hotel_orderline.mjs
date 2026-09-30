// 临时脚本：本地 graphql.schema.json 补齐尚未部署的酒店订单行字段
//   1) OrderBoxLine: isHotel / hotelCheckIn / hotelCheckOut / hotelNights / hotelNightly / productSlug
//   2) 新增类型 HotelNightPrice { date priceCent type }
//   3) OrderLineCustomFields（OBJECT）与 OrderLineCustomFieldsInput（INPUT_OBJECT）: hotelCheckIn / hotelCheckOut / hotelNights
// 依赖：本地后端 cjk-plugin 已实现这些字段但尚未部署（快照滞后），与 _patch_schema_capability_theme.mjs 同一套路。
// 用法：node scripts/_patch_schema_hotel_orderline.mjs
import { readFileSync, writeFileSync } from "node:fs";

const p = new URL("../graphql.schema.json", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1");
const schema = JSON.parse(readFileSync(p, "utf8"));
const root = schema.__schema ?? schema.data.__schema;
const types = root.types;

const clone = (obj) => JSON.parse(JSON.stringify(obj));
const scalar = (name) => ({ kind: "SCALAR", name, ofType: null });
const obj = (name) => ({ kind: "OBJECT", name, ofType: null });
const nonNull = (ofType) => ({ kind: "NON_NULL", name: null, ofType });
const list = (ofType) => ({ kind: "LIST", name: null, ofType });

/** 构造一个普通输出字段 */
const makeField = (name, type, args = []) => ({
  name,
  description: null,
  args,
  type,
  isDeprecated: false,
  deprecationReason: null,
});

/** 构造一个输入字段 */
const makeInputField = (name, type) => ({ name, description: null, type, defaultValue: null });

let touched = 0;
const findType = (name) => types.find((t) => t.name === name);

// 1) OrderBoxLine 追加 6 个字段
{
  const tp = findType("OrderBoxLine");
  if (tp?.fields) {
    const add = [
      ["isHotel", nonNull(scalar("Boolean"))],
      ["hotelCheckIn", scalar("String")],
      ["hotelCheckOut", scalar("String")],
      ["hotelNights", scalar("Int")],
      ["hotelNightly", list(nonNull(obj("HotelNightPrice")))],
      ["productSlug", scalar("String")],
    ];
    for (const [name, type] of add) {
      if (tp.fields.some((f) => f.name === name)) continue;
      const src = tp.fields.find((f) => f.name === "sku") ?? tp.fields[0];
      const f = clone(src);
      f.name = name;
      f.type = type;
      f.args = [];
      tp.fields.push(f);
      touched++;
    }
  }
}

// 2) HotelNightPrice 类型
if (!findType("HotelNightPrice")) {
  types.push({
    kind: "OBJECT",
    name: "HotelNightPrice",
    description: null,
    fields: [
      makeField("date", nonNull(scalar("String"))),
      makeField("priceCent", nonNull(scalar("Int"))),
      makeField("type", nonNull(scalar("String"))),
    ],
    interfaces: [],
    possibleTypes: null,
    enumValues: null,
    inputFields: null,
  });
  touched++;
}

// 3) OrderLineCustomFields / OrderLineCustomFieldsInput 追加 3 个字段
for (const [typeName, key] of [
  ["OrderLineCustomFields", "fields"],
  ["OrderLineCustomFieldsInput", "inputFields"],
]) {
  const tp = findType(typeName);
  if (!tp?.[key]) continue;
  const mk = key === "fields" ? makeField : makeInputField;
  for (const [name, type] of [
    ["hotelCheckIn", scalar("String")],
    ["hotelCheckOut", scalar("String")],
    ["hotelNights", scalar("Int")],
  ]) {
    if (tp[key].some((f) => f.name === name)) continue;
    tp[key].push(mk(name, type));
    touched++;
  }
}

writeFileSync(p, JSON.stringify(schema, null, 2) + "\n");
console.log(`patched ${touched} locations`);
