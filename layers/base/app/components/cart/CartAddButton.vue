<script setup lang="ts">
const { disabled } = defineProps<{
  disabled?: boolean;
}>();

const { t } = useI18n();
const toast = useToast();
const { loading, error } = storeToRefs(useOrderStore());
const { addItemToOrder } = useOrderStore();
const { selectedVariant, stockLevel } = storeToRefs(useProductStore());
const variantId = computed(() => selectedVariant.value?.id);
const quantity = ref(1);

// 数量上限跟随后端真实可售库存 availableStock（未跟踪库存时后端返回极大值，钳制到上限）
const MAX_STOCK_CAP = 999;
const maxStock = computed(() => {
  const available = (selectedVariant.value as { availableStock?: number | null } | null)?.availableStock;
  if (available == null) return 99;
  return Math.min(Math.max(0, available), MAX_STOCK_CAP);
});

const hasStock = computed(
  () => stockLevel.value === "IN_STOCK" || stockLevel.value === "LOW_STOCK",
);

const mobileClasses =
  "fixed start-0 bottom-0 z-10 bg-gray-50/80 p-4 backdrop-blur dark:bg-gray-800/80";

watch(error, (val) => {
  if (val) {
    toast.add({
      title: "Failed to Add Product",
      description: "Failed adding product to cart. Please try again later.",
      color: "error",
    });
  }
});

async function addToCart() {
  if (!variantId.value || disabled || !hasStock.value) return;

  const res = await addItemToOrder(variantId.value, quantity.value);
  if (res?.status === "partial") {
    toast.add({
      title: t("messages.shop.addToCart"),
      description: `库存不足，已加入 ${res.quantityAvailable ?? 0} 件`,
      color: "warning",
    });
  }
}
</script>

<template>
  <div
    :class="mobileClasses"
    class="flex gap-4 sm:static sm:bg-none sm:p-0 sm:backdrop-blur-none lg:w-md"
  >
    <UInputNumber v-model="quantity" size="xl" :min="1" :max="maxStock" />
    <UButton
      :label="t('messages.shop.addToCart')"
      :loading="loading"
      :disabled="disabled || !hasStock"
      size="xl"
      class="w-full justify-center"
      @click="addToCart"
    />
  </div>
</template>

<style lang="css" scoped></style>
