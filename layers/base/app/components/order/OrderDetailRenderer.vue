<script setup lang="ts">
import OrderDetailClassic from "./OrderDetailClassic.vue";
import OrderDetailJd from "./OrderDetailJd.vue";
import OrderDetailCn from "./OrderDetailCn.vue";
import OrderDetailMall from "./OrderDetailMall.vue";
import { useOrderDetailConfig } from "../../composables/useOrderDetailConfig";
const props = defineProps<{ order: any; refresh: () => void }>();
const emit = defineEmits<{ (e: "apply", line: any): void }>();
const { layout, config } = useOrderDetailConfig();
const map = {
  jd: OrderDetailJd,
  classic: OrderDetailClassic,
  confirmation: OrderDetailJd, // 映射保持现状
  cn: OrderDetailCn,
  mall: OrderDetailMall,
} as const;
</script>

<template>
  <component
    :is="map[layout] ?? OrderDetailJd"
    :order="order"
    :refresh="refresh"
    :config="config"
    @apply="emit('apply', $event)"
  >
    <template #line-actions="scope">
      <slot name="line-actions" v-bind="scope" />
    </template>
  </component>
</template>