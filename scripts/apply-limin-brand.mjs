// 东利民粮油店（limin）站点品牌落地：创建/更新 ShopTemplate 并绑定渠道。
// 用法: node scripts/apply-limin-brand.mjs
// 环境变量: ADMIN_API(默认 https://e.joho.cn/admin-api) ADMIN_EMAIL / ADMIN_PASSWORD
// 幂等: 模板按 name+app 复用；重复运行只会新增一个版本快照，可 restoreTemplateVersion 回滚。
// 数据源: scripts/limin-brand.json（门店信息 / 主题色 / 首页素材），改完重跑即可替换首屏文案。
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dir = dirname(fileURLToPath(import.meta.url));
const ADMIN_API = process.env.ADMIN_API || "https://e.joho.cn/admin-api";
const ADMIN_EMAIL = process.env.ADMIN_EMAIL || "superadmin";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "z123123";
const APP = "nshop";
let tok = null;

const brand = JSON.parse(readFileSync(resolve(__dir, "limin-brand.json"), "utf8"));
const store = brand.store;

async function gql(q, v = {}) {
  const h = { "Content-Type": "application/json" };
  if (tok) h.authorization = "Bearer " + tok;
  const r = await fetch(ADMIN_API, { method: "POST", headers: h, body: JSON.stringify({ query: q, variables: v }) });
  const nt = r.headers.get("vendure-auth-token");
  if (nt) tok = nt;
  const j = await r.json().catch(() => ({}));
  if (j.errors) throw new Error("gql error: " + JSON.stringify(j.errors));
  return j.data;
}

const esc = (s) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/** 品质溯源富文本（白名单内联样式见 utils/sanitize-html.ts） */
function qualityHtml() {
  const { report, warehouse } = brand.home;
  return `<div style="background:#F5EFE2;border:1px solid #E2D6BE;border-radius:8px;padding:14px;">
  <div style="font-size:11px;color:#A87A2E;letter-spacing:2px;line-height:18px;">品质看得见</div>
  <div style="font-family:Songti SC,SimSun,serif;font-size:18px;font-weight:600;color:#2E2721;line-height:26px;margin-top:2px;">每批留样，报告可查</div>
  <div style="font-size:13px;color:#6C5E4C;line-height:20px;margin-top:2px;">不卖散掺米，产地与年份写清楚。</div>
  <table style="width:100%;border-collapse:collapse;margin-top:10px;">
    <tr>
      <td style="width:50%;padding-right:4px;vertical-align:top;">
        <img src="${report}" alt="每批检测报告" style="width:100%;height:auto;border:1px solid #E2D6BE;border-radius:6px;" />
        <div style="font-size:11px;color:#6C5E4C;line-height:16px;margin-top:4px;">检测报告 · 到店可查</div>
      </td>
      <td style="width:50%;padding-left:4px;vertical-align:top;">
        <img src="${warehouse}" alt="粮仓实拍" style="width:100%;height:auto;border:1px solid #E2D6BE;border-radius:6px;" />
        <div style="font-size:11px;color:#6C5E4C;line-height:16px;margin-top:4px;">粮仓实拍 · 自己存粮</div>
      </td>
    </tr>
  </table>
</div>`;
}

/** 门店信息富文本（电话为空时不显示电话行） */
function storeHtml() {
  const rows = [
    ["地址", store.address],
    ["营业", store.hours],
    ["配送", store.delivery],
    ["结算", store.settlement],
  ];
  if (store.phone) rows.push(["电话", store.phone]);
  const trs = rows
    .map(
      ([k, v]) =>
        `<tr><td style="width:52px;color:#6C5E4C;vertical-align:top;">${k}</td><td>${esc(v)}</td></tr>`,
    )
    .join("\n    ");
  return `<div style="background:#F5EFE2;border:1px solid #E2D6BE;border-radius:8px;padding:14px;">
  <div style="font-family:Songti SC,SimSun,serif;font-size:16px;font-weight:600;color:#2E2721;">到店买，也送到家</div>
  <table style="width:100%;border-collapse:collapse;margin-top:8px;font-size:12px;color:#2E2721;line-height:20px;">
    ${trs}
  </table>
</div>`;
}

function buildTheme() {
  const t = brand.theme;
  return {
    palette: { scheme: t.scheme, name: t.name, tokens: { primaryColor: t.primaryColor, accentColor: t.accentColor, radius: t.radius } },
    primaryColor: t.primaryColor,
    accentColor: t.accentColor,
    radius: t.radius,
  };
}

function buildPages() {
  const h = brand.home;
  return {
    home: {
      version: 1,
      sections: [
        { type: "banner", images: [{ image: h.hero, link: h.nav[0]?.link || "/" }] },
        { type: "notice", text: h.promise },
        { type: "nav", shape: "square", layout: "row", items: h.nav },
        { type: "hot", title: "今日主推", source: "auto", limit: 3, layout: "hero" },
        { type: "recommend", title: "街坊常买", source: "auto", limit: 10, layout: "compact", dedupe: true },
        { type: "richText", html: qualityHtml() },
        { type: "richText", html: storeHtml() },
      ],
      hiddenSlots: ["coupon", "brandFloor", "plaza", "goods", "latest"],
    },
    category: { version: 1, listStyle: "grid" },
    product: {
      version: 1,
      layout: "classic",
      blocks: { promo: { visible: false }, coupon: { visible: false } },
    },
  };
}

async function main() {
  console.log("[1/5] 登录 Admin API …");
  await gql(
    `mutation($u:String!,$p:String!){ login(username:$u password:$p rememberMe:true){ __typename ...on ErrorResult{message} } }`,
    { u: ADMIN_EMAIL, p: ADMIN_PASSWORD },
  );
  if (!tok) throw new Error("登录失败");

  console.log("[2/5] 查找渠道", brand.tenant.token, "…");
  const { channels } = await gql(
    `query{ channels(options:{take:200}){ items{ id code token customFields{ shopName shopContent } } } }`,
  );
  const ch = (channels?.items || []).find((c) => c.token === brand.tenant.token || c.code === brand.tenant.code);
  if (!ch) throw new Error("未找到渠道 " + brand.tenant.token);
  if (ch.customFields?.shopContent) {
    console.warn("  ⚠ 渠道已有 shopContent（L3 覆盖会压掉模板首页），已备份到 scripts/.limin-shopContent.bak");
    const { writeFileSync } = await import("node:fs");
    writeFileSync(resolve(__dir, ".limin-shopContent.bak"), ch.customFields.shopContent);
  }

  const theme = buildTheme();
  const pages = buildPages();

  console.log("[3/5] 创建/更新模板 …");
  const { shopTemplates } = await gql(`query($app:String){ shopTemplates(app:$app){ id name version enabled } }`, { app: APP });
  let tpl = (shopTemplates || []).find((t) => t.name === "东利民·稻金");
  if (tpl) {
    const r = await gql(
      `mutation($input:UpdateShopTemplateInput!){ updateShopTemplate(input:$input){ id name version enabled } }`,
      { input: { id: tpl.id, name: "东利民·稻金", theme, pages, enabled: true } },
    );
    tpl = r.updateShopTemplate;
    console.log(`  更新模板 id=${tpl.id} version=${tpl.version}`);
  } else {
    const r = await gql(
      `mutation($input:CreateShopTemplateInput!){ createShopTemplate(input:$input){ id name version enabled } }`,
      { input: { name: "东利民·稻金", app: APP, theme, pages, enabled: true } },
    );
    tpl = r.createShopTemplate;
    console.log(`  新建模板 id=${tpl.id} version=${tpl.version}`);
  }

  console.log("[4/5] 绑定渠道 customFields …");
  const customFields = {
    templateId: tpl.id,
    shopName: store.name,
    shopLogo: store.logo,
    shopIntro: store.intro,
    themeId: "modern-minimal",
  };
  if (store.phone) customFields.servicePhone = store.phone;
  await gql(
    `mutation($input:UpdateChannelInput!){ updateChannel(input:$input){ ... on Channel { id code customFields{ templateId themeId shopName shopLogo servicePhone } } ... on ErrorResult { errorCode message } } }`,
    { input: { id: ch.id, customFields } },
  );

  console.log("[5/5] 回读校验 …");
  const { shopTemplate: t2 } = await gql(
    `query($id:ID!){ shopTemplate(id:$id){ id name version enabled theme pages } }`,
    { id: tpl.id },
  );
  const { channel: ch2 } = await gql(
    `query($id:ID!){ channel(id:$id){ id code token customFields{ templateId themeId shopName shopLogo servicePhone } } }`,
    { id: ch.id },
  );
  const cf2 = ch2?.customFields || {};
  if (!t2) throw new Error("回读失败：模板不存在");
  if (String(cf2.templateId) !== String(tpl.id)) throw new Error(`回读失败：渠道 templateId=${cf2.templateId}，期望 ${tpl.id}`);
  console.log(`  ✅ 渠道 ${ch2.code} → 模板「${t2.name}」v${t2.version}`);
  console.log(`  店招 ${cf2.shopName} · ${cf2.shopLogo} · themeId=${cf2.themeId}`);
  console.log(`  主色 ${t2.theme?.primaryColor} / 点缀 ${t2.theme?.accentColor} / 圆角 ${t2.theme?.radius}`);
  console.log(`  首页区块 ${t2.pages?.home?.sections?.length ?? 0} 个，隐藏槽位 ${(t2.pages?.home?.hiddenSlots || []).join(",")}`);
  console.log("\n完成。部署后访问 https://www.youshop.cn/limin 验证。");
}

main().catch((e) => {
  console.error("错误:", e.message);
  process.exit(1);
});
