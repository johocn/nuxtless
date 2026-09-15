<script setup lang="ts">
const { t } = useI18n();
const localePath = useTenantLocalePath();
const orderStore = useOrderStore();
const { order, loading } = storeToRefs(orderStore);
const isCartOpen = useState<boolean>("isCartOpen");
const total = computed(() => order?.value?.totalWithTax ?? 0);

// 购物车页装修（L1 全局 → L2 模板 → L3 店铺 pageCartConfig 合并）
const { pageConfig } = useThemeConfig();
const cartCfg = computed(() => pageConfig("cart") ?? null);
const panelTitle = computed(() => cartCfg.value?.title || t("messages.shop.yourCart"));
const checkoutFull = computed(() => cartCfg.value?.checkoutStyle === "full");

async function clearOrder() {
  const ids = order.value?.lines?.map((l) => l.id) ?? [];
  if (!ids.length) return;

  await Promise.all(ids.map((id) => orderStore.removeItemFromOrder(id)));
}
</script>

<template>
  <USlideover
    v-model:open="isCartOpen"
    :title="panelTitle"
    :description="t('messages.shop.cartDescription')"
  >
    <template #body>
      <CartEmpty v-if="!order?.lines?.length" class="my-14" />
      <CartItem v-for="line in order?.lines" :key="line.id" :line="line" />
    </template>

    <template #footer>
      <div class="flex w-full gap-4">
        <UButton
          :to="localePath('/checkout')"
          size="xl"
          color="primary"
          :loading="loading"
          :disabled="(order?.lines.length ?? 0) < 1"
          :class="checkoutFull ? 'w-full justify-center' : 'flex-1 justify-center'"
          @click="isCartOpen = !isCartOpen"
        >
          <span>{{ t("messages.shop.checkout") }}</span>
          <span v-if="(order?.lines.length ?? 0) > 0">
            {{ (total / 100).toFixed(2) }} {{ order?.currencyCode }}
          </span>
        </UButton>
        <UButton
          v-if="!checkoutFull"
          icon="i-lucide-trash"
          color="error"
          size="xl"
          variant="soft"
          :disabled="(order?.lines.length ?? 0) < 1 || loading"
          @click="clearOrder"
        />
      </div>
    </template>
  </USlideover>
</template>

<style lang="css" scoped></style>
