# nshop 结账页 · 中国本地化版式（cn）设计

> **状态**：设计定稿，待实施
> **日期**：2026-09-02
> **关联**：`docs/superpowers/specs/2026-08-27-nshop-checkout-jd-style-design.md`（jd 版式，本期保存原方案）

## 1. 背景与目标

nshop 结账页能力层（分箱、券包、配送/自提取向、多支付白名单、多语言多城市）已齐全，但**体验形态**仍为通用国际电商风（提交按钮在右侧 sticky aside、AddressForm 全字段表单、线性推进、无协议勾选/优惠展开抽屉），与中国本地化电商（京东/淘宝 H5）的移动端预期有差异。

**目标**：用「四级可回退风格体系」新增一个 `cn` 版式，重组布局与交互为符合中国移动端结账预期，**完全保留 `jd` / `legacy` 原方案作为回退层**，能力与数据流零改动。

## 2. 四级可回退风格体系映射（cn 版式）

- **L1 全局配色令牌**：沿用现有 token，cn 不改色板，仅调整组件内布局间距与吸底栏样式。
- **L2 页面级配置**：`checkout-config.ts` 的 `CheckoutLayout` 扩展为 `"cn" | "jd" | "legacy"`，默认 `cn`。
- **L3 功能模块样式定制**：各功能块（收货人卡/优惠抽屉/结算栏）含内建默认，可为渠道级定制预留字段（本期仅前端内建默认）。
- **L4 兜底链**：`layout` 非法值回退 `cn`；任何 `cn` 块缺失按内建默认兜底。

## 3. L2 页面级配置改动

`d:\zhao\nshop\layers\base\app\utils\checkout-config.ts`：

```ts
export type CheckoutLayout = "cn" | "jd" | "legacy";

export const checkoutConfig: CheckoutPageConfig = {
  layout: "cn",
};

/** 纯函数：解析布局，非法值回退默认 `cn`，保证 SSR/客户端一致 */
export function checkLayout(raw: string | null | undefined): CheckoutLayout {
  return raw === "jd" ? "jd" : raw === "legacy" ? "legacy" : "cn";
}
```

`CheckoutRenderer.vue` 增加 `cn` 分支，`<slot>` 仍作为最终兜底：

```vue
<script setup>
const layout = checkoutConfig.layout;
</script>
<template>
  <CheckoutLayoutCn v-if="layout === 'cn'" />
  <CheckoutLayoutJd v-else-if="layout === 'jd'" />
  <slot v-else />
</template>
```

`pages/checkout/index.vue`：`layout === 'cn'` 时渲染 `CheckoutRenderer` 走 cn；`onSubmit` 在 `cn` 时也走 `submitJd()`（同一份门闩式提交函数，仅形态不同）。`legacy` 的 `submitLegacy` 完全不动。

## 4. 组件划分

### 新增组件（`layers/base/app/components/checkout/`）

| 组件 | 职责 |
|---|---|
| `CheckoutLayoutCn.vue` | 积木装配：收货人卡 → 配送/自提模块 → 支付 → 优惠 → 金额明细，纵向分区 |
| `CheckoutCnSummaryBar.vue` | **底部吸底结算栏**：金额 + 展开明细抽屉 + 「去结算」CTA |
| `CheckoutCnContactCard.vue` | **收货人 + 手机号一体卡片**：省市区三级 + 详细地址，含定位回填 |
| `CheckoutCnAgreement.vue` | 提交前协议勾选（默认勾选，未勾拦截 + toast） |
| `CheckoutCnPromoDrawer.vue` | **优惠区抽屉**：券包/优惠价展开 |

### 复用组件（不重写）

- `CheckoutBoxDeliveryBlock`（配送方式）、`CheckoutBoxPickupBlock`（自提点）、`PaymentBlock`（支付方式）
- `OrderSummary` 的金额行计算逻辑（`subTotal / tax / shipping / total`）抽为 cn 吸底栏内嵌复用
- `useAddressBook` 地址簿、`getMyCoupons / applyCouponToOrder / clearCouponFromOrder`（券）

### 装配逻辑（`CheckoutLayoutCn`）

```
收货人卡（联系人+地址）
↓ 若 hasDeliveryBox
配送方式块（物流单选）
↓ 若 hasPickupBox
自提单模块（自提点 + 需联系方式时联系人子块）
↓
优惠区（券包/优惠展开抽屉）
支付块（支付方式，全箱白名单聚合）
↓
金额明细（可展开）
──── 底部吸底结算栏（去结算 CTA）
```

> 模块归属规则沿用既有：地址块仅与物流模块关联、不与自提模块相连；纯自提单时无收货地址，仅联系人/电话。

## 5. 数据与交互流

- **收货人卡**：读写 `checkoutState.addressForm`，复用 `useAddressBook` + `syncOrderLocation` 定位回填；省市区三级沿用既有字段（country/province/city/district + 详细地址，街道已并入详细地址）。
- **优惠抽屉**：调既有 `getMyCoupons / applyCouponToOrder / clearCouponFromOrder`，仅改呈现场景；抽屉内「去用」复用券包交互。
- **协议勾选**：本地 `ref`，默认勾选；未勾选时在 `submitPayment` 前置拦 + warning toast。
- **吸底栏**：由页面级 `cn` 分支渲染（不在 `OrderSummary` 内强制吸底，避免破坏 jd/legacy）；滚动时吸底常驻，展开金额明细。

## 6. 提交序列

cn 版式**复用 `submitJd()`**（门闩式推进）：

```
地址 → 配送 → 自提 → 联系人 → 支付(拆单结算 checkoutSplitted) → successRedirect
```

与 jd 完全同数据流，仅 `submitJd` 入口在 cn/ jd 共用。

## 7. 范围

**含（本期）**：
- 底部吸底结算栏（金额 + 明细展开 + 去结算 CTA）
- 收货人一体卡片（省市区三级 + 详细地址 + 定位回填）
- 提交前协议勾选（默认勾选、未勾拦截）
- 优惠区展开抽屉（券包/优惠价）
- 金额明细展开

**不含（本期，预留）**：
- 订单备注文本域（后端无字段则前端不落）
- 电子发票 toggle（预留，后端无字段则前端占位）

**回退**：
- `layout` 非法 → 回退 `cn`（`checkLayout`）
- cn 任一交互缺块 → 按内建默认兜底
- jd / legacy 完整保留，通过 `checkLayout` 或直接配置可切回

## 8. 测试与交付

- 手机视口（390×844，dpr=2）截图：cn 结算页吸底栏、收货人卡、优惠抽屉展开、协议未勾拦截
- e2e 回归：`submitJd` 序列不受 cn 影响；cn / jd / legacy 三版式均可提交
- i18n：新增词条（收货人、联系人、去结算、协议、展开明细、优惠等）同步 zh-CN / en-US
- 手册：新增「中国本地化结算版式（cn）」章节 + 手机截图
- 提交产物：nshop `.output/`（走 scp 部署）

## 9. 参考落地

- 现有积木式：`components/checkout/CheckoutLayoutJd.vue`、`CheckoutRenderer.vue`
- 现有配置：`utils/checkout-config.ts`、`pages/checkout/index.vue`（`submitJd`）
- 手册规范：`user_profile.md` Template Standard「四级可回退风格体系 + 积木式 UI」