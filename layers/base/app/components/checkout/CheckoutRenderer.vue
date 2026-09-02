<script setup lang="ts">
import CheckoutLayoutCn from "./CheckoutLayoutCn.vue";
import CheckoutLayoutJd from "./CheckoutLayoutJd.vue";
import { checkoutConfig } from "~~/layers/base/app/utils/checkout-config";

const layout = checkoutConfig.layout;
const emit = defineEmits<{ (e: "submit"): void }>();
</script>

<template>
  <!-- cn（中国本地化，默认）｜jd（京东新版）｜slot 兜底（legacy） -->
  <CheckoutLayoutCn v-if="layout === 'cn'" @submit="emit('submit')" />
  <CheckoutLayoutJd v-else-if="layout === 'jd'" />
  <slot v-else />
</template>

<style lang="css" scoped></style>