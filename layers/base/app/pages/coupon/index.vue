<script setup lang="ts">
import type {
  CouponBundle,
  CouponSaleOrder,
  CouponStatus,
  CouponTemplate,
  CouponType,
  CouponWechatPayParams,
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

definePageMeta({
  // 券包需登录，但领券中心可匿名浏览，故不做强制 middleware，交由页面内提示处理
  title: "优惠券",
});

const { t } = useI18n();
const localePath = useTenantLocalePath();
const toast = useToast();
const { isAuthenticated } = storeToRefs(useAuthStore());

type TabKey = "center" | "sale" | "points" | "code" | "wallet";
type WalletKey = "unused" | "used" | "expired" | "returned";
type SceneKey = "ONLINE" | "IN_STORE" | "ALL";

/** 五个 Tab（B 版式：等分图标 tab 栏） */
const TABS: { key: TabKey; label: string; paths: string[] }[] = [
  { key: "center", label: "tabCentre", paths: ["M4 7h16v3a2 2 0 0 0 0 4v3H4v-3a2 2 0 0 0 0-4V7z", "M12 8v1M12 11v1M12 14v1"] },
  { key: "sale", label: "tabSale", paths: ["M6 8h12l-1 12H7L6 8z", "M9 8V6a3 3 0 0 1 6 0v2"] },
  { key: "points", label: "tabPoints", paths: ["M4 9h16v11H4z", "M4 13h16M12 9v11"] },
  { key: "code", label: "tabCode", paths: ["M8 8m-3 0a3 3 0 1 0 6 0a3 3 0 1 0 -6 0", "M10 10l8 8M15 15l2-2M17 17l2-2"] },
  { key: "wallet", label: "tabWallet", paths: ["M4 6h16v13H4z", "M4 10h16", "M16 13.5h.01"] },
];

const tab = ref<TabKey>("center");
const walletTab = ref<WalletKey>("unused");
const walletScene = ref<SceneKey>("ALL");
const saleScene = ref<Exclude<SceneKey, "ALL">>("ONLINE");

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

const STATUS_MAP: Record<WalletKey, CouponStatus> = {
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

/** 场景子筛：ONLINE→(ONLINE|ALL)；IN_STORE→(IN_STORE|ALL)；ALL→全部 */
function matchesScene(scene: string | null | undefined, key: SceneKey): boolean {
  const s = (scene ?? "ONLINE").toUpperCase();
  if (key === "ALL") return true;
  if (key === "ONLINE") return s === "ONLINE" || s === "ALL";
  return s === "IN_STORE" || s === "ALL";
}

const sceneFilteredCoupons = computed(() =>
  filteredMyCoupons.value.filter((c) => matchesScene(c.template?.usageScene, walletScene.value)),
);

// ── 临期排序/高亮（仅「未使用」tab）──
function couponExpiry(c: CustomerCoupon): string | null {
  return c.expiredAt || c.template?.endsAt || null;
}

function remainingDays(c: CustomerCoupon): number | null {
  const end = couponExpiry(c);
  if (!end) return null;
  const diff = new Date(end).getTime() - Date.now();
  if (Number.isNaN(diff)) return null;
  return Math.max(0, Math.ceil(diff / 86_400_000));
}

const EXPIRING_DAYS = 7;

const visibleCoupons = computed<CustomerCoupon[]>(() => {
  const list = sceneFilteredCoupons.value;
  if (walletTab.value !== "unused") return list;
  return [...list].sort((a, b) => {
    const da = remainingDays(a);
    const db = remainingDays(b);
    if (da === null && db === null) return 0;
    if (da === null) return 1;
    if (db === null) return -1;
    return da - db;
  });
});

function isExpiring(c: CustomerCoupon): boolean {
  const days = remainingDays(c);
  return days !== null && days <= EXPIRING_DAYS;
}

// ── 券商城：券包内券模板映射（items 仅含 templateId）──
const templateById = computed<Record<string, CouponTemplate>>(() => {
  const map: Record<string, CouponTemplate> = {};
  for (const tpl of saleTemplates.value) map[tpl.id] = tpl;
  return map;
});

function bundleItems(b: CouponBundle) {
  return (b.items ?? []).map((it) => ({
    ...it,
    template: templateById.value[it.templateId] ?? null,
  }));
}

function bundleTypeCount(b: CouponBundle): number {
  return new Set((b.items ?? []).map((i) => i.templateId)).size;
}

function bundleTotalQty(b: CouponBundle): number {
  return (b.items ?? []).reduce((sum, i) => sum + (i.quantity ?? 0), 0);
}

/** 券包「合计可省」：包内可识别模板的面额×张数 之和 − 售价（>0 才展示） */
function bundleSave(b: CouponBundle): number {
  let save = 0;
  for (const it of bundleItems(b)) {
    const tpl = it.template;
    if (!tpl) continue;
    if (tpl.type === "FIXED" || tpl.type === "FULL") save += tpl.discountValue * (it.quantity ?? 0);
  }
  const net = save - b.salePrice;
  return net > 0 ? net : 0;
}

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

function switchTab(key: TabKey) {
  tab.value = key;
  if (key === "center" && centreCoupons.value.length === 0) loadCentre();
  if (key === "wallet") loadMy();
  if (key === "sale") loadSale();
  if (key === "points") loadPoints();
}

watch(saleScene, () => {
  if (tab.value === "sale") loadSale();
});

// 鉴权就绪后兜底加载券包：规避登录态/持久化水合未完成时切到「我的券」静默为空
watch(isAuthenticated, (ok) => {
  if (ok && myCoupons.value.length === 0) loadMy();
}, { immediate: true });

function switchWallet(k: WalletKey) {
  walletTab.value = k;
}

async function requireLogin(): Promise<boolean> {
  if (isAuthenticated.value) return true;
  await navigateTo(localePath("/account/login"));
  return false;
}

// ── 领取（领券中心）──
function heldCount(templateId: string): number {
  return myCoupons.value.filter(
    (mc) =>
      mc.templateId === templateId &&
      !["RETURNED", "INVALID", "EXPIRED"].includes(mc.status.toUpperCase()),
  ).length;
}

function canClaim(c: CouponTemplate): boolean {
  if (c.totalCount && c.claimedCount != null && c.claimedCount >= c.totalCount) return false;
  if (c.perUserLimit > 0 && heldCount(c.id) >= c.perUserLimit) return false;
  return true;
}

function claimBtnText(c: CouponTemplate): string {
  if (c.totalCount && c.claimedCount != null && c.claimedCount >= c.totalCount) return t("messages.coupon.soldOut");
  if (c.perUserLimit > 0 && heldCount(c.id) >= c.perUserLimit) return t("messages.coupon.perUserReached");
  return t("messages.coupon.claim");
}

async function claim(c: CouponTemplate) {
  if (!(await requireLogin())) return;
  if (claimingId.value || !canClaim(c)) return;
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
function isWechatBrowser(): boolean {
  if (typeof navigator === "undefined") return false;
  return /MicroMessenger/i.test(navigator.userAgent);
}

function yuan(cents: number): string {
  return (cents / 100).toFixed(cents % 100 === 0 ? 0 : 2);
}

async function startBuy(target: { kind: "bundle" | "template"; id: string; name: string; amount: number }) {
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

/** 微信 JSAPI 拉起（WeixinJSBridge） */
function invokeWechatPay(pay: CouponWechatPayParams): Promise<void> {
  return new Promise((resolve, reject) => {
    const invoke = () => {
      const bridge = (window as any).WeixinJSBridge;
      if (!bridge?.invoke) {
        reject(new Error("WeixinJSBridge unavailable"));
        return;
      }
      bridge.invoke(
        "getBrandWCPayRequest",
        {
          appId: pay.appId,
          timeStamp: pay.timeStamp,
          nonceStr: pay.nonceStr,
          package: pay.package,
          signType: pay.signType,
          paySign: pay.paySign,
        },
        (res: { err_msg?: string }) => {
          const msg = res?.err_msg || "";
          if (msg.includes("ok")) resolve();
          else reject(new Error(msg || "cancelled"));
        },
      );
    };
    if ((window as any).WeixinJSBridge) invoke();
    else document.addEventListener("WeixinJSBridgeReady", invoke, { once: true });
  });
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

// ── 展示格式化（移植自 vshop coupons.vue）──
function typeTip(type?: CouponType): string {
  if (type === "FREE_SHIPPING") return t("messages.coupon.typeFreeShipping");
  if (type === "FULL") return t("messages.coupon.typeFull");
  if (type === "PERCENT") return t("messages.coupon.typePercent");
  return t("messages.coupon.typeFixed");
}

function formatAmount(type?: CouponType, discountValue = 0): string {
  if (type === "FREE_SHIPPING") return t("messages.coupon.typeFreeShipping");
  if (type === "PERCENT") {
    const zhe = discountValue / 10;
    return zhe % 1 === 0 ? zhe.toString() : zhe.toFixed(1);
  }
  return (discountValue / 100).toString();
}

function formatUnit(type?: CouponType): string {
  if (type === "FREE_SHIPPING") return "";
  if (type === "PERCENT") return t("messages.coupon.unitDiscount");
  return t("messages.coupon.unitYuan");
}

function formatCondition(c: CouponTemplate): string {
  const minSpend = c.minSpend ? c.minSpend / 100 : 0;
  if (c.type === "FREE_SHIPPING") return c.description || t("messages.coupon.typeFreeShipping");
  if (c.type === "FULL") return t("messages.coupon.noThresholdFull");
  if (!minSpend) return t("messages.coupon.noThreshold");
  return t("messages.coupon.minSpend", { n: minSpend });
}

function formatDateRange(c?: CouponTemplate | null): string {
  const start = c?.startsAt ? String(c.startsAt).slice(0, 10) : "";
  const end = c?.endsAt ? String(c.endsAt).slice(0, 10) : "";
  if (start && end) return t("messages.coupon.dateRange", { start, end });
  if (end) return t("messages.coupon.dateUntil", { end });
  return "";
}

function isStoreCoupon(scene?: string | null): boolean {
  const s = (scene ?? "").toUpperCase();
  return s === "IN_STORE" || s === "ALL";
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

function walletEmptyText(): string {
  const map: Record<WalletKey, string> = {
    unused: t("messages.coupon.emptyUnused"),
    used: t("messages.coupon.emptyUsed"),
    expired: t("messages.coupon.emptyExpired"),
    returned: t("messages.coupon.emptyReturned"),
  };
  return map[walletTab.value];
}

onMounted(loadCentre);
</script>

<template>
  <main class="container my-14">
    <header class="mb-8">
      <h1 class="text-3xl font-semibold">{{ t("messages.coupon.title") }}</h1>
    </header>

    <!-- 五个 Tab（图标 + 文字，等分） -->
    <nav class="mb-6 grid grid-cols-5 border-b border-(--ui-border)">
      <button
        v-for="tb in TABS"
        :key="tb.key"
        type="button"
        class="flex flex-col items-center gap-1 pb-3 text-xs font-medium transition-colors"
        :class="tab === tb.key ? 'text-primary' : 'text-(--ui-text-muted)'"
        @click="switchTab(tb.key)"
      >
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="1.8"
          stroke-linecap="round"
          stroke-linejoin="round"
          class="size-5"
        >
          <path v-for="(p, i) in tb.paths" :key="i" :d="p" />
        </svg>
        <span class="whitespace-nowrap">{{ t(`messages.coupon.${tb.label}`) }}</span>
      </button>
    </nav>

    <!-- ① 领券中心 -->
    <section v-if="tab === 'center'">
      <BaseLoader v-if="loadingCenter" width="sm:w-xs md:w-sm" />
      <template v-else>
        <div v-if="centreCoupons.length" class="grid gap-4 md:grid-cols-2">
          <UCard
            v-for="c in centreCoupons"
            :key="c.id"
            variant="soft"
            class="flex flex-col"
          >
            <div class="flex items-stretch gap-4">
              <div
                class="flex w-32 shrink-0 flex-col items-center justify-center rounded-lg bg-(--ui-primary) text-white"
                :class="{ 'opacity-60': !canClaim(c) }"
              >
                <div class="flex items-baseline">
                  <span v-if="c.type === 'FIXED' || c.type === 'FULL'">¥</span>
                  <span class="text-2xl font-bold">{{ formatAmount(c.type, c.discountValue) }}</span>
                  <span>{{ formatUnit(c.type) }}</span>
                </div>
                <span class="mt-1 text-xs opacity-90">{{ typeTip(c.type) }}</span>
              </div>
              <div class="flex min-w-0 flex-1 flex-col">
                <div class="flex flex-wrap items-center gap-1">
                  <p class="font-semibold">{{ c.name }}</p>
                  <span
                    v-if="isStoreCoupon(c.usageScene)"
                    class="rounded bg-primary/10 px-1 py-px text-[10px] font-semibold text-primary"
                  >{{ t("messages.coupon.storeUsable") }}</span>
                </div>
                <p class="mt-1 text-sm text-(--ui-text-muted)">{{ formatCondition(c) }}</p>
                <p class="mt-1 text-xs text-(--ui-text-muted)">
                  {{ t("messages.coupon.validity") }}：{{ formatDateRange(c) }}
                </p>
              </div>
            </div>
            <UButton
              class="mt-4 w-full justify-center"
              :disabled="!canClaim(c) || !!claimingId"
              :loading="claimingId === c.id"
              @click="claim(c)"
            >
              {{ claimBtnText(c) }}
            </UButton>
          </UCard>
        </div>
        <p v-else>{{ t("messages.coupon.noAvailable") }}</p>
      </template>
    </section>

    <!-- ② 券商城 -->
    <section v-else-if="tab === 'sale'">
      <div v-if="!isAuthenticated" class="flex flex-col items-center gap-4 py-16">
        <p class="text-(--ui-text-muted)">{{ t("messages.coupon.loginPrompt") }}</p>
        <UButton :to="localePath('/account/login')">{{ t("messages.coupon.goLogin") }}</UButton>
      </div>
      <template v-else>
        <div class="mb-6 flex gap-2">
          <UButton
            size="sm"
            :variant="saleScene === 'ONLINE' ? 'solid' : 'soft'"
            @click="saleScene = 'ONLINE'"
          >{{ t("messages.coupon.sceneOnline") }}</UButton>
          <UButton
            size="sm"
            :variant="saleScene === 'IN_STORE' ? 'solid' : 'soft'"
            @click="saleScene = 'IN_STORE'"
          >{{ t("messages.coupon.sceneStore") }}</UButton>
        </div>

        <BaseLoader v-if="loadingSale" width="sm:w-xs md:w-sm" />
        <template v-else>
          <div v-if="saleBundles.length || saleTemplates.length" class="grid gap-4 md:grid-cols-2">
            <!-- 券包大卡 -->
            <div
              v-for="b in saleBundles"
              :key="'b-' + b.id"
              class="rounded-xl border border-(--ui-border) p-4"
            >
              <div class="flex items-start justify-between gap-3">
                <div class="min-w-0">
                  <p class="font-semibold">{{ b.name }}</p>
                  <p class="mt-0.5 text-xs text-(--ui-text-muted)">
                    {{ t("messages.coupon.bundleContains", { n: bundleTypeCount(b), m: bundleTotalQty(b) }) }}
                    <span v-if="bundleSave(b)">· {{ t("messages.coupon.bundleSave", { n: yuan(bundleSave(b)) }) }}</span>
                  </p>
                </div>
                <div class="shrink-0 text-right">
                  <span class="text-lg font-bold text-primary">¥{{ yuan(b.salePrice) }}</span>
                </div>
              </div>
              <div class="mt-2 flex flex-wrap gap-1">
                <span
                  v-for="it in bundleItems(b)"
                  :key="it.id"
                  class="rounded bg-(--ui-bg-elevated) px-1.5 py-0.5 text-xs text-(--ui-text-muted)"
                >
                  {{ it.template ? `${formatAmount(it.template.type, it.template.discountValue)}${formatUnit(it.template.type)}` : t('messages.coupon.coupon') }} ×{{ it.quantity }}
                </span>
              </div>
              <UButton
                class="mt-4 w-full justify-center"
                :loading="buyingId === b.id"
                :disabled="!!buyingId"
                @click="startBuy({ kind: 'bundle', id: b.id, name: b.name, amount: b.salePrice })"
              >
                {{ t("messages.coupon.buyNow") }}
              </UButton>
            </div>

            <!-- 单券卡 -->
            <div
              v-for="c in saleTemplates"
              :key="'t-' + c.id"
              class="flex flex-col rounded-xl border border-(--ui-border) p-4"
            >
              <div class="flex items-stretch gap-4">
                <div class="flex w-28 shrink-0 flex-col items-center justify-center rounded-lg bg-(--ui-primary) text-white">
                  <div class="flex items-baseline">
                    <span v-if="c.type === 'FIXED' || c.type === 'FULL'">¥</span>
                    <span class="text-2xl font-bold">{{ formatAmount(c.type, c.discountValue) }}</span>
                    <span>{{ formatUnit(c.type) }}</span>
                  </div>
                  <span class="mt-1 text-xs opacity-90">{{ typeTip(c.type) }}</span>
                </div>
                <div class="flex min-w-0 flex-1 flex-col">
                  <p class="font-semibold">{{ c.name }}</p>
                  <p class="mt-1 text-sm text-(--ui-text-muted)">{{ formatCondition(c) }}</p>
                  <p class="mt-1 text-xs text-(--ui-text-muted)">
                    {{ t("messages.coupon.validity") }}：{{ formatDateRange(c) }}
                  </p>
                </div>
              </div>
              <UButton
                class="mt-4 w-full justify-center"
                :loading="buyingId === c.id"
                :disabled="!!buyingId"
                @click="startBuy({ kind: 'template', id: c.id, name: c.name, amount: c.salePrice })"
              >
                {{ t("messages.coupon.buyNow") }} ¥{{ yuan(c.salePrice) }}
              </UButton>
            </div>
          </div>
          <p v-else>{{ t("messages.coupon.saleEmpty") }}</p>
        </template>
      </template>
    </section>

    <!-- ③ 积分商城 -->
    <section v-else-if="tab === 'points'">
      <div v-if="!isAuthenticated" class="flex flex-col items-center gap-4 py-16">
        <p class="text-(--ui-text-muted)">{{ t("messages.coupon.loginPrompt") }}</p>
        <UButton :to="localePath('/account/login')">{{ t("messages.coupon.goLogin") }}</UButton>
      </div>
      <template v-else>
        <BaseLoader v-if="loadingPoints" width="sm:w-xs md:w-sm" />
        <template v-else>
          <div v-if="pointsCoupons.length" class="grid gap-4 md:grid-cols-2">
            <div
              v-for="c in pointsCoupons"
              :key="c.id"
              class="flex flex-col rounded-xl border border-(--ui-border) p-4"
            >
              <div class="flex items-stretch gap-4">
                <div class="flex w-28 shrink-0 flex-col items-center justify-center rounded-lg bg-(--ui-primary) text-white">
                  <div class="flex items-baseline">
                    <span v-if="c.type === 'FIXED' || c.type === 'FULL'">¥</span>
                    <span class="text-2xl font-bold">{{ formatAmount(c.type, c.discountValue) }}</span>
                    <span>{{ formatUnit(c.type) }}</span>
                  </div>
                  <span class="mt-1 text-xs opacity-90">{{ typeTip(c.type) }}</span>
                </div>
                <div class="flex min-w-0 flex-1 flex-col">
                  <p class="font-semibold">{{ c.name }}</p>
                  <p class="mt-1 text-sm text-(--ui-text-muted)">{{ formatCondition(c) }}</p>
                  <p class="mt-1 text-xs font-semibold text-primary">
                    {{ t("messages.coupon.pointsPrice", { n: c.pointsPrice }) }}
                  </p>
                </div>
              </div>
              <UButton
                class="mt-4 w-full justify-center"
                :loading="exchangingId === c.id"
                :disabled="!!exchangingId"
                @click="exchange(c)"
              >
                {{ t("messages.coupon.exchange") }}
              </UButton>
            </div>
          </div>
          <p v-else>{{ t("messages.coupon.pointsEmpty") }}</p>
        </template>
      </template>
    </section>

    <!-- ④ 兑换码 -->
    <section v-else-if="tab === 'code'">
      <div class="flex flex-wrap items-center gap-3 rounded-xl border border-(--ui-border) p-4">
        <p class="font-semibold">{{ t("messages.coupon.redeemTitle") }}</p>
        <UInput
          v-model="redeemCode"
          class="w-52"
          :placeholder="t('messages.coupon.redeemPlaceholder')"
          :disabled="redeeming"
          @keyup.enter="redeem()"
        />
        <UButton
          color="primary"
          :loading="redeeming"
          :disabled="!redeemCode.trim() || redeeming"
          @click="redeem()"
        >
          {{ t("messages.coupon.redeemBtn") }}
        </UButton>
      </div>
    </section>

    <!-- ⑤ 我的券 -->
    <section v-else>
      <div v-if="!isAuthenticated">
        <div class="flex flex-col items-center gap-4 py-16">
          <p class="text-(--ui-text-muted)">{{ t("messages.coupon.loginPrompt") }}</p>
          <UButton :to="localePath('/account/login')">
            {{ t("messages.coupon.goLogin") }}
          </UButton>
        </div>
      </div>
      <template v-else>
        <div class="mb-3 flex flex-wrap gap-2">
          <UButton
            v-for="w in (['unused', 'used', 'expired', 'returned'] as WalletKey[])"
            :key="w"
            size="sm"
            :variant="walletTab === w ? 'solid' : 'soft'"
            @click="switchWallet(w)"
          >{{ t(`messages.coupon.${w}`) }}</UButton>
        </div>
        <!-- 场景子筛（到店券分组） -->
        <div class="mb-6 flex flex-wrap gap-2">
          <UButton
            v-for="s in (['ALL', 'ONLINE', 'IN_STORE'] as SceneKey[])"
            :key="s"
            size="xs"
            :variant="walletScene === s ? 'solid' : 'ghost'"
            @click="walletScene = s"
          >{{ t(`messages.coupon.${s === 'ALL' ? 'sceneAll' : s === 'ONLINE' ? 'sceneOnline' : 'sceneStore'}`) }}</UButton>
        </div>

        <BaseLoader v-if="loadingWallet" width="sm:w-xs md:w-sm" />
        <div v-else-if="sceneFilteredCoupons.length" class="grid gap-4 md:grid-cols-2">
          <div
            v-for="mc in visibleCoupons"
            :key="mc.id"
            class="relative rounded-xl border border-(--ui-border) p-4"
            :class="[mc.status !== 'UNUSED' && 'opacity-60', isExpiring(mc) && 'border-primary-400 ring-2 ring-primary-200 dark:ring-primary-900/50']"
          >
            <div class="flex items-stretch gap-4">
              <div
                class="flex w-32 shrink-0 flex-col items-center justify-center rounded-lg bg-(--ui-primary) text-white"
              >
                <div class="flex items-baseline">
                  <span v-if="mc.template?.type === 'FIXED' || mc.template?.type === 'FULL'">¥</span>
                  <span class="text-2xl font-bold">
                    {{ formatAmount(mc.template?.type, mc.template?.discountValue ?? 0) }}
                  </span>
                  <span>{{ formatUnit(mc.template?.type) }}</span>
                </div>
                <span class="mt-1 text-xs opacity-90">{{ typeTip(mc.template?.type) }}</span>
              </div>
              <div class="flex min-w-0 flex-1 flex-col">
                <div class="flex flex-wrap items-center gap-1">
                  <p class="font-semibold">{{ mc.template?.name || t("messages.coupon.voucher") }}</p>
                  <span
                    v-if="isStoreCoupon(mc.template?.usageScene)"
                    class="rounded bg-primary/10 px-1 py-px text-[10px] font-semibold text-primary"
                  >{{ t("messages.coupon.storeUsable") }}</span>
                </div>
                <p class="mt-1 text-sm text-(--ui-text-muted)">
                  {{ formatCondition(mc.template ?? ({} as CouponTemplate)) }}
                </p>
                <p class="mt-1 text-xs text-(--ui-text-muted)">
                  {{ t("messages.coupon.code") }}：{{ mc.code }}
                </p>
                <p class="mt-1 text-xs text-(--ui-text-muted)">
                  {{ t("messages.coupon.validity") }}：{{ formatDateRange(mc.template) }}
                </p>
              </div>
            </div>
            <!-- 到店买单券：出示券码入口（未使用且场景为到店/通用） -->
            <UButton
              v-if="mc.status === 'UNUSED' && isStoreCoupon(mc.template?.usageScene)"
              class="mt-4 w-full justify-center"
              size="sm"
              variant="soft"
              @click="goCode(mc)"
            >
              {{ t("messages.coupon.showCode") }}
            </UButton>
            <!-- 临期 badge（仅未使用 tab） -->
            <div
              v-if="walletTab === 'unused' && isExpiring(mc)"
              class="absolute top-2 left-2 rounded bg-primary-600 px-1.5 py-0.5 text-xs font-semibold text-white"
            >
              {{ t("messages.coupon.expiringDays", { n: remainingDays(mc) }) }}
            </div>
            <div
              v-if="mc.status !== 'UNUSED'"
              class="absolute top-1/2 right-8 -rotate-12 rounded border border-(--ui-error) px-2 py-1 text-sm font-bold text-(--ui-error)"
            >
              {{
                mc.status === "USED"
                  ? t("messages.coupon.usedStamp")
                  : mc.status === "EXPIRED"
                    ? t("messages.coupon.expiredStamp")
                    : mc.status === "RETURNED"
                      ? t("messages.coupon.returnedStamp")
                      : mc.status
              }}
            </div>
          </div>
        </div>
        <p v-else>{{ walletEmptyText() }}</p>
      </template>
    </section>

    <!-- 支付方式弹层（券商城） -->
    <div
      v-if="paySheetOpen"
      class="fixed inset-0 z-[70] flex items-end justify-center bg-black/40"
      @click.self="closePaySheet"
    >
      <div class="w-full max-w-md rounded-t-2xl bg-(--ui-bg) p-5">
        <p class="mb-1 text-lg font-semibold">{{ t("messages.coupon.payTitle") }}</p>
        <p class="mb-4 text-sm text-(--ui-text-muted)">{{ buyName }} · ¥{{ yuan(buyAmount) }}</p>

        <button
          type="button"
          class="mb-2 flex w-full items-center gap-3 rounded-lg border p-3 text-left"
          :class="payMode === 'WECHAT' ? 'border-primary' : 'border-(--ui-border)'"
          @click="payMode = 'WECHAT'"
        >
          <span
            class="size-3.5 shrink-0 rounded-full border-2"
            :class="payMode === 'WECHAT' ? 'border-primary bg-primary' : 'border-(--ui-border)'"
          />
          <span class="flex-1 font-medium">{{ t("messages.coupon.payWechat") }}</span>
          <span class="text-xs text-(--ui-text-muted)">{{ t("messages.coupon.payWechatSub") }}</span>
        </button>
        <button
          type="button"
          class="mb-4 flex w-full items-center gap-3 rounded-lg border p-3 text-left"
          :class="payMode === 'BALANCE' ? 'border-primary' : 'border-(--ui-border)'"
          @click="payMode = 'BALANCE'"
        >
          <span
            class="size-3.5 shrink-0 rounded-full border-2"
            :class="payMode === 'BALANCE' ? 'border-primary bg-primary' : 'border-(--ui-border)'"
          />
          <span class="flex-1 font-medium">{{ t("messages.coupon.payBalance") }}</span>
        </button>

        <div class="flex gap-3">
          <UButton class="flex-1 justify-center" variant="soft" :disabled="paying" @click="closePaySheet">
            {{ t("messages.general.cancel") }}
          </UButton>
          <UButton class="flex-1 justify-center" :loading="paying" :disabled="paying" @click="confirmPay">
            {{ t("messages.coupon.payConfirm", { n: yuan(buyAmount) }) }}
          </UButton>
        </div>
      </div>
    </div>
  </main>
</template>

<style lang="css" scoped></style>