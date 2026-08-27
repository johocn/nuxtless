<script setup lang="ts">
import DetailClassic from "./DetailClassic.vue";
import DetailFloor from "./DetailFloor.vue";
import DetailDualBuy from "./DetailDualBuy.vue";
import { useDetailConfig } from "../../composables/useDetailConfig";

const { layout, config } = useDetailConfig();

const componentMap: Record<string, any> = {
  classic: DetailClassic,
  floor: DetailFloor,
  dualBuy: DetailDualBuy,
};
</script>

<template>
  <component :is="componentMap[layout] ?? DetailClassic" :config="config" />
</template>