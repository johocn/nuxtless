<script setup lang="ts">
// 配送方式切换条：variant=segmented（分段控件）/ tabs（文本页签）。
// 文案走 i18n（messages.home.selfPickup / messages.home.mail，方案1 已加），
// 组件注册名 DeliveryFilterBar（Nuxt 自动按目录前缀注册，模板必须用全名）。
import type { DeliveryMethod } from "../../../utils/productVisibility";

const props = defineProps<{
  variant: "segmented" | "tabs";
  modelValue: DeliveryMethod;
}>();
const emit = defineEmits<{ "update:modelValue": [value: DeliveryMethod] }>();
const { t } = useI18n();

const options: { value: DeliveryMethod; label: string }[] = [
  { value: "MAIL", label: t("messages.home.mail") },
  { value: "SELF_PICKUP", label: t("messages.home.selfPickup") },
];

function pick(v: DeliveryMethod) {
  if (v !== props.modelValue) emit("update:modelValue", v);
}
</script>

<template>
  <div
    class="flex items-center gap-1"
    :class="variant === 'tabs' ? 'border-b border-gray-100' : 'rounded-full bg-gray-100 p-1 w-fit'"
  >
    <button
      v-for="opt in options"
      :key="opt.value"
      type="button"
      @click="pick(opt.value)"
      class="px-3 py-1 text-xs transition"
      :class="
        modelValue === opt.value
          ? variant === 'tabs'
            ? 'border-b-2 border-primary font-semibold text-primary -mb-px'
            : 'rounded-full bg-primary text-white font-medium shadow-sm'
          : 'text-gray-500'
      "
    >
      {{ opt.label }}
    </button>
  </div>
</template>
