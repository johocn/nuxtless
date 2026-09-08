<script setup lang="ts">
const {
  logoLight = "/logo-full.svg",
  logoDark = "/logo-full.svg",
  wrapperClass = "w-full",
} = defineProps<{
  logoLight?: string;
  logoDark?: string;
  wrapperClass?: string;
}>();

// 租户路由（URL 首段命中租户 code）下品牌以文本站点名呈现（如"二月兰会员"），
// 否则显示默认 logo 图。覆盖全站所有品牌位（头部/页脚/登录注册页等）。
const { current } = useTenantChannel();
const siteName = useSiteName();
const tenantName = computed<string>(() => current.value?.name ?? "");
</script>

<template>
  <div :class="wrapperClass" class="flex">
    <UColorModeImage
      v-if="!tenantName"
      :light="logoLight"
      :dark="logoDark"
      alt="Site Logo"
    />
    <span
      v-else
      class="flex items-center text-lg font-bold tracking-wide text-black dark:text-white"
    >
      {{ siteName }}
    </span>
  </div>
</template>

<style lang="css" scoped></style>