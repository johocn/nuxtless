<script setup lang="ts">
import CheckoutLayoutCn from "./CheckoutLayoutCn.vue";
import CheckoutLayoutJd from "./CheckoutLayoutJd.vue";
import CheckoutLayoutJdLegacy from "./CheckoutLayoutJdLegacy.vue";
import { checkoutConfig } from "~~/layers/base/app/utils/checkout-config";

const layout = checkoutConfig.layout;
const emit = defineEmits<{ (e: "submit"): void }>();
</script>

<template>
  <!-- cn（中国本地化，默认）｜jd（京东新版）→ 统一逐箱卡片渲染器；jd-legacy（旧京东薄装配回退）｜slot 兜底 -->
  <CheckoutLayoutCn v-if="layout === 'cn'" @submit="emit('submit')" />
  <CheckoutLayoutJd v-else-if="layout === 'jd'" />
  <CheckoutLayoutJdLegacy v-else-if="layout === 'jd-legacy'" />
  <slot v-else />
</template>

<style lang="css" scoped></style>
