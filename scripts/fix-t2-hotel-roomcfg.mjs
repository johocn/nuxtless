// t2（二月兰会员 / channel 37，token 66ruvnhh34svhckaa2i）酒店房型数据归位。
//
// 背景：房型配置被误挂在门票商品 59 的变体 57 上；真正需要的房间商品 60/61 各变体为 NULL。
// 改动清单（严格限定）：
//   a) 商品 60 的变体（实际 v58）→ 写入 hotelRoomConfig（按房型模板 code=suite 生成，basePriceCent 取该变体在 t2 的真实含税价）
//   b) 商品 61 的变体（实际 v64）→ 同上
//   c) 商品 59 的变体 57        → hotelRoomConfig 置为 null
// 明确不动：其它商品 / 变体 / 渠道 / 库存 / 价格（不改变体 price）。
//
// 结构复用：快照结构与 cjk-plugin src/hotel/room-template.service.ts 的 `applyToVariant` 一致
//          （templateCode/specs/rooms/basePriceCent/minNights/maxNights/advanceDays/checkInTime/
//           checkOutTime/cancelPolicy/depositType）。房型来源＝线上 roomTemplates 中 code=suite 的模板
//          （即此前被误挂到 v57 上的那份模板），避免另造结构。
// 价格口径：按任务要求「不要编造价格日历」——**不写 priceCalendar / longStayDiscount**；
//          basePriceCent 取该变体在 t2 渠道的真实含税价（priceWithTax）快照，避免出现 ¥0 的错误展示，
//          且不使用模板自带的 88800。若需严格留空，把 buildSnapshot 里的 basePriceCent 改为 undefined 即可。
// 安全：先读回完整 customFields → 只合并 hotelRoomConfig → 再整体提交（不丢弃 weight/shippingProfileId/listPrice 等既有字段）。
//       提交前用「不存在的 id」探针 mutation 探测实际可写字段（失败发生在实体查找阶段，不产生写入）。
// 幂等：目标值一致则跳过（仍记录）；重复执行结果一致。
// 备份：写前把每个目标变体的完整原值落盘 d:\zhao\_backup\p1-hotel-roomcfg-<yyyyMMdd-HHmm>\backup.json
import fs from "node:fs";
import path from "node:path";

const ADMIN_API = process.env.WA_API || "https://e.joho.cn/admin-api";
const VENDURE_TOKEN = "66ruvnhh34svhckaa2i"; // t2「二月兰会员」
const USERNAME = "superadmin";
const PASSWORD = "z123123";

const ROOM_PRODUCT_IDS = ["60", "61"];        // 需要补房型的房间商品
const TICKET_VARIANT_IDS = ["57"];            // 需要清空的误挂变体（门票商品 59）
const SOURCE_TEMPLATE_CODE = "suite";         // 房型模板来源（此前被误挂到 v57 的那份）
const PROBE_ID = "__probe_nonexistent__";
const BACKUP_ROOT = "d:\\zhao\\_backup";

// ProductVariant 候选 customFields（读时自动剔除不存在项）
const PV_CF_CANDIDATES = [
  "hotelRoomConfig", "weight", "length", "width", "height",
  "shippingProfileId", "paymentProfileId", "listPrice", "saleStart", "saleEnd",
  "costPrice", "barcode", "internalCode",
];

let auth = "";
const gqlErrors = Symbol("gqlErrors");

async function gql(query, variables = {}) {
  const res = await fetch(ADMIN_API, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${auth}`, "vendure-token": VENDURE_TOKEN },
    body: JSON.stringify({ query, variables }),
  });
  const nt = res.headers.get("vendure-auth-token");
  if (nt) auth = nt;
  const json = await res.json().catch(() => ({}));
  if (json.errors) { const e = new Error(JSON.stringify(json.errors)); e[gqlErrors] = json.errors; throw e; }
  return json.data;
}
async function login() {
  const d = await gql(`mutation { login(username:"${USERNAME}", password:"${PASSWORD}") {
    __typename ... on CurrentUser { id identifier } ... on InvalidCredentialsError { message } } }`);
  if (d?.login?.__typename !== "CurrentUser" || !auth) throw new Error("login failed: " + JSON.stringify(d));
}
const firstMessage = (e) => (e?.[gqlErrors] ?? []).map((x) => x.message).join(" | ") || String(e?.message ?? e);

function dropFieldFromError(fields, message) {
  const patterns = [/Cannot query field "([^"]+)"/, /Field "([^"]+)" is not defined by type/, /at "customFields\.([^"]+)"/, /in field "([^"]+)"/];
  for (const p of patterns) { const m = p.exec(message || ""); if (m && fields.includes(m[1])) return m[1]; }
  return null;
}

async function discoverReadFields(candidates) {
  let fields = [...candidates];
  for (let i = 0; i <= candidates.length; i++) {
    try { await gql(`query($id:ID!){ product(id:$id){ id variants { id customFields { ${fields.join(" ")} } } } }`, { id: PROBE_ID }); return fields; }
    catch (e) {
      const drop = dropFieldFromError(fields, firstMessage(e));
      if (!drop) throw e;
      console.log(`[discover] 剔除不可读字段: ${drop}`);
      fields = fields.filter((f) => f !== drop);
      if (!fields.length) throw e;
    }
  }
  return fields;
}

async function discoverWritable(fields, sampleCf) {
  let cur = [...fields];
  for (let i = 0; i <= fields.length; i++) {
    const cf = {}; for (const f of cur) cf[f] = sampleCf[f] ?? null;
    try {
      await gql(`mutation($id:ID!,$cf:UpdateProductVariantCustomFieldsInput!){ updateProductVariant(input:{ id:$id, customFields:$cf }){ id } }`, { id: PROBE_ID, cf });
      return cur;
    } catch (e) {
      const drop = dropFieldFromError(cur, firstMessage(e));
      if (!drop) return cur;
      cur = cur.filter((f) => f !== drop);
      if (!cur.length) return cur;
    }
  }
  return cur;
}

// 稳定序列化（递归排序 key），用于幂等比较
function stable(v) {
  if (Array.isArray(v)) return "[" + v.map(stable).join(",") + "]";
  if (v && typeof v === "object") return "{" + Object.keys(v).sort().map((k) => JSON.stringify(k) + ":" + stable(v[k])).join(",") + "}";
  return JSON.stringify(v ?? null);
}
const parseRaw = (raw) => { if (raw == null) return null; if (typeof raw === "object") return raw; try { return JSON.parse(raw); } catch { return undefined; } };

async function readProduct(id, cfFields) {
  const sel = `id name slug variants { id name sku enabled price priceWithTax currencyCode customFields { ${cfFields.join(" ")} } }`;
  return (await gql(`query($id:ID!){ product(id:$id){ ${sel} } }`, { id })).product;
}
async function readVariantById(vid, cfFields) {
  try {
    return (await gql(`query($id:ID!){ productVariant(id:$id){ id name sku customFields { ${cfFields.join(" ")} } } }`, { id: vid })).productVariant;
  } catch { return null; }
}
async function findVariantByScanning(vid, cfFields, productIds) {
  for (const pid of productIds) {
    const p = await readProduct(pid, cfFields);
    const v = (p?.variants ?? []).find((x) => String(x.id) === String(vid));
    if (v) return v;
  }
  return null;
}

// 按 applyToVariant 结构生成快照；basePriceCent 用变体真实含税价；不写 priceCalendar/longStayDiscount
function buildSnapshot(tpl, basePriceCent) {
  const snap = {
    templateCode: tpl.code,
    specs: tpl.specs ?? undefined,
    rooms: (tpl.defaultRooms ?? []).map((r) => ({ ...r })),
    basePriceCent,
    minNights: tpl.minNights,
    maxNights: tpl.maxNights,
    advanceDays: tpl.advanceDays,
    checkInTime: tpl.checkInTime,
    checkOutTime: tpl.checkOutTime,
    cancelPolicy: { ...tpl.cancelPolicy },
    depositType: tpl.depositType,
  };
  return snap;
}

function stampNow() { const d = new Date(); const p = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}`; }

async function main() {
  await login();
  console.log("[OK] login as", USERNAME, "| channel t2 token:", VENDURE_TOKEN);

  const cfFields = await discoverReadFields(PV_CF_CANDIDATES);
  console.log("[OK] ProductVariant 可读 customFields:", cfFields.join(","));

  // 房型模板来源
  const templates = (await gql(`query { roomTemplates { id code name enabled specs defaultRooms basePriceCent minNights maxNights advanceDays checkInTime checkOutTime cancelPolicy depositType } }`)).roomTemplates;
  const tpl = templates.find((t) => t.code === SOURCE_TEMPLATE_CODE);
  if (!tpl) throw new Error(`未找到模板 code=${SOURCE_TEMPLATE_CODE}`);
  console.log(`[OK] 源房型模板 id=${tpl.id} code=${tpl.code} name=${tpl.name}`);

  // 读取目标商品/变体
  const rooms = [];
  for (const pid of ROOM_PRODUCT_IDS) {
    const p = await readProduct(pid, cfFields);
    if (!p) throw new Error(`product(id:${pid}) 在 t2 未找到`);
    for (const v of p.variants ?? []) {
      rooms.push({ productId: p.id, productName: p.name, variant: v, action: "SET" });
    }
  }
  console.log(`[OK] 房间商品变体共 ${rooms.length} 个`);
  // 门票误挂变体
  const tickets = [];
  for (const vid of TICKET_VARIANT_IDS) {
    let v = await readVariantById(vid, cfFields);
    if (!v) v = await findVariantByScanning(vid, cfFields, ["59"]);
    if (!v) throw new Error(`variant(id:${vid}) 未找到`);
    tickets.push({ variant: v, action: "CLEAR" });
  }

  // 写字段探测（无副作用）
  const sample = rooms[0]?.variant?.customFields ?? {};
  const writeFields = await discoverWritable(cfFields, sample);
  console.log("[OK] ProductVariant 可写 customFields:", writeFields.join(","), "(剔除:", cfFields.filter((f) => !writeFields.includes(f)).join(",") || "无", ")");

  // ---- 备份（任何写入之前）----
  const backupDir = path.join(BACKUP_ROOT, `p1-hotel-roomcfg-${stampNow()}`);
  fs.mkdirSync(backupDir, { recursive: true });
  const backupFile = path.join(backupDir, "backup.json");
  const backup = {
    generatedAt: new Date().toISOString(),
    channel: { id: 37, token: VENDURE_TOKEN, name: "二月兰会员" },
    readFields: cfFields, writeFields,
    sourceTemplate: { id: tpl.id, code: tpl.code, name: tpl.name },
    targets: [], errors: [],
  };
  for (const r of rooms) {
    backup.targets.push({ kind: "room", productId: r.productId, productName: r.productName,
      variantId: r.variant.id, variantName: r.variant.name, sku: r.variant.sku,
      priceWithTax: r.variant.priceWithTax,
      before: { hotelRoomConfig: r.variant.customFields?.hotelRoomConfig ?? null, customFields: r.variant.customFields ?? {} },
      after: null });
  }
  for (const t of tickets) {
    backup.targets.push({ kind: "ticket", variantId: t.variant.id, variantName: t.variant.name, sku: t.variant.sku,
      before: { hotelRoomConfig: t.variant.customFields?.hotelRoomConfig ?? null, customFields: t.variant.customFields ?? {} },
      after: null });
  }
  backup.targets = backup.targets.map((t) => {
    if (t.kind === "room") {
      const snap = buildSnapshot(tpl, t.priceWithTax);
      return { ...t, target: JSON.stringify(snap) };
    }
    return { ...t, target: null };
  });
  fs.writeFileSync(backupFile, JSON.stringify(backup, null, 2), "utf8");
  console.log("[BACKUP]", backupFile, "(写入前已落盘)");

  const same = (a, b) => stable(a) === stable(b);
  const errors = [];
  let changed = 0, skipped = 0;

  async function apply(target, payloadValue, sel) {
    const vid = target.variantId;
    const beforeCf = target.before.customFields ?? {};
    const beforeRaw = beforeCf.hotelRoomConfig ?? null;
    const beforeParsed = parseRaw(beforeRaw);
    const targetParsed = payloadValue == null ? null : parseRaw(payloadValue);
    if (beforeRaw == null && payloadValue == null) { skipped++; console.log(`[SKIP] variant ${vid} hotelRoomConfig 已为 null`); target.after = { status: "SKIP", customFields: beforeCf }; return; }
    if (beforeParsed !== undefined && same(beforeParsed, targetParsed)) {
      skipped++; console.log(`[SKIP] variant ${vid} 已是目标值`); target.after = { status: "SKIP", customFields: beforeCf }; return;
    }
    // 读回完整 → 只合并 hotelRoomConfig → 提交（其它字段一个不丢）
    const merged = { ...beforeCf, hotelRoomConfig: payloadValue };
    const payload = {}; for (const f of writeFields) payload[f] = merged[f] ?? null;
    try {
      const r = await gql(`mutation($id:ID!,$cf:UpdateProductVariantCustomFieldsInput!){ updateProductVariant(input:{ id:$id, customFields:$cf }){ ${sel} } }`, { id: vid, cf: payload });
      changed++;
      const afterCf = r.updateProductVariant.customFields ?? {};
      target.after = { status: "UPDATED", customFields: afterCf };
      console.log(`[OK] variant ${vid} ${target.variantName} 已更新 (hotelRoomConfig ${payloadValue == null ? "→ null" : "已写入"})`);
    } catch (e) {
      console.log(`[FAIL] variant ${vid} 更新失败:`, firstMessage(e).slice(0, 400));
      errors.push(`variant ${vid}: ${firstMessage(e)}`);
      target.after = { status: "ERROR", error: firstMessage(e) };
    }
  }

  const sel = `id name sku customFields { ${cfFields.join(" ")} }`;
  for (const t of backup.targets) {
    if (t.kind === "room") await apply(t, t.target, sel);
    else await apply(t, null, sel);
  }

  backup.errors = errors;
  fs.writeFileSync(backupFile, JSON.stringify(backup, null, 2), "utf8");

  // ---- 复核：重新查询，逐字段核对 ----
  console.log("\n================ 复核（重新查询） ================");
  for (const t of backup.targets) {
    const now = await readVariantById(t.variantId, cfFields) ?? await findVariantByScanning(t.variantId, cfFields, ["59", "60", "61"]);
    const nowCf = now?.customFields ?? {};
    const nowRaw = nowCf.hotelRoomConfig ?? null;
    const okJson = stable(parseRaw(nowRaw)) === stable(parseRaw(t.target));
    const lost = cfFields.filter((f) => f !== "hotelRoomConfig" && !same(t.before.customFields?.[f] ?? null, nowCf[f] ?? null));
    console.log(`VARIANT ${t.variantId} ${t.variantName} [${t.kind}]`);
    console.log(`  hotelRoomConfig 到达目标值: ${okJson ? "OK" : "!!"} | 现值(截断): ${String(nowRaw).slice(0, 120)}`);
    console.log(`  其它字段丢失检查: ${lost.length === 0 ? "无丢失 OK" : "!! 丢失 " + lost.join(",")}`);
    console.log(`  before其他: ${JSON.stringify(Object.fromEntries(Object.entries(t.before.customFields ?? {}).filter(([k]) => k !== "hotelRoomConfig")))}`);
    console.log(`  after 其他: ${JSON.stringify(Object.fromEntries(Object.entries(nowCf).filter(([k]) => k !== "hotelRoomConfig")))}`);
  }

  console.log(`\n汇总：更新 ${changed} 项，跳过 ${skipped} 项，失败 ${errors.length} 项`);
  if (errors.length) for (const e of errors) console.log("  -", e);
}
main().then(() => console.log("\nDONE")).catch((e) => { console.error("FAIL:", firstMessage(e)); process.exit(1); });