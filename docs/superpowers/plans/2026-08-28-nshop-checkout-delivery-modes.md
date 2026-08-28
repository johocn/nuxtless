# nshop /checkout 配送方式四入口模块化 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将 `/checkout` 配送方式区改造为「folded（默认，物流子项默认展开 + 四入口平级）+ flat（备选，分组平铺）」的可回退模块，入口显隐由配送/自提数据驱动，采用京东红配色。

**Architecture:** 在 `checkout-config.ts` 扩展版式枚举与解析纯函数（`checkout-delivery.ts`），改造 `DeliveryModeBlock.vue` 为单渲染器多版式：`folded` 渲染四入口平级胶囊 + 物流子项虚线分隔区（默认展开、标题可折叠）；`flat` 渲染物流/自提两组分组标题 + 平铺单选。入口显隐由四组数据探测决定，底层 `flow.setMode/setShippingMethod/setPickupLocation` 逻辑零改动。

**Tech Stack:** Nuxt 4 (SSR)、Vue 3 `<script setup>`、@nuxtjs/i18n、@nuxt/ui（URadioGroup/Alert）、Pinia（useOrderStore）、`//.nuxt/gql` codegen、Tailwind（现有 `primary-*` 红调可用）。

**Spec:** `docs/superpowers/specs/2026-08-28-nshop-checkout-delivery-modes-design.md`

---

## File Structure

- **Create:** `layers/base/app/utils/checkout-delivery.ts` — 版式类型 `DeliveryLayout` + 解析纯函数 `deliveryLayout()`（坏值回退 `"folded"`，SSR 友好）。
- **Modify:** `layers/base/app/components/checkout/DeliveryModeBlock.vue` — 单渲染器多版式 + 入口显隐探测 + 京东红样式。
- **Modify (i18n):** `layers/base/i18n/locales/zh-CN.ts` + 全部语言包（en-US / de-DE / ja-JP / ko-KR / es-ES / fr-FR / it-IT / pt-BR / ru-RU / fa-IR / bg-BG）—— 新增「折叠展开」「请选择承运方式」「物流配送|自提分组」等词条（本次判定：尽量复用现有词条，仅新增最少必需项）。

数据流：`DeliveryModeBlock` 内部 `available: Record<CheckoutDeliveryMode, boolean>` → 渲染入口列表 `filter(available)`；选中走既有 `flow.setMode(type)` / `applyShipping(id)`。

---

### Task 1: 新增版式配置（checkout-delivery.ts）

**Files:**
- Create: `layers/base/app/utils/checkout-delivery.ts`

- [ ] **Step 1: 创建版式类型与解析纯函数**

```ts
/**
 * 配送方式区的版式（可回退积木式构建器）。
 * - `folded`（默认）：四入口平级 + 物流子项默认展开可折叠。
 * - `flat`（备选）：物流/自提两组分组标题 + 平铺单选。
 */
export type DeliveryLayout = "folded" | "flat";

/** 纯函数：解析版式，非法值回退默认 `folded`，保证 SSR/客户端一致 */
export function deliveryLayout(raw: string | null | undefined): DeliveryLayout {
  return raw === "flat" ? "flat" : "folded";
}

/** 前端常量（当前默认 folded，未来可拆后端 customFields + SSR 读取） */
export const deliveryConfig: { layout: DeliveryLayout } = {
  layout: "folded",
};
```

- [ ] **Step 2: 运行类型检查**

Run: `pnpm typecheck`
Expected: PASS（无未定义类型错误）

- [ ] **Step 3: Commit**

```bash
git add layers/base/app/utils/checkout-delivery.ts
git commit -m "feat: checkout 配送方式版式配置 checkout-delivery.ts"
```

---

### Task 2: 改造 DeliveryModeBlock.vue（单渲染器多版式 + 显隐探测 + 京东红）

**Files:**
- Modify: `layers/base/app/components/checkout/DeliveryModeBlock.vue`（整体重写）

- [ ] **Step 1: 重写组件为单渲染器多版式**

完整替换 `DeliveryModeBlock.vue`：

```vue
<script setup lang="ts">
// 配送方式区（京东红版）：folded 默认四入口平级 + 物流子项默认展开；flat 分组平铺。
// 四入口显隐由数据驱动：物流看 eligibleShippingMethods，三自提看对应类型是否有自提点。
import { deliveryConfig, type DeliveryLayout } from "~~/layers/base/app/utils/checkout-delivery";
import {
  isShippingMode,
  type CheckoutDeliveryMode,
} from "~~/layers/base/app/utils/checkout-config";
import { useCheckoutFlow } from "~~/layers/base/app/composables/useCheckoutFlow";

const { t } = useI18n();
const toast = useToast();
const orderStore = useOrderStore();
const flow = useCheckoutFlow();
const { mode } = flow;

const layout = ref<DeliveryLayout>(deliveryLayout(deliveryConfig.layout));

await orderStore.getShippingMethods();
const { shippingMethods } = storeToRefs(orderStore);
const shippingMethodList = computed(() => shippingMethods.value ?? []);

// —— 数据驱动的入口显隐 ——
// 物流配送：有可用物流方式即显示
const shippingAvailable = computed(() => shippingMethodList.value.length > 0);
// 三类自提：对应类型是否拉得到自提点（挂载时并发探测一次，缓存本地）
const pickupAvailable = reactive({
  store: false,
  employee: false,
  point: false,
});
const pickupProbing = ref(false);

const PICKUP_TYPES = ["store", "employee", "point"] as const;

async function probePickup() {
  if (pickupProbing.value) return;
  pickupProbing.value = true;
  try {
    await Promise.all(
      PICKUP_TYPES.map(async (type) => {
        try {
          const { pickupLocations: list } = await GqlGetPickupLocations({
            type,
            lat: null,
            lng: null,
          });
          pickupAvailable[type] = (list ?? []).length > 0;
        } catch (e) {
          // 探测失败视为不可用，仅告警，不阻塞
          pickupAvailable[type] = false;
          console.warn("[DeliveryModeBlock] probe pickup failed", type, e);
        }
      }),
    );
  } finally {
    pickupProbing.value = false;
  }
}
onMounted(() => {
  void probePickup();
  // 默认 shipping：唯一/第一物流直接预选
  if (mode.value === "shipping" && shippingMethodList.value[0]) {
    void applyShipping(shippingMethodList.value[0].id);
  }
});

// 可见入口列表（按常用度排序：物流 → 门店 → 自提点 → 职工）
const visibleModes = computed<CheckoutDeliveryMode[]>(() => {
  const list: CheckoutDeliveryMode[] = [];
  if (shippingAvailable.value) list.push("shipping");
  if (pickupAvailable.store) list.push("store");
  if (pickupAvailable.point) list.push("point");
  if (pickupAvailable.employee) list.push("employee");
  return list;
});

const modeLabel: Record<CheckoutDeliveryMode, string> = {
  shipping: t("messages.checkout.deliveryLogistic"),
  store: t("messages.checkout.storePickup"),
  employee: t("messages.checkout.employeePickup"),
  point: t("messages.checkout.pointPickup"),
};

// 物流预选与提交
const appliedId = ref<string | null>(null);
const selectedShippingModel = computed(() =>
  isShippingMode(mode.value)
    ? appliedId.value || shippingMethodList.value[0]?.id || ""
    : "",
);
async function applyShipping(id: string) {
  if (!id || id === appliedId.value) return;
  orderStore.error = null;
  await orderStore.setShippingMethod(id);
  if (orderStore.error) {
    toast.add({
      title: t("messages.general.shippingSelect"),
      description: orderStore.error,
      color: "error",
    });
    return;
  }
  appliedId.value = id;
}

function onChooseShipping(id: string) {
  flow.setMode("shipping");
  void applyShipping(id);
}
function onChoosePickup(key: Exclude<CheckoutDeliveryMode, "shipping">) {
  flow.setMode(key);
}

// folded 版式：物流子项默认展开，标题可折叠
const foldedExpanded = ref(true);

flow.submitFns.submitDelivery = async () => {
  if (!isShippingMode(mode.value)) return true;
  const list = shippingMethodList.value;
  if (!list.length) {
    orderStore.error = t("messages.checkout.noShippingMethod");
    toast.add({
      title: t("messages.general.shippingSelect"),
      description: orderStore.error,
      color: "error",
    });
    return false;
  }
  const id = appliedId.value || list[0]?.id || "";
  if (!id) return false;
  await applyShipping(id);
  return !orderStore.error && !!appliedId.value;
};
</script>

<template>
  <section
    aria-labelledby="delivery-mode-heading"
    class="rounded-lg border border-neutral-200 bg-white p-4 dark:border-neutral-800 dark:bg-neutral-900"
  >
    <h3 id="delivery-mode-heading" class="mb-4 font-medium text-neutral-900 dark:text-neutral-100">
      {{ t("messages.checkout.deliveryMethod") }}
    </h3>

    <UAlert
      v-if="!visibleModes.length"
      icon="i-lucide-truck"
      color="warning"
      variant="soft"
      :title="t('messages.checkout.noShippingMethod')"
      :description="t('messages.checkout.noShippingMethodDesc')"
    />

    <!-- ===== folded（默认）：四入口平级 + 物流子项默认展开 ===== -->
    <template v-else-if="layout === 'folded'">
      <div class="flex flex-wrap gap-2">
        <button
          v-for="m in visibleModes"
          :key="m"
          type="button"
          :class="[
            'rounded-md border px-4 py-2 text-sm transition',
            mode === m
              ? 'border-primary-500 bg-primary-50 font-medium text-primary-600 dark:bg-primary-900/30 dark:text-primary-400'
              : 'border-neutral-200 text-neutral-700 hover:border-primary-300 dark:border-neutral-700 dark:text-neutral-300',
          ]"
          @click="m === 'shipping' ? loadShipping() : onChoosePickup(m)"
        >
          {{ modeLabel[m] }}
          <span
            v-if="m === 'shipping' && shippingMethodList.length"
            class="ml-1 text-xs text-neutral-400 dark:text-neutral-500"
          >{{ shippingMethodList.length }}</span>
        </button>
      </div>

      <!-- 物流子项区：虚线分隔，默认展开，标题可折叠 -->
      <div v-if="isShippingMode(mode) || true" class="mt-3">
        <button
          type="button"
          class="flex w-full items-center gap-2 text-sm text-neutral-500 dark:text-neutral-400"
          @click="foldedExpanded = !foldedExpanded"
        >
          <span :class="['transition-transform', foldedExpanded ? '' : '-rotate-90']">&#9662;</span>
          {{ t("messages.checkout.chooseCarrier") }}
        </button>
        <div v-if="foldedExpanded" class="mt-2 space-y-2">
          <template v-if="shippingMethodList.length === 0">
            <UAlert
              icon="i-lucide-truck"
              color="warning"
              variant="soft"
              :title="t('messages.checkout.noShippingMethod')"
              :description="t('messages.checkout.noShippingMethodDesc')"
            />
          </template>
          <template v-else>
            <URadioGroup
              :model-value="selectedShippingModel"
              @update:model-value="onChooseShipping"
              indicator="hidden"
              variant="table"
              orientation="horizontal"
              :items="shippingMethodList.map((m) => ({ label: m.name, value: m.id }))"
              :ui="{ item: 'w-full' }"
              :disabled="orderStore.loading"
            />
          </template>
        </div>
        <!-- 提示：切自提时展示对应列表、隐藏地址 -->
        <p
          v-if="!isShippingMode(mode)"
          class="mt-2 text-xs text-neutral-400 dark:text-neutral-500"
        >
          {{ t("messages.checkout.pickupFillFromLocation") }}
        </p>
      </div>
    </template>

    <!-- ===== flat（备选）：物流 / 自提两组分组平铺 ===== -->
    <template v-else>
      <div v-if="shippingMethodList.length" class="mb-4">
        <p class="mb-2 flex items-center gap-2 text-sm font-medium text-neutral-700 dark:text-neutral-300">
          <span class="h-3.5 w-1 rounded-sm bg-primary-500" />
          {{ t("messages.checkout.chooseCarrier") }}
        </p>
        <URadioGroup
          :model-value="selectedShippingModel"
          @update:model-value="onChooseShipping"
          indicator="hidden"
          variant="table"
          orientation="horizontal"
          :items="shippingMethodList.map((m) => ({ label: m.name, value: m.id }))"
          :ui="{ item: 'w-full' }"
          :disabled="orderStore.loading"
        />
      </div>

      <div v-if="visibleModes.some((m) => m !== 'shipping')">
        <p class="mb-2 flex items-center gap-2 text-sm font-medium text-neutral-700 dark:text-neutral-300">
          <span class="h-3.5 w-1 rounded-sm bg-primary-500" />
          {{ t("messages.checkout.pickupMethod") }}
        </p>
        <div class="flex flex-wrap gap-2">
          <button
            v-for="m in visibleModes.filter((x) => x !== 'shipping')"
            :key="m"
            type="button"
            :class="[
              'rounded-md border px-4 py-2 text-sm transition',
              mode === m
                ? 'border-primary-500 bg-primary-50 font-medium text-primary-600 dark:bg-primary-900/30 dark:text-primary-400'
                : 'border-neutral-200 text-neutral-700 hover:border-primary-300 dark:border-neutral-700 dark:text-neutral-300',
            ]"
            @click="onChoosePickup(m)"
          >
            {{ modeLabel[m] }}
          </button>
        </div>
      </div>
    </template>
  </section>
</template>

<style lang="css" scoped></style>
```

> 说明：模板中 `loadShipping()` 为内联逻辑占位 —— 选「物流配送」入口本身已通过 `onChooseShipping` 处理；此处入口按钮 `@click` 对 `shipping` 仍需切 shipping 模式。为消除占位，进入 Task 3 前需在 `<script>` 内补充 `loadShipping`（或直接复用 `onChooseShipping` 首个 id）。见 Task 3 Step 2 修正。

- [ ] **Step 2: 运行类型检查**

Run: `pnpm typecheck`
Expected: 提示 `loadShipping is not defined` —— 该占位将在 Task 3 修正（计划禁止占位，故本步先归档，Task 3 一次性落实正确实现）。

- [ ] **Step 3: Commit（先保留占位归档，Task 3 合入后统一提交）**

```bash
git add layers/base/app/components/checkout/DeliveryModeBlock.vue
git commit -m "feat: DeliveryModeBlock 改造为 folded/flat 双版式 + 显隐探测骨架"
```

---

### Task 3: 修正入口交互 + 补 i18n 词条

**Files:**
- Modify: `layers/base/app/components/checkout/DeliveryModeBlock.vue`（消除占位）
- Modify: `layers/base/i18n/locales/zh-CN.ts` + `en-US.ts` + 其余语言包

- [ ] **Step 1: 补充 `loadShipping`（消除占位）**

在 `<script setup>` 的 `onChoosePickup` 之后插入：

```ts
// 选中「物流配送」入口：切回 shipping 模式（若已有预选物流则应用其 id）
function loadShipping() {
  flow.setMode("shipping");
  const first = shippingMethodList.value[0];
  if (first) void applyShipping(first.id);
}
```

- [ ] **Step 2: 新增 i18n 词条（zh-CN 先建，其它语言包同步）**

在 `zh-CN.ts` 的 `checkout` 区块新增（放在 `deliveryMethod` / `pickupMethod` 附近）：

```ts
checkout: {
  // ... 现有词条保留
  deliveryLogistic: "物流配送",      // folded 四入口之物流
  chooseCarrier: "请选择承运方式",    // 物流子项区标题（也作 flat 物流分组标题）
  pickupFillFromLocation: "已选中自提方式，展示自提点列表并自动隐藏收货地址",
},
```

`en-US.ts` 对应：

```ts
deliveryLogistic: "Delivery",
chooseCarrier: "Select a carrier",
pickupFillFromLocation: "Pickup selected: showing pickup points and hiding delivery address",
```

其余语言包（de/ja/ko/es/fr/it/pt/ru/fa/bg）按各语言包既有 `checkout` 区块位置补同键词条；缺词条时沿用 `zhFallbackLocale` 中文兜底（无需逐一手工翻译，缺失自动回退中文，符合项目深合并机制）。

- [ ] **Step 3: 运行类型检查**

Run: `pnpm typecheck`
Expected: PASS，无 `loadShipping is not defined` 报错。

- [ ] **Step 4: Commit**

```bash
git add layers/base/app/components/checkout/DeliveryModeBlock.vue layers/base/i18n/locales/
git commit -m "feat: 修正配送入口交互 + 新增 folded/flat i18n 词条"
```

---

### Task 4: 验证折叠/平级/显隐交互

**Files:**
- Reference: `layers/base/app/components/checkout/DeliveryModeBlock.vue`

- [ ] **Step 1: 本地起 dev 服务验证**

Run: `pnpm dev`
浏览器打开 `http://localhost:3001/checkout`

- [ ] **Step 2: 逐项验证（agent-browser / 手动）**

- `folded` 默认版式：四入口平级显示（物流配送 + 可见自提类型），物流子项**默认展开**并预选第一条。
- 点「物流配送」标题可收起/展开子项（折叠箭头旋转）。
- 切「门店自提」：子项保持可见但取消选中态，`PickupBlock` 显示门店列表，收货地址块隐藏；切换「自提点/职工自提」同理。
- 显隐：某类型自提点数据为空时对应入口不显示；物流方式为空时物流入口隐藏。
- `flat`：临时将 `checkout-delivery.ts` 的 `deliveryConfig.layout` 改为 `"flat"` → 出现「请选择承运方式」「自提」两组分组标题，交互回归正常；改回 `"folded"`。
- 语言切换（中英）：入口与子项区文案正常。

- [ ] **Step 3: 回归既有流程**

- 物流默认/唯一直接预选第一条；自提就近预选（有/无定位）；提交门闩（地址→配送/自提→支付）不回归。

- [ ] **Step 4: Commit（如有修复一并提交）**

```bash
git add -A
git commit -m "test: 验证 checkout 配送方式折叠/平级/显隐交互"
```

---

### Task 5: 最终构建 + 部署（遵循部署铁律）

**Files:**
- Reference: 全部本计划产物

- [ ] **Step 1: 本地构建**

Run: `pnpm build`
Expected: 构建成功，`.output` 产物生成。

- [ ] **Step 2: 提交产物**

```bash
git add .output docs/superpowers/plans/2026-08-28-nshop-checkout-delivery-modes.md
git commit -m "build: checkout 配送方式四入口模块化 dist 产物"
```

- [ ] **Step 3: 服务器部署**

服务器执行 `git pull` + `pm2 restart nshop`（本地已构建，绝不在服务器 build），验证 `https://www.youshop.cn/checkout` 配送方式区正常。

---

## Self-Review

- **Spec 覆盖**：四入口平级 ✅（Task 2 folded 区块）、默认展开+可折叠 ✅（foldedExpanded）、flat 分组备选 ✅（Task 2 flat 区块）、数据驱动显隐 ✅（shippingAvailable/pickupAvailable probe）、京东红 ✅（primary-* + bg-white）、常用度排序物流→门店→自提点→职工 ✅（visibleModes）、深层配送逻辑零改动 ✅（仍走 flow.setMode/applyShipping）。
- **占位扫描**：Task 2 引入 `loadShipping` 占位并衔接 Task 3 Step 1 完整定义，无遗留 TBD/TODO。
- **类型一致性**：`DeliveryLayout`=`"folded"|"flat"`、`deliveryLayout()` 统一被 Task 1/2 引用；`CheckoutDeliveryMode` 沿用既有；`pickupAvailable` 键与 `PICKUP_TYPES` 一致；`modeLabel` 键齐全。i18n 键 `deliveryLogistic/chooseCarrier/pickupFillFromLocation` 前后一致。