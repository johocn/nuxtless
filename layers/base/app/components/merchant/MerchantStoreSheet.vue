<script setup lang="ts">
import type { MerchantStoreView } from "~~/layers/base/app/composables/useMerchantStores";

/**
 * 商户详情弹层（到店场景）：商户/营业状态/地址/营业时间/电话/门店公告/门店照片，
 * 底部「拨打电话 + 导航到店」。导航复用 usePickupNavigation（高德 URI，无需新 SDK）。
 */
const open = defineModel<boolean>("open", { default: false });
const props = defineProps<{
  store: MerchantStoreView | null;
  distance?: string;
}>();

const { t } = useI18n();
const nav = usePickupNavigation();
const toast = useToast();

const stateLabel = computed(() => {
  if (props.store?.isOpenNow == null) return "";
  return props.store.isOpenNow ? t("messages.merchantStore.openNow") : t("messages.merchantStore.closedNow");
});
const canNavigate = computed(() =>
  !!props.store?.coords && nav.hasCoords({ name: props.store.name, coordinates: props.store.coords } as any),
);

function callStore() {
  const phone = props.store?.phoneNumber;
  if (!phone || typeof window === "undefined") return;
  window.location.href = `tel:${phone}`;
}

function navigateToStore() {
  if (!props.store || typeof window === "undefined") return;
  const uri = nav.buildNavigationUri({ name: props.store.name, coordinates: props.store.coords } as any);
  if (!uri) {
    toast.add({ title: t("messages.merchantStore.noCoords"), color: "error" });
    return;
  }
  window.open(uri, "_blank");
}
</script>

<template>
  <UModal v-model:open="open" :title="store?.name" :ui="{ overlay: 'z-[80]' }">
    <template #body>
      <div v-if="store" class="space-y-4">
        <div class="flex flex-wrap items-center gap-2 text-[11px]">
          <span v-if="store.partner" class="tag">{{ t("messages.merchantStore.merchant") }} · {{ store.partner }}</span>
          <span v-if="stateLabel" class="tag" :class="store.isOpenNow ? 'on' : 'off'">{{ stateLabel }}</span>
          <span v-if="distance" class="text-(--ui-text-muted)">{{ distance }}</span>
        </div>

        <div class="flex flex-col gap-2 text-[13px] leading-relaxed">
          <div class="row">
            <UIcon name="i-lucide-map-pin" class="mt-0.5 size-4 flex-none text-(--ui-text-muted)" />
            <span class="min-w-0">{{ store.address }}</span>
          </div>
          <div v-if="store.businessHours" class="row">
            <UIcon name="i-lucide-clock" class="mt-0.5 size-4 flex-none text-(--ui-text-muted)" />
            <span class="min-w-0">{{ t("messages.merchantStore.hours") }} {{ store.businessHours }}</span>
          </div>
          <div v-if="store.phoneNumber" class="row">
            <UIcon name="i-lucide-phone" class="mt-0.5 size-4 flex-none text-(--ui-text-muted)" />
            <span class="min-w-0">{{ store.phoneNumber }}</span>
          </div>
        </div>

        <div v-if="store.remark" class="rounded-lg bg-(--ui-bg-elevated) px-3 py-2 text-[11px] leading-relaxed">
          <p class="font-semibold">{{ t("messages.merchantStore.notice") }}</p>
          <p class="mt-1 whitespace-pre-line text-(--ui-text-muted)">{{ store.remark }}</p>
        </div>

        <div v-if="store.photos.length">
          <p class="mb-1.5 text-[11px] text-(--ui-text-muted)">{{ t("messages.merchantStore.photos") }}</p>
          <div class="grid grid-cols-2 gap-2">
            <img
              v-for="(photo, i) in store.photos"
              :key="i"
              :src="photo"
              alt=""
              loading="lazy"
              class="h-28 w-full rounded-lg object-cover"
            >
          </div>
        </div>

        <p class="rounded-lg border border-dashed border-(--ui-border) px-3 py-2 text-[11px] leading-relaxed text-(--ui-text-muted)">
          {{ t("messages.merchantStore.redeemHint") }}
        </p>

        <div class="flex gap-2">
          <UButton
            v-if="store.phoneNumber"
            class="flex-1"
            variant="soft"
            icon="i-lucide-phone"
            :label="t('messages.merchantStore.call')"
            @click="callStore"
          />
          <UButton
            class="flex-1"
            icon="i-lucide-navigation"
            :label="t('messages.merchantStore.navigate')"
            :disabled="!canNavigate"
            @click="navigateToStore"
          />
        </div>
      </div>
    </template>
  </UModal>
</template>

<style scoped>
.row {
  display: flex;
  align-items: flex-start;
  gap: 8px;
}
.tag {
  border: 1px solid var(--ui-border);
  border-radius: 999px;
  padding: 0 7px;
  line-height: 1.6;
}
.tag.on {
  color: #0f766e;
  border-color: #14b8a6;
}
.tag.off {
  color: var(--ui-text-dimmed);
}
</style>
