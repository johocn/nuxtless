<script setup lang="ts">
// 促销/优惠条：回退链 = text prop（版式层显式传入）→ 商品 promos（code）→ 频道方案库 promoSchemes → i18n messages.detail.promoItems
import { localizeText, type LocalizedText } from "../../utils/detail-config";
import { resolveSchemeTexts } from "../../utils/schemes";

const props = defineProps<{ text?: LocalizedText }>();
const { tm, locale } = useI18n();
const { promoSchemes } = useDetailConfig();
const productStore = useProductStore();
const promoCodes = computed(() => productStore.product?.customFields?.promos ?? []);

const items = computed(() => {
  if (props.text) return [localizeText(props.text, locale.value)];
  const schemeTexts = resolveSchemeTexts(promoSchemes.value, promoCodes.value, locale.value);
  if (schemeTexts.length) return schemeTexts;
  return tm("messages.detail.promoItems") as string[]; // i18n 数组用 tm() 取（t() 对数组会返回原 key）
});
</script>

<template>
  <div class="mt-2 flex flex-wrap gap-1.5 text-xs">
    <span
      v-for="tx in items"
      :key="tx"
      class="rounded bg-primary/10 px-1.5 py-0.5 text-primary"
    >
      {{ tx }}
    </span>
  </div>
</template>
