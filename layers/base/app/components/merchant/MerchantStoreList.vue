<script setup lang="ts">
import {
  formatStoreDistance,
  type MerchantStoreView,
} from "~~/layers/base/app/composables/useMerchantStores";

/** 适用门店列表（券详情页/券码页共用）：首屏只列前 N 家，点击门店卡打开商户详情。 */
const props = withDefaults(
  defineProps<{
    stores: MerchantStoreView[];
    loading?: boolean;
    /** 券模板门店覆盖范围：ALL / MERCHANT / STORE */
    coverage?: string | null;
    limit?: number;
    /** 隐藏标题（父级已有小节标题时） */
    hideTitle?: boolean;
  }>(),
  { loading: false, coverage: "ALL", limit: 3, hideTitle: false },
);

const { t } = useI18n();
const expanded = ref(false);
const sheetOpen = ref(false);
const active = ref<MerchantStoreView | null>(null);

const visible = computed(() => (expanded.value ? props.stores : props.stores.slice(0, props.limit)));
const coverageLabel = computed(() => {
  const c = String(props.coverage ?? "ALL").toUpperCase();
  return c === "STORE" || c === "MERCHANT"
    ? t("messages.merchantStore.coverageLimited")
    : t("messages.merchantStore.coverageAll");
});

function openSheet(store: MerchantStoreView) {
  active.value = store;
  sheetOpen.value = true;
}
</script>

<template>
  <section>
    <div v-if="!hideTitle" class="mb-2 flex items-center justify-between gap-2">
      <span class="flex items-center gap-1.5 text-[13px] font-semibold">
        <UIcon name="i-lucide-store" class="size-4 text-(--ui-primary)" />
        {{ t("messages.merchantStore.title") }}
      </span>
      <span class="text-[11px] text-(--ui-text-muted)">
        {{ coverageLabel }}
        <template v-if="stores.length"> · {{ t("messages.merchantStore.count", { n: stores.length }) }}</template>
      </span>
    </div>

    <div v-if="loading" class="flex flex-col gap-2">
      <div v-for="i in 2" :key="i" class="h-16 animate-pulse rounded-xl bg-(--ui-bg-elevated)" />
    </div>

    <p
      v-else-if="!stores.length"
      class="rounded-xl border border-dashed border-(--ui-border) px-3 py-4 text-center text-[11px] text-(--ui-text-muted)"
    >
      {{ t("messages.merchantStore.empty") }}
    </p>

    <div v-else class="flex flex-col gap-2">
      <MerchantStoreCard
        v-for="store in visible"
        :key="store.id"
        :store="store"
        :distance="formatStoreDistance(store.distanceKm)"
        @open="openSheet(store)"
      />
      <button
        v-if="stores.length > limit"
        type="button"
        class="self-center px-2 py-1 text-[11px] text-(--ui-primary)"
        @click="expanded = !expanded"
      >
        {{ expanded ? t("messages.merchantStore.collapse") : t("messages.merchantStore.expand", { n: stores.length }) }}
      </button>
    </div>

    <MerchantStoreSheet
      v-model:open="sheetOpen"
      :store="active"
      :distance="active ? formatStoreDistance(active.distanceKm) : ''"
    />
  </section>
</template>
