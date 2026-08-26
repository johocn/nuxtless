<script setup lang="ts">
// JD 风格轮播 Banner：自动播放 + 左右箭头 + 圆点指示器 + 悬停暂停
// 数据来源：首页运营内容里的 Banner 块（useHomeContent），无 Banner 时回退到占位图
const { slides } = defineProps<{
  slides: Array<{ imageUrl?: string; link?: string; title?: string; subTitle?: string }>;
}>();

const localePath = useLocalePath();

// 缺省占位 Banner（无运营 Banner 时兜底展示）
const DEFAULT_SLIDES = [
  { imageUrl: "https://picsum.photos/seed/jd-home-1/750/300", title: "京东 618 年中大促" },
  { imageUrl: "https://picsum.photos/seed/jd-home-2/750/300", title: "家电焕新节" },
  { imageUrl: "https://picsum.photos/seed/jd-home-3/750/300", title: "新品首发" },
];

// 合并：优先真实 Banner，缺失用占位；仍全空则全部占位
const list = computed(() => {
  const real = slides.filter((s) => s?.imageUrl);
  return real.length ? real : DEFAULT_SLIDES;
});

const cur = ref(0);
let timer: ReturnType<typeof setInterval> | undefined;

function go(i: number) {
  cur.value = (i + list.value.length) % list.value.length;
}
function next() {
  go(cur.value + 1);
}
function play() {
  if (timer) clearInterval(timer);
  timer = setInterval(next, 3500);
}
function stop() {
  if (timer) clearInterval(timer);
  timer = undefined;
}

onMounted(play);
onBeforeUnmount(stop);

function to(s: { link?: string }) {
  return s.link ? localePath(s.link) : "";
}
</script>

<template>
  <section
    class="relative select-none overflow-hidden"
    @mouseenter="stop"
    @mouseleave="play"
  >
    <div
      class="flex transition-transform duration-500 ease-out"
      :style="{ transform: `translateX(-${cur * 100}%)` }"
    >
      <template v-for="(s, i) in list" :key="i">
        <NuxtLink
          v-if="to(s)"
          :to="to(s)"
          class="relative block w-full shrink-0"
        >
          <NuxtImg :src="s.imageUrl" format="webp" class="h-44 w-full object-cover md:h-64 xl:h-[21rem]" />
          <span
            v-if="s.title"
            class="absolute bottom-2 left-3 rounded bg-black/30 px-2 py-0.5 text-xs text-white"
          >{{ s.title }}</span>
        </NuxtLink>
        <div v-else class="relative w-full shrink-0">
          <NuxtImg :src="s.imageUrl" format="webp" class="h-44 w-full object-cover md:h-64 xl:h-[21rem]" />
          <span
            v-if="s.title"
            class="absolute bottom-2 left-3 rounded bg-black/30 px-2 py-0.5 text-xs text-white"
          >{{ s.title }}</span>
        </div>
      </template>
    </div>

    <!-- 左右箭头 -->
    <button
      type="button"
      aria-label="上一张"
      class="absolute left-1 top-1/2 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-full bg-black/30 text-lg leading-none text-white"
      @click.stop="play(); go(cur - 1)"
    >‹</button>
    <button
      type="button"
      aria-label="下一张"
      class="absolute right-1 top-1/2 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-full bg-black/30 text-lg leading-none text-white"
      @click.stop="play(); go(cur + 1)"
    >›</button>

    <!-- 圆点指示器 -->
    <div class="absolute bottom-1.5 left-0 right-0 flex justify-center gap-1.5">
      <span
        v-for="(_, i) in list"
        :key="i"
        class="h-1.5 w-1.5 rounded-full transition"
        :class="i === cur ? 'bg-primary' : 'bg-white/60'"
        @click="go(i)"
      />
    </div>
  </section>
</template>