<script setup lang="ts">
import { getCouponFissionActivity, claimFissionReward, fissionInviteCodeOf, type CouponFissionActivityView } from "../../composables/useCoupon";
import { isWechatBrowser, useSso } from "../../composables/useSso";
import { localizeText } from "../../utils/detail-config";

/**
 * 券店分享裂变条（FR-C）：匿名可查活动视图（后端服务端时间窗判定）。
 * - 活动横幅：名称/副标题/双方奖励摘要/规则。
 * - 带 ?invite= 进入：未登录 → 一键登录（returnUrl 保留 invite 穿透登录）；已登录 → 自动领奖（幂等，后端 R3）。
 * - 「分享得券」：微信环境引导右上角转发（分享卡由 WechatShare 自动带 ?invite=）；其他环境复制链接。
 * 后端四例外（未登录/自分享/已领/限新客/售罄/下线）各有明确 status，前端只映射文案。
 */
const route = useRoute();
const { t, locale } = useI18n();
const toast = useToast();
const authStore = useAuthStore();
const { isAuthenticated } = storeToRefs(authStore);
const localePath = useTenantLocalePath();
const { fetchProviders, loginWithSso } = useSso();

const activity = ref<CouponFissionActivityView | null>(null);
const claimStatus = ref<string>("");
const claiming = ref(false);
/** 本次会话已自动领过（避免页面回退重复弹 toast；后端本就幂等） */
const claimedThisSession = ref(false);

const inviteFromQuery = computed(() => String(route.query.invite ?? "").trim());

const nameOf = (tpl: any) => String(localizeText(tpl?.name, locale.value) ?? "");
/** 奖励摘要：被分享者得 X；分享者另得 Y（可选） */
const rewardSummary = computed(() => {
  const a = activity.value;
  if (!a) return "";
  const invitee = nameOf(a.inviteeTemplate);
  const inviter = a.inviterTemplate ? nameOf(a.inviterTemplate) : null;
  return inviter
    ? t("messages.couponStore.fissionRewardBoth", { invitee, inviter })
    : t("messages.couponStore.fissionRewardInvitee", { invitee });
});

const statusText = computed(() => {
  switch (claimStatus.value) {
    case "OK": return t("messages.couponStore.fissionClaimedOk");
    case "ALREADY_REWARDED": return t("messages.couponStore.fissionClaimedAlready");
    case "SELF_SHARE": return t("messages.couponStore.fissionSelfShare");
    case "BLOCKED_NEW_CUSTOMER": return t("messages.couponStore.fissionNewCustomerOnly");
    case "SOLD_OUT": return t("messages.couponStore.fissionSoldOut");
    case "NOT_LOGGED_IN": return "";
    default: return "";
  }
});
/** 领奖成功/已领过 → 绿色成功态；其余例外 → 灰色提示态 */
const statusOk = computed(() => claimStatus.value === "OK" || claimStatus.value === "ALREADY_REWARDED");

async function loadActivity() {
  try {
    activity.value = await getCouponFissionActivity();
  } catch {
    activity.value = null; // 查询失败按无活动处理，不阻塞券店浏览
  }
}

async function goLogin() {
  const providers = await fetchProviders();
  const provider = providers[0];
  if (provider) {
    loginWithSso(provider, { inviteCode: inviteFromQuery.value, returnUrl: route.fullPath });
  } else {
    toast.add({ title: t("messages.couponStore.fissionLoginUnavailable"), color: "error" });
  }
}

/** 自动领奖（登录 + 带 invite 进入）。后端幂等，重复调用返回 ALREADY_REWARDED。 */
async function autoClaim() {
  if (claiming.value || claimedThisSession.value || !inviteFromQuery.value || !isAuthenticated.value) return;
  claiming.value = true;
  try {
    const res = await claimFissionReward(inviteFromQuery.value);
    claimStatus.value = res.status;
    claimedThisSession.value = true;
    if (res.status === "OK") {
      toast.add({ title: t("messages.couponStore.fissionClaimedToast"), color: "success" });
    }
  } catch {
    // 网络/服务异常：静默，用户可刷新重试（发放可重试不阻断浏览）
  } finally {
    claiming.value = false;
  }
}

/** 分享入口：微信引导转发；其他环境复制带 invite 的链接 */
async function shareNow() {
  if (!isAuthenticated.value) {
    await goLogin();
    return;
  }
  if (isWechatBrowser()) {
    toast.add({ title: t("messages.couponStore.fissionShareWechatHint"), color: "primary" });
    return;
  }
  // 个人邀请码 = 可逆码 F<base36(customerId)>（后端解码定位分享者；customFields.inviteCode 是被邀请快照，非个人码）
  const myInvite = fissionInviteCodeOf((authStore.session as any)?.user);
  const base = `${window.location.origin}${localePath("/")}`;
  const link = myInvite ? `${base}?invite=${encodeURIComponent(myInvite)}` : base;
  try {
    await navigator.clipboard.writeText(link);
    toast.add({ title: t("messages.couponStore.fissionLinkCopied"), color: "success" });
  } catch {
    toast.add({ title: link, color: "neutral" });
  }
}

onMounted(loadActivity);
watch([isAuthenticated, inviteFromQuery], () => autoClaim(), { immediate: false });
onMounted(() => autoClaim());
</script>

<template>
  <div v-if="activity" class="fission" data-testid="fission-bar">
    <div class="head">
      <div class="txt">
        <div class="name">{{ activity.name }}</div>
        <div class="reward">{{ rewardSummary }}</div>
      </div>
      <button class="share-btn" data-testid="fission-share" @click="shareNow">
        {{ isAuthenticated ? t("messages.couponStore.fissionShare") : t("messages.couponStore.fissionLogin") }}
      </button>
    </div>
    <div v-if="activity.subtitle" class="subtitle">{{ activity.subtitle }}</div>
    <div v-if="statusText" class="status" :class="{ ok: statusOk }" data-testid="fission-status">{{ statusText }}</div>
    <div v-if="activity.rules" class="rules">{{ activity.rules }}</div>
  </div>
</template>

<style scoped>
.fission { border-radius: 12px; background: linear-gradient(120deg, #7c3aed, #db2777); color: #fff; padding: 12px 14px; margin-bottom: 12px; }
.head { display: flex; align-items: center; justify-content: space-between; gap: 10px; }
.txt { min-width: 0; }
.name { font-size: 15px; font-weight: 700; }
.reward { margin-top: 2px; font-size: 12px; opacity: .9; }
.share-btn { flex: none; border-radius: 999px; background: rgb(255 255 255 / .95); color: #db2777; font-size: 12px; font-weight: 700; padding: 7px 14px; cursor: pointer; }
.subtitle { margin-top: 6px; font-size: 12px; opacity: .85; }
.status { margin-top: 8px; border-radius: 8px; background: rgb(0 0 0 / .18); padding: 7px 10px; font-size: 12px; }
.status.ok { background: rgb(255 255 255 / .22); font-weight: 600; }
.rules { margin-top: 8px; font-size: 11px; opacity: .8; }
</style>
