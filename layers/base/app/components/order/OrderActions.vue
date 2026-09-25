<script setup lang="ts">
import type { GetOrderByCodeQuery } from "#gql/default";
import type { OrderVisualVariant } from "../../utils/order-config";

const props = defineProps<{
  order: NonNullable<GetOrderByCodeQuery["orderByCode"]>;
  /**
   * 版式视觉变体：cn/jd/mall = 对应版式视觉；**不传（undefined）= 既有观感**，
   * 供 classic / confirmation 等旧调用方零回归。
   */
  variant?: OrderVisualVariant;
}>();
const emit = defineEmits<{
  (e: "updated"): void;
}>();
const { t } = useI18n();
const localePath = useTenantLocalePath();
const router = useRouter();
const { loading, canCancel, cancelOrder, reorder, copyOrderLink } =
  useOrderActions();

const lines = computed(() =>
  (props.order.lines ?? []).map((l) => ({
    productVariantId: l.productVariant?.id ?? "",
    quantity: l.quantity,
  })),
);

// ---- 版式差异：不传 → 沿用主题默认圆角（旧调用方零回归）｜jd 近直角｜cn·mall 药丸 ----
const rounded = computed(() =>
  props.variant === "jd" ? "rounded" : props.variant ? "rounded-full" : "",
);
const cancelVariant = computed(() => (props.variant === "jd" ? "outline" : "soft"));
const cancelColor = computed(() => (props.variant === "jd" ? "neutral" : "error"));
const linkVariant = computed(() => (props.variant === "jd" ? "outline" : "ghost"));
const reorderClass = computed(() =>
  props.variant === "mall"
    ? "border-0 bg-gradient-to-r from-[#e0433f] to-[#ff6a6c] text-white shadow-[0_5px_14px_#e0433f47]"
    : "",
);

async function onCancel() {
  const ok = await cancelOrder(props.order.state);
  if (ok) emit("updated");
}

async function onReorder() {
  const ok = await reorder(lines.value);
  if (ok) router.push(localePath("/checkout"));
}
</script>

<template>
  <div class="flex flex-wrap gap-3">
    <UButton
      v-if="canCancel(order.state)"
      icon="i-lucide-x"
      :color="cancelColor"
      :variant="cancelVariant"
      :loading="loading"
      :class="rounded"
      :label="t('messages.order.cancel')"
      @click="onCancel"
    />
    <UButton
      icon="i-lucide-shopping-cart"
      color="primary"
      :loading="loading"
      :class="[rounded, reorderClass]"
      :label="t('messages.order.reorder')"
      @click="onReorder"
    />
    <UButton
      icon="i-lucide-link"
      color="primary"
      :variant="linkVariant"
      :class="rounded"
      :label="t('messages.general.getLink')"
      @click="copyOrderLink(order.code)"
    />
  </div>
</template>