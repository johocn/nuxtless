<script setup lang="ts">
/** 页头店铺切换器：与 HeaderCitySelector 并列（同 UPopover + UButton 范式）。
 *  目录前缀 header → 自动注册为 HeaderTenantSelector。 */
const { t } = useI18n();
const toast = useToast();
const siteName = useSiteName();
const { current, code } = useTenantChannel();
const { shops, loading, load, switchTo } = useTenantSwitcher();

const open = ref(false);
const switching = ref(false);

/** 未解析出租户（平台默认店）时按钮显示站点名 */
const label = computed(() => current.value?.name || siteName.value || t("messages.nav.selectShop"));

/** 打开面板时才拉清单（懒加载，避免 setup 期异步取数造成页头水合失配） */
watch(open, (v) => {
  if (v) void load();
});

async function pick(next: string) {
  if (next === code.value) {
    open.value = false;
    return;
  }
  switching.value = true;
  const ok = await switchTo(next);
  switching.value = false;
  if (!ok) {
    toast.add({ title: t("messages.error.switchFailed"), color: "error" });
    return;
  }
  open.value = false;
}
</script>

<template>
  <UPopover v-model:open="open">
    <UButton
      variant="ghost"
      color="neutral"
      icon="i-lucide-store"
      :label="label"
      :loading="switching"
    />

    <template #content>
      <div class="w-72 p-4">
        <p class="mb-3 text-sm font-semibold">{{ t('messages.nav.selectShop') }}</p>
        <ul v-if="shops.length" class="max-h-72 space-y-0.5 overflow-y-auto">
          <li v-for="shop in shops" :key="shop.code">
            <UButton
              block
              color="neutral"
              variant="ghost"
              class="justify-start"
              :label="shop.name"
              :loading="switching"
              :class="shop.code === code ? 'font-medium' : ''"
              @click="pick(shop.code)"
            >
              <template #trailing>
                <UBadge v-if="shop.isDefault" size="sm" variant="soft">
                  {{ t('messages.nav.officialShop') }}
                </UBadge>
                <UIcon v-else-if="shop.code === code" name="i-lucide-check" class="text-primary" />
              </template>
            </UButton>
          </li>
        </ul>
        <p v-else class="py-4 text-center text-xs text-neutral-400">
          {{ loading ? t('messages.nav.loading') : t('messages.error.switchFailed') }}
        </p>
      </div>
    </template>
  </UPopover>
</template>
