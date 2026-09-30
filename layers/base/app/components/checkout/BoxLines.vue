<script setup lang="ts">
// 商品行子块：渲染单箱的商品行，支持行级勾选 / 数量步进 / 删除 / 图 / 规格名(SKU)。
// 选择状态复用 usePerBoxSelection 单例，与箱头整箱勾选、汇总等保持一致，不在此重复实现。
import type { OrderBoxInfo } from "~~/types/order";
import { storeToRefs } from "pinia";
import { reactive } from "vue";
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

// featureAssetSource 为相对 source 路径（未含 assets/ 前缀，如 `source/05/0.png`），
// 需按 Vendure assets 约定在动态 origin 前补 `/assets/` 拼全（与 useGqlHostUrl 同源策略一致：
// 生产 Nginx 同源反代，本地 dev 跟随当前 Host）。
const { origin } = useRequestURL();

function lineImage(l: OrderBoxInfo["lines"][number]): string {
  if (!l.featureAssetSource) return "";
  const s = l.featureAssetSource;
  let full: string;
  if (/^https?:\/\//.test(s)) {
    full = s;
  } else if (/^assets\//.test(s)) {
    full = `${origin}/${s}`;
  } else {
    full = `${origin}/assets/${s}`;
  }
  return assetSrc(full, 48);
}

const localePath = useTenantLocalePath();

/** 逐晚明细展开态（按订单行 id 记录，默认折叠） */
const expanded = reactive<Record<string, boolean>>({});
function toggleDetail(orderLineId: string) {
  expanded[orderLineId] = !expanded[orderLineId];
}

/** 日类型 → 本地化标签（复用详情页既有词条） */
const typeLabel = (ty: string): string =>
  ({
    weekday: t("messages.detail.tWeekday"),
    weekend: t("messages.detail.tWeekend"),
    holiday: t("messages.detail.tHoliday"),
    custom: t("messages.detail.tCustom"),
  } as Record<string, string>)[ty] ?? ty;

const fmt = (amount: number) => `¥${(amount / 100).toFixed(2)}`;
</script>

<template>
  <!-- 酒店行需 flex-wrap：展开的「逐晚明细」块用 basis-full 独占一行，
       否则（nowrap）会被压在同一行内挤压描述列，导致日期文案逐字换行。
       普通商品行不加 wrap，保持原有单行布局。 -->
  <li
    v-for="l in box.lines ?? []"
    :key="l.orderLineId"
    class="flex items-start gap-2 px-3 py-2 text-sm"
    :class="l.isHotel ? 'flex-wrap' : ''"
  >
    <input
      type="checkbox"
      :checked="sel.isLineChecked(box.boxKey, l.orderLineId)"
      class="mt-1 h-4 w-4 shrink-0 accent-primary-500"
      @change="sel.setLineChecked(box.boxKey, l.orderLineId, ($event.target as HTMLInputElement).checked)"
    />

    <img
      v-if="lineImage(l)"
      :src="lineImage(l)"
      :alt="l.productName"
      class="h-9 w-9 shrink-0 rounded-md object-cover"
      width="36"
      height="36"
      loading="lazy"
    />
    <span v-else class="h-9 w-9 shrink-0 rounded-md bg-neutral-100 dark:bg-neutral-800" />

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

      <!-- 酒店房型：显示入离日期与晚数，不出单价与步进器 -->
      <template v-if="l.isHotel">
        <div class="mt-0.5 truncate text-[11px] text-neutral-500 dark:text-neutral-400">
          {{ t("messages.hotel.dateRange", { in: l.hotelCheckIn, out: l.hotelCheckOut }) }}
        </div>
        <div class="mt-0.5 flex items-center justify-between gap-2 whitespace-nowrap text-[11px]">
          <span class="text-neutral-500 dark:text-neutral-400">
            {{ t("messages.hotel.nights", { n: l.hotelNights ?? l.quantity }) }}
          </span>
          <button
            v-if="l.hotelNightly?.length"
            type="button"
            class="text-primary-600 dark:text-primary-400"
            @click="toggleDetail(l.orderLineId)"
          >
            {{ t("messages.hotel.nightlyDetail") }}
            {{ expanded[l.orderLineId] ? "▴" : "▾" }}
          </button>
        </div>
      </template>
    </div>

    <template v-if="l.isHotel">
      <div class="shrink-0 text-right">
        <div class="font-semibold text-neutral-900 dark:text-neutral-100">{{ fmt(l.lineTotal) }}</div>
        <div class="mt-0.5 flex justify-end gap-2 whitespace-nowrap text-[11px]">
          <NuxtLink
            v-if="l.productSlug && l.hotelCheckIn && l.hotelCheckOut"
            :to="`${localePath(`/product/${l.productSlug}`)}?checkIn=${l.hotelCheckIn}&checkOut=${l.hotelCheckOut}`"
            class="text-primary-600 dark:text-primary-400"
          >{{ t("messages.hotel.changeDates") }}</NuxtLink>
          <button
            :disabled="orderLoading"
            class="text-red-500 disabled:cursor-not-allowed disabled:opacity-40"
            @click="removeLine(l)"
          >{{ t("messages.account.delete") }}</button>
        </div>
      </div>
    </template>

    <!-- 普通商品：保持原有单价 / 步进 / 小计 / 删除 -->
    <template v-else>
      <span class="mt-1 shrink-0 text-neutral-500 dark:text-neutral-400">{{ fmt(l.unitPrice) }}</span>

      <div class="mt-0.5 flex shrink-0 items-center gap-0.5">
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

      <span class="mt-1 w-14 shrink-0 text-right font-medium text-neutral-900 dark:text-neutral-100">
        {{ fmt(l.lineTotal) }}
      </span>

      <button
        :disabled="orderLoading"
        class="mt-1 shrink-0 text-red-500 disabled:cursor-not-allowed disabled:opacity-40"
        @click="removeLine(l)"
      >{{ t("messages.account.delete") }}</button>
    </template>

    <!-- 逐晚明细：横跨整行，仅在展开时出现 -->
    <div
      v-if="l.isHotel && expanded[l.orderLineId] && l.hotelNightly?.length"
      class="w-full basis-full rounded-md border border-dashed border-neutral-200 bg-neutral-50 px-2 py-1.5 dark:border-neutral-700 dark:bg-neutral-800/50"
    >
      <div
        v-for="n in l.hotelNightly"
        :key="n.date"
        class="flex justify-between text-[11px] text-neutral-500 dark:text-neutral-400"
      >
        <span>
          {{ n.date }}
          <span v-if="n.type !== 'weekday'" class="ml-1 rounded bg-orange-50 px-1 text-orange-500 dark:bg-orange-900/30">
            {{ typeLabel(n.type) }}
          </span>
        </span>
        <span>{{ fmt(n.priceCent) }}</span>
      </div>
      <div class="mt-1 flex justify-between border-t border-neutral-200 pt-1 text-[11px] font-medium text-neutral-700 dark:border-neutral-700 dark:text-neutral-200">
        <span>{{ t("messages.hotel.stayTotal") }}</span>
        <span>{{ fmt(l.lineTotal) }}</span>
      </div>
    </div>
  </li>
</template>