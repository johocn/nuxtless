<script setup lang="ts">
// 京东风格价格块 · 方案B 深色价签条：整条主色价签 + 现价白字 + 划线原价 + 活动角标
const { fmt, current, list, showList } = usePriceWithList();
const { t } = useI18n();
</script>

<template>
  <div class="jdB">
    <span v-if="showList" class="jdB-mark">{{ t("messages.shop.priceFlashSale") }}</span>
    <span class="jdB-now">{{ fmt(current) }}</span>
    <span v-if="showList" class="jdB-orig">{{ fmt(list) }}</span>
  </div>
</template>

<style scoped>
.jdB {
  display: inline-flex; align-items: center; gap: 12px;
  background: var(--color-price, #E1251B); color: #fff; border-radius: 6px; padding: 8px 14px;
}
.jdB-mark {
  font-size: 12px; color: #fff; background: rgba(255, 255, 255, 0.24);
  border-radius: 3px; padding: 1px 7px; line-height: 1.6; white-space: nowrap;
}
.jdB-now { font-weight: 800; font-size: 24px; line-height: 1.1; color: #fff; }
.jdB-orig { color: rgba(255, 255, 255, 0.78); font-size: 14px; text-decoration: line-through; }
</style>