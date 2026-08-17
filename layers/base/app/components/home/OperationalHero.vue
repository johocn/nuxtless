<script setup lang="ts">
import type { HeroBlockData } from "../../utils/home-content";

defineProps<{ block: HeroBlockData }>();
</script>

<template>
  <section class="mb-8 w-full" aria-label="运营横幅">
    <NuxtImg
      format="webp"
      class="h-105 w-full object-cover lg:h-140"
      :src="block.imageUrl"
      :alt="block.title ?? '运营横幅'"
      loading="eager"
      sizes="sm:100vw md:1600px"
      fetchpriority="high"
      placeholder
      placeholder-class="blur-sm"
    />
  </section>
</template>