<script setup lang="ts">
import { afterSalesStateInfo } from "../../utils/after-sales-state";

const props = defineProps<{ state: string }>();
const { t } = useI18n();
const info = computed(() => afterSalesStateInfo(props.state));
</script>

<template>
  <UBadge :color="info.color" variant="outline" :label="t(info.labelKey)" />
</template>