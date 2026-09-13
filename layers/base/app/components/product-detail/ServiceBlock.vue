<script setup lang="ts">
// 服务/保障条：回退链 = 商品 services（code）→ 频道方案库 serviceSchemes → i18n messages.detail.serviceItems
import { resolveSchemeTexts } from "../../utils/schemes";

const { tm, locale } = useI18n();
const { serviceSchemes } = useDetailConfig();
const productStore = useProductStore();
const serviceCodes = computed(() => productStore.product?.customFields?.services ?? []);

const items = computed(() => {
  const schemeTexts = resolveSchemeTexts(serviceSchemes.value, serviceCodes.value, locale.value);
  if (schemeTexts.length) return schemeTexts;
  return tm("messages.detail.serviceItems") as string[]; // 数组用 tm()，随 locale 变化
});
</script>

<template>
  <div class="flex gap-3 border-y border-gray-100 py-2 text-xs text-gray-500">
    <span v-for="it in items" :key="it" class="flex items-center gap-1">
      <UIcon name="i-lucide-check-circle-2" class="text-primary" />
      {{ it }}
    </span>
  </div>
</template>
