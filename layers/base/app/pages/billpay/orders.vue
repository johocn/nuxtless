<script setup lang="ts">
import BillPayOrderCard from "~~/layers/base/app/components/bill-pay/BillPayOrderCard.vue";
import { getMyBillPayOrders, billpayErrorMessage, type BillPayOrder, type BillPayStatus } from "~~/layers/base/app/composables/useBillPay";

/**
 * 我的委托单列表：状态 tab（全部/待支付/进行中/已完成）。
 * 待支付 = PENDING_QUOTE + QUOTED；进行中 = PAID + IN_SERVICE + COMPLETED；已完成 = SETTLED + REFUNDED。
 * CANCELLED 只在「全部」出现。
 */
definePageMeta({ title: "messages.billpay.myOrders" });

const { t } = useI18n();
const localePath = useTenantLocalePath();
const toast = useToast();
const { isAuthenticated } = storeToRefs(useAuthStore());

const loading = ref(true);
const orders = ref<BillPayOrder[]>([]);
const activeTab = ref<"all" | "unpaid" | "ongoing" | "done">("all");

const tabs = computed(() => [
  { key: "all", label: t("messages.billpay.tabAll") },
  { key: "unpaid", label: t("messages.billpay.tabUnpaid") },
  { key: "ongoing", label: t("messages.billpay.tabOngoing") },
  { key: "done", label: t("messages.billpay.tabDone") },
] as const);

const TAB_STATUSES: Record<string, BillPayStatus[]> = {
  unpaid: ["PENDING_QUOTE", "QUOTED"],
  ongoing: ["PAID", "IN_SERVICE", "COMPLETED"],
  done: ["SETTLED", "REFUNDED"],
};

const filtered = computed(() => {
  const s = TAB_STATUSES[activeTab.value];
  return s ? orders.value.filter((o) => s.includes(o.status)) : orders.value;
});

async function load() {
  loading.value = true;
  try {
    if (!isAuthenticated.value) {
      orders.value = [];
      navigateTo(localePath("/account/login"));
      return;
    }
    orders.value = await getMyBillPayOrders();
  } catch (e) {
    toast.add({ title: t("messages.billpay.loadFailed"), description: billpayErrorMessage(e), color: "error" });
  } finally {
    loading.value = false;
  }
}
onMounted(load);
</script>

<template>
  <main class="mx-auto my-4 w-full max-w-3xl px-3 pb-24">
    <div class="mb-3 flex items-center justify-between">
      <h1 class="text-lg font-semibold">{{ t("messages.billpay.myOrders") }}</h1>
      <NuxtLink :to="localePath('/billpay')" class="text-sm text-(--ui-primary)">
        {{ t("messages.billpay.newOrder") }}
      </NuxtLink>
    </div>

    <!-- 状态 tab -->
    <nav class="sticky top-0 z-10 -mx-3 mb-3 flex gap-2 bg-(--ui-bg)/90 px-3 py-2 backdrop-blur">
      <UButton
        v-for="tb in tabs"
        :key="tb.key"
        size="xs"
        :variant="activeTab === tb.key ? 'solid' : 'soft'"
        @click="activeTab = tb.key"
      >
        {{ tb.label }}
      </UButton>
    </nav>

    <BaseLoader v-if="loading" width="sm:w-xs" />
    <UCard v-else-if="!filtered.length" class="text-center text-(--ui-text-muted)">
      {{ t("messages.billpay.emptyOrders") }}
    </UCard>

    <ul v-else class="flex flex-col gap-2">
      <li v-for="o in filtered" :key="o.id">
        <BillPayOrderCard :order="o" />
      </li>
    </ul>

    <!-- 与 pages/billpay/orders/[id].vue 构成父子路由：此处必须是子路由出口，否则详情页不渲染 -->
    <NuxtPage />
  </main>
</template>
