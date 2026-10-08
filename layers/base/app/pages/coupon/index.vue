<script setup lang="ts">
import type {
  CouponBundle,
  CouponSaleOrder,
  CouponStatus,
  CouponTemplate,
  CustomerCoupon,
} from "~~/layers/base/app/composables/useCoupon";
import {
  getCouponCentre,
  getMyCoupons,
  claimCoupon,
  redeemCouponByCode,
  getCouponSaleCatalogue,
  createCouponSaleOrder,
  createWechatCouponPayment,
  payCouponSaleWithBalance,
  cancelCouponSaleOrder,
  getMyCouponSaleOrders,
  getPointsMallTemplates,
  exchangeCouponWithPoints,
  couponErrorMessage,
} from "~~/layers/base/app/composables/useCoupon";
import {
  couponMatchesScene,
  couponRemainingDays,
  invokeWechatPay,
  isWechatBrowser,
  type CouponBuyTarget,
  type CouponPageTab,
  type CouponSceneKey,
  type CouponWalletKey,
} from "~~/layers/base/app/utils/coupon";

definePageMeta({
  // 券包需登录，但领券中心可匿名浏览，故不做强制 middleware，交由页面内提示处理
  title: "优惠券",
});

const { t } = useI18n();
const localePath = useTenantLocalePath();
const toast = useToast();
const { isAuthenticated } = storeToRefs(useAuthStore());

const tab = ref<CouponPageTab>("center");
const walletTab = ref<CouponWalletKey>("unused");
const walletScene = ref<CouponSceneKey>("ALL");
const saleScene = ref<Exclude<CouponSceneKey, "ALL">>("ONLINE");

// 领券中心
const centreCoupons = ref<CouponTemplate[]>([]);
const loadingCenter = ref(false);
const claimingId = ref<string | null>(null);
// 我的券
const myCoupons = ref<CustomerCoupon[]>([]);
const loadingWallet = ref(false);
// 兑换码
const redeemCode = ref("");
const redeeming = ref(false);
// 券商城
const saleTemplates = ref<CouponTemplate[]>([]);
const saleBundles = ref<CouponBundle[]>([]);
const loadingSale = ref(false);
const buyingId = ref<string | null>(null);
// 支付弹层
const paySheetOpen = ref(false);
const payMode = ref<"WECHAT" | "BALANCE">("WECHAT");
const pendingOrder = ref<CouponSaleOrder | null>(null);
const buyName = ref("");
const buyAmount = ref(0);
const paying = ref(false);
// 积分商城
const pointsCoupons = ref<CouponTemplate[]>([]);
const loadingPoints = ref(false);
const exchangingId = ref<string | null>(null);

const STATUS_MAP: Record<CouponWalletKey, CouponStatus> = {
  unused: "UNUSED",
  used: "USED",
  expired: "EXPIRED",
  returned: "RETURNED",
};

const filteredMyCoupons = computed(() =>
  myCoupons.value.filter(
    (c) => c.status.toUpperCase() === STATUS_MAP[walletTab.value],
  ),
);

const sceneFilteredCoupons = computed(() =>
  filteredMyCoupons.value.filter((c) => couponMatchesScene(c.template?.usageScene, walletScene.value)),
);

// ── 临期排序（仅「未使用」tab，高亮展示见 CouponWalletList）──
const visibleCoupons = computed<CustomerCoupon[]>(() => {
  const list = sceneFilteredCoupons.value;
  if (walletTab.value !== "unused") return list;
  return [...list].sort((a, b) => {
    const da = couponRemainingDays(a);
    const db = couponRemainingDays(b);
    if (da === null && db === null) return 0;
    if (da === null) return 1;
    if (db === null) return -1;
    return da - db;
  });
});

// ── 加载 ──
async function loadCentre() {
  loadingCenter.value = true;
  try {
    centreCoupons.value = await getCouponCentre();
  } catch (e) {
    toast.add({ title: t("messages.coupon.couponCentre"), description: couponErrorMessage(e), color: "error" });
  } finally {
    loadingCenter.value = false;
  }
}

async function loadMy() {
  if (!isAuthenticated.value) return;
  loadingWallet.value = true;
  try {
    myCoupons.value = (await getMyCoupons()).map((c) => ({
      ...c,
      status: c.status.toUpperCase() as CouponStatus,
    }));
  } catch (e) {
    toast.add({ title: t("messages.coupon.myWallet"), description: couponErrorMessage(e), color: "error" });
  } finally {
    loadingWallet.value = false;
  }
}

async function loadSale() {
  loadingSale.value = true;
  try {
    const data = await getCouponSaleCatalogue(saleScene.value);
    saleTemplates.value = data.templates ?? [];
    saleBundles.value = data.bundles ?? [];
  } catch (e) {
    toast.add({ title: t("messages.coupon.tabSale"), description: couponErrorMessage(e), color: "error" });
  } finally {
    loadingSale.value = false;
  }
}

async function loadPoints() {
  loadingPoints.value = true;
  try {
    pointsCoupons.value = await getPointsMallTemplates();
  } catch (e) {
    toast.add({ title: t("messages.coupon.tabPoints"), description: couponErrorMessage(e), color: "error" });
  } finally {
    loadingPoints.value = false;
  }
}

function switchTab(key: CouponPageTab) {
  tab.value = key;
  if (key === "center" && centreCoupons.value.length === 0) loadCentre();
  if (key === "wallet") loadMy();
  // 券商城/积分商城需登录：匿名时短路走登录提示，避免 API FORBIDDEN toast
  if (key === "sale" && isAuthenticated.value) loadSale();
  if (key === "points" && isAuthenticated.value) loadPoints();
}

watch(saleScene, () => {
  if (tab.value === "sale") loadSale();
});

// 鉴权就绪后兜底加载：规避登录态/持久化水合未完成时切到「我的券」静默为空；
// 以及匿名期间点过「券商城/积分商城」被短路、登录后停留在该 tab 时补加载
watch(isAuthenticated, (ok) => {
  if (!ok) return;
  if (myCoupons.value.length === 0) loadMy();
  if (tab.value === "sale" && !loadingSale.value && saleTemplates.value.length === 0 && saleBundles.value.length === 0) loadSale();
  if (tab.value === "points" && !loadingPoints.value && pointsCoupons.value.length === 0) loadPoints();
}, { immediate: true });

async function requireLogin(): Promise<boolean> {
  if (isAuthenticated.value) return true;
  await navigateTo(localePath("/account/login"));
  return false;
}

// ── 领取（领券中心）──
async function claim(c: CouponTemplate) {
  if (!(await requireLogin())) return;
  if (claimingId.value) return;
  claimingId.value = c.id;
  try {
    await claimCoupon(c.id);
    toast.add({ title: t("messages.coupon.claimSuccess"), color: "success" });
    c.claimedCount += 1;
  } catch (e) {
    toast.add({ title: t("messages.coupon.claimFailed"), description: couponErrorMessage(e), color: "error" });
  } finally {
    claimingId.value = null;
  }
}

// ── 凭兑换码领券 ──
async function redeem() {
  const code = redeemCode.value.trim();
  if (!code) return;
  if (!(await requireLogin())) return;
  if (redeeming.value) return;
  redeeming.value = true;
  try {
    await redeemCouponByCode(code);
    toast.add({ title: t("messages.coupon.redeemSuccess"), color: "success" });
    redeemCode.value = "";
    await loadMy();
    walletTab.value = "unused";
    walletScene.value = "ALL";
    tab.value = "wallet";
  } catch (e) {
    toast.add({ title: t("messages.coupon.redeemFailed"), description: couponErrorMessage(e), color: "error" });
  } finally {
    redeeming.value = false;
  }
}

// ── 积分兑换 ──
async function exchange(c: CouponTemplate) {
  if (!(await requireLogin())) return;
  if (exchangingId.value) return;
  exchangingId.value = c.id;
  try {
    await exchangeCouponWithPoints(c.id);
    toast.add({ title: t("messages.coupon.exchangeSuccess"), color: "success" });
    await loadMy();
    walletTab.value = "unused";
    walletScene.value = "ALL";
    tab.value = "wallet";
  } catch (e) {
    toast.add({ title: t("messages.coupon.exchangeFailed"), description: couponErrorMessage(e), color: "error" });
  } finally {
    exchangingId.value = null;
  }
}

// ── 券商城购买 ──
async function startBuy(target: CouponBuyTarget) {
  if (!(await requireLogin())) return;
  if (buyingId.value) return;
  buyingId.value = target.id;
  try {
    const order = await createCouponSaleOrder(
      target.kind === "bundle" ? { bundleId: target.id } : { templateId: target.id },
    );
    pendingOrder.value = order;
    buyName.value = target.name;
    buyAmount.value = order.amount ?? target.amount;
    payMode.value = isWechatBrowser() ? "WECHAT" : "BALANCE";
    paySheetOpen.value = true;
  } catch (e) {
    toast.add({ title: t("messages.coupon.purchaseFailed"), description: couponErrorMessage(e), color: "error" });
  } finally {
    buyingId.value = null;
  }
}

/** 微信回调结算为异步：短轮询确认已支付（最多 5 次 × 1.2s） */
async function waitForPaid(saleOrderId: string): Promise<void> {
  for (let i = 0; i < 5; i++) {
    try {
      const orders = await getMyCouponSaleOrders();
      const found = orders.find((o) => o.id === saleOrderId);
      if (found && found.status === "PAID") return;
    } catch {
      // 忽略轮询异常，继续重试
    }
    await new Promise((r) => setTimeout(r, 1200));
  }
}

async function onPaid() {
  paySheetOpen.value = false;
  pendingOrder.value = null;
  toast.add({ title: t("messages.coupon.paySuccess"), color: "success" });
  await loadMy();
  tab.value = "wallet";
  walletTab.value = "unused";
  walletScene.value = "ALL";
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

// ── 出示券码（到店买单券，跳券码页）──
function goCode(c: CustomerCoupon) {
  const discount =
    c.template?.type === "PERCENT"
      ? t("messages.coupon.discountPercent", { n: (c.template?.discountValue ?? 0) / 10 })
      : c.template?.type === "FIXED"
        ? t("messages.coupon.discountFixed", { n: (c.template?.discountValue ?? 0) / 100 })
        : "";
  navigateTo({
    path: localePath("/coupon/code"),
    query: {
      code: c.code ?? "",
      name: c.template?.name ?? "",
      expiresAt: c.expiredAt || c.template?.endsAt || "",
      discount,
    },
  });
}

onMounted(loadCentre);
</script>

<template>
  <main class="container my-14">
    <header class="mb-8">
      <h1 class="text-3xl font-semibold">{{ t("messages.coupon.title") }}</h1>
    </header>

    <!-- 显式绑定而非 v-model：switchTab 含各 tab 懒加载，而 redeem/exchange/onPaid 内
         直接赋值 tab.value 的路径不应触发懒加载 -->
    <CouponTabNav :model-value="tab" @update:model-value="switchTab" />

    <!-- ① 领券中心 -->
    <section v-if="tab === 'center'">
      <BaseLoader v-if="loadingCenter" width="sm:w-xs md:w-sm" />
      <CouponCentreList
        v-else
        :coupons="centreCoupons"
        :my-coupons="myCoupons"
        :claiming-id="claimingId"
        @claim="claim"
      />
    </section>

    <!-- ② 券商城 -->
    <section v-else-if="tab === 'sale'">
      <CouponLoginPrompt v-if="!isAuthenticated" />
      <CouponSaleList
        v-else
        v-model:scene="saleScene"
        :bundles="saleBundles"
        :templates="saleTemplates"
        :buying-id="buyingId"
        :loading="loadingSale"
        @buy="startBuy"
      />
    </section>

    <!-- ③ 积分商城 -->
    <section v-else-if="tab === 'points'">
      <CouponLoginPrompt v-if="!isAuthenticated" />
      <template v-else>
        <BaseLoader v-if="loadingPoints" width="sm:w-xs md:w-sm" />
        <CouponPointsList
          v-else
          :coupons="pointsCoupons"
          :exchanging-id="exchangingId"
          @exchange="exchange"
        />
      </template>
    </section>

    <!-- ④ 兑换码 -->
    <section v-else-if="tab === 'code'">
      <CouponRedeemForm v-model="redeemCode" :redeeming="redeeming" @submit="redeem" />
    </section>

    <!-- ⑤ 我的券 -->
    <section v-else>
      <CouponLoginPrompt v-if="!isAuthenticated" />
      <CouponWalletList
        v-else
        v-model:wallet-tab="walletTab"
        v-model:scene="walletScene"
        :coupons="visibleCoupons"
        :loading="loadingWallet"
        @show-code="goCode"
      />
    </section>

    <!-- 支付方式弹层（券商城） -->
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
