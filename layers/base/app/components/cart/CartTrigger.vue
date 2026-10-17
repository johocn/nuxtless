<script setup lang="ts">
const { order } = storeToRefs(useOrderStore());
const isCartOpen = useState<boolean>("isCartOpen", () => false);

const itemCount = computed(
  () => order.value?.lines?.reduce((sum, line) => sum + line.quantity, 0) ?? 0,
);
</script>

<template>
  <UChip :show="itemCount > 0" color="error" :text="itemCount" size="3xl">
    <!-- 大字版：触发按钮锁 px（36px），防 rem 放大挤压 header logo -->
    <UButton
      icon="i-lucide-shopping-cart"
      variant="outline"
      size="md"
      class="h-[36px]! w-[36px]! min-w-0! p-0! justify-center shrink-0"
      :ui="{ leadingIcon: 'size-[18px]!' }"
      @click="isCartOpen = !isCartOpen"
    />
  </UChip>
</template>

<style lang="css" scoped></style>
