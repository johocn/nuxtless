<script setup lang="ts">
import type { OrderLine } from "~~/types/order";
import { assetSrc } from "../../utils/image";

const { line } = defineProps<{
  line: OrderLine;
}>();

const { t } = useI18n();
const orderStore = useOrderStore();
const { loading } = storeToRefs(orderStore);
const { selectedVariant } = storeToRefs(useProductStore());

// 商品显示名 = 商品名 + 变体名（例：智能手环 6 经典黑），变体名与商品名相同时仅展示一次
const displayName = computed(() => {
  const pName = line.productVariant?.product?.name ?? "";
  const vName = line.productVariant?.name ?? "";
  if (vName && vName !== pName) return `${pName} ${vName}`.trim();
  return pName || vName;
});

const remove = () => {
  orderStore.removeItemFromOrder(line.id);
};
</script>

<template>
  <div class="flex gap-4 border-b py-4">
    <div class="basis-[20%]">
      <NuxtImg
        :src="assetSrc(line?.featuredAsset?.preview, 128)"
        :alt="line?.productVariant.name ?? 'Product Image'"
        class="h-full rounded object-cover"
        width="128"
        loading="lazy"
      />
    </div>

    <div class="flex basis-[50%] flex-col">
      <div class="text-sm font-medium">
        {{ displayName }}
      </div>
      <div class="text-xs">
        {{ t("messages.shop.quantity") }}: {{ line.quantity }}
      </div>
      <div class="mt-1 text-sm font-semibold">
        {{ (line.linePriceWithTax / line.quantity / 100).toFixed(2) }}
        {{ selectedVariant?.currencyCode }}
      </div>
    </div>

    <div class="flex basis-[40%] items-center justify-end gap-2">
      <CartQuantityInput
        :quantity="line.quantity"
        :disabled="loading"
        @update="(val) => orderStore.adjustOrderLine(line.id, val)"
      />
      <UButton
        icon="i-lucide-trash"
        color="error"
        size="sm"
        variant="soft"
        :disabled="loading"
        @click="remove"
      />
    </div>
  </div>
</template>
