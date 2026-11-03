<script setup lang="ts">
/**
 * 优惠活动照片图位：有图走 img（懒加载），无图或加载失败走券名首字兜底，永不出现空白图位。
 * - ratio：square 列表左图 / wide 16:9 / banner 2:1
 * - rounded：卡片自身已裁剪时传 false
 */
const props = withDefaults(
  defineProps<{
    name?: string | null;
    src?: string | null;
    ratio?: "square" | "wide" | "banner";
    rounded?: boolean;
  }>(),
  { name: "", src: null, ratio: "square", rounded: true },
);

const failed = ref(false);
watch(
  () => props.src,
  () => {
    failed.value = false;
  },
);

const showImg = computed(() => !!props.src && !failed.value);
const initial = computed(() => (props.name || "券").trim().slice(0, 1));
const ratioClass = computed(() =>
  props.ratio === "wide"
    ? "aspect-video"
    : props.ratio === "banner"
      ? "aspect-[2/1]"
      : "aspect-square",
);
</script>

<template>
  <div
    class="overflow-hidden bg-(--ui-bg-muted)"
    :class="[ratioClass, rounded ? 'rounded-lg' : 'rounded-none']"
  >
    <img
      v-if="showImg"
      :src="props.src!"
      :alt="props.name || ''"
      loading="lazy"
      decoding="async"
      class="h-full w-full object-cover"
      @error="failed = true"
    >
    <div
      v-else
      class="flex h-full w-full items-center justify-center text-base font-semibold text-(--ui-text-muted)"
      aria-hidden="true"
    >
      {{ initial }}
    </div>
  </div>
</template>
