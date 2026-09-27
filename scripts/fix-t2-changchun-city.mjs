// 统一 t2 渠道（「二月兰会员」channel 37，token 66ruvnhh34svhckaa2i）的配送城市口径为「长春市」。
//
// 改动清单（严格限定，不多改一个）：
//   a) 商品 id 59,60,61,71,73,76,77,79 → customFields.belongCity="长春市"、serviceCities=["长春市"]
//   b) 库存地 id 6（t2 虚拟仓）          → customFields.serviceCities=["长春市"]
// 明确不动：库存地 id=3（默认仓，服务默认渠道）、自提点、配送档案、其它渠道/商品。
//
// 安全点：Vendure 的 updateProduct / updateStockLocation 对 customFields 是「按键部分合并」
//         （core: patchEntity 递归 patch，未提供的键保留）。本脚本仍按「读回完整 customFields
//         → 合并目标字段 → 整体提交」执行；提交前用「探针 mutation」探测输入类型实际可写字段，
//         把不可写字段（如 localeString 的 displayTemplate）摘除，避免 BAD_USER_INPUT。
//         探针用不存在的 id，失败发生在变量校验/实体查找阶段，不产生任何写入。
// 幂等：已是目标值的实体跳过（仍记录）；重复执行结果一致。
// 备份：写前把每个待改实体的完整原值 customFields 落到
//       d:\zhao\_backup\p0-t2-changchun-<yyyyMMdd-HHmmss>\backup.json
import fs from "node:fs";
import path from "node:path";

const ADMIN_API = process.env.WA_API || "https://e.joho.cn/admin-api";
const VENDURE_TOKEN = "66ruvnhh34svhckaa2i"; // t2「二月兰会员」
const USERNAME = "superadmin";
const PASSWORD = "z123123";

const TARGET_CITY = "长春市";
const PRODUCT_IDS = ["59", "60", "61", "71", "73", "76", "77", "79"];
const STOCK_LOCATION_IDS = ["6"]; // t2 虚拟仓；id=3 默认仓不动
const READONLY_REPORT_STOCK_ID = "3"; // 仅读回用于报告，绝不写
const PROBE_ID = "__probe_nonexistent__";

const BACKUP_ROOT = "d:\\zhao\\_backup";

// 读取候选字段（尽量完整备份；不存在的字段会被自动剔除）
const READ_CANDIDATES = {
  product: [
    "belongCity", "serviceCities", "deliveryMethods", "displayTemplate", "videoUrl",
    "marketingTags", "promos", "services", "sellingPoint",
    "listedInMarketplace", "marketplaceStatus", "rejectReason", "barcode", "internalCode",
    "tenantCategoryRef", "platformCategoryId", "needsCategorization", "videoAssetId",
  ],
  stockLocation: ["kind", "code", "serviceCities", "lat", "lng"],
};

let auth = "";
const gqlErrors = Symbol("gqlErrors");

async function gql(query, variables = {}) {
  const res = await fetch(ADMIN_API, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${auth}`,
      "vendure-token": VENDURE_TOKEN,
    },
    body: JSON.stringify({ query, variables }),
  });
  const nt = res.headers.get("vendure-auth-token");
  if (nt) auth = nt;
  const json = await res.json().catch(() => ({}));
  if (json.errors) {
    const err = new Error(JSON.stringify(json.errors));
    err[gqlErrors] = json.errors;
    throw err;
  }
  return json.data;
}

async function login() {
  const d = await gql(
    `mutation { login(username:"${USERNAME}", password:"${PASSWORD}") {
       __typename ... on CurrentUser { id identifier }
       ... on InvalidCredentialsError { errorCode message } } }`,
  );
  if (d?.login?.__typename !== "CurrentUser" || !auth) throw new Error("login failed: " + JSON.stringify(d));
}

const firstMessage = (e) => (e?.[gqlErrors] ?? []).map((x) => x.message).join(" | ") || String(e?.message ?? e);

// 依据报错消息从列表里剔除一个字段；返回被剔除的字段名，无则 null
function dropFieldFromError(fields, message) {
  const patterns = [
    /Cannot query field "([^"]+)"/,                    // 读取：字段不存在
    /Field "([^"]+)" is not defined by type/,          // 写入：输入类型不含该字段
    /at "customFields\.([^"]+)"/,                      // 写入：值类型不符
    /in field "([^"]+)"/,
  ];
  for (const p of patterns) {
    const m = p.exec(message || "");
    if (m && fields.includes(m[1])) return m[1];
  }
  return null;
}

// 读取字段探测：对探针实体读取，剔除不存在字段（读操作，无副作用）
async function discoverReadFields(kind, candidates) {
  let fields = [...candidates];
  for (let i = 0; i < candidates.length + 1; i++) {
    const sel = `id customFields { ${fields.join(" ")} }`;
    const q = kind === "product"
      ? `query($id:ID!){ product(id:$id){ ${sel} } }`
      : `query($id:ID!){ stockLocation(id:$id){ ${sel} } }`;
    try {
      await gql(q, { id: PROBE_ID });
      return fields;
    } catch (e) {
      const msg = firstMessage(e);
      const drop = dropFieldFromError(fields, msg);
      if (!drop) throw e;
      fields = fields.filter((f) => f !== drop);
      if (!fields.length) throw e;
    }
  }
  return fields;
}

// 写入字段探测：用不存在的 id 提交全部候选字段，靠变量校验报错剔除不可写字段（无写入）
async function discoverWritable(kind, fields, sampleCf) {
  let cur = [...fields];
  for (let i = 0; i < fields.length + 1; i++) {
    const cf = {};
    for (const f of cur) cf[f] = sampleCf[f] ?? null;
    try {
      if (kind === "product") {
        await gql(`mutation($cf:UpdateProductCustomFieldsInput!){ updateProduct(input:{ id:"${PROBE_ID}", customFields:$cf }){ id } }`, { cf });
      } else {
        await gql(`mutation($cf:UpdateStockLocationCustomFieldsInput!){ updateStockLocation(input:{ id:"${PROBE_ID}", customFields:$cf }){ id } }`, { cf });
      }
      return cur;
    } catch (e) {
      const msg = firstMessage(e);
      const drop = dropFieldFromError(cur, msg);
      if (!drop) return cur; // 非字段问题（如实体不存在）→ 视为可写
      cur = cur.filter((f) => f !== drop);
      if (!cur.length) return cur;
    }
  }
  return cur;
}

const sameArr = (a, b) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
const productSatisfied = (cf) => cf?.belongCity === TARGET_CITY && sameArr(cf?.serviceCities, [TARGET_CITY]);
const stockSatisfied = (cf) => sameArr(cf?.serviceCities, [TARGET_CITY]);

function stampNow() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
}

async function readEntity(kind, id, fields) {
  const sel = `id name slug customFields { ${fields.join(" ")} }`;
  if (kind === "product") return (await gql(`query($id:ID!){ product(id:$id){ ${sel} } }`, { id })).product;
  return (await gql(`query($id:ID!){ stockLocation(id:$id){ id name customFields { ${fields.join(" ")} } } }`, { id })).stockLocation;
}

async function main() {
  await login();
  console.log("[OK] login as", USERNAME, "| channel t2 token:", VENDURE_TOKEN);

  // ---- 字段发现 ----
  const productRead = await discoverReadFields("product", READ_CANDIDATES.product);
  const stockRead = await discoverReadFields("stockLocation", READ_CANDIDATES.stockLocation);
  console.log("[OK] Product 可读 customFields:", productRead.join(","));
  console.log("[OK] StockLocation 可读 customFields:", stockRead.join(","));

  const sampleProduct = await readEntity("product", PRODUCT_IDS[0], productRead);
  const sampleStock = await readEntity("stockLocation", STOCK_LOCATION_IDS[0], stockRead);
  const productWrite = await discoverWritable("product", productRead, sampleProduct.customFields ?? {});
  const stockWrite = await discoverWritable("stockLocation", stockRead, sampleStock.customFields ?? {});
  console.log("[OK] Product 可写 customFields:", productWrite.join(","), "(剔除:", productRead.filter(f => !productWrite.includes(f)).join(",") || "无", ")");
  console.log("[OK] StockLocation 可写 customFields:", stockWrite.join(","), "(剔除:", stockRead.filter(f => !stockWrite.includes(f)).join(",") || "无", ")");

  const backupDir = path.join(BACKUP_ROOT, `p0-t2-changchun-${stampNow()}`);
  fs.mkdirSync(backupDir, { recursive: true });
  const backupFile = path.join(backupDir, "backup.json");
  const backup = {
    generatedAt: new Date().toISOString(),
    channel: { id: 37, token: VENDURE_TOKEN, name: "二月兰会员" },
    targetCity: TARGET_CITY,
    readFields: { product: productRead, stockLocation: stockRead },
    writeFields: { product: productWrite, stockLocation: stockWrite },
    products: [],
    stockLocations: [],
  };

  const report = [];
  const errors = [];
  let changed = 0, skipped = 0;

  // ---- 先读回全部原值并落盘备份（在任何写入之前）----
  for (const id of PRODUCT_IDS) {
    const p = await readEntity("product", id, productRead);
    if (!p) { errors.push(`product(id:${id}) 在 t2 渠道下未找到`); continue; }
    backup.products.push({ id: p.id, name: p.name, slug: p.slug, before: p.customFields ?? {}, after: null });
  }
  for (const id of STOCK_LOCATION_IDS) {
    const s = await readEntity("stockLocation", id, stockRead);
    if (!s) { errors.push(`stockLocation(id:${id}) 未找到`); continue; }
    backup.stockLocations.push({ id: s.id, name: s.name, before: s.customFields ?? {}, after: null });
  }
  fs.writeFileSync(backupFile, JSON.stringify(backup, null, 2), "utf8");
  console.log("[BACKUP]", backupFile, "(写入前已落盘)");

  // ---- a) 商品 ----
  for (const rec of backup.products) {
    const id = rec.id, beforeCf = rec.before;
    if (productSatisfied(beforeCf)) {
      skipped++;
      console.log(`[SKIP] product ${id} 已是目标值`);
      report.push({ kind: "product", id, name: rec.name, status: "SKIP", before: beforeCf, after: beforeCf });
      continue;
    }
    const merged = { ...beforeCf, belongCity: TARGET_CITY, serviceCities: [TARGET_CITY] };
    const payload = {};
    for (const f of productWrite) payload[f] = merged[f] ?? null;
    try {
      const sel = `id name customFields { ${productRead.join(" ")} }`;
      const r = await gql(
        `mutation($id:ID!,$cf:UpdateProductCustomFieldsInput!){ updateProduct(input:{ id:$id, customFields:$cf }){ ${sel} } }`,
        { id, cf: payload },
      );
      changed++;
      rec.after = r.updateProduct.customFields ?? {};
      console.log(`[OK] product ${id} ${rec.name} 已更新`);
      report.push({ kind: "product", id, name: rec.name, status: "UPDATED", before: beforeCf, after: rec.after });
    } catch (e) {
      console.log(`[FAIL] product ${id} 更新失败：`, firstMessage(e).slice(0, 500));
      errors.push(`product ${id}: ${firstMessage(e)}`);
      report.push({ kind: "product", id, name: rec.name, status: "ERROR", before: beforeCf, error: firstMessage(e) });
    }
  }

  // ---- b) 库存地 ----
  for (const rec of backup.stockLocations) {
    const id = rec.id, beforeCf = rec.before;
    if (stockSatisfied(beforeCf)) {
      skipped++;
      console.log(`[SKIP] stockLocation ${id} 已是目标值`);
      report.push({ kind: "stockLocation", id, name: rec.name, status: "SKIP", before: beforeCf, after: beforeCf });
      continue;
    }
    const merged = { ...beforeCf, serviceCities: [TARGET_CITY] };
    const payload = {};
    for (const f of stockWrite) payload[f] = merged[f] ?? null;
    try {
      const sel = `id name customFields { ${stockRead.join(" ")} }`;
      const r = await gql(
        `mutation($id:ID!,$cf:UpdateStockLocationCustomFieldsInput!){ updateStockLocation(input:{ id:$id, customFields:$cf }){ ${sel} } }`,
        { id, cf: payload },
      );
      changed++;
      rec.after = r.updateStockLocation.customFields ?? {};
      console.log(`[OK] stockLocation ${id} ${rec.name} 已更新`);
      report.push({ kind: "stockLocation", id, name: rec.name, status: "UPDATED", before: beforeCf, after: rec.after });
    } catch (e) {
      console.log(`[FAIL] stockLocation ${id} 更新失败：`, firstMessage(e).slice(0, 500));
      errors.push(`stockLocation ${id}: ${firstMessage(e)}`);
      report.push({ kind: "stockLocation", id, name: rec.name, status: "ERROR", before: beforeCf, error: firstMessage(e) });
    }
  }

  backup.errors = errors;
  fs.writeFileSync(backupFile, JSON.stringify(backup, null, 2), "utf8");

  // ---- 复核：重新查询，打印 改前 → 改后 ----
  console.log("\n================ 复核（重新查询） ================");
  const tag = (ok) => (ok ? "OK" : "!!");
  for (const { id } of backup.products) {
    const now = await readEntity("product", id, productRead);
    const nowCf = now?.customFields ?? {};
    const b = backup.products.find((p) => p.id === id)?.before ?? {};
    console.log(`PRODUCT ${id}`);
    console.log(`  belongCity      : ${JSON.stringify(b.belongCity ?? null)} → ${JSON.stringify(nowCf.belongCity ?? null)}  ${tag(nowCf.belongCity === TARGET_CITY)}`);
    console.log(`  serviceCities   : ${JSON.stringify(b.serviceCities ?? null)} → ${JSON.stringify(nowCf.serviceCities ?? null)}  ${tag(sameArr(nowCf.serviceCities, [TARGET_CITY]))}`);
    console.log(`  deliveryMethods : ${JSON.stringify(b.deliveryMethods ?? null)} → ${JSON.stringify(nowCf.deliveryMethods ?? null)}  [保留检查]`);
    console.log(`  full(after)     : ${JSON.stringify(nowCf)}`);
  }
  for (const { id } of backup.stockLocations) {
    const now = await readEntity("stockLocation", id, stockRead);
    const nowCf = now?.customFields ?? {};
    const b = backup.stockLocations.find((s) => s.id === id)?.before ?? {};
    console.log(`STOCKLOCATION ${id} ${now?.name}`);
    console.log(`  serviceCities   : ${JSON.stringify(b.serviceCities ?? null)} → ${JSON.stringify(nowCf.serviceCities ?? null)}  ${tag(sameArr(nowCf.serviceCities, [TARGET_CITY]))}`);
    console.log(`  kind/code       : ${JSON.stringify(b.kind ?? null)}/${JSON.stringify(b.code ?? null)} → ${JSON.stringify(nowCf.kind ?? null)}/${JSON.stringify(nowCf.code ?? null)}  [保留检查]`);
    console.log(`  full(after)     : ${JSON.stringify(nowCf)}`);
  }
  {
    const w3 = await readEntity("stockLocation", READONLY_REPORT_STOCK_ID, stockRead);
    console.log(`\n[未修改核对] stockLocation ${READONLY_REPORT_STOCK_ID} ${w3?.name}: ${JSON.stringify(w3?.customFields ?? null)}`);
  }

  console.log(`\n汇总：更新 ${changed} 项，跳过 ${skipped} 项，失败 ${errors.length} 项`);
  if (errors.length) { console.log("原始报错："); for (const e of errors) console.log("  -", e); }
}

main().then(() => console.log("\nDONE")).catch((e) => { console.error("FAIL:", firstMessage(e)); process.exit(1); });