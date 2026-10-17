<script setup lang="ts">
import type { CouponSaleOrder } from "~~/layers/base/app/composables/useCoupon";
import {
  getCouponSaleCatalogue,
  getPointsMallTemplates,
  createCouponSaleOrder,
  createWechatCouponPayment,
  payCouponSaleWithBalance,
  cancelCouponSaleOrder,
  getMyCouponSaleOrders,
  exchangeCouponWithPoints,
  couponErrorMessage,
} from "~~/layers/base/app/composables/useCoupon";
import { invokeWechatPay, isWechatBrowser } from "~~/layers/base/app/utils/coupon";

definePageMeta({
  title: "券商城",
});

const { t } = useI18n();
const localePath = useTenantLocalePath();
const toast = useToast();
const { isAuthenticated } = storeToRefs(useAuthStore());

const loadError = ref(false);
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
  try {
    const [sale, points] = await Promise.all([
      getCouponSaleCatalogue("ALL"),
      getPointsMallTemplates(),
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

// ── 详情弹层 ──
const sheetTarget = ref<any>(null);
const sheetBundle = ref<any>(null);

function openDetail(target: Record<string, any>, bundle: Record<string, any> | null = null) {
  sheetTarget.value = target;
  sheetBundle.value = bundle;
}

// ── 购买/支付（与 pages/coupon/index.vue 同模式） ──
const buyingId = ref<string | null>(null);
const paying = ref(false);
const paySheetOpen = ref(false);
const payMode = ref<"WECHAT" | "BALANCE">("WECHAT");
const pendingOrder = ref<CouponSaleOrder | null>(null);
const buyName = ref("");
const buyAmount = ref(0);

function requireLogin(): boolean {
  if (isAuthenticated.value) return true;
  navigateTo(localePath("/account/login"));
  return false;
}

async function startBuy(target: Record<string, any>, kind: "template" | "bundle") {
  if (!requireLogin()) return;
  if (buyingId.value) return;
  buyingId.value = target.id;
  try {
    const order = await createCouponSaleOrder(kind === "bundle" ? { bundleId: target.id } : { templateId: target.id });
    pendingOrder.value = order;
    buyName.value = target.name;
    buyAmount.value = order.amount ?? target.salePrice ?? 0;
    payMode.value = isWechatBrowser() ? "WECHAT" : "BALANCE";
    paySheetOpen.value = true;
  } catch (e) {
    toast.add({ title: t("messages.coupon.purchaseFailed"), description: couponErrorMessage(e), color: "error" });
  } finally {
    buyingId.value = null;
  }
}

function buyFromSheet() {
  const target = sheetTarget.value;
  if (!target) return;
  const kind: "template" | "bundle" = sheetBundle.value ? "bundle" : "template";
  sheetTarget.value = null;
  sheetBundle.value = null;
  startBuy(target, kind);
}

/** 微信回调结算为异步：短轮询确认已支付（最多 5 次 × 1.2s） */
async function waitForPaid(saleOrderId: string): Promise<void> {
  for (let i = 0; i < 5; i++) {
    try {
      const orders = await getMyCouponSaleOrders();
      if (orders.find((o) => o.id === saleOrderId && o.status === "PAID")) return;
    } catch {
      // 忽略轮询异常，继续重试
    }
    await new Promise((r) => setTimeout(r, 1200));
  }
}

async function confirmPay() {
  const order = pendingOrder.value;
  if (!order || paying.value) return;
  paying.value = true;
  try {
    if (payMode.value === "BALANCE") {
      await payCouponSaleWithBalance(order.id);
      await onPaid();
    } else {
      if (!isWechatBrowser()) {
        toast.add({ title: t("messages.coupon.notInWechat"), color: "warning" });
        return;
      }
      const res = await createWechatCouponPayment(order.id, "JSAPI");
      if (!res?.pay?.paySign) {
        toast.add({ title: t("messages.coupon.noOpenid"), color: "warning" });
        return;
      }
      try {
        await invokeWechatPay(res.pay);
      } catch (e) {
        toast.add({ title: t("messages.coupon.payCancelled"), description: couponErrorMessage(e), color: "error" });
        return;
      }
      await waitForPaid(order.id);
      await onPaid();
    }
  } catch (e) {
    toast.add({ title: t("messages.coupon.payFailed"), description: couponErrorMessage(e), color: "error" });
  } finally {
    paying.value = false;
  }
}

async function onPaid() {
  paySheetOpen.value = false;
  pendingOrder.value = null;
  toast.add({ title: t("messages.coupon.paySuccess"), color: "success" });
}

/** 关闭支付弹层：未支付则取消出售单，避免残留 PENDING */
async function closePaySheet() {
  const order = pendingOrder.value;
  paySheetOpen.value = false;
  pendingOrder.value = null;
  if (order) {
    try {
      await cancelCouponSaleOrder(order.id);
    } catch {
      // 已支付/已取消时取消会失败，忽略
    }
  }
}

// ── 积分兑换 ──
const exchangingId = ref<string | null>(null);
async function exchange(c: Record<string, any>) {
  if (!requireLogin()) return;
  if (exchangingId.value) return;
  exchangingId.value = c.id;
  try {
    await exchangeCouponWithPoints(c.id);
    toast.add({ title: t("messages.coupon.exchangeSuccess"), color: "success" });
  } catch (e) {
    toast.add({ title: t("messages.coupon.exchangeFailed"), description: couponErrorMessage(e), color: "error" });
  } finally {
    exchangingId.value = null;
  }
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

    <UAlert v-if="loadError" color="error" variant="soft" :title="t('messages.couponMall.loadFailed')">
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
      @close="sheetTarget = null; sheetBundle = null"
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
