# nshop 结算页 perbox-card 逐箱卡片重构实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把当前「平铺只读」的逐箱结算升级为「逐箱卡片 + 商品行级选择 + 支付交集三态 + 底部汇总完整」，并保留 `jd-legacy` 回退。

**Architecture:** 新增统一逐箱渲染器 `CheckoutPerBoxList` 与选择状态 composable `usePerBoxSelection`；将现存的只读商品行升级为可勾选/步进/删除的 `BoxLines` 子块；`PaymentBlock` 由并集改为交集 + 分箱分组单选；复用已有 `useAddressBook`/`AmapRegionSelect`/`AddressFormModal`/`PickupLocationSelect`/`CheckoutCouponDrawer`。一行后端前置：`GetOrderBoxes.lines` 增补 `featureAsset/variantName/sku`。

**Tech Stack:** Nuxt 3 + Vue 3.4 + Nuxt UI v3（`URadioGroup`/`UInput`）+ Pinia `useOrderStore` + `useCheckoutFlow` + `graphql-request`。

参考设计：`docs/superpowers/specs/2026-09-02-nshop-cn-checkout-perbox-card-design.md`
现有结构（已盘点确认）：`BoxDeliveryBlock.vue`/`BoxPickupBlock.vue`（商品行**只读**）、`PaymentBlock.vue`（支付方式用**并集** `allowedCodes`）、`PerBoxSummary.vue`、`CheckoutCnSummaryBar.vue`、`CheckoutLayoutCn.vue`/`CheckoutLayoutJd.vue`、`checkout-config.ts`（默认 `cn`）。

---

## 文件结构

**后端（vendure cjk-plugin）**
- Modify: `packages/cjk-plugin/src/order/order-box-aggregation.ts`（`lines` 增字段）
- Commit/产出: `packages/cjk-plugin/lib/` 重生成并提交

**前端（nshop）**
- Modify: `layers/base/gql/queries/order.gql`（`lines` 补 `featureAsset/sku/variantName`）
- Create: `layers/base/app/composables/usePerBoxSelection.ts`（箱/行级选择状态）
- Create: `layers/base/app/components/checkout/BoxLines.vue`（商品行级：勾选/步进/删除/图/规格）
- Modify: `layers/base/app/components/checkout/PaymentBlock.vue`（交集 + 分箱分组单选）
- Modify: `layers/base/app/components/checkout/PerBoxSummary.vue`（完整订单汇总：箱小计→商户分账→应付款）
- Modify: `layers/base/app/components/checkout/CheckoutCnSummaryBar.vue`（吸底栏按已选项汇总）
- Create: `layers/base/app/components/checkout/CheckoutPerBoxList.vue`（逐箱卡片渲染器，cn/jd 共用）
- Create: `layers/base/app/components/checkout/BoxCouponSelect.vue`（券切换抽屉，复用 coupon 骨架）
- Modify: `layers/base/app/components/checkout/CheckoutLayoutCn.vue`、`CheckoutLayoutJd.vue`（接入 `CheckoutPerBoxList`）
- Create: `layers/base/app/components/checkout/CheckoutLayoutJdLegacy.vue`（回退，= 旧 Jd 抽到独立组件）
- Modify: `layers/base/app/components/checkout/CheckoutRenderer.vue`（`jd`→新卡片，`jd-legacy`→旧，`cn`→新卡片）
- Modify: `layers/base/app/composables/useCheckoutFlow.ts`（提交门闩支持 boxKeys/lineIds）
- Modify: `layers/base/app/composables/useCheckout.ts`（回流：未选行 AddItemToOrder）
- Modify: `layers/base/i18n/locales/zh-CN.ts`、`en-US.ts`（新增词条）
- Modify: `layers/base/stores/useOrderStore.ts`（`checkoutSplitted` 透传 boxKeys/lineIds）

---

### Task 0: 后端 `GetOrderBoxes.lines` 增补图片/规格/SKU（前置）

**Files:**
- Modify: `packages/cjk-plugin/src/order/order-box-aggregation.ts`
- Run: 本地构建重产出 `packages/cjk-plugin/lib/` 并提交

- [ ] **Step 1: 在聚合器映射 `lines` 时补 3 字段**

在构造各行对象（当前含 `orderLineId/productVariantId/productName/unitPrice/quantity/lineTotal`）处追加：

```ts
featureAsset: { source: line.featuredAsset?.source ?? null },
variantName: line.productVariant.name ?? null,
sku: line.productVariant.sku ?? null,
```

- [ ] **Step 2: 本地构建并重出 `lib/`**

```bash
# 在 vendure 仓库根目录（本地）
pnpm --filter @vendure-... build  # 或仓库既有构建命令；勿在服务器构建
```

- [ ] **Step 3: 规范 `order.gql` 同步字段（见 Task 1）**
- [ ] **Step 4: 提交并部署**

```bash
git add packages/cjk-plugin/src packages/cjk-plugin/lib
git commit -m "feat(cjk-plugin): orderBoxes.lines 增补 featureAsset/variantName/sku"
# 服务器：git pull origin master && pm2 restart vendure --update-env（仅重启，不构建）
```

---

### Task 1: 前端 GQL 补字段 + 类型 + typecheck

**Files:**
- Modify: `layers/base/gql/queries/order.gql`

- [ ] **Step 1: `lines` 补字段**

在 `order.gql` 的 `GetOrderBoxes.lines`（当前含 `productName/unitPrice/quantity/lineTotal`）追加：

```graphql
featureAsset { source }
variantName
sku
```

- [ ] **Step 2: 重新生成类型**

```bash
npm run prepare   # 触发 nuxt typegen / codegen（本项目用 graphql-request + 既有 Gql 类型）
```

- [ ] **Step 3: typecheck 基线与本次文件零新增错误**

```bash
npm run typecheck
# 只看 order.gql 相关文件是否新增错误；既有基线错误忽略
```

---

### Task 2: `usePerBoxSelection.ts`（选择状态）

**Files:**
- Create: `layers/base/app/composables/usePerBoxSelection.ts`

- [ ] **Step 1: 实现选择状态 composable**

```ts
export type BoxSelection = Record<string, Record<string, number>>; // boxKey -> lineId -> qty

export function usePerBoxSelection() {
  const orderStore = useOrderStore();
  const { orderBoxes } = storeToRefs(orderStore);

  const selection = reactive<BoxSelection>({});

  function ensureBox(boxKey: string) {
    if (!selection[boxKey]) {
      const box = (orderBoxes.value ?? []).find((b) => b.boxKey === boxKey);
      const init: Record<string, number> = {};
      for (const l of box?.lines ?? []) init[l.orderLineId] = l.quantity;
      selection[boxKey] = init;
    }
  }

  function initAll() {
    for (const box of orderBoxes.value ?? []) ensureBox(box.boxKey);
  }

  function isBoxChecked(boxKey: string): boolean {
    const sel = selection[boxKey]; if (!sel) return false;
    const lines = (orderBoxes.value ?? []).find((b) => b.boxKey === boxKey)?.lines ?? [];
    return lines.every((l) => sel[l.orderLineId]! > 0);
  }

  function toggleBox(boxKey: string, checked: boolean) {
    const box = (orderBoxes.value ?? []).find((b) => b.boxKey === boxKey);
    if (!box) return;
    ensureBox(boxKey);
    const all = box.lines.length > 0 && box.lines.every((l) => selection[boxKey][l.orderLineId]! > 0);
    if (checked !== all) {
      for (const l of box.lines) selection[boxKey][l.orderLineId] = checked ? l.quantity : 0;
    }
  }

  function isLineChecked(boxKey: string, lineId: string): boolean {
    return (selection[boxKey]?.[lineId] ?? 0) > 0;
  }

  function setLineChecked(boxKey: string, lineId: string, checked: boolean) {
    ensureBox(boxKey);
    const box = (orderBoxes.value ?? []).find((b) => b.boxKey === boxKey);
    const line = box?.lines.find((l) => l.orderLineId === lineId);
    if (line) selection[boxKey][lineId] = checked ? line.quantity : 0;
  }

  function setQty(boxKey: string, lineId: string, qty: number) {
    ensureBox(boxKey);
    if (qty <= 0) return;
    selection[boxKey][lineId] = qty;
  }

  function removeLine(boxKey: string, lineId: string) {
    ensureBox(boxKey);
    selection[boxKey][lineId] = 0;
  }

  function selectedBoxes(): { boxKey: string; lineIds: string[] }[] {
    const out: { boxKey: string; lineIds: string[] }[] = [];
    for (const box of orderBoxes.value ?? []) {
      const lineIds = (box.lines ?? [])
        .filter((l) => (selection[box.boxKey]?.[l.orderLineId] ?? 0) > 0)
        .map((l) => l.orderLineId);
      if (lineIds.length) out.push({ boxKey: box.boxKey, lineIds });
    }
    return out;
  }

  function selectedAmount(): number {
    let sum = 0;
    for (const box of orderBoxes.value ?? []) {
      for (const l of box.lines ?? []) sum += (selection[box.boxKey]?.[l.orderLineId] ?? 0) > 0 ? l.lineTotal : 0;
    }
    return sum;
  }

  initAll();
  return { selection, initAll, isBoxChecked, toggleBox, isLineChecked, setLineChecked, setQty, removeLine, selectedBoxes, selectedAmount };
}
```

- [ ] **Step 2: typecheck**

```bash
npm run typecheck  # usePerBoxSelection.ts 零错误
```

---

### Task 3: `BoxLines.vue`（商品行级：图/名/规格/单价/步进/小计/删除）

**Files:**
- Create: `layers/base/app/components/checkout/BoxLines.vue`

- [ ] **Step 1: 实现商品行组件**

props：`box: OrderBoxInfo`；使用 `usePerBoxSelection`；行=勾选|图|名称+规格名+SKU|单价|−qty＋|行小计|删除。

```vue
<template>
  <li v-for="l in box.lines ?? []" :key="l.orderLineId"
      class="flex items-center gap-2 border-b border-neutral-100 px-3 py-2 text-sm last:border-0">
    <input type="checkbox" :checked="sel.isLineChecked(box.boxKey, l.orderLineId)"
           @change="sel.setLineChecked(box.boxKey, l.orderLineId, ($event.target as HTMLInputElement).checked)" />
    <img v-if="l.featureAsset?.source" :src="l.featureAsset.source" class="h-7 w-7 rounded-md object-cover"
         :alt="l.productName" />
    <span v-else class="h-7 w-7 rounded-md bg-neutral-100" />
    <div class="min-w-0 flex-1 leading-tight">
      <div class="truncate">{{ l.productName }}</div>
      <div v-if="l.variantName" class="truncate text-[11px] text-neutral-500">{{ l.variantName }}<span v-if="l.sku"> ｜ {{ l.sku }}</span></div>
    </div>
    <span class="shrink-0 text-neutral-500">¥{{ (l.unitPrice / 100).toFixed(2) }}</span>
    <span class="flex shrink-0 items-center gap-1 rounded border border-neutral-200 px-1">
      <button @click="sel.setQty(box.boxKey, l.orderLineId, Math.max(1, (sel.selection[box.boxKey]?.[l.orderLineId] ?? l.quantity) - 1))"
              :disabled="(sel.selection[box.boxKey]?.[l.orderLineId] ?? l.quantity) <= 1">−</button>
      <b>{{ sel.selection[box.boxKey]?.[l.orderLineId] ?? l.quantity }}</b>
      <button @click="sel.setQty(box.boxKey, l.orderLineId, (sel.selection[box.boxKey]?.[l.orderLineId] ?? l.quantity) + 1)">＋</button>
    </span>
    <span class="w-16 shrink-0 text-right font-medium">¥{{ (l.lineTotal / 100).toFixed(2) }}</span>
    <button class="shrink-0 text-red-500" @click="sel.removeLine(box.boxKey, l.orderLineId)">删除</button>
  </li>
</template>

<script setup lang="ts">
const props = defineProps<{ box: OrderBoxInfo }>();
const sel = usePerBoxSelection();
</script>
```

- [ ] **Step 2: 在 `BoxDeliveryBlock.vue`/`BoxPickupBlock.vue` 替换只读行**

把两个块里 `v-for="l in box.lines ?? []"` 的只读 `<li>`（展示 `productName × quantity` + `lineTotal`）整体替换为其箱 `BoxLines` 实例；箱标题旁放整箱勾选（`sel.isBoxChecked/toggleBox`）；箱内小计改用 `sel.selectedAmount` 相关盒级计算。

`BoxDeliveryBlock.vue` 替换点（原只读行处）替换为 `<CheckoutBoxLines :box="box" />`；`BoxPickupBlock.vue` 同理；两者箱头加：

```vue
<input type="checkbox" :checked="sel.isBoxChecked(box.boxKey)"
       @change="sel.toggleBox(box.boxKey, ($event.target as HTMLInputElement).checked)" />
```

- [ ] **Step 3: typecheck 与手机截图验证**

```bash
npm run typecheck  # 新增组件零错误
```

---

### Task 4: `PaymentBlock.vue` 交集 + 分箱分组单选

**Files:**
- Modify: `layers/base/app/components/checkout/PaymentBlock.vue`

- [ ] **Step 1: 并集改为交集，并导出三态**

把 `allowedCodes`（并集）语义改为「交集」，并区分合并/分箱：

```ts
const selectedBoxes = usePerBoxSelection().selectedBoxes; // 现态仅需 boxKeys
const selKeys = computed(() => selectedBoxes().map((s) => s.boxKey));

const intersectionCodes = computed<Set<string>>(() => {
  const boxes = (orderBoxes.value ?? []).filter((b) => selKeys.value.includes(b.boxKey));
  if (!boxes.length) return new Set();
  let set = new Set<string>();
  boxes.forEach((b, i) => {
    if (i === 0) set = new Set(b.availablePaymentMethodCodes ?? []);
    else set = new Set([...set].filter((c) => b.availablePaymentMethodCodes?.includes(c)));
  });
  return set;
});

const canMerge = computed(() => intersectionCodes.value.size > 0);
```

`paymentMethodList` 由 `allowedCodes.value.has` 改为 `intersectionCodes.value.has`，并在合并态用单值 `state.code`。新增 `boxPayList`（分箱态按箱列出）：

```ts
const splitBoxes = computed(() => (orderBoxes.value ?? []).filter((b) =>
  selKeys.value.includes(b.boxKey)));
```

- [ ] **Step 2: 分箱分组单选 UI（交积分箱态）**

在 `paymentMethodList`（仅合并态显示）下方，当 `!canMerge.value` 时渲染分箱分组：每箱一组 `URadioGroup`，组头=「单 N · ¥X」，箱内单选；唯一方式自动锁定（灰盘 radio 禁用 + 标注“该箱唯一方式·自动锁定”）。组内选择写入 `state.boxPay[boxKey]`：

```ts
// state：paymentForm 增加
boxPay: {} as Record<string, string>,
```

提交改为：合并态 `checkoutSplitted(state.code)`；分箱态按 `selectedBoxes()` + 各箱 `boxPay` 逐单提交（后端按 boxKeys 拆单）。

- [ ] **Step 3: typecheck**

```bash
npm run typecheck
```

---

### Task 5: 底部订单汇总完整（合并/分箱两态）

**Files:**
- Modify: `layers/base/app/components/checkout/PerBoxSummary.vue`

- [ ] **Step 1: 扩展示范为完整汇总**

在既有「商户分账 + 应付款总额」之上，按已选项补 逐箱小计列表（箱名 + 商品/运费/券 + 箱小计）→ 商户分账 → 应付款。数据用 `usePerBoxSelection().selectedAmount` + `orderStore.merchantSplit`，合并态显示 `totalWithTax`，分箱态按各单分项。

```ts
const sel = usePerBoxSelection();
const totalSelected = computed(() => sel.selectedAmount());
```

模板在标题下渲染各箱小计（源自 `orderBoxes` 已选行求和 + 该箱运费/券），再复用既有 `split`/`payableTotal` 块。

- [ ] **Step 2: `CheckoutCnSummaryBar.vue` 改按已选项**

`subTotal`/`orderTotal` computed 改从 `sel.selectedAmount()` 与分箱/合并态取应付款，替代 `activeOrder.subTotal`（不含税）口径，合并态仍用 `totalWithTax`。

- [ ] **Step 3: typecheck**

---

### Task 6: 券切换抽屉 `BoxCouponSelect.vue`

**Files:**
- Create: `layers/base/app/components/checkout/BoxCouponSelect.vue`

- [ ] **Step 1: 实现整单一券抽屉（复用 coupon 骨架）**

入口=每箱卡「优惠券」行（`box.availableCoupons` 有可用券才显示切换入口）。抽屉列表 = `useCoupon().getMyCoupons("UNUSED")` 中 `code ∈ box.availableCoupons[].code` 的券；应用 `applyCouponToOrder(code)` → `orderStore.fetchOrder()` → toast；换券=`clearCouponFromOrder()`→再 apply；取消=`clearCouponFromOrder()`。已用券显示各箱「已用：-¥N」来自 `customFields.couponCode`。

- [ ] **Step 2: typecheck + i18n**

新增词条：`messages.checkout.couponSwitch/couponUsed/couponCleared` 等，zh/en 同步。

```bash
npm run typecheck
```

---

### Task 7: 回流（未选箱/行 → 购物车）

**Files:**
- Modify: `layers/base/app/composables/useCheckout.ts`
- Modify: `layers/base/app/composables/useCheckoutFlow.ts`

- [ ] **Step 1: 提交前记录未选项，成功后回流**

在 `useCheckoutFlow` 的提交门闩完成、`checkoutSplitted` 成功后：

```ts
// 结算成功 transform 后
const excluded: { variantId: string; qty: number }[] = [];
for (const box of orderBoxes.value ?? []) {
  for (const l of box.lines) {
    const selQty = sel.selection[box.boxKey]?.[l.orderLineId] ?? l.quantity;
    if (selQty <= 0) excluded.push({ variantId: String(l.productVariantId), qty: l.quantity });
    else if (selQty < l.quantity) excluded.push({ variantId: String(l.productVariantId), qty: l.quantity - selQty });
  }
}
// 逐项 AddItemToOrder（幂等），失败不异常（防丢单）
```

`checkoutSplitted` 调用改为传被选项：

```ts
const boxes = sel.selectedBoxes();
orderStore.checkoutSplitted(state.code, undefined, {
  boxKeys: boxes.map((b) => b.boxKey),
  lineIds: boxes.flatMap((b) => b.lineIds),
});
```

**铁律**：GQL 输入须声明 `[String!]`（`$bk/$li`），非 `ID`，否则 boxKey 被强转 -1 恒报 NO_ITEMS_TO_CHECKOUT。

空选中阻止提交并 toast。

- [ ] **Step 2: typecheck + 回归**

```bash
npm run typecheck
```

---

### Task 8: `CheckoutPerBoxList` 渲染器 + cn/jd 接入 + `jd-legacy` 回退

**Files:**
- Create: `layers/base/app/components/checkout/CheckoutPerBoxList.vue`
- Create: `layers/base/app/components/checkout/CheckoutLayoutJdLegacy.vue`
- Modify: `layers/base/app/components/checkout/CheckoutRenderer.vue`
- Modify: `layers/base/app/utils/checkout-config.ts`

- [ ] **Step 1: `CheckoutPerBoxList.vue` 统一逐箱渲染**

按「租户分区 → 租户内档案分箱」渲染，区内并排物流/自提箱卡；每箱卡=箱头(整箱勾选)+`BoxLines`+配送方式/自提点(沿用 `CheckoutBoxDeliveryBlock`/`CheckoutBoxPickupBlock` 的配送/自提逻辑，仅商品行换成 `BoxLines`)+运费券小计+券行入口。

每卡内部逻辑仍复用 `BoxDeliveryBlock`/`BoxPickupBlock` 原有配送/自提方法（`chooseLogistics`/`choosePickup`/`applyBox`），仅产物收敛进卡片容器。

- [ ] **Step 2: cn/jd 外层容器改接**

`CheckoutLayoutCn.vue`/`CheckoutLayoutJd.vue` 中间逐箱区替换为 `<CheckoutPerBoxList />`；外围（cn：`CheckoutCnContactCard`+吸底栏；jd：无吸底栏）保留。

- [ ] **Step 3: `jd-legacy` 回退**

把当前 `CheckoutLayoutJd.vue` 原样另存为 `CheckoutLayoutJdLegacy.vue`；`CheckoutRenderer.vue`：

```ts
<CheckoutPerBoxListWrapper v-if="layout === 'cn' || layout === 'jd'" ... />
<CheckoutLayoutJdLegacy v-else-if="layout === 'jd-legacy'" />
```

`checkout-config.ts`：`layout: "cn"`（默认）；`jd-legacy` 可在后台配置回退。

- [ ] **Step 4: typecheck**

```bash
npm run typecheck
```

---

### Task 9: i18n 双语言补全

**Files:**
- Modify: `layers/base/i18n/locales/zh-CN.ts`、`en-US.ts`

- [ ] **Step 1: 补词条**

新增（zh/en 同步）：箱级整选/部分选择文案、`messages.checkout.splitPay`（分箱支付）、`splitPerBox`、`uniqueMethodLocked`（该箱唯一方式·自动锁定）、`perBoxSubtotal`（本箱小计）、`couponSwitch`、`flowBack`（剩余 N 件未结算，已放回购物车）、`mergeToOneOrder`（已存在）等。缺 key 会裸显 `messages.checkout.xxx`，两语言必须同步。

```bash
npm run typecheck
```

---

### Task 10: 手机截图 + 操作手册 + 部署

**Files:**
- Run: `scripts/_shots_checkout_scenarios.py`（补新场景：行级选择、分箱支付、地址新增、联系人新增、券切换）

- [ ] **Step 1: 手机视口截图（390×844, dpr=2）**

覆盖：单箱、多箱、多商家多档案、分箱支付（按箱分组单选）、余额充足/不足、地址簿 CRUD+分页、联系人 CRUD+分页、券切换、city 修复回归。每场景补入操作手册。

- [ ] **Step 2: 本地构建 + 部署（nshop）**

```bash
node scripts/deploy.mjs   # 本地构建 .output → scp → 服务器 pm2 restart（勿在服务器构建）
```

- [ ] **Step 3: 操作手册补章节 + 描述本次逐箱卡片/分箱交互**

（HTML 手册/Doc 手册按既有约定；若含后端配套，vendure 侧执行 Task 0 的 git pull + pm2 restart。）

---

## Self-Review

- **Spec 覆盖**：商品行级选择(T2/T3)、图片/规格名/SKU(T0/T1/T3)、支付交集+分箱分组单选(T4)、底部汇总完整(T5)、券切换(T6)、回流(T7)、jd-legacy 回退(T8)、i18n(T9)、截图/部署(T10)——均覆盖。
- **占位符扫描**：无 TBD；Step 均有真实代码或精确替换点。需满足人员自行对齐 `OrderBoxInfo` 各字段名（以 typecheck 为准）。
- **类型一致**：`usePerBoxSelection` 返回 `selectedBoxes()/selection` 在 T3/T4/T5/T7 用同名；`checkoutSplitted(boxKeys,lineIds)` 签名一致；`featureAsset.source/variantName/sku` 全链一致。