<script setup lang="ts">
const props = defineProps<{
  block: { id: string; data: { items?: Array<{ text?: string }> } };
}>();
</script>
<template>
  <div
    v-if="(block.data?.items ?? []).length"
    class="overflow-hidden border-b border-gray-100 bg-neutral-50 py-2"
    aria-label="公告栏"
  >
    <div class="mx-auto max-w-5xl px-4 text-sm text-neutral-600">
      <span class="mr-3 font-medium text-primary">公告</span>
      <span
        v-for="(it, index) in block.data?.items ?? []"
        :key="(it.text ?? '') + String(index)"
        class="mr-6"
      >
        {{ it.text }}
      </span>
    </div>
  </div>
</template>