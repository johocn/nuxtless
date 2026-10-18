<script setup lang="ts">
import {
  getCouponSaleCatalogue,
  getPointsMallTemplates,
} from "~~/layers/base/app/composables/useCoupon";

definePageMeta({
  title: "券商城",
});

const { t } = useI18n();
const localePath = useTenantLocalePath();
const { isAuthenticated } = storeToRefs(useAuthStore());
const {
  sheetTarget, sheetBundle, openDetail, closeDetail, buyFromSheet,
  buyingId, paying, paySheetOpen, payMode, buyName, buyAmount,
  startBuy, confirmPay, closePaySheet, exchangingId, exchange,
} = useCouponSaleFlow();

const loadError = ref(false);
const needLogin = ref(false);
const templates = ref<any[]>([]);
const bundles = ref<any[]>([]);
const pointsTemplates = ref<any[]>([]);
const loading = ref(true);

const activeFloor = ref("sale");
const floors = computed(() => [
  { key: "sale", label: t("messages.couponMall.floorSale"), show: templates.value.length > 0 },
  { key: "bundle", label: t("messages.couponMall.floorBundle"), show: bundles.value.length > 0 },
  { key: "points", label: t("messages.couponMall.floorPoints"), show: pointsTemplates.value.length > 0 },
].filter((f) => f.show));

async function load() {
  loading.value = true;
  loadError.value = false;
  needLogin.value = false;
  try {
    const [sale, points] = await Promise.all([
      getCouponSaleCatalogue("ALL"),
      getPointsMallTemplates(),
    ]);
    templates.value = sale?.templates ?? [];
    bundles.value = sale?.bundles ?? [];
    pointsTemplates.value = points ?? [];
  } catch {
    // catalogue 匿名访问被后端 FORBIDDEN 拒绝属预期：未登录时展示登录引导而非报错
    if (!isAuthenticated.value) {
      needLogin.value = true;
    } else {
      loadError.value = true;
    }
  } finally {
    loading.value = false;
  }
}
onMounted(load);

/** 登录引导跳转（与 requireLogin 同口径：租户 localePath 到登录页） */
function goLogin() {
  navigateTo(localePath("/account/login"));
}

function goTo(key: string) {
  activeFloor.value = key;
  document.getElementById(`floor-${key}`)?.scrollIntoView({ behavior: "smooth", block: "start" });
}
</script>

<template>
  <main class="mx-auto my-8 w-full max-w-3xl px-3 pb-24">
    <!-- 页头 -->
    <header class="mb-4">
      <h1 class="text-2xl font-semibold">{{ t("messages.couponMall.heroTitle") }}</h1>
      <p class="mt-1 text-sm text-(--ui-text-muted)">{{ t("messages.couponMall.heroSub") }}</p>
    </header>

    <!-- 吸顶锚点 -->
    <nav v-if="floors.length" class="sticky top-0 z-10 -mx-3 mb-3 flex gap-2 bg-(--ui-bg)/90 px-3 py-2 backdrop-blur">
      <UButton
        v-for="f in floors" :key="f.key" size="xs"
        :variant="activeFloor === f.key ? 'solid' : 'soft'"
        @click="goTo(f.key)"
      >{{ f.label }}</UButton>
    </nav>

    <!-- 未登录引导（catalogue 匿名 FORBIDDEN 是后端预期行为，优先于报错展示） -->
    <UCard v-if="needLogin" class="text-center">
      <p class="text-(--ui-text-muted)">{{ t("messages.couponMall.heroSub") }}</p>
      <UButton class="mt-4" @click="goLogin">
        {{ t("messages.coupon.goLogin") }}
      </UButton>
    </UCard>
    <UAlert v-else-if="loadError" color="error" variant="soft" :title="t('messages.couponMall.loadFailed')">
      <UButton size="xs" variant="link" @click="load">{{ t("messages.couponMall.retry") }}</UButton>
    </UAlert>
    <UCard v-else-if="!loading && !floors.length" class="text-center text-(--ui-text-muted)">
      {{ t("messages.couponMall.empty") }}
    </UCard>

    <BaseLoader v-if="loading" width="sm:w-xs md:w-sm" />

    <section v-if="templates.length" id="floor-sale" class="mb-6">
      <h2 class="mb-2 text-sm font-semibold">{{ t("messages.couponMall.floorSale") }}</h2>
      <div class="flex flex-col gap-2">
        <CouponMallCouponCard
          v-for="tpl in templates" :key="tpl.id"
          :tpl="tpl" :buying="buyingId === tpl.id"
          @buy="openDetail(tpl)"
          @detail="openDetail(tpl)"
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

    <CouponMallDetailSheet
      :open="!!sheetTarget"
      :tpl="sheetTarget"
      :bundle="sheetBundle"
      :templates="templates"
      @close="closeDetail"
      @buy="buyFromSheet"
    />

    <!-- 支付方式弹层 -->
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

<style lang="css" scoped></style>
