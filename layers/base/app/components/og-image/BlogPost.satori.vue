<script setup lang="ts">
/**
 * satori OG 模板：纯 wasm 渲染，无 native 二进制，
 * 规避 win32 构建产物在 Linux 服务器加载失败的问题（部署铁律：服务器不安装）。
 */

withDefaults(
  defineProps<{
    colorMode?: "dark" | "light";
    title?: string;
    author?: string;
    date?: string;
    category?: string;
    avatar?: string;
    backgroundImage?: string;
  }>(),
  {
    colorMode: "dark",
    // title: "Blog Post Title",
    // author: "Author Name",
    // date: "Jan 1, 2025",
    // category: "Technology",
  },
);

// satori 要求图片 src 为绝对 URL / 以 / 开头的相对路径；补齐前导 /，避免被当作外部地址拦截
function normSrc(src?: string) {
  if (!src) return src;
  if (/^(?:https?:|\/|data:)/i.test(src)) return src;
  return `/${src}`;
}
</script>

<template>
  <div
    class="flex h-full w-full flex-col justify-between bg-neutral-50 p-15 text-neutral-900 dark:bg-neutral-900 dark:text-white"
  >
    <img
      :src="normSrc(backgroundImage)"
      class="absolute inset-0 w-full object-cover opacity-[0.7]"
    />

    <div class="flex items-start">
      <div
        class="rounded-full bg-gray-50 px-6 py-2 text-4xl font-semibold dark:bg-gray-950"
      >
        {{ category }}
      </div>
    </div>

    <div class="flex flex-col gap-6">
      <h1 class="m-0 text-[80px] font-extrabold" style="line-height: 1.1">
        {{ title }}
      </h1>
    </div>

    <div class="flex items-center gap-6">
      <div
        v-if="avatar"
        class="overflow-hidden border-4 border-neutral-200 dark:border-neutral-800"
        style="width: 80px; height: 80px; border-radius: 50%"
      >
        <img
          :src="normSrc(avatar)"
          alt="Avatar"
          class="h-full w-full"
          style="object-fit: cover; border-radius: 50%"
        />
      </div>
      <div class="flex flex-col">
        <span class="text-[32px] font-semibold">{{ author }}</span>
        <span class="text-[24px] text-neutral-400">{{ date }}</span>
      </div>
    </div>
  </div>
</template>