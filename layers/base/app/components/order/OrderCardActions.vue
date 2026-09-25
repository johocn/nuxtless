<script setup lang="ts">
import type { GetOrderHistoryQuery } from "#gql/default";
import type { OrderVisualVariant } from "../../utils/order-config";

type OrderListOrder = NonNullable<
  GetOrderHistoryQuery["activeCustomer"]
>["orders"]["items"][number];

const { t } = useI18n();
const localePath = useTenantLocalePath();
const router = useRouter();
const { canCancel, cancelOrder, reorder, loading } = useOrderActions();

const props = defineProps<{
  order: OrderListOrder;
  /**
   * 版式视觉变体：cn/jd/mall = 对应版式视觉；**不传（undefined）= 既有观感**，
   * 供 card 版式（OrderCard）零回归。
   */
  variant?: OrderVisualVariant;
}>();
const emit = defineEmits<{ (e: "changed"): void }>();

// 不传 → 沿用主题默认圆角（card 版式外观零回归）｜jd 4px｜cn·mall 药丸
const rounded = computed(() =>
  props.variant === "jd" ? "rounded" : props.variant ? "rounded-full" : "",
);
const cancelVariant = computed(() => (props.variant === "jd" ? "outline" : "soft"));
const reorderVariant = computed(() => (props.variant === "jd" ? "outline" : "soft"));
const reorderColor = computed(() => (props.variant === "jd" ? "neutral" : "primary"));
const reorderClass = computed(() =>
  props.variant === "mall" ? "border-0 bg-[#fff0ec] font-semibold text-[#e0433f]" : "",
);
const detailVariant = computed(() => (props.variant === "jd" ? "outline" : "solid"));
const detailClass = computed(() =>
  props.variant === "mall"
    ? "border-0 bg-gradient-to-r from-[#e0433f] to-[#ff6a6c] text-white shadow-[0_3px_10px_#e0433f47]"
    : "",
);

async function onReorder() {
  const lines = props.order.lines.map((l) => ({
    productVariantId: l.productVariant.id,
    quantity: l.quantity,
  }));
  if (await reorder(lines)) router.push(localePath("/checkout"));
}

async function onCancel() {
  if (await cancelOrder(props.order.state)) emit("changed");
}
</script>

<template>
  <div class="flex flex-wrap justify-end gap-2">
    <UButton
      v-if="canCancel(order.state)"
      size="sm"
      :variant="cancelVariant"
      color="neutral"
      :class="rounded"
      :label="t('messages.order.cancel')"
      :loading="loading"
      @click="onCancel"
    />
    <UButton
      size="sm"
      :variant="reorderVariant"
      :color="reorderColor"
      :class="[rounded, reorderClass]"
      :label="t('messages.order.reorder')"
      @click="onReorder"
    />
    <UButton
      size="sm"
      :variant="detailVariant"
      color="primary"
      :class="[rounded, detailClass]"
      :label="t('messages.order.viewDetail')"
      :to="localePath(`/account/orders/${order.code}`)"
    />
  </div>
</template>