<script setup lang="ts">
import type { CouponPageTab } from "~~/layers/base/app/utils/coupon";

defineProps<{ modelValue: CouponPageTab }>();
const emit = defineEmits<{ (e: "update:modelValue", v: CouponPageTab): void }>();

const { t } = useI18n();

/** 五个 Tab（B 版式：等分图标 tab 栏） */
const TABS: { key: CouponPageTab; label: string; paths: string[] }[] = [
  { key: "center", label: "tabCentre", paths: ["M4 7h16v3a2 2 0 0 0 0 4v3H4v-3a2 2 0 0 0 0-4V7z", "M12 8v1M12 11v1M12 14v1"] },
  { key: "sale", label: "tabSale", paths: ["M6 8h12l-1 12H7L6 8z", "M9 8V6a3 3 0 0 1 6 0v2"] },
  { key: "points", label: "tabPoints", paths: ["M4 9h16v11H4z", "M4 13h16M12 9v11"] },
  { key: "code", label: "tabCode", paths: ["M8 8m-3 0a3 3 0 1 0 6 0a3 3 0 1 0 -6 0", "M10 10l8 8M15 15l2-2M17 17l2-2"] },
  { key: "wallet", label: "tabWallet", paths: ["M4 6h16v13H4z", "M4 10h16", "M16 13.5h.01"] },
];
</script>

<template>
  <!-- 五个 Tab（图标 + 文字，等分） -->
  <nav class="mb-6 grid grid-cols-5 border-b border-(--ui-border)">
    <button
      v-for="tb in TABS"
      :key="tb.key"
      type="button"
      class="flex flex-col items-center gap-1 pb-3 text-xs font-medium transition-colors"
      :class="modelValue === tb.key ? 'text-primary' : 'text-(--ui-text-muted)'"
      @click="emit('update:modelValue', tb.key)"
    >
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="1.8"
        stroke-linecap="round"
        stroke-linejoin="round"
        class="size-5"
      >
        <path v-for="(p, i) in tb.paths" :key="i" :d="p" />
      </svg>
      <span class="whitespace-nowrap">{{ t(`messages.coupon.${tb.label}`) }}</span>
    </button>
  </nav>
</template>
