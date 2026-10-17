<script setup lang="ts">
// 限时秒杀楼层：数据自共享 shop-api activeFlashSaleActivities（useFlashSale），挂载后拉取、
// 非首屏阻塞；失败/为空整层隐藏（与 CouponFloorBlock/PointsGoodsFloorBlock 容错一致）。
// 版式 row 横滑 / grid2 双列随后台 layout 切换（与 vshop/后台 schema 对齐）；
// 头部倒计时取全场最早 endAt，每秒 tick，到点自动重取；点击卡片进商品详情。
import { localizeText } from "../../../utils/detail-config";
import { formatCents } from "../../../utils/format-money";
import { soldPercent } from "../../../utils/flash-sale";
import { getFlashSaleItems, type FlashProductInfo } from "../../../composables/useFlashSale";
import type { FlashItem } from "../../../utils/flash-sale";
import type { FlashSection } from "../../../utils/shop-content";

const props = defineProps<{ section: FlashSection }>();
const { t, locale } = useI18n();
const localePath = useTenantLocalePath();

const items = ref<FlashItem[]>([]);
const products = ref<Record<string, FlashProductInfo>>({});
const loaded = ref(false);
const countdown = ref("");

const MAX = computed(() => {
  const l = props.section?.limit;
  if (typeof l === "number" && Number.isInteger(l) && l > 0) return Math.min(l, 20);
  return 4;
});
const isGrid = computed(() => props.section?.layout === "grid2");
const title = computed(() => localizeText(props.section?.title, locale.value) || t("messages.home.flashFloor"));

let timer: ReturnType<typeof setInterval> | null = null;

function tick() {
  // 取所有项里最早结束的 endAt（与 vshop earliestEndAt 同口径，楼层只挂一个计时器）
  let min: number | null = null;
  for (const it of items.value) {
    const endTime = Date.parse(it.endAt);
    if (!Number.isFinite(endTime)) continue;
    if (min === null || endTime < min) min = endTime;
  }
  if (min === null) {
    countdown.value = "";
    return;
  }
  const remain = min - Date.now();
  if (remain <= 0) {
    countdown.value = "00:00:00";
    stopTimer();
    void load(); // 到点重取；取不到有效项时整层隐藏
    return;
  }
  const totalSec = Math.floor(Math.max(0, remain) / 1000);
  const pad = (n: number) => String(n).padStart(2, "0");
  countdown.value = `${pad(Math.floor(totalSec / 3600))}:${pad(Math.floor((totalSec % 3600) / 60))}:${pad(totalSec % 60)}`;
}

function stopTimer() {
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
}

async function load() {
  try {
    const res = await getFlashSaleItems(MAX.value);
    items.value = res.items;
    products.value = res.products;
    if (items.value.length) {
      stopTimer();
      tick();
      timer = setInterval(tick, 1000);
    }
  } catch {
    items.value = []; // 取数失败整层隐藏
  } finally {
    loaded.value = true;
  }
}

onMounted(() => {
  void load();
});
onUnmounted(stopTimer);

function nameOf(it: FlashItem): string {
  return products.value[it.productId]?.name || it.name || t("messages.home.flashFallbackName");
}
function imageOf(it: FlashItem): string | null {
  return products.value[it.productId]?.image ?? null;
}
function slugOf(it: FlashItem): string {
  return products.value[it.productId]?.slug || "";
}
/** 划线原价：仅当高于秒杀价时展示（避免倒挂） */
function originOf(it: FlashItem): string | null {
  const origin = products.value[it.productId]?.originPrice;
  if (typeof origin !== "number" || origin <= it.flashPrice) return null;
  return formatCents(origin);
}
function progressOf(it: FlashItem): number {
  return soldPercent(it);
}
</script>

<template>
  <section v-if="loaded && items.length" class="mt-2 rounded-lg bg-white p-3">
    <div class="mb-3 flex items-center justify-between">
      <div class="flex items-center gap-2">
        <h2 class="text-base font-bold text-gray-800">{{ title }}</h2>
        <span
          v-if="countdown"
          class="flex items-center gap-1 rounded-full bg-gray-900 px-2 py-0.5"
        >
          <span class="text-[10px] text-white">{{ t("messages.home.flashEndsIn") }}</span>
          <span class="text-[11px] font-bold tabular-nums text-white">{{ countdown }}</span>
        </span>
      </div>
    </div>

    <!-- row：横滑（尾部自然裁切提示可滑） -->
    <div v-if="!isGrid" class="no-scrollbar flex gap-3 overflow-x-auto pb-1">
      <NuxtLink
        v-for="it in items"
        :key="it.activityId"
        :to="localePath(`/product/${slugOf(it)}`)"
        class="w-28 shrink-0 overflow-hidden rounded-lg border border-gray-100 transition active:scale-[0.98]"
        external
      >
        <div class="relative">
          <img
            v-if="imageOf(it)"
            :src="imageOf(it)!"
            :alt="nameOf(it)"
            class="h-28 w-full bg-gray-50 object-cover"
            loading="lazy"
          />
          <div v-else class="h-28 w-full bg-gray-50"></div>
          <span class="absolute left-0 top-1.5 rounded-tr-md bg-primary px-1.5 py-0.5 text-[10px] font-semibold text-white">{{ t("messages.home.flashBadge") }}</span>
        </div>
        <p class="line-clamp-2 h-10 px-2 pt-1.5 text-xs leading-5 text-gray-800">{{ nameOf(it) }}</p>
        <div class="flex items-baseline gap-1.5 px-2 pt-0.5">
          <span class="text-sm font-bold text-primary">{{ formatCents(it.flashPrice) }}</span>
          <span v-if="originOf(it)" class="text-[10px] text-gray-400 line-through">{{ originOf(it) }}</span>
        </div>
        <div class="flex items-center gap-1.5 px-2 pb-2 pt-1">
          <span class="h-1 flex-1 overflow-hidden rounded bg-gray-100">
            <i class="block h-full rounded bg-primary" :style="{ width: `${progressOf(it)}%` }"></i>
          </span>
          <span class="text-[10px] text-gray-400">{{ t("messages.home.flashSold", { n: progressOf(it) }) }}</span>
        </div>
      </NuxtLink>
    </div>

    <!-- grid2：双列平铺 -->
    <div v-else class="grid grid-cols-2 gap-3">
      <NuxtLink
        v-for="it in items"
        :key="it.activityId"
        :to="localePath(`/product/${slugOf(it)}`)"
        class="overflow-hidden rounded-lg border border-gray-100 transition active:scale-[0.98]"
        external
      >
        <div class="relative">
          <img
            v-if="imageOf(it)"
            :src="imageOf(it)!"
            :alt="nameOf(it)"
            class="h-36 w-full bg-gray-50 object-cover"
            loading="lazy"
          />
          <div v-else class="h-36 w-full bg-gray-50"></div>
          <span class="absolute left-0 top-1.5 rounded-tr-md bg-primary px-1.5 py-0.5 text-[10px] font-semibold text-white">{{ t("messages.home.flashBadge") }}</span>
        </div>
        <p class="line-clamp-2 h-10 px-2 pt-1.5 text-xs leading-5 text-gray-800">{{ nameOf(it) }}</p>
        <div class="flex items-baseline gap-1.5 px-2 pt-0.5">
          <span class="text-sm font-bold text-primary">{{ formatCents(it.flashPrice) }}</span>
          <span v-if="originOf(it)" class="text-[10px] text-gray-400 line-through">{{ originOf(it) }}</span>
        </div>
        <div class="flex items-center gap-1.5 px-2 pb-2 pt-1">
          <span class="h-1 flex-1 overflow-hidden rounded bg-gray-100">
            <i class="block h-full rounded bg-primary" :style="{ width: `${progressOf(it)}%` }"></i>
          </span>
          <span class="text-[10px] text-gray-400">{{ t("messages.home.flashSold", { n: progressOf(it) }) }}</span>
        </div>
      </NuxtLink>
    </div>
  </section>
</template>

<style scoped>
.no-scrollbar::-webkit-scrollbar { display: none; }
.no-scrollbar { -ms-overflow-style: none; scrollbar-width: none; }
</style>
