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
/* 大字版（R1）：内容文字/间距一律 rem（100% 档与原 px 等价，125%+ 随根字号放大） */
.jdB {
  display: inline-flex; align-items: center; gap: 0.75rem;
  background: var(--color-price, #E1251B); color: #fff; border-radius: 0.375rem; padding: 0.5rem 0.875rem;
}
.jdB-mark {
  font-size: 0.75rem; color: #fff; background: rgba(255, 255, 255, 0.24);
  border-radius: 0.1875rem; padding: 0.0625rem 0.4375rem; line-height: 1.6; white-space: nowrap;
}
.jdB-now { font-weight: 800; font-size: 1.5rem; line-height: 1.1; color: #fff; }
.jdB-orig { color: rgba(255, 255, 255, 0.78); font-size: 0.875rem; text-decoration: line-through; }
</style>