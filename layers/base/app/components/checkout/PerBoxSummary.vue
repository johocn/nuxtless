<script setup lang="ts">
// 底部订单汇总（spec §8 / §12）：自上而下 逐箱小计（按已选项）→ 商户分账 → 应付款总额。
// 金额一律按「已选项」实时刷新（usePerBoxSelection 单例）：
//   本箱小计 = 该箱已选商品合计 + 该箱运费(box.shippingCost) − 券/免邮折扣(box.shippingDiscount)；
//   应付款 = 各被选箱小计之和（合并/分箱同口径，均按已选项求和，避免把未选行金额算进应付款）。
// 数据源 orderStore.orderBoxes + usePerBoxSelection（商户分账按已选箱租户聚合，不依赖后端整单 split）。
import type { OrderBoxInfo } from "~~/types/order";
import { usePerBoxSelection } from "~~/layers/base/app/composables/usePerBoxSelection";
import { taxFromGross } from "~~/layers/base/app/utils/tax-price";

const { t } = useI18n();
const orderStore = useOrderStore();
const sel = usePerBoxSelection();

const { orderBoxes } = storeToRefs(orderStore);

const fmt = (cents: number) => `¥${(cents / 100).toFixed(2)}`;

/** 该箱被选行 lineTotal 求和（整行粒度：不可调数量，金额=行原数量×单价；未选行不计入） */
function boxGoodsTotal(box: OrderBoxInfo): number {
  let sum = 0;
  for (const l of box.lines ?? []) {
    if ((sel.selection[box.boxKey]?.[l.orderLineId] ?? 0) > 0) sum += l.lineTotal;
  }
  return sum;
}

/** 该箱被选件数（整行粒度下 qty = 该行原数量；未选行计 0） */
function boxSelectedQty(box: OrderBoxInfo): number {
  let qty = 0;
  for (const l of box.lines ?? []) {
    if ((sel.selection[box.boxKey]?.[l.orderLineId] ?? 0) > 0) qty += l.quantity;
  }
  return qty;
}

/** 该箱小计 = 已选商品合计 + 运费 − 券/免邮折扣（与后端 subtotal 同构，仅按已选项重算） */
function boxSubtotal(box: OrderBoxInfo): number {
  return Math.max(
    0,
    boxGoodsTotal(box) + (box.shippingCost ?? 0) - (box.shippingDiscount ?? 0),
  );
}

/** 被选箱（至少选了一行；未选任何行的箱不显示） */
const selectedBoxList = computed<OrderBoxInfo[]>(() =>
  (orderBoxes.value ?? []).filter((b) => boxGoodsTotal(b) > 0),
);

/** 应付款总额 = 各被选箱小计之和（合并/分箱同口径，均按已选项） */
const payableTotal = computed(() =>
  selectedBoxList.value.reduce((acc, b) => acc + boxSubtotal(b), 0),
);

/** 已选商品总额（含税，跨箱求和），用于反向拆分税额行展示 */
const totalSelectedGoods = computed(() =>
  selectedBoxList.value.reduce((acc, b) => acc + boxGoodsTotal(b), 0),
);

/** 税额（含税口径反拆）：inclusive/exclusive 展示，zero 隐藏 */
const { taxMode } = useTaxMode();
const goodsTaxCents = computed(() =>
  taxFromGross(totalSelectedGoods.value, taxMode.value),
);

/** 已选 N 件 */
const selectedQty = computed(() =>
  selectedBoxList.value.reduce((acc, b) => acc + boxSelectedQty(b), 0),
);

/** 商户分账 = 各被选箱小计按租户聚合（部分结算时只计入已选项，与会实收一致；不再用后端整单 merchantSplit） */
const merchantRows = computed<{ key: string; name: string; amount: number }[]>(() => {
  const map = new Map<string, { key: string; name: string; amount: number }>();
  for (const box of selectedBoxList.value) {
    const key = box.tenantChannelId ?? box.tenantName ?? box.profileName;
    const cur = map.get(key) ?? {
      key,
      name: box.tenantName ?? box.profileName ?? "",
      amount: 0,
    };
    cur.amount += boxSubtotal(box);
    map.set(key, cur);
  }
  return [...map.values()];
});
</script>

<template>
  <section
    v-if="selectedBoxList.length"
    aria-labelledby="per-box-summary-heading"
    class="rounded-lg border border-neutral-200 p-4 dark:border-neutral-800"
  >
    <h3 id="per-box-summary-heading" class="mb-3 font-medium text-neutral-900 dark:text-neutral-100">
      {{ t("messages.checkout.settlementTitle") }}
    </h3>

    <!-- 逐箱小计列表：每箱 商品 → 运费 → 券 → 本箱小计（按已选项） -->
    <dl class="space-y-3 text-sm">
      <div
        v-for="box in selectedBoxList"
        :key="box.boxKey"
        class="rounded-md border border-neutral-100 p-3 dark:border-neutral-800"
      >
        <dt class="mb-2 flex items-center justify-between gap-2 font-medium text-neutral-900 dark:text-neutral-100">
          <span class="min-w-0 truncate">{{ box.profileName }}</span>
          <span class="shrink-0 text-xs font-normal text-neutral-400">{{ box.tenantName }}</span>
        </dt>
        <dd class="space-y-1 text-neutral-600 dark:text-neutral-300">
          <div class="flex items-center justify-between">
            <span>{{ t("messages.checkout.subtotal") }}</span>
            <span>{{ fmt(boxGoodsTotal(box)) }}</span>
          </div>
          <div v-if="(box.shippingCost ?? 0) > 0" class="flex items-center justify-between">
            <span>{{ t("messages.checkout.shipping") }}</span>
            <span>{{ fmt(box.shippingCost ?? 0) }}</span>
          </div>
          <div v-if="(box.shippingDiscount ?? 0) > 0" class="flex items-center justify-between text-red-500">
            <span>{{ t("messages.checkout.couponDiscount") }}</span>
            <span>-{{ fmt(box.shippingDiscount ?? 0) }}</span>
          </div>
          <div class="flex items-center justify-between border-t border-neutral-100 pt-1 font-medium text-neutral-900 dark:border-neutral-800 dark:text-neutral-100">
            <span>{{ t("messages.checkout.perBoxSubtotal") }}</span>
            <span>{{ fmt(boxSubtotal(box)) }}</span>
          </div>
        </dd>
      </div>
    </dl>

    <!-- 商户分账汇总（按已选箱租户聚合，每商户一行金额；部分结算时与会实收一致） -->
    <template v-if="merchantRows.length">
      <p class="mb-2 mt-4 text-xs text-primary-600 dark:text-primary-400">
        {{ t("messages.checkout.mergeToOneOrder") }}
      </p>
      <dl class="space-y-1 text-sm">
        <div
          v-for="s in merchantRows"
          :key="s.key"
          class="flex items-center justify-between text-neutral-600 dark:text-neutral-300"
        >
          <dt class="min-w-0 truncate">{{ s.name }}</dt>
          <dd class="shrink-0 font-medium">{{ fmt(s.amount) }}</dd>
        </div>
      </dl>
    </template>

    <!-- 税额行（含税口径反拆）：inclusive/exclusive 展示，zero 不显示 -->
    <div
      v-if="goodsTaxCents != null"
      class="mt-2 flex items-center justify-between rounded-md bg-neutral-50 px-3 py-2 text-sm text-neutral-600 dark:bg-neutral-900 dark:text-neutral-300"
    >
      <span>{{ t("messages.general.tax") }}</span>
      <span class="font-medium">{{ fmt(goodsTaxCents) }}</span>
    </div>

    <!-- 应付款总额 + 已选 N 件 -->
    <div class="mt-3 flex items-center justify-between border-t border-neutral-200 pt-2 text-sm font-semibold dark:border-neutral-800">
      <span>
        {{ t("messages.checkout.payableTotal") }}
        <span class="ml-1 text-xs font-normal text-neutral-400">
          {{ t("messages.checkout.selectedCount", { n: selectedQty }) }}
        </span>
      </span>
      <span class="text-primary-600 dark:text-primary-400">{{ fmt(payableTotal) }}</span>
    </div>
  </section>
</template>

<style lang="css" scoped></style>
