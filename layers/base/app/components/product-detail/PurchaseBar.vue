<script setup lang="ts">
// 底部加购栏：复用 CartAddButton（含 productServiceable 警示逻辑在详情页层做）
const { disabled } = defineProps<{ disabled?: boolean }>();
</script>

<template>
  <CartAddButton :disabled="disabled" class="w-full" />
</template>