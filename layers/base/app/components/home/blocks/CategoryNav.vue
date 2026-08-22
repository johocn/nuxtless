<script setup lang="ts">
const props = defineProps<{
  block: { id: string; data: { items?: Array<{ name: string; slug: string }> } };
}>();

const localePath = useLocalePath();
</script>
<template>
  <nav class="mx-auto max-w-5xl px-4 py-6" aria-label="分类导航">
    <div class="flex flex-wrap justify-center gap-3">
      <NuxtLink
        v-for="it in block.data?.items ?? []"
        :key="it.name + it.slug"
        :to="localePath(it.slug ? `/category/${it.slug}` : '/')"
        class="rounded-full border border-gray-200 px-4 py-2 text-sm text-gray-700 transition hover:border-primary hover:text-primary"
      >
        {{ it.name }}
      </NuxtLink>
    </div>
  </nav>
</template>