<script setup lang="ts">
// 商品行子块：渲染单箱的商品行，支持行级勾选 / 数量步进 / 删除 / 图 / 规格名(SKU)。
// 选择状态复用 usePerBoxSelection 单例，与箱头整箱勾选、汇总等保持一致，不在此重复实现。
import type { OrderBoxInfo } from "~~/types/order";
import { assetSrc } from "../../utils/image";

const props = defineProps<{ box: OrderBoxInfo }>();

const sel = usePerBoxSelection();
const { t } = useI18n();

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

    <!-- 整行粒度：数量锁定为购物车数量，不在结算页改动（后端 checkoutSplitted 不支持行内部分数量） -->
    <b class="w-8 shrink-0 text-center text-neutral-700 dark:text-neutral-200">×{{ l.quantity }}</b>

    <span class="w-14 shrink-0 text-right font-medium text-neutral-900 dark:text-neutral-100">
      {{ fmt(l.lineTotal) }}
    </span>

    <button
      class="shrink-0 text-red-500"
      @click="sel.removeLine(box.boxKey, l.orderLineId)"
    >{{ t("messages.account.delete") }}</button>
  </li>
</template>