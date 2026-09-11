<script setup lang="ts">
// 京东风格价格块 · 方案A 横幅促销价：现价 + 划线原价 + 降价额 + 促销标签
const { fmt, current, list, showList, save } = usePriceWithList();
const { t } = useI18n();
</script>

<template>
  <div class="jdA">
    <span class="jdA-now">{{ fmt(current) }}</span>
    <template v-if="showList">
      <span class="jdA-orig">{{ fmt(list) }}</span>
      <span class="jdA-save">{{ t("messages.shop.priceSave") }} {{ fmt(save) }}</span>
    </template>
    <div v-if="showList" class="jdA-tags">
      <!-- <span class="jdA-tag">{{ t("messages.shop.priceFlash") }}</span> -->
      <span class="jdA-tag">{{ t("messages.shop.priceFinal") }}</span>
    </div>
  </div>
</template>

<style scoped>
.jdA { display: flex; flex-wrap: wrap; align-items: baseline; gap: 10px; color: var(--color-price, #E1251B); }
.jdA-now { font-weight: 800; font-size: 26px; line-height: 1.1; color: var(--color-price, #E1251B); }
.jdA-orig { color: var(--color-text-3, #b0b0b0); font-size: 14px; text-decoration: line-through; }
.jdA-save { color: var(--color-price, #E1251B); font-size: 14px; font-weight: 600; }
.jdA-tags { flex-basis: 100%; display: flex; gap: 6px; margin-top: 6px; }
.jdA-tag {
  font-size: 12px; color: var(--color-price, #E1251B); border: 1px solid var(--color-price, #E1251B);
  border-radius: 3px; padding: 1px 6px; line-height: 1.6; background: color-mix(in srgb, var(--color-price, #E1251B) 6%, transparent);
}
</style>