<script setup lang="ts">
import type { OrderTabKey } from "../../utils/order-state";
import { ORDER_TABS } from "../../utils/order-state";
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
</script>

<template>
  <div>
    <!-- tab 药丸：OrderTabBar 样式固定为 card 版式，故本容器内联同名 tab（视觉对照 order-list-cn.html） -->
    <div
      class="flex gap-2 overflow-x-auto border-b border-[#f0f0f0] bg-white px-[14px] py-3"
    >
      <button
        v-for="it in tabs"
        :key="it.key"
        class="shrink-0 whitespace-nowrap rounded-full px-[13px] py-[5px] text-[13px]"
        :class="
          activeTab === it.key
            ? 'bg-[#e1251b] font-semibold text-white'
            : 'bg-[#f4f5f7] text-[#4b5563]'
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
    <div
      v-else
      class="flex flex-col gap-3 px-3 pb-6 pt-3"
    >
      <article
        v-for="o in filtered"
        :key="o.id"
        class="overflow-hidden rounded-xl border border-[#ececec] bg-white shadow-[0_1px_3px_#0000000d]"
      >
        <!-- 整卡可点跳详情：头部/商品/合计包在链接内，操作区独立于链接外，避免按钮点击误触跳转 -->
        <NuxtLink
          :to="localePath(`/account/orders/${o.code}`)"
          class="block"
        >
          <div class="flex items-center justify-between px-[13px] pb-2 pt-[11px]">
            <div class="flex items-center gap-1.5 text-[13px] font-semibold">
              <span class="i-lucide-store text-[#e1251b]" />
              {{
                o.customFields?.deliveryType === "pickup"
                  ? t("messages.shop.pickupInfo")
                  : t("messages.account.selfOperated")
              }}
            </div>
            <OrderStateBadge :state="o.state" />
          </div>
          <ul class="px-[13px]">
            <li
              v-for="line in o.lines"
              :key="line.id"
              class="flex items-center gap-[11px] border-t border-[#f4f4f5] py-[9px] first:border-t-0"
            >
              <NuxtImg
                :src="assetSrc(line.featuredAsset?.preview, 96)"
                :alt="line.productVariant?.name ?? ''"
                class="h-12 w-12 shrink-0 rounded-lg bg-[linear-gradient(135deg,#eef0f3,#e2e5ea)] object-cover"
                loading="lazy"
              />
              <div class="min-w-0 flex-1">
                <p class="truncate text-[13.5px] font-medium">
                  {{ line.productVariant?.name }}
                </p>
              </div>
              <p class="whitespace-nowrap text-[13px] font-semibold">
                {{ fmt(line.linePriceWithTax, o.currencyCode) }}
                <span class="ml-1 text-[12px] font-normal text-[#9ca3af]">×{{ line.quantity }}</span>
              </p>
            </li>
          </ul>
          <div
            class="mx-[13px] flex items-center justify-between border-t border-[#f1f1f2] py-[9px] text-[12.5px] text-[#6b7280]"
          >
            <span>{{ t("messages.order.totalItems", { n: o.totalQuantity }) }}</span>
            <span>
              {{ t("messages.order.actualPaid") }}
              <b class="text-[14px] text-[#111827]">{{ fmt(o.totalWithTax, o.currencyCode) }}</b>
            </span>
          </div>
        </NuxtLink>
        <div class="flex justify-end px-[13px] pb-3">
          <OrderCardActions
            :order="o"
            variant="cn"
            @changed="changed"
          />
        </div>
      </article>
    </div>

    <div
      v-if="rawItems.length < total"
      class="mx-3 mb-[30px] mt-1.5 text-center"
    >
      <button
        class="rounded-full bg-white px-[26px] py-2 text-[13px] text-[#6b7280] shadow-[0_1px_3px_#0000000f]"
        @click="loadMore"
      >
        {{ t("messages.order.loadMore") }}
      </button>
    </div>
  </div>
</template>