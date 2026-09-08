<script setup lang="ts">
// 中国本地化版式：底部吸底结算栏——应付金额 + 「去结算」CTA 常驻，
// 展开金额明细（小计/税费/运费/合计）+ 优惠抽屉入口 + 协议勾选（未勾拦截）。
import type { Ref } from "vue";
import type { ActiveOrderDetail } from "~~/types/order";
import { usePerBoxSelection } from "~~/layers/base/app/composables/usePerBoxSelection";

const props = defineProps<{
  disabled?: boolean;
  onSubmit: () => Promise<void> | void;
}>();

const { t } = useI18n();
const toast = useToast();
const orderStore = useOrderStore();
const { order, loading } = storeToRefs(orderStore);
const activeOrder = order as Ref<ActiveOrderDetail>;

// 行级选择状态（与逐箱卡片/汇总共用同一单例）：金额一律按「已选项」实时刷新
const sel = usePerBoxSelection();
const { orderBoxes } = storeToRefs(orderStore);

// 协议勾选（默认勾选）；未勾选时提交前拦截
const accepted = ref(true);
const expandState = ref(false);
const promoOpen = ref(false);

/** 已选商品合计（cents） */
const selectedGoods = computed(() => sel.selectedAmount());

/** 被选箱（至少选了一行） */
const selectedBoxList = computed(() =>
  (orderBoxes.value ?? []).filter((b) =>
    (b.lines ?? []).some((l) => (sel.selection[b.boxKey]?.[l.orderLineId] ?? 0) > 0),
  ),
);

/** 应付款（cents）= 已选商品合计 + 被选箱运费 − 券/免邮折扣（合并/分箱同口径，均按已选项） */
const payableCents = computed(() => {
  let shipping = 0;
  let discount = 0;
  for (const box of selectedBoxList.value) {
    shipping += box.shippingCost ?? 0;
    discount += box.shippingDiscount ?? 0;
  }
  return Math.max(0, selectedGoods.value + shipping - discount);
});

/** 已选 N 件 */
const selectedQty = computed(() => {
  let qty = 0;
  for (const box of orderBoxes.value ?? []) {
    for (const l of box.lines ?? []) {
      qty += sel.selection[box.boxKey]?.[l.orderLineId] ?? 0;
    }
  }
  return qty;
});

const subTotal = computed(() => (selectedGoods.value / 100).toFixed(2));
const orderTotal = computed(() => (payableCents.value / 100).toFixed(2));
// 已选项口径无法精确拆分税额（activeOrder.taxSummary 含未选行），隐藏税额行避免口径不一致
const orderTaxTotal = computed(() => null);
const shippingWithTax = computed(() => {
  let shipping = 0;
  for (const box of selectedBoxList.value) shipping += box.shippingCost ?? 0;
  return (shipping / 100).toFixed(2);
});

function expandDetails() {
  expandState.value = !expandState.value;
}

async function onGoCheckout() {
  if (!accepted.value) {
    toast.add({ title: t("messages.checkout.cnAgreementRequired"), color: "warning" });
    return;
  }
  await props.onSubmit();
}
</script>

<template>
  <!-- 移动端底部吸底结算栏（z 高于全局 JdTabBar z-60，防双底条同现时结算按钮被盖） -->
  <div
    class="fixed inset-x-0 bottom-0 z-[70] border-t border-neutral-200 bg-white px-4 pb-[env(safe-area-inset-bottom)] pt-2.5 shadow-[0_-2px_12px_rgba(0,0,0,0.06)] dark:border-neutral-800 dark:bg-neutral-900 md:hidden"
  >
    <!-- 金额明细（默认收起，点击展开） -->
    <div
      v-if="expandState"
      class="mb-2 flex flex-col gap-1 border-b border-neutral-100 pb-2 text-sm dark:border-neutral-700"
    >
      <div v-if="(activeOrder?.lines.length ?? 0) > 0" class="max-h-56 overflow-y-auto overscroll-contain">
        <CartItem v-for="line in activeOrder?.lines" :key="line.id" :line="line" class="border-b border-neutral-100 py-1 last:border-0 dark:border-neutral-800" />
      </div>
      <div class="mt-1 flex justify-between"><span>{{ t("messages.shop.subtotal") }}</span><span>{{ subTotal }}</span></div>
      <div v-if="orderTaxTotal != null" class="flex justify-between"><span>{{ t("messages.general.tax") }}</span><span>{{ orderTaxTotal }}</span></div>
      <div class="flex justify-between"><span>{{ t("messages.general.shipping") }}</span><span>{{ shippingWithTax }}</span></div>
      <USeparator class="my-1" />
      <div class="flex justify-between font-bold"><span>{{ t("messages.shop.total") }}</span><span>¥{{ orderTotal }}</span></div>
    </div>

    <div class="flex items-center justify-between gap-3">
      <div class="flex min-w-0 flex-1 flex-col">
        <button
          type="button"
          class="flex w-fit items-center gap-1 text-sm text-neutral-600 dark:text-neutral-300"
          @click="expandDetails"
        >
          <span>{{ expandState ? t("messages.checkout.cnCollapseDetails") : t("messages.checkout.cnExpandDetails") }}</span>
          <UIcon :name="expandState ? 'i-lucide-chevron-down' : 'i-lucide-chevron-up'" />
        </button>
        <div class="mt-0.5 flex items-baseline gap-1">
          <span class="text-xs text-neutral-400">{{ t("messages.shop.total") }}</span>
          <span class="font-bold text-primary-600 dark:text-primary-300">¥{{ orderTotal }}</span>
        </div>
        <p class="text-[11px] text-neutral-400">
          {{ t("messages.checkout.selectedCount", { n: selectedQty }) }}
        </p>
      </div>
      <UButton
        size="lg"
        color="primary"
        :loading="loading"
        :disabled="(activeOrder?.lines.length ?? 0) < 1 || props.disabled"
        class="px-8 justify-center"
        @click="onGoCheckout"
      >
        {{ t("messages.shop.checkout") }}
      </UButton>
    </div>

    <!-- 协议勾选 -->
    <CheckoutCnAgreement v-model="accepted" class="mt-2" />
  </div>

  <!-- 非吸底：优惠抽屉（父页面控制 open） -->
  <CheckoutCnPromoDrawer :open="promoOpen" @close="promoOpen = false" />
</template>