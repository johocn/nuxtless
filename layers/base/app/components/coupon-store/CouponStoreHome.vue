<script setup lang="ts">
import {
  getCouponSaleCatalogue,
  getPointsMallTemplates,
} from "~~/layers/base/app/composables/useCoupon";
import { couponYuan } from "../../utils/coupon";

/**
 * 券店首页（Channel.customFields.storefrontMode=coupon）：
 * 店招 + 楼层（floors 导购 / grid 宫格，由 storefrontHomeLayout 配置）。
 * 只取 scene=IN_STORE 的买单券；楼层卡片/购买/支付/详情全部复用券商城实现。
 */
const props = defineProps<{ layout?: "floors" | "grid" }>();
const layout = computed(() => props.layout ?? "floors");

const { t } = useI18n();
const { customFields } = useChannelTheme();
const localePath = useTenantLocalePath();
const { isAuthenticated } = storeToRefs(useAuthStore());
const {
  sheetTarget, sheetBundle, openDetail, closeDetail, buyFromSheet,
  buyingId, paying, paySheetOpen, payMode, buyName, buyAmount,
  startBuy, confirmPay, closePaySheet, exchangingId, exchange,
} = useCouponSaleFlow();

const loadError = ref(false);
const templates = ref<any[]>([]);
const bundles = ref<any[]>([]);
const pointsTemplates = ref<any[]>([]);
const loading = ref(true);

const activeFloor = ref("sale");
const floors = computed(() => [
  { key: "sale", label: t("messages.couponMall.floorSale"), show: templates.value.length > 0 },
  { key: "bundle", label: t("messages.couponMall.floorBundle"), show: bundles.value.length > 0 },
  { key: "points", label: t("messages.couponMall.floorPoints"), show: layout.value === "floors" && pointsTemplates.value.length > 0 },
].filter((f) => f.show));

async function load() {
  loading.value = true;
  loadError.value = false;
  try {
    const [sale, points] = await Promise.all([
      getCouponSaleCatalogue("IN_STORE"),
      layout.value === "floors" ? getPointsMallTemplates() : Promise.resolve([]),
    ]);
    templates.value = sale?.templates ?? [];
    bundles.value = sale?.bundles ?? [];
    pointsTemplates.value = points ?? [];
  } catch {
    loadError.value = true;
  } finally {
    loading.value = false;
  }
}
onMounted(load);

function goTo(key: string) {
  activeFloor.value = key;
  document.getElementById(`floor-${key}`)?.scrollIntoView({ behavior: "smooth", block: "start" });
}

const shopName = computed(() => customFields.value?.shopName || "");
const slogan = computed(() => t("messages.couponStore.heroSlogan"));
/** sale 楼层最低售价（元，展示用）；无数据为 null 不显示 */
const asLowPrice = computed<number | null>(() => {
  const prices = templates.value
    .map((tpl) => Number(tpl?.salePrice ?? 0))
    .filter((p) => p > 0);
  return prices.length ? Math.min(...prices) : null;
});
</script>

<template>
  <main class="mx-auto w-full max-w-3xl px-3 pb-24">
    <!-- 店招 hero -->
    <header class="hero">
      <div class="min-w-0">
        <div class="hero-name">{{ shopName }}</div>
        <div class="hero-slogan">{{ slogan }}</div>
        <div class="hero-trust">{{ t("messages.couponStore.trustLine") }}</div>
      </div>
      <div class="hero-side">
        <span v-if="asLowPrice !== null" class="low-pill">
          {{ t("messages.couponStore.asLowAs", { price: couponYuan(asLowPrice) }) }}
        </span>
        <NuxtLink v-if="isAuthenticated" :to="localePath('/coupon')" class="pts-pill">
          {{ t("messages.couponMall.pointsBalance") }}
        </NuxtLink>
      </div>
    </header>

    <!-- 版式 A：吸顶锚点 -->
    <nav v-if="layout === 'floors' && floors.length" class="sticky top-0 z-10 -mx-3 mb-3 flex gap-2 bg-(--ui-bg)/90 px-3 py-2 backdrop-blur">
      <UButton v-for="f in floors" :key="f.key" size="xs" :variant="activeFloor === f.key ? 'solid' : 'soft'" @click="goTo(f.key)">
        {{ f.label }}
      </UButton>
    </nav>

    <UAlert v-if="loadError" color="error" variant="soft" :title="t('messages.couponMall.loadFailed')">
      <UButton size="xs" variant="link" @click="load">{{ t("messages.couponMall.retry") }}</UButton>
    </UAlert>
    <UCard v-else-if="!loading && !templates.length && !bundles.length && !pointsTemplates.length" class="text-center text-(--ui-text-muted)">
      {{ t("messages.couponStore.empty") }}
    </UCard>

    <BaseLoader v-if="loading" width="sm:w-xs md:w-sm" />

    <!-- 版式 A：楼层 -->
    <template v-if="layout === 'floors'">
      <section v-if="templates.length" id="floor-sale" class="mb-6">
        <h2 class="mb-2 text-sm font-semibold">{{ t("messages.couponMall.floorSale") }}</h2>
        <div class="flex flex-col gap-2">
          <CouponStoreCouponCard
            v-for="tpl in templates" :key="tpl.id"
            :tpl="tpl" :buying="buyingId === tpl.id"
            @buy="openDetail(tpl)"
          />
        </div>
      </section>
      <section v-if="bundles.length" id="floor-bundle" class="mb-6">
        <h2 class="mb-2 text-sm font-semibold">{{ t("messages.couponMall.floorBundle") }}</h2>
        <div class="flex flex-col gap-2">
          <CouponMallBundleCard
            v-for="b in bundles" :key="b.id"
            :bundle="b" :templates="templates" :buying="buyingId === b.id"
            @buy="startBuy(b, 'bundle')"
            @detail="openDetail(b, b)"
          />
        </div>
      </section>
      <section v-if="pointsTemplates.length" id="floor-points" class="mb-6">
        <h2 class="mb-2 text-sm font-semibold">{{ t("messages.couponMall.floorPoints") }}</h2>
        <div class="flex flex-col gap-2">
          <CouponMallPointsCard
            v-for="pt in pointsTemplates" :key="pt.id"
            :tpl="pt" :exchanging="exchangingId === pt.id"
            @exchange="exchange(pt)"
          />
        </div>
      </section>
    </template>

    <!-- 版式 B：券卡宫格（单券 2 列宫格 + 券包横幅 + 积分行） -->
    <template v-else>
      <section v-if="templates.length" class="mb-4">
        <div class="grid grid-cols-2 gap-2">
          <CouponStoreCouponGridCard
            v-for="tpl in templates" :key="tpl.id"
            :tpl="tpl" :buying="buyingId === tpl.id"
            @buy="openDetail(tpl)"
          />
        </div>
      </section>
      <section v-if="bundles.length" class="mb-4">
        <div class="flex flex-col gap-2">
          <CouponMallBundleCard
            v-for="b in bundles" :key="b.id"
            :bundle="b" :templates="templates" :buying="buyingId === b.id"
            @buy="startBuy(b, 'bundle')"
            @detail="openDetail(b, b)"
          />
        </div>
      </section>
      <section v-if="pointsTemplates.length" class="mb-4">
        <div class="flex flex-col gap-2">
          <CouponMallPointsCard
            v-for="pt in pointsTemplates" :key="pt.id"
            :tpl="pt" :exchanging="exchangingId === pt.id"
            @exchange="exchange(pt)"
          />
        </div>
      </section>
    </template>

    <CouponMallDetailSheet
      :open="!!sheetTarget"
      :tpl="sheetTarget"
      :bundle="sheetBundle"
      :templates="templates"
      @close="closeDetail"
      @buy="buyFromSheet"
    />

    <CouponPaySheet
      v-if="paySheetOpen"
      v-model="payMode"
      :name="buyName"
      :amount="buyAmount"
      :paying="paying"
      @confirm="confirmPay"
      @close="closePaySheet"
    />
  </main>
</template>

<style scoped>
.hero { display: flex; align-items: center; justify-content: space-between; gap: 8px; margin-bottom: 12px; border-radius: 12px; background: var(--ui-primary); color: #fff; padding: 16px; }
.hero-name { font-size: 17px; font-weight: 700; }
.hero-slogan { margin-top: 2px; font-size: 12px; opacity: .85; }
.hero-trust { margin-top: 4px; font-size: 11px; opacity: .75; }
.hero-side { display: flex; flex-direction: column; align-items: flex-end; gap: 6px; flex: none; }
.low-pill { border-radius: 999px; background: rgb(255 255 255 / .92); color: var(--ui-primary); padding: 4px 10px; font-size: 12px; font-weight: 600; white-space: nowrap; }
.pts-pill { border-radius: 999px; background: rgba(255, 255, 255, .18); padding: 4px 10px; font-size: 12px; color: #fff; white-space: nowrap; }
</style>
