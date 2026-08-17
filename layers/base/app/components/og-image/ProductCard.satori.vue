<script setup lang="ts">
/**
 * satori OG 模板：纯 wasm 渲染，无 native 二进制，
 * 规避 win32 构建产物在 Linux 服务器加载失败的问题（部署铁律：服务器不安装）。
 */

withDefaults(
  defineProps<{
    colorMode?: "dark" | "light";
    productName?: string;
    price?: string;
    description?: string;
    image?: string;
    brand?: string;
  }>(),
  {
    colorMode: "light",
    productName: "Product Name",
    price: "$99",
    // description: "A fantastic product that solves your problems",
    brand: "Brand",
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
    class="flex h-full w-full items-center justify-center bg-neutral-100 p-10 dark:bg-neutral-800"
  >
    <div
      class="flex h-full w-full overflow-hidden bg-white dark:bg-neutral-900"
      style="border-radius: 32px; box-shadow: 0 20px 50px rgba(0, 0, 0, 0.08)"
    >
      <div
        class="flex flex-1 items-center justify-center bg-neutral-50 p-10 dark:bg-neutral-800"
        style="border-top-left-radius: 32px; border-bottom-left-radius: 32px"
      >
        <img
          v-if="image"
          class="absolute inset-0 object-cover"
          :src="normSrc(image)"
        />
      </div>
      <div
        class="flex flex-1 flex-col justify-center"
        style="padding: 50px 60px"
      >
        <div class="flex flex-col gap-2">
          <span
            class="text-[22px] font-bold text-blue-600 uppercase"
            style="letter-spacing: 0.1em"
          >
            {{ brand }}
          </span>
          <span
            class="text-[60px] font-black text-neutral-900 dark:text-neutral-100"
            style="line-height: 1.1; letter-spacing: -0.02em"
          >
            {{ productName }}
          </span>
        </div>

        <span
          class="text-[28px] font-normal text-neutral-500 dark:text-neutral-400"
          style="line-height: 1.5; margin-top: 24px; margin-bottom: 32px"
        >
          {{ description }}
        </span>

        <div class="text-[52px] font-extrabold text-blue-600">
          {{ price }}
        </div>
      </div>
    </div>
  </div>
</template>