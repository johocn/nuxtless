<script setup lang="ts">
import type { AddressRecord } from "~~/types/address";

const props = defineProps<{
  addresses: AddressRecord[];
  defaultId?: string | null;
}>();
const emit = defineEmits<{
  (e: "select", record: AddressRecord): void;
}>();

const { t } = useI18n();

// Nuxt UI v4 SelectMenu: value-key="id" 使 model 值为地址 id（字符串），
// 用选中 id 反查完整记录后上抛，保持对外事件负载为 AddressRecord。
const selectedId = ref<string>();

watch(
  () => props.defaultId,
  (id) => {
    if (id && !selectedId.value) selectedId.value = id;
  },
  { immediate: true },
);

// 下拉选项用“姓名 · 街道”组合标签，避免同名地址在列表里无法区分
const options = computed(() =>
  props.addresses.map((a) => ({
    ...a,
    label: [a.fullName, a.streetLine1].filter(Boolean).join(" · "),
  })),
);

const selectedRecord = computed(
  () => props.addresses.find((a) => a.id === selectedId.value) ?? null,
);

function onSelect(id?: string) {
  const record = props.addresses.find((a) => a.id === id);
  if (record) emit("select", record);
}
</script>

<template>
  <USelectMenu
    v-model="selectedId"
    :items="options"
    :value-key="'id'"
    :label-key="'label'"
    :placeholder="t('messages.account.selectAddress')"
    class="w-full"
    @update:model-value="onSelect"
  >
    <template #default>
      <span class="flex items-center gap-1 line-clamp-1">
        <template v-if="selectedRecord">
          <span>{{ selectedRecord.fullName }} · {{ selectedRecord.streetLine1 }}</span>
          <UBadge v-if="props.defaultId === selectedRecord.id" color="primary" size="sm">
            {{ t("messages.account.defaultAddress") }}
          </UBadge>
        </template>
      </span>
    </template>
  </USelectMenu>
</template>