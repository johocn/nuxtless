<script setup lang="ts">
export interface FacetValueOption {
  id: string;
  name: string;
}
export interface FacetOption {
  id: string;
  name: string;
  values: FacetValueOption[];
}

const props = defineProps<{
  open: boolean;
  facets: FacetOption[];
  initialSelection: Record<string, string[]>;
}>();

const emit = defineEmits<{
  (e: "update:open", v: boolean): void;
  (e: "apply", v: Record<string, string[]>): void;
  (e: "clear"): void;
}>();

const { t } = useI18n();

// 抽屉打开时以 query 导出的选中态初始化
const selected = ref<Record<string, string[]>>({ ...props.initialSelection });
watch(
  () => props.open,
  (val) => {
    if (val) selected.value = { ...props.initialSelection };
  },
);

function isSelected(facetId: string, valueId: string): boolean {
  return (selected.value[facetId] ?? []).includes(valueId);
}

function toggle(facetId: string, valueId: string) {
  const current = selected.value[facetId] ?? [];
  selected.value = {
    ...selected.value,
    [facetId]: current.includes(valueId)
      ? current.filter((v) => v !== valueId)
      : [...current, valueId],
  };
}

function applyFilters() {
  emit("apply", { ...selected.value });
  emit("update:open", false);
}

function clearFilters() {
  emit("clear");
  emit("update:open", false);
}
</script>

<template>
  <USlideover
    :open="open"
    :title="t('messages.shop.filters')"
    side="right"
    @update:open="emit('update:open', $event)"
  >
    <template #body>
      <div v-for="facet in facets" :key="facet.id" class="mb-5">
        <h3 class="mb-2 font-semibold">{{ facet.name }}</h3>
        <div class="flex flex-wrap gap-2">
          <button
            v-for="val in facet.values"
            :key="val.id"
            type="button"
            class="rounded-full px-3 py-1 text-sm"
            :class="
              isSelected(facet.id, val.id)
                ? 'bg-brand-600 text-white'
                : 'bg-neutral-100 text-neutral-700'
            "
            @click="toggle(facet.id, val.id)"
          >
            {{ val.name }}
          </button>
        </div>
      </div>
      <div v-if="!facets.length" class="py-6 text-sm text-neutral-500">
        {{ t("messages.shop.noFilters") }}
      </div>
    </template>

    <template #footer>
      <div class="flex gap-2">
        <UButton
          color="neutral"
          variant="outline"
          :disabled="!Object.values(selected).some((v) => v.length)"
          @click="clearFilters"
        >
          {{ t("messages.shop.clearFilters") }}
        </UButton>
        <UButton color="primary" @click="applyFilters">
          {{ t("messages.shop.applyFilters") }}
        </UButton>
      </div>
    </template>
  </USlideover>
</template>