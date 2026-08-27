<script setup lang="ts">
import CheckoutLayoutJd from "./CheckoutLayoutJd.vue";
import { checkoutConfig } from "~~/layers/base/app/utils/checkout-config";

const layout = checkoutConfig.layout;
</script>

<template>
  <CheckoutLayoutJd v-if="layout === 'jd'" />
  <slot v-else />
</template>

<style lang="css" scoped></style>