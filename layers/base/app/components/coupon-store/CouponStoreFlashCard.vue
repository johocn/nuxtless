<script setup lang="ts">
import {
  getCouponFlashSaleActivity,
  claimFlashCoupon,
  type CouponFlashSaleActivityView,
} from "../../composables/useCoupon";
import { couponYuan } from "../../utils/coupon";

/**
 * 券店神券日楼层（FR-F2，方案 A 首页内嵌）：
 * - 匿名可查进行中场次（后端服务端时钟判定窗口；无场次为 null 不渲染）。
 * - 走秒倒计时到 endsAt 自动摘除（endTick）。
 * - 每券限量进度条（claimedCount/totalCount）+ 抢券按钮；场次内每人每券 perUserLimit 张。
 * - 未登录点击 → 引导 SSO 登录；后端 status 映射文案（B1 时间窗硬拦、B3 场次限抢、B2 原子限量）。
 */
const { t, locale } = useI18n();
const toast = useToast();
const { isAuthenticated } = storeToRefs(useAuthStore());
const localePath = useTenantLocalePath();
const { fetchProviders, loginWithSso } = useSso();
const route = useRoute();

const activity = ref<CouponFlashSaleActivityView | null>(null);
const claimingId = ref<string | null>(null);

/* ---- 走秒倒计时（到点自动摘除） ---- */
const remainMs = ref(0);
let timer: ReturnType<typeof setInterval> | null = null;
function tick() {
  if (!activity.value) return;
  remainMs.value = Math.max(0, new Date(activity.value.endsAt).getTime() - Date.now());
  if (remainMs.value <= 0) {
    activity.value = null;
    stopTimer();
  }
}
function stopTimer() {
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
}
const countdownText = computed(() => {
  const s = Math.floor(remainMs.value / 1000);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(Math.floor(s / 3600))}:${pad(Math.floor((s % 3600) / 60))}:${pad(s % 60)}`;
});

const typeLabel = (tpl: any): string => {
  switch (tpl?.type) {
    case "FIXED": return t("messages.coupon.typeFixed");
    case "PERCENT": return t("messages.coupon.typePercent");
    case "FULL": return t("messages.coupon.typeFull");
    case "FREE_SHIPPING": return t("messages.coupon.typeFreeShipping");
    default: return "";
  }
};
function faceValue(tpl: any): string {
  if (tpl?.type === "PERCENT") {
    return t("messages.couponStore.percentOff", { v: (Number(tpl.discountValue) / 10).toFixed(1).replace(/\.0$/, "") });
  }
  if (tpl?.type === "FREE_SHIPPING") return t("messages.coupon.typeFreeShipping");
  return `¥${couponYuan(Number(tpl?.discountValue ?? 0))}`;
}
/** 限量进度：已领/总量（totalCount=0 为不限量，进度满格不显示） */
function progressOf(item: { template: any }): { pct: number; text: string } {
  const total = Number(item.template?.totalCount ?? 0);
  const claimed = Number(item.template?.claimedCount ?? 0);
  if (total <= 0) return { pct: 0, text: "" };
  return { pct: Math.min(100, Math.round((claimed / total) * 100)), text: t("messages.couponStore.flashProgress", { claimed, total }) };
}

async function load() {
  try {
    activity.value = await getCouponFlashSaleActivity();
    if (activity.value) {
      tick();
      stopTimer();
      timer = setInterval(tick, 1000);
    }
  } catch {
    activity.value = null; // 查询失败按无场次处理，不阻塞券店浏览
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

async function grab(tplId: string | number) {
  if (!isAuthenticated.value) {
    await goLogin();
    return;
  }
  if (claimingId.value) return;
  claimingId.value = String(tplId);
  try {
    const res = await claimFlashCoupon(String(tplId));
    switch (res.status) {
      case "OK":
        toast.add({ title: t("messages.couponStore.flashGrabOk"), color: "success" });
        await load(); // 刷新进度与我已抢数
        break;
      case "SOLD_OUT":
        toast.add({ title: t("messages.couponStore.flashSoldOut"), color: "warning" });
        await load();
        break;
      case "PER_USER_LIMIT":
        toast.add({ title: t("messages.couponStore.flashPerUserLimit"), color: "warning" });
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
onBeforeUnmount(stopTimer);
</script>

<template>
  <div v-if="activity" class="flash" data-testid="flash-card">
    <div class="head">
      <span class="tag">{{ activity.name }}</span>
      <span class="cd" data-testid="flash-countdown">{{ countdownText }}</span>
    </div>
    <div v-if="activity.subtitle" class="subtitle">{{ activity.subtitle }}</div>
    <div v-for="item in activity.items" :key="item.template.id" class="row" data-testid="flash-item">
      <div class="face">
        <span class="val">{{ faceValue(item.template) }}</span>
        <span class="cond">{{ typeLabel(item.template) }}</span>
      </div>
      <div class="mid">
        <div class="pname">{{ item.template.name }}</div>
        <div v-if="progressOf(item).text" class="pbar">
          <div class="pbar-in" :style="{ width: `${progressOf(item).pct}%` }"></div>
        </div>
        <div v-if="progressOf(item).text" class="ppct">{{ progressOf(item).text }}</div>
      </div>
      <button
        v-if="!item.soldOut && item.myClaimed < activity.perUserLimit"
        class="grab" data-testid="flash-grab"
        :disabled="claimingId === String(item.template.id)"
        @click="grab(item.template.id)"
      >{{ t("messages.couponStore.flashGrab") }}</button>
      <button v-else class="grab off" disabled>
        {{ item.soldOut ? t("messages.couponStore.flashSoldOut") : t("messages.couponStore.flashGrabbed") }}
      </button>
    </div>
    <div v-if="activity.rules" class="rules">{{ activity.rules }}</div>
  </div>
</template>

<style scoped>
.flash { border-radius: 12px; border: 1.5px solid var(--ui-primary); background: var(--ui-bg); padding: 12px 14px; margin-bottom: 12px; }
.head { display: flex; align-items: center; gap: 8px; }
.tag { border-radius: 999px; background: var(--ui-primary); color: #fff; font-size: 12px; font-weight: 700; padding: 3px 10px; }
.cd { margin-left: auto; font-variant-numeric: tabular-nums; color: var(--ui-primary); font-size: 14px; font-weight: 800; }
.subtitle { margin-top: 6px; font-size: 12px; color: var(--ui-text-muted); }
.row { display: flex; align-items: center; gap: 10px; margin-top: 10px; }
.face { flex: none; width: 84px; text-align: center; border-radius: 10px; background: color-mix(in srgb, var(--ui-primary) 10%, transparent); padding: 8px 4px; }
.val { display: block; color: var(--ui-primary); font-size: 17px; font-weight: 800; }
.cond { display: block; margin-top: 2px; font-size: 10px; color: var(--ui-text-muted); }
.mid { flex: 1; min-width: 0; }
.pname { font-size: 13px; font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.pbar { height: 6px; border-radius: 999px; background: var(--ui-bg-accented); overflow: hidden; margin-top: 6px; }
.pbar-in { height: 100%; border-radius: 999px; background: var(--ui-primary); }
.ppct { margin-top: 3px; font-size: 10px; color: var(--ui-text-muted); }
.grab { flex: none; width: 76px; border: 0; border-radius: 999px; background: var(--ui-primary); color: #fff; font-size: 12px; font-weight: 700; padding: 8px 0; cursor: pointer; }
.grab.off { background: var(--ui-bg-accented); color: var(--ui-text-muted); cursor: default; }
.rules { margin-top: 10px; font-size: 11px; color: var(--ui-text-muted); }
</style>
