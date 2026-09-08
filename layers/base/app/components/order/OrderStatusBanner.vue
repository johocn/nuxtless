<script setup lang="ts">
import type { GetOrderByCodeQuery } from "#gql/default";
import { stateBadge } from "../../utils/order-state";

const props = defineProps<{
  order: NonNullable<GetOrderByCodeQuery["orderByCode"]>;
}>();
const { t } = useI18n();

const badge = computed(() => stateBadge(props.order.state));

const gradient: Record<string, string> = {
  neutral: "from-neutral-500 to-neutral-400",
  warning: "from-amber-500 to-yellow-400",
  info: "from-sky-500 to-indigo-500",
  success: "from-emerald-500 to-green-500",
  error: "from-red-500 to-rose-500",
};
</script>

<template>
  <div
    class="flex items-center justify-between gap-3 rounded-xl bg-gradient-to-r px-4 py-4 text-white shadow-sm"
    :class="gradient[badge.color] ?? gradient.neutral"
  >
    <div class="min-w-0">
      <p class="text-lg font-semibold">{{ t(badge.labelKey) }}</p>
      <p class="truncate text-sm text-white/80">
        {{ t("messages.shop.orderCode") }}: {{ order.code }}
      </p>
    </div>
    <span
      class="shrink-0 rounded-full bg-white/20 px-2.5 py-1 text-xs font-semibold text-white"
    >
      {{ t(badge.labelKey) }}
    </span>
  </div>
</template>