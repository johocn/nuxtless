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
  () => props.inviteCode || authStore.session?.user?.inviteCode || (route.query.invite as string) || "",
);

// 微信按分享「链接 URL」在服务端/客户端缓存整张分享卡（标题+描述+图一体，TTL 很长），
// 清 App 缓存清不掉这张卡。首次绑卡若图未就绪会固化成 logo，此后同一链接持续吐旧卡。
// 故 JS-SDK 分享卡链接追加每次唯一参数 _st=now：微信把每次分享当「新链接」重新抓卡，破除旧卡缓存。
// 页面展示/复制仍用干净 URL：baseShareUrl（只带 invite，不含 _st）。
const shareNonce = ref<number | null>(null);
if (import.meta.client) shareNonce.value = Date.now();

const baseShareUrl = computed(() => {
  const path = route.fullPath.split("?")[0];
  const q = new URLSearchParams(route.query as Record<string, string>);
  if (inviteCode.value) q.set("invite", inviteCode.value);
  const qs = q.toString();
  return `${window.location.origin}${path}${qs ? `?${qs}` : ""}`;
});

// 分享卡链接（带破缓存 _st）
const shareUrl = computed(() => {
  const q = new URLSearchParams(shareNonce.value ? { _st: String(shareNonce.value) } : undefined);
  return q.toString() ? `${baseShareUrl.value}${baseShareUrl.value.includes("?") ? "&" : "?"}${q.toString()}` : baseShareUrl.value;
});

// 渠道级分享配置：Channel.customFields（shareImageUrl/shopName/shopIntro），复用 GetChannelTheme，
// 与商品页同 useAsyncData key → SSR 去重不新增请求。
const { data: channelShareData } = useAsyncData(
  "channel-share-image",
  async () => {
    const res = await useAsyncGql("GetChannelTheme", {}, { server: true });
    return (res.data.value as any)?.activeChannel?.customFields ?? {};
  },
  { server: true },
);
const channelShare = computed<any>(() => channelShareData.value ?? {});
const channelShareImage = computed(() => channelShare.value.shareImageUrl ?? "");
const channelIntro = computed(() => channelShare.value.shopIntro ?? "");
const channelShopName = computed(() => channelShare.value.shopName ?? "");

// 确定性兜底：读 SSR 烘焙进 HTML 的 meta[name="share:image"]（见商品页 shareCardSrc）。
// 该 meta 由 SSR 直接算出商品压缩图 URL 并写入静态 HTML，客户端即时可读，
// 不依赖 hydration/运行时 featuredAsset——规避微信端客户端拿不到 featuredAsset 致 imgUrl 空。
function docShareImage(): string {
  if (import.meta.server || typeof document === "undefined") return "";
  return document.querySelector('meta[name="share:image"]')?.getAttribute("content") ?? "";
}

// 分享卡图 URL 兜底链：SSR 烘焙的商品页 meta（docShareImage，商品图唯一可靠来源，SSR 直达即正确）
// → 页面自传图（props）→ 渠道分享图 → 域名 logo 兜底（保证首页/非商品页/无图商品恒有图）。
// 注意：props 值在微信端 SPA 进入时可能被客户端误算成 logo，故把 docShareImage 置最前优先。
// （SpA 从列表进入的商品页无 SSR meta，客户端又拿不到 featuredAsset，见知识库，需整页 SSR 导航根治。）
const defaultShareImage = () => `${window.location.origin}/share-logo.jpg`;
const shareData = computed(() => ({
  title: props.title || channelShopName.value || document.title,
  desc: props.description || channelIntro.value || t("messages.site.shareDesc"),
  link: shareUrl.value,
  imgUrl: docShareImage() || props.imageUrl || channelShareImage.value || defaultShareImage(),
}));

async function copyLink() {
  try {
    await navigator.clipboard.writeText(baseShareUrl.value);
  } catch {
    /* 剪贴板不可用时仍提示已复制以简化交互 */
  }
  copied.value = true;
  setTimeout(() => (copied.value = false), 1600);
}

async function copyTalk() {
  const talk = `${t("messages.share.talkPrefix")} ${baseShareUrl.value}`;
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

// 微信内且拿到签名 → wx.config 绑定自定义分享卡片；任一环节失败静默降级为「仅复制引导」。
// 关键：商品页的商品图/标题可能晚于 onMounted 就绪（客户端商品数据、渠道配置异步到达），
// 若只在 wx.ready 时推一次，会锁定 JS-SDK 绑定瞬间的兜底值（如域名 logo），转发卡就固化成了 logo。
// 因此 SDK ready 后对 shareData 做响应式重推：商品图一旦就绪，卡片立即换成商品自己的图。
const sdkReady = ref(false);
let wxApi: any = null;
function pushCard() {
  if (!sdkReady.value || !wxApi) return;
  wxApi.updateAppMessageShareData(shareData.value);
  wxApi.updateTimelineShareData({
    title: shareData.value.title,
    link: shareData.value.link,
    imgUrl: shareData.value.imgUrl,
  });
}
watch(shareData, pushCard);

// 等待分享图就绪：微信在 wx.config/ready 绑定瞬间即固化分享卡（标题+描述+图一体），
// 绑定后再 updateAppMessageShareData 重推在真机上不可靠。因此第一次 wx.ready 就必须已
// 持有分享图，否则会固化成空图/默认 logo。
// 商品图（props.imageUrl）与渠道分享图（channelShareImage）都算就绪的判定对象。
// 另有 SSR 烘焙的 meta 图（docShareImage）——静态 HTML 即时可得，作为微信端客户端拿不到
// featuredAsset 时的确定性来源。任一就绪即可绑卡。上限设 20s 避免极端无图场景永不绑卡。
function waitForShareImageReady(): Promise<void> {
  return new Promise((resolve) => {
    const got = () => props.imageUrl || channelShareImage.value || docShareImage();
    if (got()) return resolve();
    const start = Date.now();
    const timer = setInterval(() => {
      if (got() || Date.now() - start > 20000) {
        clearInterval(timer);
        resolve();
      }
    }, 100);
  });
}

async function bindShare() {
  try {
    const sigUrl = window.location.href.split("#")[0] || "";
    const sig = await fetchJssdkSignature(sigUrl);
    if (!sig?.signature) return;
    await loadWechatSdk();
    // 等分享图就绪再 wx.config/ready，确保第一次绑卡即用商品图（消除早期空图快照竞态），
    // 转发卡在绑定瞬间固化，此时无图会固化成默认图。
    await waitForShareImageReady();
    const wx = (window as any).wx;
    wx.config({
      debug: false,
      appId: sig.appId,
      timestamp: sig.timestamp,
      nonceStr: sig.nonceStr,
      signature: sig.signature,
      jsApiList: ["updateAppMessageShareData", "updateTimelineShareData"],
    });
    wx.ready(() => {
      wxApi = wx;
      sdkReady.value = true;
      pushCard();
    });
    wx.error(() => {
      /* 签名失败静默降级为仅复制引导 */
    });
  } catch {
    /* 任一环节异常静默降级 */
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
      color="neutral"
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
            :value="baseShareUrl"
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