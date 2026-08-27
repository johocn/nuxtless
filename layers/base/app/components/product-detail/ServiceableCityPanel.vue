<script setup lang="ts">
// 可购买城市折叠面板：不可服务城市时警示 + 展开可购买城市列表
import { useCityService } from "../../composables/useCityService";

const props = defineProps<{
  product?: {
    customFields?: {
      belongCity?: string | null;
      serviceCities?: Array<string | null> | null;
    } | null;
  } | null;
}>();

const { getServiceInfo } = useCityService();
const info = computed(() => getServiceInfo(props.product));
const open = ref(false);
const { t } = useI18n();

const cities = computed(() => {
  const list = [...(info.value.serviceCities ?? [])];
  if (info.value.belongCity && !list.includes(info.value.belongCity)) {
    list.unshift(info.value.belongCity);
  }
  return list;
});
</script>

<template>
  <div v-if="!info.serviceable" class="mt-3">
    <p class="text-sm text-amber-600">
      {{ t("messages.detail.notServiceable") }}
    </p>
    <UButton
      color="neutral" variant="ghost" size="xs" icon="i-lucide-map"
      class="mt-1" @click="open = !open"
    >
      {{ t("messages.detail.viewServiceCities") }}
    </UButton>
    <Transition name="fade">
      <div v-if="open" class="mt-2 rounded-md border border-neutral-200 bg-neutral-50 p-3 text-sm dark:border-neutral-800 dark:bg-neutral-900">
        <p class="mb-1 font-medium">{{ t("messages.detail.serviceCitiesTitle") }}</p>
        <p v-if="cities.length" class="line-clamp-3 text-neutral-600 dark:text-neutral-400">
          {{ cities.join("、") }}
        </p>
        <p v-else class="text-neutral-500">{{ t("messages.detail.nationwide") }}</p>
      </div>
    </Transition>
  </div>
</template>