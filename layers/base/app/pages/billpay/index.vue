<script setup lang="ts">
import BillPayHome from "~~/layers/base/app/components/bill-pay/BillPayHome.vue";

/**
 * 代买单提交页（/billpay）：与首页模式分支共用 BillPayHome 主体（表单含登录引导）。
 */
definePageMeta({ title: "messages.billpay.title" });
</script>

<template>
  <BillPayHome />
</template>
