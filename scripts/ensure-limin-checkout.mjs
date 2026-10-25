// 东利民粮油店（limin）结算修复：补齐渠道级配送方式 / 支付方式 / 租户默认档案。
//
// 背景：cjk 分箱（computeOrderBoxes）按变体 shippingProfileId 分箱，未绑定则回退
// 「租户默认配送档案」；两者都没有时该行被 continue 丢弃 → orderBoxes=[]，
// 结算页显示「已选 0 件 / ¥0.00」，且 submitJd 报「配送信息加载中」。
// limin 渠道（token official-20 / id 111）此前 shippingMethods 与 paymentMethods 均为空，
// 也没有任何 ownerChannelId=111 的租户默认档案，故结算为 0。
//
// 用法: node scripts/ensure-limin-checkout.mjs
// 环境变量: ADMIN_API(默认 https://e.joho.cn/admin-api) ADMIN_USER / ADMIN_PASSWORD
//           LIMIN_CHANNEL_TOKEN(默认 official-20) LIMIN_CHANNEL_ID(默认 111)
// 幂等: 配送/支付方式与档案均按 code 复用，重复运行只做 update + 重设租户默认。
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ADMIN_API = process.env.ADMIN_API || "https://e.joho.cn/admin-api";
const ADMIN_USER = process.env.ADMIN_USER || "superadmin";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "z123123";
const CHANNEL_TOKEN = process.env.LIMIN_CHANNEL_TOKEN || "official-20";
const CHANNEL_ID = process.env.LIMIN_CHANNEL_ID || "111";

const METHOD_CODE = "limin-home-delivery";
const PAY_CODE = "limin-cod";
const PAY_PROFILE_CODE = "limin-cod-profile";
const SHIP_PROFILE_CODE = "limin-delivery";

let tok = null;
async function gql(q, v = {}, channelToken = null) {
  const h = { "Content-Type": "application/json" };
  if (tok) h.authorization = "Bearer " + tok;
  if (channelToken) h["vendure-token"] = channelToken;
  const r = await fetch(ADMIN_API, {
    method: "POST",
    headers: h,
    body: JSON.stringify({ query: q, variables: v }),
  });
  const nt = r.headers.get("vendure-auth-token");
  if (nt) tok = nt;
  const j = await r.json().catch(() => ({}));
  if (j.errors) throw new Error("gql error: " + JSON.stringify(j.errors));
  return j.data;
}

const log = (...a) => console.log(...a);

async function main() {
  await gql(`mutation{ login(username:"${ADMIN_USER}" password:"${ADMIN_PASSWORD}" rememberMe:true){ __typename } }`);
  log(`登录成功，目标渠道 ${CHANNEL_ID} (token ${CHANNEL_TOKEN})`);

  // ---------- 1) 配送方式：江南城区免费送货上门 ----------
  const allMethods = (await gql(`query{ shippingMethods(options:{take:500}){ items{ id code translations{ id languageCode } } } }`))
    .shippingMethods.items;
  let sm = allMethods.find((m) => m.code === METHOD_CODE);
  const calculator = {
    code: "default-shipping-calculator",
    arguments: [
      { name: "rate", value: "0" },
      { name: "includesTax", value: "auto" },
      { name: "taxRate", value: "0" },
    ],
  };
  const checker = {
    code: "default-shipping-eligibility-checker",
    arguments: [{ name: "orderMinimum", value: "0" }],
  };
  // 已有同语言译名时带上 id，避免 update 时重复插入触发唯一约束
  const withIds = (translations, existing = []) =>
    translations.map((t) => {
      const hit = existing.find((e) => e.languageCode === t.languageCode);
      return hit ? { ...t, id: hit.id } : t;
    });
  const smTranslations = [
    {
      languageCode: "zh_Hans",
      name: "送货上门",
      description: "江南城区免费送到家 · 12:00 前下单当日送达",
    },
  ];
  if (!sm) {
    const r = await gql(
      `mutation($input:CreateShippingMethodInput!){
        createShippingMethod(input:$input){ id code }
      }`,
      { input: { code: METHOD_CODE, fulfillmentHandler: "manual-fulfillment", checker, calculator, translations: smTranslations } },
      CHANNEL_TOKEN,
    );
    sm = r.createShippingMethod;
    if (!sm?.id) throw new Error("创建配送方式失败: " + JSON.stringify(sm));
    log(`+ 配送方式已创建 id=${sm.id} code=${sm.code}`);
  } else {
    await gql(
      `mutation($input:UpdateShippingMethodInput!){ updateShippingMethod(input:$input){ id code } }`,
      { input: { id: sm.id, checker, calculator, translations: withIds(smTranslations, sm.translations) } },
      CHANNEL_TOKEN,
    );
    log(`= 配送方式已存在 id=${sm.id}，已刷新计算器/译名`);
  }

  // ---------- 2) 支付方式：货到付款 ----------
  const allPays = (await gql(`query{ paymentMethods(options:{take:500}){ items{ id code translations{ id languageCode } } } }`))
    .paymentMethods.items;
  let pm = allPays.find((p) => p.code === PAY_CODE);
  const pmTranslations = [
    { languageCode: "zh_Hans", name: "货到付款", description: "送到家验货后再付款" },
  ];
  if (!pm) {
    const r = await gql(
      `mutation($input:CreatePaymentMethodInput!){
        createPaymentMethod(input:$input){ id code }
      }`,
      { input: { code: PAY_CODE, enabled: true, handler: { code: "cash-on-delivery", arguments: [] }, translations: pmTranslations } },
      CHANNEL_TOKEN,
    );
    pm = r.createPaymentMethod;
    if (!pm?.id) throw new Error("创建支付方式失败: " + JSON.stringify(pm));
    log(`+ 支付方式已创建 id=${pm.id} code=${pm.code}`);
  } else {
    await gql(
      `mutation($input:UpdatePaymentMethodInput!){ updatePaymentMethod(input:$input){ id code } }`,
      {
        input: {
          id: pm.id,
          enabled: true,
          handler: { code: "cash-on-delivery", arguments: [] },
          translations: withIds(pmTranslations, pm.translations),
        },
      },
      CHANNEL_TOKEN,
    );
    log(`= 支付方式已存在 id=${pm.id}，已刷新启用状态/译名`);
  }

  // ---------- 3) 绑定方式到渠道（保留渠道已有绑定） ----------
  const scoped = await gql(
    `query{ shippingMethods(options:{take:500}){ items{ id } } paymentMethods(options:{take:500}){ items{ id } } }`,
    {},
    CHANNEL_TOKEN,
  );
  const shipIds = [...new Set([...scoped.shippingMethods.items.map((x) => x.id), String(sm.id)])];
  const payIds = [...new Set([...scoped.paymentMethods.items.map((x) => x.id), String(pm.id)])];
  await gql(
    `mutation($input:AssignShippingMethodsToChannelInput!){ assignShippingMethodsToChannel(input:$input){ id code } }`,
    { input: { channelId: CHANNEL_ID, shippingMethodIds: shipIds } },
  );
  await gql(
    `mutation($input:AssignPaymentMethodsToChannelInput!){ assignPaymentMethodsToChannel(input:$input){ id code } }`,
    { input: { channelId: CHANNEL_ID, paymentMethodIds: payIds } },
  );
  log(`渠道已绑定配送方式 ${JSON.stringify(shipIds)} / 支付方式 ${JSON.stringify(payIds)}`);

  // ---------- 4) 支付档案（货到付款）并设为租户默认 ----------
  const payProfiles = (await gql(
    `query{ paymentProfiles(options:{take:200}){ items{ id code } } }`,
    {},
    CHANNEL_TOKEN,
  )).paymentProfiles.items;
  let payProfile = payProfiles.find((p) => p.code === PAY_PROFILE_CODE);
  if (!payProfile) {
    const r = await gql(
      `mutation($input:CreatePaymentProfileInput!){
        createPaymentProfile(input:$input){ id code }
      }`,
      { input: { name: "东利民货到付款", code: PAY_PROFILE_CODE, description: "送货上门验货后付款", paymentMethodIds: [String(pm.id)] } },
      CHANNEL_TOKEN,
    );
    payProfile = r.createPaymentProfile;
    if (!payProfile?.id) throw new Error("创建支付档案失败: " + JSON.stringify(payProfile));
    log(`+ 支付档案已创建 id=${payProfile.id}`);
  } else {
    await gql(
      `mutation($input:UpdatePaymentProfileInput!){ updatePaymentProfile(input:$input){ id code } }`,
      { input: { id: payProfile.id, paymentMethodIds: [String(pm.id)] } },
      CHANNEL_TOKEN,
    );
    log(`= 支付档案已存在 id=${payProfile.id}，已刷新支付方式`);
  }
  await gql(`mutation($id:ID!){ setTenantDefaultPaymentProfile(id:$id) }`, { id: payProfile.id }, CHANNEL_TOKEN);
  log(`支付档案 ${payProfile.id} 已设为租户默认`);

  // ---------- 5) 配送档案（免费送货上门 + 货到付款）并设为租户默认 ----------
  const shipProfiles = (await gql(
    `query{ shippingProfiles(options:{take:200}){ items{ id code } } }`,
    {},
    CHANNEL_TOKEN,
  )).shippingProfiles.items;
  let shipProfile = shipProfiles.find((p) => p.code === SHIP_PROFILE_CODE);
  const shipProfileBase = {
    name: "东利民免费送货上门",
    description: "江南城区免费送到家 · 货到付款",
    enabled: true,
    requiresAddress: true,
    requiresContact: false,
    shippingMethodIds: [String(sm.id)],
    paymentProfileId: String(payProfile.id),
  };
  if (!shipProfile) {
    const r = await gql(
      `mutation($input:CreateShippingProfileInput!){
        createShippingProfile(input:$input){ id code }
      }`,
      { input: { code: SHIP_PROFILE_CODE, isGlobal: false, ...shipProfileBase } },
      CHANNEL_TOKEN,
    );
    shipProfile = r.createShippingProfile;
    if (!shipProfile?.id) throw new Error("创建配送档案失败: " + JSON.stringify(shipProfile));
    log(`+ 配送档案已创建 id=${shipProfile.id}`);
  } else {
    await gql(
      `mutation($input:UpdateShippingProfileInput!){ updateShippingProfile(input:$input){ id code } }`,
      { input: { id: shipProfile.id, ...shipProfileBase } },
      CHANNEL_TOKEN,
    );
    log(`= 配送档案已存在 id=${shipProfile.id}，已刷新绑定`);
  }
  await gql(`mutation($id:ID!){ setTenantDefaultShippingProfile(id:$id) }`, { id: shipProfile.id }, CHANNEL_TOKEN);
  log(`配送档案 ${shipProfile.id} 已设为租户默认`);

  // ---------- 6) 回读断言 ----------
  const after = await gql(
    `query{ shippingMethods(options:{take:500}){ items{ id code name } }
             paymentMethods(options:{take:500}){ items{ id code } }
             shippingProfiles(options:{take:200}){ items{ id code isTenantDefault
               shippingMethods{ id code } paymentProfileId } }
             paymentProfiles(options:{take:200}){ items{ id code isTenantDefault paymentMethods{ id code } } } }`,
    {},
    CHANNEL_TOKEN,
  );
  const check = {
    channelShippingMethods: after.shippingMethods.items,
    channelPaymentMethods: after.paymentMethods.items.map((p) => p.code),
    shippingProfile: after.shippingProfiles.items.find((p) => p.code === SHIP_PROFILE_CODE) ?? null,
    paymentProfile: after.paymentProfiles.items.find((p) => p.code === PAY_PROFILE_CODE) ?? null,
  };
  log("\n== 回读 ==");
  log(JSON.stringify(check, null, 2));
  if (!check.channelShippingMethods.some((m) => String(m.id) === String(sm.id))) throw new Error("断言失败：渠道未绑定配送方式");
  if (!check.channelPaymentMethods.includes(PAY_CODE)) throw new Error("断言失败：渠道未绑定支付方式");
  if (!check.shippingProfile?.isTenantDefault) throw new Error("断言失败：配送档案非租户默认");
  if (!check.paymentProfile?.isTenantDefault) throw new Error("断言失败：支付档案非租户默认");
  log("\n✔ limin 结算配置就绪");
}

main().catch((e) => {
  console.error("✘ " + e.message);
  process.exit(1);
});
