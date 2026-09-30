// 临时脚本：本地 graphql.schema.json 补齐尚未部署的游客订单行酒店字段
//   GuestOrderLine（OBJECT）: hotelCheckIn / hotelCheckOut / hotelNights
// 依赖：本地后端 pickup-plugin 已实现这些字段但尚未部署（快照滞后），与 _patch_schema_hotel_orderline.mjs 同一套路。
// 用法：node scripts/_patch_schema_guest_hotel.mjs
import { readFileSync, writeFileSync } from "node:fs";

const p = new URL("../graphql.schema.json", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1");
const schema = JSON.parse(readFileSync(p, "utf8"));
const root = schema.__schema ?? schema.data.__schema;
const types = root.types;

const clone = (obj) => JSON.parse(JSON.stringify(obj));
const scalar = (name) => ({ kind: "SCALAR", name, ofType: null });

let touched = 0;
const findType = (name) => types.find((t) => t.name === name);

// GuestOrderLine 追加 3 个可空字段
{
  const tp = findType("GuestOrderLine");
  if (tp?.fields) {
    for (const [name, type] of [
      ["hotelCheckIn", scalar("String")],
      ["hotelCheckOut", scalar("String")],
      ["hotelNights", scalar("Int")],
    ]) {
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

writeFileSync(p, JSON.stringify(schema, null, 2) + "\n");
console.log(`patched ${touched} locations`);
