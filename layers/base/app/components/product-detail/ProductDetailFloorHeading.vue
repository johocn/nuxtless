<script setup lang="ts">
defineProps<{
  /** 楼层编号（如 "01"），为空时不显示 */
  no?: string;
  /** 楼层标题文案 */
  label: string;
}>();
</script>

<template>
  <div class="mb-4 flex items-end gap-3">
    <span v-if="no" class="flex h-9 items-center justify-center rounded-md bg-primary/10 px-2.5 font-mono text-xl font-extrabold leading-none text-primary">
      {{ no }}
    </span>
    <div class="flex items-center gap-2 pb-0.5">
      <span class="h-4 w-1 rounded-full bg-primary"></span>
      <h2 class="text-lg font-bold text-gray-900">{{ label }}</h2>
    </div>
  </div>
</template>