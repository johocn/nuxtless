<script setup lang="ts">
// 支付块：被选箱支付白名单「交集」三态。
// 交集非空 → 合并 1 单，交集中单选；交集为空 → 按箱分组、箱内单选互斥、逐单拆单提交（checkoutSplitted 按 boxKeys/lineIds）。
import type { CheckoutState } from "~~/types/general";
import type { CheckoutSplittedResult } from "~~/types/order";
import { useCheckoutFlow } from "~~/layers/base/app/composables/useCheckoutFlow";
import { usePerBoxSelection } from "~~/layers/base/app/composables/usePerBoxSelection";

const { t } = useI18n();
const toast = useToast();
const orderStore = useOrderStore();
const flow = useCheckoutFlow();
const { isAuthenticated } = storeToRefs(useAuthStore());
const { flowBackUnselected } = useCheckout();

await orderStore.fetchOrderBoxes();
await orderStore.getPaymentMethods();
const { paymentMethods, orderBoxes } = storeToRefs(orderStore);

// 行级选择状态（与逐箱卡片共用同一死源）
const sel = usePerBoxSelection();

// 被选箱（至少选了一行）及其 boxKey
const selKeys = computed(() => sel.selectedBoxes().map((s) => s.boxKey));
const selectedBoxObjs = computed(() =>
  (orderBoxes.value ?? []).filter((b) => selKeys.value.includes(b.boxKey)),
);

// 交集：所有被选箱白名单的共同支付方式
const intersectionCodes = computed<Set<string>>(() => {
  const boxes = selectedBoxObjs.value;
  if (!boxes.length) return new Set();
  const first = boxes[0];
  if (!first) return new Set();
  let set = new Set<string>(first.availablePaymentMethodCodes ?? []);
  for (let i = 1; i < boxes.length; i++) {
    const box = boxes[i];
    if (!box) continue;
    const codes = new Set(box.availablePaymentMethodCodes ?? []);
    set = new Set([...set].filter((c) => codes.has(c)));
  }
  return set;
});

// 合并态：交集非空即合并 1 单；空则分箱
const canMerge = computed(() => intersectionCodes.value.size > 0);

// 需登录才能使用的支付方式并集（游客过滤，如余额钱包）
const loginRequiredCodes = computed(() => {
  const set = new Set<string>();
  for (const box of orderBoxes.value ?? []) {
    for (const code of box.loginRequiredPaymentCodes ?? []) set.add(code);
  }
  return set;
});

// 合并态支付方式列表 = 交集 ∩ 登录可见
const paymentMethodList = computed(() =>
  (paymentMethods.value ?? []).filter(
    (m) =>
      intersectionCodes.value.has(m.code) &&
      (isAuthenticated.value || !loginRequiredCodes.value.has(m.code)),
  ),
);

// 交集中缺少登录后可见方式时（如游客且交集全为余额等需登录方式）
const mergeNoAvailable = computed(
  () => canMerge.value && paymentMethodList.value.length === 0,
);

const checkoutState = useState<CheckoutState>("checkoutState");
const state = checkoutState.value.paymentForm;
// 分箱态：各箱所选支付方式 boxKey -> code
const boxPay = (state.boxPay ?? {}) as Record<string, string>;

// 分箱态：按箱列出可见方式（该箱白名单 ∩ 登录可见）
const boxPayList = computed(() =>
  selectedBoxObjs.value.map((box) => {
    const methods = (paymentMethods.value ?? []).filter(
      (m) =>
        box.availablePaymentMethodCodes?.includes(m.code) &&
        (isAuthenticated.value || !box.loginRequiredPaymentCodes?.includes(m.code)),
    );
    return { box, methods };
  }),
);

// 合并态默认选中：优先余额（跨箱合单常用），否则首个可用
function applyDefaultSelection() {
  const list = paymentMethodList.value;
  if (!list.length) {
    state.code = "";
    return;
  }
  const stillOk = list.some((m) => m.code === state.code);
  if (state.code && stillOk) return;
  const balance = isAuthenticated.value
    ? list.find((m) => /balance|wallet|余额/i.test(m.code))
    : undefined;
  state.code = (balance ?? list[0]!).code;
}

// 分箱态默认选中：每箱回填其首个可见方式；无方法则置空
function applyBoxDefault() {
  for (const g of boxPayList.value) {
    if (g.methods.length && !g.methods.some((m) => m.code === boxPay[g.box.boxKey])) {
      boxPay[g.box.boxKey] = g.methods[0]!.code;
    } else if (!g.methods.length) {
      boxPay[g.box.boxKey] = "";
    }
  }
}

onMounted(() => {
  applyDefaultSelection();
  applyBoxDefault();
});
watch([paymentMethodList, boxPayList], () => {
  applyDefaultSelection();
  applyBoxDefault();
});

const fmt = (v: number | null | undefined) => `¥${((v ?? 0) / 100).toFixed(2)}`;

function fail(key: string) {
  orderStore.error = t(key);
  toast.add({
    title: t("messages.checkout.completeSections"),
    description: orderStore.error,
    color: "warning",
  });
}

// 注册提交：合并 1 单 或 分箱逐单
flow.submitFns.submitPayment = async () => {
  // 以真实 orderBoxes 为唯一真源重建勾选，消除漏选导致的后端误判「部分结算」回流
  sel.syncWithOrderBoxes();
  const boxesSel = sel.selectedBoxes();
  // 全选：走后端「无限定」路径（不传 boxKeys/lineIds），codegen 不上送，杜绝全选时漏行回流
  const fullSelection = sel.isFullSelection();
  // 空选中阻止提交：未选任何商品行时直接提示，不调用 checkoutSplitted
  if (!boxesSel.length) {
    fail("messages.checkout.emptySelection");
    return false;
  }
  // 结算前捕获未选项清单：checkoutSplitted 成功后 orderBoxes 会被清空，须先缓存再回流
  const excluded = fullSelection ? [] : sel.excludedItems();

  if (canMerge.value) {
    // 合并 1 单：交集中单选，一次提交全部被选箱/行
    if (!state.code || !paymentMethodList.value.some((m) => m.code === state.code)) {
      fail(mergeNoAvailable.value ? "messages.checkout.noAvailablePaymentMethod" : "messages.checkout.pickPaymentMethod");
      return false;
    }
    orderStore.error = null;
    orderStore.loading = true;
    const settled = await orderStore.checkoutSplitted(
      state.code,
      undefined,
      fullSelection
        ? undefined
        : {
            boxKeys: boxesSel.map((b) => b.boxKey),
            lineIds: boxesSel.flatMap((b) => b.lineIds),
          },
    );
    orderStore.loading = false;
    if (orderStore.error) return false;
    if (settled.length) {
      checkoutState.value.placedOrderCode = String(settled[0]?.code ?? "");
    }
    if (settled.length > 0) await flowBackUnselected(excluded);
    return settled.length > 0;
  }

  // 分箱态：每箱独立支付方式，逐单提交（后端按 boxKeys/lineIds 拆单，一箱一单）
  if (boxesSel.some((b) => !boxPay[b.boxKey])) {
    fail("messages.checkout.pickPaymentMethod");
    return false;
  }
  orderStore.error = null;
  let settledAll: NonNullable<CheckoutSplittedResult> = [];
  for (const b of boxesSel) {
    orderStore.loading = true;
    const res = await orderStore.checkoutSplitted(boxPay[b.boxKey]!, undefined, {
      boxKeys: [b.boxKey],
      lineIds: b.lineIds,
    });
    orderStore.loading = false;
    if (orderStore.error) return false;
    settledAll = settledAll.concat(res ?? []);
  }
  if (settledAll.length) {
    checkoutState.value.placedOrderCode = String(settledAll[0]?.code ?? "");
  }
  if (settledAll.length > 0) await flowBackUnselected(excluded);
  return settledAll.length > 0;
};
</script>

<template>
  <section
    aria-labelledby="payment-block-heading"
    class="rounded-lg border border-neutral-200 p-4 dark:border-neutral-800"
  >
    <h3 id="payment-block-heading" class="mb-3 font-medium">
      {{ t("messages.general.paymentMethod") }}
    </h3>

    <!-- 合并 1 单：交集中单选 -->
    <template v-if="canMerge">
      <p v-if="!paymentMethodList.length && isAuthenticated" class="text-sm text-neutral-500">
        {{ t("messages.general.loading") }}
      </p>
      <p v-else-if="mergeNoAvailable" class="text-sm text-amber-600">
        {{ t("messages.checkout.noAvailablePaymentMethod") }}
      </p>
      <template v-else>
        <p class="mb-2 text-xs text-neutral-500">
          {{ t("messages.checkout.mergeToOneOrder") }}
        </p>
        <URadioGroup
          v-model="state.code"
          indicator="hidden"
          variant="table"
          orientation="vertical"
          :items="paymentMethodList.map((m) => ({ label: m.name, value: m.code }))"
          :ui="{ item: 'w-full' }"
          :disabled="orderStore.loading"
        />
      </template>
    </template>

    <!-- 分箱支付：顶部红条 + 按箱分组、箱内单选互斥 -->
    <template v-else-if="selectedBoxObjs.length">
      <div
        class="mb-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-600 dark:border-red-800 dark:bg-red-950 dark:text-red-400"
      >
        {{ t("messages.checkout.splitPay") }}
      </div>

      <div v-for="(g, gi) in boxPayList" :key="g.box.boxKey" class="mt-4">
        <div class="mb-2 text-sm font-medium">
          {{ t("messages.checkout.splitPerBox", { n: gi + 1 }) }} · {{ t("messages.checkout.perBoxSubtotal") }}
          {{ fmt(g.box.subtotal) }}
        </div>

        <URadioGroup
          v-if="g.methods.length > 1"
          v-model="boxPay[g.box.boxKey]"
          indicator="hidden"
          variant="table"
          orientation="vertical"
          :items="g.methods.map((m) => ({ label: m.name, value: m.code }))"
          :ui="{ item: 'w-full' }"
          :disabled="orderStore.loading"
        />
        <!-- 唯一方式自动锁定 -->
        <div
          v-else-if="g.methods.length === 1"
          class="flex items-center justify-between rounded-lg border border-neutral-200 px-3 py-2 dark:border-neutral-800"
        >
          <div class="flex items-center gap-2">
            <URadio :model-value="g.methods[0]!.code" :value="g.methods[0]!.code" disabled />
            <span class="text-sm text-neutral-600 dark:text-neutral-300">{{ g.methods[0]!.name }}</span>
          </div>
          <span class="text-xs text-neutral-500">{{ t("messages.checkout.uniqueMethodLocked") }}</span>
        </div>
        <p v-else class="text-sm text-neutral-500">
          {{ t("messages.checkout.noAvailablePaymentMethod") }}
        </p>
      </div>
    </template>
  </section>
</template>

<style lang="css" scoped></style>