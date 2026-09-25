<script setup lang="ts">
import type { OrderTabKey } from "../../utils/order-state";
import { ORDER_TABS, stateBadge } from "../../utils/order-state";
import { assetSrc } from "../../utils/image";

const activeTab = defineModel<OrderTabKey>({ required: true });
const { t, locale } = useI18n();
const localePath = useTenantLocalePath();
const { loading, error, filtered, rawItems, total, loadMore, changed } =
  useOrderList(activeTab);

const tabs = computed(() =>
  ORDER_TABS.map((tb) => ({ key: tb.key, label: t(tb.labelKey) })),
);
const fmt = (amount: number, currency?: string | null) =>
  new Intl.NumberFormat(locale.value, {
    style: "currency",
    currency: currency || "CNY",
  }).format(amount / 100);
const dateTime = (v?: string | null) =>
  v
    ? new Date(v).toLocaleString(locale.value, {
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
      })
    : "";

/** 纯文字状态色：对照 order-list-jd.html 的 .s-warn/.s-info/.s-ok/.s-mute */
const STATE_TEXT: Record<string, string> = {
  warning: "text-[#d97706]",
  info: "text-[#e1251b]",
  success: "text-[#16a34a]",
};
const stateTextOf = (o: any) =>
  STATE_TEXT[stateBadge(o.state, o).color] ?? "text-[#9ca3af]";

/** 按配送类型分组（自营 / 自提门店）：OrderBase 片段无商家名，故以 deliveryType 为口径 */
const groups = computed(() => {
  const self = filtered.value.filter(
    (o) => (o as any).customFields?.deliveryType !== "pickup",
  );
  const pickup = filtered.value.filter(
    (o) => (o as any).customFields?.deliveryType === "pickup",
  );
  return [
    { key: "self", label: t("messages.account.selfOperated"), items: self },
    { key: "pickup", label: t("messages.order.merchantPickup"), items: pickup },
  ].filter((g) => g.items.length > 0);
});
</script>

<template>
  <div>
    <!-- 下划线 tab（视觉对照 order-list-jd.html） -->
    <div class="flex gap-0.5 overflow-x-auto border-b border-[#eee] bg-white px-2">
      <button
        v-for="it in tabs"
        :key="it.key"
        class="shrink-0 whitespace-nowrap border-b-2 border-b-transparent px-3 py-2.5 text-[13.5px] text-[#666]"
        :class="
          activeTab === it.key
            ? 'border-b-[#e1251b] font-bold text-[#e1251b]'
            : ''
        "
        @click="activeTab = it.key"
      >
        {{ it.label }}
      </button>
    </div>

    <div
      v-if="loading"
      class="py-12 text-center text-neutral-500"
    >
      {{ t("messages.general.loading") }}
    </div>
    <div
      v-else-if="error"
      class="py-12 text-center text-neutral-500"
    >
      {{ t("messages.order.loadFailed") }}
    </div>
    <div
      v-else-if="!filtered.length"
      class="py-12 text-center text-neutral-500"
    >
      {{ t("messages.order.empty") }}
    </div>
    <template v-else>
      <section
        v-for="g in groups"
        :key="g.key"
        class="mt-2.5 border-t-2 border-t-[#e1251b] bg-white"
      >
        <div
          class="flex items-center gap-1.5 border-b border-[#f2f2f2] px-3 py-2.5 text-[13.5px] font-bold"
        >
          <span class="h-3.5 w-[3px] rounded-[1px] bg-[#e1251b]" />
          {{ g.label }}
        </div>
        <div
          v-for="o in g.items"
          :key="o.id"
          class="border-b border-[#f2f2f2]"
        >
          <!-- 整卡可点跳详情：订单头/商品/合计包在链接内，操作区独立于链接外，避免按钮点击误触跳转 -->
          <NuxtLink
            :to="localePath(`/account/orders/${o.code}`)"
            class="block"
          >
            <div class="flex items-center justify-between px-3 pb-1 pt-[9px] text-[11.5px] text-[#9ca3af]">
              <span>
                {{ dateTime(o.orderPlacedAt) }}
                <span class="font-mono text-[#6b7280]">#{{ o.code }}</span>
              </span>
              <span
                class="text-[12px] font-semibold"
                :class="stateTextOf(o)"
              >
                {{ t(stateBadge(o.state, o).labelKey) }}
              </span>
            </div>
            <ul class="px-3 py-0.5">
              <li
                v-for="line in o.lines"
                :key="line.id"
                class="flex items-center gap-2.5 border-t border-dashed border-[#f1f1f1] py-2 first:border-t-0"
              >
                <NuxtImg
                  :src="assetSrc(line.featuredAsset?.preview, 96)"
                  :alt="line.productVariant?.name ?? ''"
                  class="h-[46px] w-[46px] shrink-0 rounded bg-[#f0f1f3] object-cover"
                  loading="lazy"
                />
                <div class="min-w-0 flex-1">
                  <p class="truncate text-[13px]">
                    {{ line.productVariant?.name }}
                  </p>
                </div>
                <p class="whitespace-nowrap text-[12.5px] font-semibold">
                  {{ fmt(line.linePriceWithTax, o.currencyCode) }}
                  <span class="ml-[3px] font-normal text-[#9ca3af]">×{{ line.quantity }}</span>
                </p>
              </li>
            </ul>
            <div class="flex items-center justify-between px-3 py-2 text-[12px] text-[#6b7280]">
              <span>{{ t("messages.order.totalItems", { n: o.totalQuantity }) }}</span>
              <span>
                {{ t("messages.order.actualPaid") }}
                <b class="text-[14px] text-[#e1251b]">{{ fmt(o.totalWithTax, o.currencyCode) }}</b>
              </span>
            </div>
          </NuxtLink>
          <div class="flex justify-end px-3 pb-[11px]">
            <OrderCardActions
              :order="o"
              variant="jd"
              @changed="changed"
            />
          </div>
        </div>
      </section>

      <div
        v-if="rawItems.length < total"
        class="mx-3 mb-[30px] mt-3.5 text-center"
      >
        <button
          class="rounded border border-[#ddd] bg-white px-[26px] py-2 text-[13px] text-[#666]"
          @click="loadMore"
        >
          {{ t("messages.order.loadMore") }}
        </button>
      </div>
    </template>
  </div>
</template>