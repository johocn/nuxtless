<script setup lang="ts">
const {
  logoLight = "/logo-full.svg",
  logoDark = "/logo-full.svg",
  wrapperClass = "w-full",
  alt = "Site Logo",
} = defineProps<{
  logoLight?: string;
  logoDark?: string;
  wrapperClass?: string;
  alt?: string;
}>();
</script>

<template>
  <div :class="wrapperClass" class="flex">
    <UColorModeImage
      :light="logoLight"
      :dark="logoDark"
      :alt="alt"
    />
  </div>
</template>

<style lang="css" scoped></style>
