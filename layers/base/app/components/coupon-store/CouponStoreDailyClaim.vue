<script setup lang="ts">
import {
  getCouponDailyClaimActivity,
  claimDailyCoupon,
  type CouponDailyClaimActivityView,
} from "../../composables/useCoupon";
import { couponYuan } from "../../utils/coupon";

/**
 * 券店每日领券卡（FR-F1，方案 A 首页内嵌楼层）：
 * - 匿名可查活动视图（后端服务端时间窗判定；无生效活动为 null 不渲染）。
 * - 每人每券每天 1 张（UTC+8 业务日）：claimedToday 置灰「今日已领」，soldOut 置灰「已领完」。
 * - 未登录点击领取 → 引导 SSO 登录；后端 status 映射文案，R3 幂等（重复领取返回 ALREADY_CLAIMED）。
 */
const { t, locale } = useI18n();
const toast = useToast();
const { isAuthenticated } = storeToRefs(useAuthStore());
const localePath = useTenantLocalePath();
const { fetchProviders, loginWithSso } = useSso();
const route = useRoute();

const activity = ref<CouponDailyClaimActivityView | null>(null);
const claimingId = ref<string | null>(null);

const typeLabel = (tpl: any): string => {
  switch (tpl?.type) {
    case "FIXED": return t("messages.coupon.typeFixed");
    case "PERCENT": return t("messages.coupon.typePercent");
    case "FULL": return t("messages.coupon.typeFull");
    case "FREE_SHIPPING": return t("messages.coupon.typeFreeShipping");
    default: return "";
  }
};

/** 券面主文案：面额/折扣/件数 */
function faceValue(tpl: any): string {
  if (tpl?.type === "PERCENT") {
    return t("messages.couponStore.percentOff", { v: (Number(tpl.discountValue) / 10).toFixed(1).replace(/\.0$/, "") });
  }
  if (tpl?.type === "FREE_SHIPPING") return t("messages.coupon.typeFreeShipping");
  return `¥${couponYuan(Number(tpl?.discountValue ?? 0))}`;
}
/** 使用条件：满 X 可用 / 无门槛 */
const conditionText = (tpl: any): string =>
  Number(tpl?.minSpend ?? 0) > 0
    ? t("messages.coupon.minSpend", { n: couponYuan(Number(tpl.minSpend)) })
    : t("messages.coupon.noThreshold");

async function load() {
  try {
    activity.value = await getCouponDailyClaimActivity();
  } catch {
    activity.value = null; // 查询失败按无活动处理，不阻塞券店浏览
  }
}

async function goLogin() {
  const providers = await fetchProviders();
  const provider = providers[0];
  if (provider) {
    loginWithSso(provider, { returnUrl: route.fullPath });
  } else {
    toast.add({ title: t("messages.couponStore.fissionLoginUnavailable"), color: "error" });
  }
}

async function claim(tplId: string | number) {
  if (!isAuthenticated.value) {
    await goLogin();
    return;
  }
  if (claimingId.value) return;
  claimingId.value = String(tplId);
  try {
    const res = await claimDailyCoupon(String(tplId));
    switch (res.status) {
      case "OK":
        toast.add({ title: t("messages.couponStore.dailyClaimOk"), color: "success" });
        await load(); // 刷新 claimedToday 态
        break;
      case "ALREADY_CLAIMED":
        toast.add({ title: t("messages.couponStore.dailyClaimedAlready"), color: "neutral" });
        await load();
        break;
      case "SOLD_OUT":
        toast.add({ title: t("messages.couponStore.dailySoldOut"), color: "warning" });
        await load();
        break;
      case "PER_USER_LIMIT":
        toast.add({ title: t("messages.couponStore.reasonPerUserLimit"), color: "warning" });
        break;
      case "MEMBER_LEVEL_BLOCKED":
        toast.add({ title: t("messages.couponStore.memberLevelBlocked"), color: "warning" });
        break;
      case "NOT_STARTED":
      case "ENDED":
      case "INACTIVE":
      case "NOT_IN_ACTIVITY":
        toast.add({ title: t("messages.couponStore.activityUnavailable"), color: "warning" });
        await load();
        break;
      case "NOT_LOGGED_IN":
        await goLogin();
        break;
      default:
        toast.add({ title: t("messages.couponList.opFailed"), color: "error" });
    }
  } catch {
    toast.add({ title: t("messages.couponList.opFailed"), color: "error" });
  } finally {
    claimingId.value = null;
  }
}

onMounted(load);
</script>

<template>
  <div v-if="activity" class="daily" data-testid="daily-claim-card">
    <div class="head">
      <div class="txt">
        <div class="name">{{ activity.name }}</div>
        <div v-if="activity.subtitle" class="subtitle">{{ activity.subtitle }}</div>
      </div>
    </div>
    <div class="chips">
      <div v-for="item in activity.items" :key="item.template.id" class="chip" data-testid="daily-claim-chip">
        <div class="val">{{ faceValue(item.template) }}</div>
        <div class="cond">{{ typeLabel(item.template) }} · {{ conditionText(item.template) }}</div>
        <button
          v-if="!item.claimedToday && !item.soldOut"
          class="btn" data-testid="daily-claim-btn"
          :disabled="claimingId === String(item.template.id)"
          @click="claim(item.template.id)"
        >{{ t("messages.couponStore.dailyClaim") }}</button>
        <button v-else class="btn off" disabled>
          {{ item.soldOut ? t("messages.couponStore.dailySoldOut") : t("messages.couponStore.dailyClaimed") }}
        </button>
      </div>
    </div>
    <div v-if="activity.rules" class="rules">{{ activity.rules }}</div>
  </div>
</template>

<style scoped>
.daily { border-radius: 12px; background: var(--ui-primary); color: #fff; padding: 12px 14px; margin-bottom: 12px; }
.head { display: flex; align-items: center; justify-content: space-between; }
.name { font-size: 15px; font-weight: 700; }
.subtitle { margin-top: 2px; font-size: 12px; opacity: .85; }
.chips { display: flex; gap: 8px; margin-top: 10px; overflow-x: auto; scrollbar-width: none; }
.chips::-webkit-scrollbar { display: none; }
.chip { flex: 1 0 96px; max-width: 140px; border-radius: 10px; background: rgb(255 255 255 / .14); padding: 10px 8px; text-align: center; }
.val { font-size: 18px; font-weight: 800; }
.cond { margin: 4px 0 8px; font-size: 10px; opacity: .85; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.btn { display: block; width: 100%; border: 0; border-radius: 999px; background: #fff; color: var(--ui-primary); font-size: 12px; font-weight: 700; padding: 5px 0; cursor: pointer; }
.btn.off { background: rgb(0 0 0 / .22); color: rgb(255 255 255 / .75); cursor: default; }
.rules { margin-top: 8px; font-size: 11px; opacity: .8; }
</style>
