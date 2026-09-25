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

/** 实心浅底丸（状态色）：对照 order-list-mall.html 的 .pill 调色板 */
const PILL: Record<string, string> = {
  warning: "text-[#b45309] bg-[#fff4e5]",
  info: "text-[#c2410c] bg-[#fff0ec]",
  success: "text-[#047857] bg-[#e9f9f0]",
};
const pillOf = (o: any) =>
  PILL[stateBadge(o.state, o).color] ?? "text-[#6b7280] bg-[#f3f4f6]";
</script>

<template>
  <div>
    <!-- 渐变药丸 tab（视觉对照 order-list-mall.html；顶部标题卡属页面 chrome，不在此实现） -->
    <div class="flex gap-2 overflow-x-auto px-4 pb-1 pt-3">
      <button
        v-for="it in tabs"
        :key="it.key"
        class="shrink-0 whitespace-nowrap rounded-full px-[15px] py-1.5 text-[13px]"
        :class="
          activeTab === it.key
            ? 'bg-gradient-to-r from-[#e0433f] to-[#ff6a6c] font-bold text-white'
            : 'bg-white text-[#6b7280] shadow-[0_1px_3px_#0000000a]'
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
      class="flex flex-col gap-[14px] px-3.5 pb-1 pt-3"
    >
      <article
        v-for="o in filtered"
        :key="o.id"
        class="rounded-[18px] bg-white px-[15px] pb-3 pt-3.5 shadow-[0_3px_14px_#1118270f]"
      >
        <!-- 整卡可点跳详情：头部/商品/合计包在链接内，操作区独立于链接外，避免按钮点击误触跳转 -->
        <NuxtLink
          :to="localePath(`/account/orders/${o.code}`)"
          class="block"
        >
          <div class="mb-1 flex items-center justify-between">
            <div class="flex items-center gap-[7px] text-[13.5px] font-bold">
              <span class="i-lucide-store text-[#e0433f]" />
              {{
                o.customFields?.deliveryType === "pickup"
                  ? t("messages.shop.pickupInfo")
                  : t("messages.account.selfOperated")
              }}
            </div>
            <span
              class="rounded-full px-2.5 py-[3px] text-[11px] font-semibold"
              :class="pillOf(o)"
            >
              {{ t(stateBadge(o.state, o).labelKey) }}
            </span>
          </div>
          <ul class="mt-1.5">
            <li
              v-for="line in o.lines"
              :key="line.id"
              class="flex items-center gap-[11px] border-t border-[#f5f5f6] py-[9px] first:border-t-0"
            >
              <NuxtImg
                :src="assetSrc(line.featuredAsset?.preview, 96)"
                :alt="line.productVariant?.name ?? ''"
                class="h-[50px] w-[50px] shrink-0 rounded-xl bg-[linear-gradient(135deg,#f2f3f5,#e8eaee)] object-cover"
                loading="lazy"
              />
              <div class="min-w-0 flex-1">
                <p class="truncate text-[13.5px] font-semibold">
                  {{ line.productVariant?.name }}
                </p>
              </div>
              <p class="whitespace-nowrap text-[13px] font-bold">
                {{ fmt(line.linePriceWithTax, o.currencyCode) }}
                <span class="ml-[3px] text-[11.5px] font-normal text-[#9ca3af]">×{{ line.quantity }}</span>
              </p>
            </li>
          </ul>
          <div
            class="mt-2 flex items-center justify-between border-t border-dashed border-[#eef0f2] pt-2.5 text-[12.5px] text-[#6b7280]"
          >
            <span>{{ t("messages.order.totalItems", { n: o.totalQuantity }) }}</span>
            <span>
              {{ t("messages.order.actualPaid") }}
              <b class="text-[15px] text-[#e0433f]">{{ fmt(o.totalWithTax, o.currencyCode) }}</b>
            </span>
          </div>
        </NuxtLink>
        <div class="mt-[11px] flex justify-end">
          <OrderCardActions
            :order="o"
            variant="mall"
            @changed="changed"
          />
        </div>
      </article>
    </div>

    <div
      v-if="rawItems.length < total"
      class="mx-3.5 mt-4 text-center"
    >
      <button
        class="rounded-full bg-white px-[30px] py-[9px] text-[13px] text-[#6b7280] shadow-[0_2px_8px_#0000000d]"
        @click="loadMore"
      >
        {{ t("messages.order.loadMore") }}
      </button>
    </div>
  </div>
</template>