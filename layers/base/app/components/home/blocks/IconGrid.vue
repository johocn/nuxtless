<script setup lang="ts">
defineProps<{ block: { id: string; data: { items?: Array<{ icon?: string; label: string; link: string }> } } }>();
</script>
<template>
  <nav class="mx-auto grid max-w-5xl grid-cols-4 gap-3 px-4 py-6 sm:grid-cols-6 lg:grid-cols-8">
    <NuxtLink
      v-for="it in block.data?.items ?? []"
      :key="it.label + it.link"
      :to="it.link ?? '/'"
      class="flex flex-col items-center gap-1 text-sm text-gray-700 hover:text-primary"
    >
      <UIcon v-if="it.icon" :name="it.icon" class="h-8 w-8" />
      <span>{{ it.label }}</span>
    </NuxtLink>
  </nav>
</template>