<script setup lang="ts">
// 积分商品楼层：数据自共享 shop-api pointsProducts（usePointsGoods），挂载后拉取、
// 非首屏阻塞；失败/为空整层隐藏，不阻断首页其它区块（与 CouponFloorBlock 容错一致）。
// 兑换闭环在积分商城端完成：点击仅提示引导（与 vshop 积分商城同源实体）。
import { localizeText } from "../../../utils/detail-config";
import { getPointsProducts, type PointsProduct } from "../../../composables/usePointsGoods";
import type { PointsGoodsSection } from "../../../utils/shop-content";

const props = defineProps<{ section: PointsGoodsSection }>();
const { t, locale } = useI18n();
const toast = useToast();

const items = ref<PointsProduct[]>([]);
const loaded = ref(false);

const MAX = computed(() => {
  const l = props.section?.limit;
  if (typeof l === "number" && Number.isInteger(l) && l > 0) return Math.min(l, 20);
  return 6;
});
const title = computed(() => localizeText(props.section?.title, locale.value) || t("messages.home.pointsGoodsFloor"));

onMounted(async () => {
  try {
    const list = await getPointsProducts(MAX.value);
    items.value = list.filter((g) => g.inStock).slice(0, MAX.value);
  } catch {
    items.value = []; // 取数失败整层隐藏
  } finally {
    loaded.value = true;
  }
});

function pointsText(g: PointsProduct): string {
  return t("messages.coupon.pointsPrice", { n: g.pointsPrice });
}

function guide() {
  toast.add({ title: t("messages.home.pointsGuide"), color: "primary" });
}
</script>

<template>
  <section v-if="loaded && items.length" class="mt-2 rounded-lg bg-white p-3">
    <div class="mb-3 flex items-center justify-between">
      <h2 class="text-base font-bold text-gray-800">{{ title }}</h2>
      <button class="text-xs text-primary" @click="guide">{{ t("messages.nav.viewMore") }} ›</button>
    </div>
    <div class="no-scrollbar flex gap-3 overflow-x-auto pb-1">
      <button
        v-for="g in items"
        :key="g.id"
        class="w-[120px] shrink-0 overflow-hidden rounded-lg border border-gray-100 text-left"
        @click="guide"
      >
        <img
          v-if="g.image"
          :src="g.image"
          :alt="g.name"
          class="h-[110px] w-full bg-gray-50 object-cover"
          loading="lazy"
        />
        <div v-else class="h-[110px] w-full bg-gray-50"></div>
        <p class="line-clamp-2 h-10 px-2 pt-1.5 text-xs leading-5 text-gray-800">{{ g.name }}</p>
        <p class="px-2 pb-2 pt-0.5 text-sm font-bold text-primary">{{ pointsText(g) }}</p>
      </button>
    </div>
  </section>
</template>

<style scoped>
.no-scrollbar::-webkit-scrollbar { display: none; }
.no-scrollbar { -ms-overflow-style: none; scrollbar-width: none; }
</style>
