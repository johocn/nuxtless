<script setup lang="ts">
import { getBillPayConfig, getMyBillPayOrders, distinctMerchants, type BillPayConfig } from "~~/layers/base/app/composables/useBillPay";
import BillPaySubmitForm from "./BillPaySubmitForm.vue";
import BillPayLimitsStrip from "./BillPayLimitsStrip.vue";

/**
 * 代买单首页（Channel.customFields.storefrontMode=billpay，t3 租户）：
 * 店招（含「代买代办」身份声明）+ 权益边界条（限额/优惠前置公示）+ 提交委托表单 + 我的委托单入口。
 * 数据：billPayConfig（匿名可读，SSR 预取用于权益条前置公示）+ 历史委托单（登录后用于商家联想）。
 */
const { t } = useI18n();
const { customFields } = useChannelTheme();
const localePath = useTenantLocalePath();
const { isAuthenticated } = storeToRefs(useAuthStore());

// SSR 预取：限额/优惠数值须出现在首屏 HTML（前置公示）；失败降级 null（报价卡占位，提交时后端仍会校验）
const { data: config } = useAsyncData<BillPayConfig | null>(
  "billpay-config",
  async () => {
    try {
      return await getBillPayConfig();
    } catch {
      return null;
    }
  },
  { default: () => null },
);

const historyMerchants = ref<string[]>([]);

onMounted(async () => {
  if (isAuthenticated.value) {
    try {
      const orders = await getMyBillPayOrders();
      historyMerchants.value = distinctMerchants(orders);
    } catch {
      historyMerchants.value = [];
    }
  }
});

const shopName = computed(() => customFields.value?.shopName || t("messages.billpay.defaultShopName"));
</script>

<template>
  <main class="mx-auto w-full max-w-3xl px-3 pb-24">
    <!-- 店招 -->
    <header class="hero">
      <div class="min-w-0">
        <div class="hero-name">{{ shopName }}</div>
        <div class="hero-slogan">{{ t("messages.billpay.heroSlogan") }}</div>
        <div class="hero-trust">{{ t("messages.billpay.identitySlogan") }}</div>
      </div>
      <NuxtLink v-if="isAuthenticated" :to="localePath('/billpay/orders')" class="hero-orders">
        {{ t("messages.billpay.myOrders") }}
      </NuxtLink>
    </header>

    <!-- 权益边界条（限额/优惠前置公示） -->
    <BillPayLimitsStrip :config="config" />

    <!-- 提交委托表单 -->
    <BillPaySubmitForm :config="config" :history-merchants="historyMerchants" />

    <!-- 「自己到店」买单券推荐位（券板块断点修复） -->
    <BillPayCouponSection class="mt-5" />

    <!-- 服务说明 -->
    <section class="mt-5 rounded-xl bg-(--ui-bg-muted) p-4 text-xs leading-relaxed text-(--ui-text-muted)">
      <p class="mb-1 font-semibold text-(--ui-text)">{{ t("messages.billpay.flowTitle") }}</p>
      <p>{{ t("messages.billpay.flowDesc") }}</p>
    </section>
  </main>
</template>

<style scoped>
.hero { display: flex; align-items: center; justify-content: space-between; gap: 8px; margin-bottom: 14px; border-radius: 12px; background: var(--ui-primary); color: #fff; padding: 16px; }
.hero-name { font-size: 17px; font-weight: 700; }
.hero-slogan { margin-top: 2px; font-size: 12px; opacity: .85; }
.hero-trust { margin-top: 4px; font-size: 11px; opacity: .75; }
.hero-orders { flex: none; border-radius: 999px; background: rgba(255, 255, 255, .18); padding: 6px 12px; font-size: 12px; color: #fff; white-space: nowrap; }
</style>
