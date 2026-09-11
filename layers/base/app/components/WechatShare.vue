<script setup lang="ts">
import { isWechatBrowser, useSso } from "../composables/useSso";

// 通用分享组件：页内按钮 + 复制链接/话术 + 微信内 JS-SDK 自定义分享卡片（静默降级）。
// shareUrl 始终拼接 ?invite=<当前用户邀请码|页面已带邀请码>，保证转发带码。
const props = withDefaults(
  defineProps<{
    title?: string;
    description?: string;
    imageUrl?: string;
    inviteCode?: string;
  }>(),
  { title: "", description: "", imageUrl: "", inviteCode: "" },
);

const { t } = useI18n();
const route = useRoute();
const authStore = useAuthStore();
const { fetchJssdkSignature } = useSso();

const open = ref(false);
const copied = ref(false);
const copyLabel = computed(() => t(copied.value ? "messages.share.copied" : "messages.share.copyLink"));

// 邀请码优先级：显式 props（页面传入登录用户码）> 会话用户邀请码 > 当前 URL 已带 invite
const inviteCode = computed(
  () => props.inviteCode || authStore.user?.inviteCode || (route.query.invite as string) || "",
);

const shareUrl = computed(() => {
  const path = route.fullPath.split("?")[0];
  const q = new URLSearchParams(route.query as Record<string, string>);
  if (inviteCode.value) q.set("invite", inviteCode.value);
  const qs = q.toString();
  return `${window.location.origin}${path}${qs ? `?${qs}` : ""}`;
});

const shareData = computed(() => ({
  title: props.title || document.title,
  desc: props.description || t("messages.share.inviteTip"),
  link: shareUrl.value,
  imgUrl: props.imageUrl || "",
}));

async function copyLink() {
  try {
    await navigator.clipboard.writeText(shareUrl.value);
  } catch {
    /* 剪贴板不可用时仍提示已复制以简化交互 */
  }
  copied.value = true;
  setTimeout(() => (copied.value = false), 1600);
}

async function copyTalk() {
  const talk = `${t("messages.share.talkPrefix")} ${shareUrl.value}`;
  try {
    await navigator.clipboard.writeText(talk);
  } catch {
    /* ignore */
  }
  copied.value = true;
  setTimeout(() => (copied.value = false), 1600);
}

function loadWechatSdk(): Promise<void> {
  return new Promise((resolve, reject) => {
    if ((window as any).wx?.config) return resolve();
    const s = document.createElement("script");
    s.src = "//res.wx.qq.com/open/js/jweixin-1.6.0.js";
    s.onload = () => resolve();
    s.onerror = () => reject(new Error("load wx sdk fail"));
    document.head.appendChild(s);
  });
}

// 微信内且拿到签名 → wx.config 绑定自定义分享卡片；任一环节失败静默降级为「仅复制引导」
async function bindShare() {
  try {
    const sig = await fetchJssdkSignature(window.location.href.split("#")[0]);
    if (!sig?.signature) return;
    await loadWechatSdk();
    const wx = (window as any).wx;
    wx.config({
      appId: sig.appId,
      timestamp: sig.timestamp,
      nonceStr: sig.nonceStr,
      signature: sig.signature,
      jsApiList: ["updateAppMessageShareData", "updateTimelineShareData"],
    });
    wx.ready(() => {
      wx.updateAppMessageShareData(shareData.value);
      wx.updateTimelineShareData({
        title: shareData.value.title,
        link: shareData.value.link,
        imgUrl: shareData.value.imgUrl,
      });
    });
    wx.error(() => {});
  } catch {
    /* 静默降级 */
  }
}

onMounted(() => {
  if (isWechatBrowser()) void bindShare();
});
</script>

<template>
  <div>
    <!-- 页内分享触发按钮 -->
    <UButton
      color="gray"
      variant="soft"
      :icon="open ? 'i-lucide-x' : 'i-lucide-share-2'"
      class="fixed bottom-[92px] right-3 z-[70] h-11 w-11 !rounded-full !p-0 shadow-md"
      :aria-label="t('messages.share.title')"
      @click="open = !open"
    />

    <!-- 分享浮层 bottom sheet -->
    <div
      v-if="open"
      class="fixed inset-x-0 bottom-0 z-[80] flex justify-center"
      @click.self="open = false"
    >
      <div class="w-full max-w-md rounded-t-2xl bg-white p-5 pb-8 shadow-2xl">
        <div class="mb-1 text-base font-bold text-gray-900">{{ t("messages.share.title") }}</div>
        <div class="rounded-lg bg-amber-50 px-3 py-2.5 text-xs leading-relaxed text-amber-700">
          {{ t("messages.share.openingTip") }}
          <br />
          {{ t("messages.share.inviteTip") }}
        </div>
        <div class="mt-3 flex items-center gap-2">
          <input
            :value="shareUrl"
            readonly
            class="min-w-0 flex-1 rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-xs text-gray-500"
          />
          <UButton color="primary" size="sm" @click="copyLink">{{ copyLabel }}</UButton>
        </div>
        <UButton color="secondary" variant="outline" size="sm" block class="mt-2" @click="copyTalk">
          {{ t("messages.share.copyTalk") }}
        </UButton>
      </div>
    </div>
  </div>
</template>