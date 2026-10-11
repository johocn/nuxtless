// 临时脚本：本地 graphql.schema.json 补齐尚未部署的酒店预订取消/改期字段（P4 Task 14/15/16）
//   HotelBookingPublic += cancelledAt/cancelReason/cancelFeeCent/afterSalesRequestId/
//                         rescheduleCount/rescheduledAt/reschedulePending
//   Query += hotelBookingCancelQuote / hotelBookingRescheduleQuote
//   Mutation += cancelMyHotelBooking / rescheduleMyHotelBooking / cancelMyRescheduleSupplement
//   新类型：HotelCancelQuote / HotelRescheduleNight / HotelRescheduleQuote / HotelRescheduleResult
// 依赖：本地后端 cjk-plugin 已实现但尚未部署（快照滞后），与 _patch_schema_aftersales2.mjs 同一套路。
// 用法：node scripts/_patch_schema_hotel_reschedule.mjs
import { readFileSync, writeFileSync } from "node:fs";

const p = new URL("../graphql.schema.json", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1");
const schema = JSON.parse(readFileSync(p, "utf8"));
const root = schema.__schema ?? schema.data.__schema;
const types = root.types;

let touched = 0;
const findType = (name) => types.find((t) => t.name === name);

const scalar = (name) => ({ kind: "SCALAR", name, ofType: null });
const SC = (name, nn = false) => (nn ? { kind: "NON_NULL", name: null, ofType: scalar(name) } : scalar(name));
const OBJ = (name, nn = false) =>
  nn
    ? { kind: "NON_NULL", name: null, ofType: { kind: "OBJECT", name, ofType: null } }
    : { kind: "OBJECT", name, ofType: null };
const LIST = (ofType, nn = false) =>
  nn
    ? { kind: "NON_NULL", name: null, ofType: { kind: "LIST", name: null, ofType } }
    : { kind: "LIST", name: null, ofType };

const arg = (name, type) => ({ name, description: null, type, defaultValue: null });
const field = (name, type, args = []) => ({
  name,
  description: null,
  args,
  type,
  isDeprecated: false,
  deprecationReason: null,
});

// 1) HotelBookingPublic 追加 7 个字段
{
  const tp = findType("HotelBookingPublic");
  for (const [name, type] of [
    ["cancelledAt", SC("DateTime")],
    ["cancelReason", SC("String")],
    ["cancelFeeCent", SC("Int")],
    ["afterSalesRequestId", SC("ID")],
    ["rescheduleCount", SC("Int", true)],
    ["rescheduledAt", SC("DateTime")],
    ["reschedulePending", SC("Boolean", true)],
  ]) {
    if (tp.fields.some((f) => f.name === name)) continue;
    tp.fields.push(field(name, type));
    touched++;
  }
}

// 2) Query += 2 个报价查询
{
  const q = findType("Query");
  const defs = [
    [
      "hotelBookingCancelQuote",
      OBJ("HotelCancelQuote", true),
      [arg("id", SC("ID", true))],
    ],
    [
      "hotelBookingRescheduleQuote",
      OBJ("HotelRescheduleQuote", true),
      [arg("id", SC("ID", true)), arg("checkIn", SC("String", true)), arg("checkOut", SC("String", true))],
    ],
  ];
  for (const [name, type, args] of defs) {
    if (q.fields.some((f) => f.name === name)) continue;
    q.fields.push(field(name, type, args));
    touched++;
  }
}

// 3) Mutation += 3 个操作
{
  const m = findType("Mutation");
  const defs = [
    [
      "cancelMyHotelBooking",
      OBJ("HotelBookingPublic", true),
      [arg("id", SC("ID", true)), arg("reason", SC("String"))],
    ],
    [
      "rescheduleMyHotelBooking",
      OBJ("HotelRescheduleResult", true),
      [
        arg("id", SC("ID", true)),
        arg("checkIn", SC("String", true)),
        arg("checkOut", SC("String", true)),
        arg("paymentMethod", SC("String")),
      ],
    ],
    [
      "cancelMyRescheduleSupplement",
      OBJ("HotelBookingPublic", true),
      [arg("id", SC("ID", true))],
    ],
  ];
  for (const [name, type, args] of defs) {
    if (m.fields.some((f) => f.name === name)) continue;
    m.fields.push(field(name, type, args));
    touched++;
  }
}

// 4) 新 OBJECT 类型 ×4
const newTypes = [
  {
    kind: "OBJECT",
    name: "HotelCancelQuote",
    description: null,
    fields: [
      field("bookingId", SC("ID", true)),
      field("mode", SC("String", true)),
      field("free", SC("Boolean", true)),
      field("cancellable", SC("Boolean", true)),
      field("refundCent", SC("Int", true)),
      field("feeCent", SC("Int", true)),
      field("totalCent", SC("Int", true)),
      field("paidCent", SC("Int", true)),
      field("firstNightFeeCent", SC("Int", true)),
      field("deadline", SC("DateTime")),
    ],
    inputFields: null,
    interfaces: [],
    enumValues: null,
    possibleTypes: null,
  },
  {
    kind: "OBJECT",
    name: "HotelRescheduleNight",
    description: null,
    fields: [
      field("date", SC("String", true)),
      field("remaining", SC("Int")),
      field("closed", SC("Boolean", true)),
      field("feasible", SC("Boolean", true)),
    ],
    inputFields: null,
    interfaces: [],
    enumValues: null,
    possibleTypes: null,
  },
  {
    kind: "OBJECT",
    name: "HotelRescheduleQuote",
    description: null,
    fields: [
      field("bookingId", SC("ID", true)),
      field("eligible", SC("Boolean", true)),
      field("reason", SC("String")),
      field("message", SC("String")),
      field("oldCheckIn", SC("String", true)),
      field("oldCheckOut", SC("String", true)),
      field("newCheckIn", SC("String", true)),
      field("newCheckOut", SC("String", true)),
      field("nights", SC("Int", true)),
      field("oldTotalCent", SC("Int", true)),
      field("newTotalCent", SC("Int")),
      field("diffCent", SC("Int")),
      field("refundCent", SC("Int")),
      field("supplementCent", SC("Int")),
      field("availability", LIST(OBJ("HotelRescheduleNight", true), true)),
    ],
    inputFields: null,
    interfaces: [],
    enumValues: null,
    possibleTypes: null,
  },
  {
    kind: "OBJECT",
    name: "HotelRescheduleResult",
    description: null,
    fields: [
      field("booking", OBJ("HotelBookingPublic", true)),
      field("applied", SC("Boolean", true)),
      field("paymentState", SC("String")),
      field("paymentId", SC("ID")),
      field("supplementCent", SC("Int", true)),
      field("paymentPublic", SC("String")),
    ],
    inputFields: null,
    interfaces: [],
    enumValues: null,
    possibleTypes: null,
  },
];
for (const tp of newTypes) {
  if (types.some((t) => t.name === tp.name)) continue;
  types.push(tp);
  touched++;
}

writeFileSync(p, JSON.stringify(schema, null, 2) + "\n");
console.log(`patched ${touched} locations`);
