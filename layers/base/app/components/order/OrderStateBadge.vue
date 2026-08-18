<script setup lang="ts">
import { stateBadge } from "../../utils/order-state";

const props = defineProps<{ state: string }>();
const { t } = useI18n();
const badge = computed(() => stateBadge(props.state));
</script>

<template>
  <UBadge :color="badge.color" variant="outline">
    {{ t(badge.labelKey) }}
  </UBadge>
</template>