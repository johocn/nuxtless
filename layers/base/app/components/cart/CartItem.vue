<script setup lang="ts">
import type { OrderLine } from "~~/types/order";
import { assetSrc } from "../../utils/image";

const { line } = defineProps<{
  line: OrderLine;
}>();

const { t } = useI18n();
const orderStore = useOrderStore();
const { loading } = storeToRefs(orderStore);
const { selectedVariant } = storeToRefs(useProductStore());
// 与逐箱卡片(BoxLines)共用「分箱选择单例」：加减/删除都同步它，保证底部合计/件数与实际数量一致
const sel = usePerBoxSelection();

// 由 orderLineId 反查所在箱的 boxKey（orderBoxes 与 activeOrder 是两套数据源，需桥接定位）
function boxKeyOf(orderLineId: string): string | undefined {
  for (const box of orderStore.orderBoxes ?? []) {
    if ((box.lines ?? []).some((l) => l.orderLineId === orderLineId)) return box.boxKey;
  }
  return undefined;
}

// 商品显示名 = 商品名 + 变体名（例：智能手环 6 经典黑），变体名与商品名相同时仅展示一次
const displayName = computed(() => {
  const pName = line.productVariant?.product?.name ?? "";
  const vName = line.productVariant?.name ?? "";
  if (vName && vName !== pName) return `${pName} ${vName}`.trim();
  return pName || vName;
});

const unitPrice = line.unitPriceWithTax;
const lineTotal = line.linePriceWithTax;
const currency = selectedVariant.value?.currencyCode ?? (line as any).currencyCode ?? "CNY";

const localePath = useTenantLocalePath();

/** 酒店房型行：有入住日期即按酒店渲染（隐藏单价与步进器） */
const isHotel = computed(() => !!line.customFields?.hotelCheckIn && !!line.customFields?.hotelCheckOut);
const hotelNights = computed(() => line.customFields?.hotelNights ?? line.quantity);
const hotelSlug = computed(() => line.productVariant?.product?.slug ?? "");

async function onAdjust(val: number) {
  if (val === line.quantity) return;
  if (val < 1) {
    // 数量减到 0：等价删除订单行（复用删除路径，保证选择单例/分箱同步一致）
    await remove();
    return;
  }
  await orderStore.adjustOrderLine(line.id, val);
  // 重拉分箱 → 分箱汇总/选择单例同步，保证底部合计与单价×数量一致
  await orderStore.fetchOrderBoxes();
  const bk = boxKeyOf(line.id);
  if (bk) sel.setLineQty(bk, line.id, val);
}
const remove = async () => {
  await orderStore.removeItemFromOrder(line.id);
  // 删除后重拉分箱，并同步选择单例（该行置 0，不再计入合计/件数）
  await orderStore.fetchOrderBoxes();
  const bk = boxKeyOf(line.id);
  if (bk) sel.removeLine(bk, line.id);
};
</script>

<template>
  <div class="flex gap-3 border-b py-4">
    <!-- 左侧固定缩略图：放大到 64px → 更醒目，用户一眼能看到商品效果；图片缺失时用占位色块防布局跳动 -->
    <div class="shrink-0">
      <NuxtImg
        v-if="line?.featuredAsset?.preview"
        :src="assetSrc(line?.featuredAsset?.preview, 128)"
        :alt="line?.productVariant.name ?? 'Product Image'"
        class="h-16 w-16 rounded object-cover"
        width="64"
        height="64"
        loading="lazy"
      />
      <div v-else class="h-16 w-16 rounded bg-neutral-100 dark:bg-neutral-800" />
    </div>

    <!-- 中间商品描述：名称/单价/规格；酒店行改为起止日期与晚数 -->
    <div class="min-w-0 flex-1 flex flex-col justify-center">
      <div class="truncate text-sm font-medium">
        {{ displayName }}
      </div>
      <template v-if="isHotel">
        <div class="mt-1 text-xs text-neutral-500">
          {{ t("messages.hotel.nights", { n: hotelNights }) }} ·
          {{ t("messages.hotel.dateRange", { in: line.customFields?.hotelCheckIn, out: line.customFields?.hotelCheckOut }) }}
        </div>
        <div class="mt-0.5 text-sm font-semibold text-neutral-900 dark:text-neutral-100">
          {{ (lineTotal / 100).toFixed(2) }} {{ currency }}
        </div>
      </template>
      <template v-else>
        <div class="mt-1 text-xs text-neutral-500">
          {{ t("messages.shop.price") }}: {{ (unitPrice / 100).toFixed(2) }} {{ currency }}
        </div>
        <div v-if="line.quantity > 1" class="mt-0.5 text-xs text-neutral-400">
          {{ t("messages.shop.subtotal") }}: {{ (lineTotal / 100).toFixed(2) }} {{ currency }}
        </div>
      </template>
    </div>

    <!-- 右侧操作区：普通商品为步进器；酒店行为「修改日期 + 删除」 -->
    <div class="flex shrink-0 flex-col items-end justify-center gap-1.5">
      <NuxtLink
        v-if="isHotel && hotelSlug"
        :to="`${localePath(`/product/${hotelSlug}`)}?checkIn=${line.customFields?.hotelCheckIn}&checkOut=${line.customFields?.hotelCheckOut}`"
        class="text-xs text-primary-600 dark:text-primary-400"
      >{{ t("messages.hotel.changeDates") }}</NuxtLink>
      <div v-else-if="!isHotel" class="flex items-center gap-0.5">
        <button
          type="button"
          aria-label="减少数量"
          :disabled="loading"
          class="flex h-7 w-7 items-center justify-center rounded border border-neutral-200 text-neutral-600 disabled:cursor-not-allowed disabled:opacity-40 dark:border-neutral-700"
          @click="onAdjust(line.quantity - 1)"
        >−</button>
        <b class="min-w-8 px-1 shrink-0 text-center text-[15px] font-bold tabular-nums text-neutral-900 dark:text-neutral-100">{{ line.quantity }}</b>
        <button
          type="button"
          aria-label="增加数量"
          :disabled="loading"
          class="flex h-7 w-7 items-center justify-center rounded border border-neutral-200 text-neutral-600 disabled:cursor-not-allowed disabled:opacity-40 dark:border-neutral-700"
          @click="onAdjust(line.quantity + 1)"
        >＋</button>
      </div>
      <button
        type="button"
        :disabled="loading"
        class="flex items-center gap-0.5 text-xs text-red-500 disabled:opacity-40"
        @click="remove"
      >
        <span class="i-lucide-trash-2 h-3.5 w-3.5" />
        {{ t("messages.account.delete") }}
      </button>
    </div>
  </div>
</template>
