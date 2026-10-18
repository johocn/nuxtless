import type { CouponSaleOrder } from "./useCoupon";
import {
  createCouponSaleOrder,
  createWechatCouponPayment,
  payCouponSaleWithBalance,
  cancelCouponSaleOrder,
  getMyCouponSaleOrders,
  exchangeCouponWithPoints,
  couponErrorMessage,
} from "./useCoupon";
import { invokeWechatPay, isWechatBrowser } from "../utils/coupon";

/**
 * 券购/支付/兑换共享流程（原 coupon-mall 页内逻辑抽离，供券商城页与券店首页复用）：
 * 详情弹层 → 下单 → PaySheet（微信/余额）→ 支付确认/取消；积分兑换；登录引导。
 */
export function useCouponSaleFlow() {
  const { t } = useI18n();
  const localePath = useTenantLocalePath();
  const toast = useToast();
  const { isAuthenticated } = storeToRefs(useAuthStore());

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

  function closeDetail() {
    sheetTarget.value = null;
    sheetBundle.value = null;
  }

  return {
    sheetTarget, sheetBundle, openDetail, closeDetail, buyFromSheet,
    buyingId, paying, paySheetOpen, payMode, pendingOrder, buyName, buyAmount,
    requireLogin, startBuy, confirmPay, closePaySheet,
    exchangingId, exchange,
  };
}
