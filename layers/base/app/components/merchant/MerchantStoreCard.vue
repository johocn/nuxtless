<script setup lang="ts">
import type { MerchantStoreView } from "~~/layers/base/app/composables/useMerchantStores";

/** 到店门店卡：名称/商户/地址/营业时间/电话/距离，点击打开商户详情。 */
const props = defineProps<{
  store: MerchantStoreView;
  /** 距离文案由列表统一计算（有定位才展示） */
  distance?: string;
}>();
const emit = defineEmits<{ (e: "open"): void }>();

const { t } = useI18n();
const stateLabel = computed(() => {
  if (props.store.isOpenNow === null) return "";
  return props.store.isOpenNow ? t("messages.merchantStore.openNow") : t("messages.merchantStore.closedNow");
});
</script>

<template>
  <button type="button" class="store-card" @click="emit('open')">
    <span class="min-w-0 flex-1">
      <span class="flex items-center gap-1.5">
        <span class="truncate text-[13px] font-semibold">{{ store.name }}</span>
        <span v-if="stateLabel" class="state" :class="store.isOpenNow ? 'on' : 'off'">{{ stateLabel }}</span>
      </span>
      <span class="mt-0.5 block truncate text-[11px] text-(--ui-text-muted)">
        <template v-if="store.partner">{{ store.partner }} · </template>{{ store.address }}
      </span>
      <span class="mt-1 flex items-center gap-3 text-[11px] text-(--ui-text-dimmed)">
        <span v-if="store.businessHours" class="inline-flex min-w-0 items-center gap-1">
          <UIcon name="i-lucide-clock" class="size-3 flex-none" />
          <span class="truncate">{{ store.businessHours }}</span>
        </span>
        <span v-if="store.phoneNumber" class="inline-flex flex-none items-center gap-1">
          <UIcon name="i-lucide-phone" class="size-3" />{{ store.phoneNumber }}
        </span>
      </span>
    </span>
    <span class="flex flex-none flex-col items-end gap-1">
      <span v-if="distance" class="text-[11px] text-(--ui-text-muted)">{{ distance }}</span>
      <UIcon name="i-lucide-chevron-right" class="size-4 text-(--ui-text-dimmed)" />
    </span>
  </button>
</template>

<style scoped>
.store-card {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  width: 100%;
  text-align: left;
  border: 1px solid var(--ui-border);
  border-radius: 12px;
  background: var(--ui-bg);
  padding: 10px 12px;
  transition: border-color 0.12s;
}
.store-card:active {
  border-color: var(--ui-primary);
}
.state {
  flex: none;
  font-size: 10px;
  line-height: 1.5;
  padding: 0 5px;
  border-radius: 999px;
  border: 1px solid var(--ui-border);
}
.state.on {
  color: #0f766e;
  border-color: #14b8a6;
}
.state.off {
  color: var(--ui-text-dimmed);
}
</style>
