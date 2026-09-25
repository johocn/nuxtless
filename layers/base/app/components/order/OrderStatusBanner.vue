<script setup lang="ts">
import type { GetOrderByCodeQuery } from "#gql/default";
import { stateBadge } from "../../utils/order-state";
import type { OrderVisualVariant } from "../../utils/order-config";

const props = withDefaults(
  defineProps<{
    order: NonNullable<GetOrderByCodeQuery["orderByCode"]>;
    /** 版式变体（缺省 cn = 现状观感，classic 调用方零回归） */
    variant?: OrderVisualVariant;
  }>(),
  { variant: "cn" },
);
const { t } = useI18n();

const badge = computed(() => stateBadge(props.order.state, props.order));

// cn：按订单状态取语义渐变（现状行为）；jd / mall：固定品牌渐变
const stateGradient: Record<string, string> = {
  neutral: "from-neutral-500 to-neutral-400",
  warning: "from-amber-500 to-yellow-400",
  info: "from-sky-500 to-indigo-500",
  success: "from-emerald-500 to-green-500",
  error: "from-red-500 to-rose-500",
};
const gradient = computed(() => {
  if (props.variant === "jd") return "from-[#c8161d] via-[#e1251b] to-[#f04b2f]";
  if (props.variant === "mall") return "from-[#e0433f] to-[#ff6a6c]";
  return stateGradient[badge.value.color] ?? stateGradient.neutral;
});
const radius = computed(() =>
  props.variant === "jd" ? "rounded-md" : props.variant === "mall" ? "rounded-2xl" : "rounded-xl",
);
const chipRadius = computed(() => (props.variant === "jd" ? "rounded-sm" : "rounded-full"));
</script>

<template>
  <div
    class="flex items-center justify-between gap-3 bg-gradient-to-r px-4 py-4 text-white shadow-sm"
    :class="[radius, gradient]"
  >
    <div class="min-w-0">
      <p class="text-lg font-semibold">{{ t(badge.labelKey) }}</p>
      <p class="truncate text-sm text-white/80">
        {{ t("messages.shop.orderCode") }}: {{ order.code }}
      </p>
    </div>
    <span
      class="shrink-0 bg-white/20 px-2.5 py-1 text-xs font-semibold text-white"
      :class="chipRadius"
    >
      {{ t(badge.labelKey) }}
    </span>
  </div>
</template>