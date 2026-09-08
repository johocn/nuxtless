<script setup lang="ts">
// 商品行子块：渲染单箱的商品行，支持行级勾选 / 数量步进 / 删除 / 图 / 规格名(SKU)。
// 选择状态复用 usePerBoxSelection 单例，与箱头整箱勾选、汇总等保持一致，不在此重复实现。
import type { OrderBoxInfo } from "~~/types/order";
import { storeToRefs } from "pinia";
import { assetSrc } from "../../utils/image";

const props = defineProps<{ box: OrderBoxInfo }>();

const sel = usePerBoxSelection();
const { t } = useI18n();

const orderStore = useOrderStore();
const { loading: orderLoading } = storeToRefs(orderStore);

/** 加减数量：改活动订单行数量→同步选中→重拉分箱联动金额。防抖由 loading 控制。减到 0 等价删除订单行。 */
async function adjustQty(l: OrderBoxInfo["lines"][number], newQty: number) {
  if (orderLoading.value) return;             // 防抖：上一个调整未完成则忽略
  if (newQty === l.quantity) return;
  if (newQty < 1) {
    await removeLine(l);
    return;
  }
  await orderStore.adjustOrderLine(l.orderLineId, newQty);
  sel.setLineQty(props.box.boxKey, l.orderLineId, newQty);
  await orderStore.fetchOrderBoxes();
}

/** 删除订单行：真正从活动订单移除（而非仅置 0 未选），避免残留行导致结算误判空选择/回流 */
async function removeLine(l: OrderBoxInfo["lines"][number]) {
  if (orderLoading.value) return;
  await orderStore.removeItemFromOrder(l.orderLineId);
  await orderStore.fetchOrderBoxes();
  sel.removeLine(props.box.boxKey, l.orderLineId);
}

// featureAssetSource 为相对 source 路径，需动态 origin 拼全（与 useGqlHostUrl 同源策略一致：
// 生产 Nginx 同源反代，本地 dev 跟随当前 Host）
const { origin } = useRequestURL();

function lineImage(l: OrderBoxInfo["lines"][number]): string {
  if (!l.featureAssetSource) return "";
  const full = /^https?:\/\//.test(l.featureAssetSource)
    ? l.featureAssetSource
    : `${origin}${l.featureAssetSource}`;
  return assetSrc(full, 48);
}

const fmt = (amount: number) => `¥${(amount / 100).toFixed(2)}`;
</script>

<template>
  <li
    v-for="l in box.lines ?? []"
    :key="l.orderLineId"
    class="flex items-center gap-2 px-3 py-2 text-sm"
  >
    <input
      type="checkbox"
      :checked="sel.isLineChecked(box.boxKey, l.orderLineId)"
      class="h-4 w-4 shrink-0 accent-primary-500"
      @change="sel.setLineChecked(box.boxKey, l.orderLineId, ($event.target as HTMLInputElement).checked)"
    />

    <img
      v-if="lineImage(l)"
      :src="lineImage(l)"
      :alt="l.productName"
      class="h-7 w-7 shrink-0 rounded-md object-cover"
      width="28"
      height="28"
      loading="lazy"
    />
    <span v-else class="h-7 w-7 shrink-0 rounded-md bg-neutral-100 dark:bg-neutral-800" />

    <div class="min-w-0 flex-1 leading-tight">
      <div class="truncate text-neutral-900 dark:text-neutral-100">{{ l.productName }}</div>
      <div
        v-if="l.variantName && l.variantName !== l.productName"
        class="truncate text-[11px] text-neutral-500 dark:text-neutral-400"
      >
        {{ l.variantName }}<span v-if="l.sku"> ｜ {{ l.sku }}</span>
      </div>
      <div v-else-if="l.sku" class="truncate text-[11px] text-neutral-500 dark:text-neutral-400">
        {{ l.sku }}
      </div>
    </div>

    <span class="shrink-0 text-neutral-500 dark:text-neutral-400">{{ fmt(l.unitPrice) }}</span>

    <div class="flex shrink-0 items-center gap-0.5">
      <button
        type="button"
        :disabled="orderLoading"
        class="flex h-6 w-6 items-center justify-center rounded border border-neutral-200 text-neutral-600 disabled:cursor-not-allowed disabled:opacity-40"
        aria-label="减少数量"
        @click="adjustQty(l, l.quantity - 1)"
      >−</button>
      <b class="w-7 shrink-0 text-center text-neutral-700 dark:text-neutral-200">{{ l.quantity }}</b>
      <button
        type="button"
        :disabled="orderLoading"
        class="flex h-6 w-6 items-center justify-center rounded border border-neutral-200 text-neutral-600 disabled:cursor-not-allowed disabled:opacity-40"
        aria-label="增加数量"
        @click="adjustQty(l, l.quantity + 1)"
      >＋</button>
    </div>

    <span class="w-14 shrink-0 text-right font-medium text-neutral-900 dark:text-neutral-100">
      {{ fmt(l.lineTotal) }}
    </span>

    <button
      :disabled="orderLoading"
      class="shrink-0 text-red-500 disabled:cursor-not-allowed disabled:opacity-40"
      @click="removeLine(l)"
    >{{ t("messages.account.delete") }}</button>
  </li>
</template>