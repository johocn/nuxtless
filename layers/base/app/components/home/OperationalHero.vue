<script setup lang="ts">
import type { HeroBlockData } from "../../utils/home-content";
import { assetSrc } from "../../utils/image";

defineProps<{ block: HeroBlockData }>();
</script>

<template>
  <section class="mb-8 w-full" aria-label="运营横幅">
    <NuxtImg
      class="h-105 w-full object-cover lg:h-140"
      :src="assetSrc(block.imageUrl, 1600)"
      :alt="block.title ?? '运营横幅'"
      loading="eager"
      fetchpriority="high"
      placeholder
      placeholder-class="blur-sm"
    />
  </section>
</template>