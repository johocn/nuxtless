<script setup lang="ts">
import { getCouponSaleCatalogue } from "~~/layers/base/app/composables/useCoupon";
import {
  saleCardProgress,
  formatCouponDiscount,
  couponSavingsExample,
  couponSceneArt,
  couponAnchorYuan,
  couponPromoPrice,
  hasDetail,
  parseDetailParagraphs,
  detailAssetUrl,
} from "../../utils/coupon-mall";
import { couponYuan, couponTemplateMap, couponBundleItems } from "../../utils/coupon";

/**
 * 独立券详情页（版式 A 大图沉浸式，券店模式访问 /t1/coupon/[id]）：
 * 数字 id = 单券模板，b 前缀（如 b2）= 券包。内容与详情弹层（DetailSheet）同源，
 * 供微信分享卡 / 到店物料二维码直达。目录经 resolveClient 显式带租户 token（SSR 可用，匿名可读）。
 */
definePageMeta({ title: "messages.couponDetail.title" });

const route = useRoute();
const { t, locale } = useI18n();
const localePath = useTenantLocalePath();
const pageOrigin = useRequestURL().origin;
const { isAuthenticated } = storeToRefs(useAuthStore());

const rawId = computed(() => String(route.params.id ?? ""));
const isBundle = computed(() => /^b/i.test(rawId.value));
const targetId = computed(() => rawId.value.replace(/^b/i, ""));

// 目录查询：useAsyncData 同 key 在 SSR/客户端复用；失败（如后端异常）走错误态。
// 后端 scene 为过滤语义（券模板 usageScene 需命中查询场景，无"不过滤"选项），
// 详情页需按 id 直达任意可售券 → 双场景查询合并（券包不受 scene 影响，取其一即可）
const {
  data: catalogue,
  error: loadError,
  refresh,
} = await useAsyncData("coupon-detail-catalogue", async () => {
  try {
    const [online, inStore] = await Promise.all([
      getCouponSaleCatalogue("ONLINE"),
      getCouponSaleCatalogue("IN_STORE"),
    ]);
    if (!online && !inStore) throw createError({ statusCode: 502, message: "catalogue unavailable" });
    const base = online ?? inStore;
    const seen = new Set<number>();
    const templates = [...(online?.templates ?? []), ...(inStore?.templates ?? [])].filter((x: any) => {
      const id = Number(x.id);
      if (seen.has(id)) return false;
      seen.add(id);
      return true;
    });
    return { ...base, templates };
  } catch (e: any) {
    if (import.meta.server) {
      console.error("[coupon-detail] catalogue failed:", e?.message ?? e, "| cause:", e?.cause?.message ?? e?.cause ?? "");
    }
    throw e;
  }
});

const tpl = computed(() =>
  isBundle.value
    ? null
    : (catalogue.value?.templates ?? []).find((x: any) => String(x.id) === targetId.value) ?? null,
);
const bundle = computed(() =>
  isBundle.value
    ? (catalogue.value?.bundles ?? []).find((x: any) => String(x.id) === targetId.value) ?? null
    : null,
);
/** 展示主体：单券或券包（券包仅取名称/包价/已售等公共字段参与展示） */
const target = computed<Record<string, any> | null>(() => tpl.value ?? bundle.value ?? null);
const needLogin = computed(() => !!loadError.value && !isAuthenticated.value);
const notFound = computed(() => !loadError.value && !!catalogue.value && !target.value);

// ── 首购立减/学生价上下文（后端按登录态计算；匿名 firstBuyEligible=null 按新客展示引导） ──
const promoCtx = computed(() => ({
  firstBuyDiscount: catalogue.value?.firstBuyDiscount ?? 0,
  firstBuyEligible: catalogue.value?.firstBuyEligible ?? null,
  studentApproved: catalogue.value?.studentApproved ?? null,
}));

// ── 展示值（与 DetailSheet/CouponStoreCouponCard 同口径） ──
const name = computed(() => (target.value ? String(localizeText(target.value.name as never, locale.value) ?? "") : ""));
const scene = computed(() => couponSceneArt(name.value));
const dealText = computed(() => {
  if (isBundle.value || !tpl.value) return "";
  const d = formatCouponDiscount(tpl.value);
  if (d.kind === "percent") {
    return t("messages.couponStore.percentOff", {
      v: d.percent,
      s: Math.max(0, 100 - Number(tpl.value.discountValue ?? 0)),
    });
  }
  return `¥${d.amount}`;
});
const savings = computed(() => (tpl.value ? couponSavingsExample(tpl.value) : null));
/** 划线锚定价（仅当高于售价时展示） */
const anchor = computed(() => (tpl.value ? couponAnchorYuan(tpl.value) : null));
/** 首购/学生优惠（券包仅首购路径，与 DetailSheet 同口径）；null=原价 */
const promo = computed(() => {
  if (!target.value) return null;
  return isBundle.value
    ? couponPromoPrice({ salePrice: target.value.salePrice }, promoCtx.value)
    : couponPromoPrice(tpl.value, promoCtx.value);
});
const baseFen = computed(() => Number(target.value?.salePrice ?? 0));
const displayPrice = computed(() => promo.value?.yuan ?? couponYuan(baseFen.value));
const promoLabel = computed(() =>
  promo.value
    ? promo.value.kind === "student"
      ? t("messages.couponStore.studentTag")
      : t("messages.couponStore.firstBuyTag")
    : "",
);
/** 明细优惠行金额（分） */
const promoOffFen = computed(() =>
  promo.value ? baseFen.value - Math.round(Number(promo.value.yuan) * 100) : 0,
);
const marketingLabel = computed(() => String(target.value?.label ?? "").trim());
const soldCount = computed(() => Math.max(0, Number(target.value?.soldCount ?? 0)));
const soldOut = computed(() => (tpl.value ? saleCardProgress(tpl.value).soldOut : false));
const limitPercent = computed(() => (tpl.value ? saleCardProgress(tpl.value).percent ?? 0 : 0));
/** 未认证学生引导：券有学生价且当前非认证通过 */
const studentGuide = computed(
  () => !!tpl.value && Number(tpl.value.studentPrice ?? 0) > 0 && promoCtx.value.studentApproved !== true,
);
/** 限量券剩余张数；不限量为 null */
const remain = computed(() => {
  if (!tpl.value) return null;
  const total = Number(tpl.value.totalCount ?? 0);
  if (!(total > 0)) return null;
  return Math.max(0, total - Number(tpl.value.claimedCount ?? 0));
});

// ── 图文介绍（与 DetailSheet 同源解析） ──
const paragraphs = computed(() => {
  const desc = target.value?.description;
  if (!hasDetail(desc, locale.value)) return [];
  const raw = localizeText(desc as never, locale.value) as string;
  return parseDetailParagraphs(raw);
});
const introImageFailed = ref(false);
const scopeAll = computed(() => (target.value?.scope ?? "ALL") === "ALL");
const bundleItems = computed(() =>
  bundle.value
    ? couponBundleItems(bundle.value as never, couponTemplateMap(catalogue.value?.templates ?? [])).map(
        (it: any) => ({
          ...it,
          // PERCENT 券 discountValue 是折扣值非面额：与 BundleCard 同口径语义化（「8折」），禁止渲染成 ¥0.80
          valueText: (() => {
            if (!it.template) return "—";
            const d = formatCouponDiscount(it.template);
            if (d.kind === "percent") {
              return t("messages.couponStore.percentOff", {
                v: d.percent,
                s: Math.max(0, 100 - Number(it.template.discountValue ?? 0)),
              });
            }
            if (d.kind === "amount") return `¥${d.amount}`;
            return `¥${couponYuan(it.template.discountValue)}`;
          })(),
        }),
      )
    : [],
);
const flowSteps = computed(() =>
  target.value?.usageScene === "IN_STORE" || bundle.value
    ? [
        t("messages.couponStore.flowStep1"),
        t("messages.couponStore.flowStep2"),
        t("messages.couponStore.flowStep3"),
      ]
    : [],
);

// ── 购买链路（复用券店/券商城共享流程） ──
const {
  buyingId, paying, paySheetOpen, payMode, buyName, buyAmount,
  startBuy, confirmPay, closePaySheet,
} = useCouponSaleFlow();
const buying = computed(() => buyingId.value === targetId.value);
function buy() {
  const item = target.value;
  if (!item || buying.value || soldOut.value) return;
  startBuy(item, isBundle.value ? "bundle" : "template");
}

// ── 立即使用（FR-A1）：已登录且持该模板未用券 → 券码页到店动线 ──
const ownedCoupon = ref<{ code: string; expiredAt?: string | null } | null>(null);
let ownedLoaded = false;
/** 登录态就绪时机不定（me 异步初始化）：watch 立即 + 变化，就绪后拉一次持券列表 */
async function loadOwned() {
  if (ownedLoaded || !isAuthenticated.value || isBundle.value) return;
  ownedLoaded = true;
  try {
    const { getMyCoupons } = await import("~~/layers/base/app/composables/useCoupon");
    const mine = await getMyCoupons();
    const hit = mine.find((c) => String(c.templateId) === targetId.value && c.status.toUpperCase() === "UNUSED");
    ownedCoupon.value = hit ? { code: hit.code, expiredAt: hit.expiredAt } : null;
  } catch {
    ownedCoupon.value = null;
  }
}
onMounted(() => watch(isAuthenticated, loadOwned, { immediate: true }));
/** 券详情页折扣文案（与券包 goCode 同口径） */
const ownedDiscount = computed(() => {
  if (!tpl.value) return "";
  return tpl.value.type === "PERCENT"
    ? t("messages.coupon.discountPercent", { n: (tpl.value.discountValue ?? 0) / 10 })
    : tpl.value.type === "FIXED"
      ? t("messages.coupon.discountFixed", { n: (tpl.value.discountValue ?? 0) / 100 })
      : "";
});
const showUseNow = computed(() =>
  !!ownedCoupon.value && ["IN_STORE", "ALL"].includes(String(tpl.value?.usageScene ?? "")),
);
function useNow() {
  if (!ownedCoupon.value) return;
  navigateTo({
    path: localePath("/coupon/code"),
    query: {
      code: ownedCoupon.value.code,
      name: name.value,
      expiresAt: ownedCoupon.value.expiredAt || tpl.value?.endsAt || "",
      discount: ownedDiscount.value,
    },
  });
}

// ── 分享/SEO：券无实图 → og:image 走渠道分享图 → 域名 logo 兜底（与商品页兜底链一致） ──
const { i18NBaseUrl } = useRuntimeConfig().public;
const { customFields, loadTheme } = useChannelTheme();
await loadTheme();
// og 卡用渠道分享图原图；JS-SDK 转发卡用压缩图（微信缩略图 iOS≈128KB 上限，
// 渠道原图可能超限，按商品页口径压到 ?w=240&q=50；logo 兜底保持原样）
const shareImage = computed(() => {
  const raw = customFields.value?.shareImageUrl ?? "";
  return raw ? new URL(raw, i18NBaseUrl).toString() : `${i18NBaseUrl}/share-logo.jpg`;
});
const shareCardSrc = computed(() => {
  const raw = customFields.value?.shareImageUrl ?? "";
  if (!raw) return `${i18NBaseUrl}/share-logo.jpg`;
  const u = new URL(raw, i18NBaseUrl);
  u.searchParams.set("w", "240");
  u.searchParams.set("q", "50");
  return u.toString();
});
const shareDesc = computed(() => {
  const first = paragraphs.value.find((p) => p.type === "text")?.content ?? "";
  return String(first).slice(0, 80) || t("messages.couponMall.heroSub");
});
// 浏览器标签/微信默认抓取用券名（definePageMeta 静态标题仅作 layout 兜底），
// og/twitter 卡券名 + 券介绍；share:image SSR 烘焙压缩图（WechatShare docShareImage 直读静态 HTML）
useSeoMeta({
  title: name.value,
  description: shareDesc.value,
  ogTitle: name.value,
  ogDescription: shareDesc.value,
  ogImage: shareImage.value,
  twitterTitle: name.value,
  twitterDescription: shareDesc.value,
  twitterImage: shareImage.value,
});
// JS-SDK 分享图 meta（WechatShare 组件读取）：SSR 烘焙静态值（券分享图按渠道固定）
if (import.meta.server && shareCardSrc.value) {
  useHead({ meta: [{ name: "share:image", content: shareCardSrc.value }] });
}
</script>

<template>
  <main class="mx-auto min-h-[60vh] w-full max-w-md">
    <!-- 加载失败：未登录 → 登录引导；其余 → 重试 -->
    <UCard v-if="needLogin" class="mx-3 mt-10 text-center">
      <p class="text-(--ui-text-muted)">{{ t("messages.coupon.loginRequired") }}</p>
      <UButton class="mt-4" :to="localePath('/account/login')">{{ t("messages.coupon.goLogin") }}</UButton>
    </UCard>
    <UAlert v-else-if="loadError" class="mx-3 mt-10" color="error" variant="soft" :title="t('messages.couponMall.loadFailed')">
      <UButton size="xs" variant="link" @click="refresh()">{{ t("messages.couponMall.retry") }}</UButton>
    </UAlert>
    <UCard v-else-if="notFound" class="mx-3 mt-10 text-center">
      <UIcon name="i-lucide-ticket-x" class="mx-auto h-10 w-10 text-(--ui-text-dimmed)" />
      <p class="mt-3 text-(--ui-text-muted)">{{ t("messages.couponDetail.notFound") }}</p>
      <UButton class="mt-4" :to="localePath('/')">{{ t("messages.couponStore.backHome") }}</UButton>
    </UCard>

    <template v-else-if="target">
      <!-- 头图：高构图场景插画 + 营销标签 + 到店可用/券包 pill -->
      <div class="relative h-44 overflow-hidden">
        <CouponStoreSceneArt :scene="scene" tall />
        <span v-if="marketingLabel" class="mk-tag">{{ marketingLabel }}</span>
        <span class="scene-pill">{{ isBundle ? t("messages.coupon.bundleSub") : t("messages.coupon.storeUsable") }}</span>
      </div>

      <div class="flex flex-col gap-3 px-4 pb-40 pt-3">
        <!-- 名称 + 已售 -->
        <div class="flex items-baseline justify-between gap-2">
          <h1 class="min-w-0 text-base font-semibold leading-snug">{{ name }}</h1>
          <span v-if="soldCount > 0" class="flex-none text-xs text-(--ui-text-muted)">
            {{ t("messages.couponStore.soldCount", { n: soldCount }) }}
          </span>
        </div>

        <!-- 折扣大字 + 算账行（仅单券 PERCENT） -->
        <div v-if="dealText" class="flex items-baseline gap-2">
          <span class="deal">{{ dealText }}</span>
          <span v-if="savings" class="text-xs text-(--ui-text-muted)">
            {{ t("messages.couponStore.savingsLine", { spend: savings.spend, save: savings.save }) }}
          </span>
        </div>

        <!-- 价格行：优惠标签 + 划线价 + 到手价 + 售价 -->
        <div class="flex flex-wrap items-baseline gap-2">
          <span v-if="promo" class="promo-tag" :class="promo.kind">{{ promoLabel }}</span>
          <s v-if="promo" class="text-xs text-(--ui-text-dimmed)">¥{{ couponYuan(baseFen) }}</s>
          <span class="text-xl font-bold text-(--ui-primary)">¥{{ displayPrice }}</span>
          <span v-if="!promo && anchor" class="text-xs text-(--ui-text-muted)">{{ t(isBundle ? "messages.couponDetail.bundlePrice" : "messages.couponStore.basePrice") }}¥{{ couponYuan(baseFen) }}</span>
        </div>

        <!-- 算账条（仅 PERCENT 付费券） -->
        <div v-if="savings" class="calc-strip">
          {{ t("messages.couponStore.calcExample", { spend: savings.spend, save: savings.save, off: dealText }) }}
        </div>

        <!-- 价格明细（有首购/学生优惠时：券价 → 优惠 → 到手） -->
        <div v-if="promo" class="flex flex-col gap-1.5 rounded-xl bg-(--ui-bg-elevated) px-3 py-2.5">
          <div class="flex items-baseline justify-between text-xs">
            <span class="text-(--ui-text-muted)">{{ t(isBundle ? "messages.couponDetail.bundlePrice" : "messages.couponStore.basePrice") }}</span>
            <s>¥{{ couponYuan(baseFen) }}</s>
          </div>
          <div class="flex items-baseline justify-between text-xs">
            <span class="text-(--ui-text-muted)">{{ promoLabel }}</span>
            <span class="promo-off">−¥{{ couponYuan(promoOffFen) }}</span>
          </div>
          <div class="flex items-baseline justify-between text-xs font-semibold">
            <span>{{ t("messages.couponStore.finalPrice") }}</span>
            <span class="text-base font-bold text-(--ui-primary)">¥{{ displayPrice }}</span>
          </div>
        </div>

        <!-- 学生认证引导 -->
        <NuxtLink
          v-if="studentGuide"
          :to="localePath('/coupon/student-verify')"
          class="flex items-center justify-between rounded-xl border border-dashed border-teal-500 bg-teal-50 px-3 py-2 text-xs text-teal-700 dark:bg-teal-950/40 dark:text-teal-300"
        >
          {{ t("messages.couponStore.studentGuide") }} <span>→</span>
        </NuxtLink>

        <!-- 图文介绍 -->
        <template v-if="paragraphs.length">
          <span class="sec">{{ t("messages.couponMall.secIntro") }}</span>
          <div class="flex flex-col gap-1.5">
            <template v-for="(p, i) in paragraphs" :key="i">
              <p v-if="p.type === 'text'" class="text-[13px] leading-relaxed text-(--ui-text-muted)">{{ p.content }}</p>
              <img
                v-else-if="!introImageFailed"
                class="w-full rounded-lg"
                loading="lazy"
                :src="detailAssetUrl(p.content, pageOrigin)"
                :alt="t('messages.couponMall.secIntro')"
                @error="introImageFailed = true"
              >
              <span v-else class="py-3 text-center text-xs text-(--ui-text-dimmed)">{{ t("messages.couponMall.imageFail") }}</span>
            </template>
          </div>
        </template>

        <!-- 适用范围 -->
        <span class="sec">{{ t("messages.couponMall.secScope") }}</span>
        <div class="flex flex-wrap gap-1.5">
          <span class="scope-pill">{{ scopeAll ? t("messages.couponMall.scopeAll") : t("messages.couponMall.scopeLimited") }}</span>
          <span v-if="!isBundle" class="scope-pill">
            {{ tpl?.usageScene === "IN_STORE" ? t("messages.coupon.sceneStore") : t("messages.coupon.sceneOnline") }}
          </span>
          <span v-if="!isBundle && Number(tpl?.minSpend ?? 0) > 0" class="scope-pill">
            {{ t("messages.coupon.minSpend", { n: couponYuan(tpl?.minSpend ?? 0) }) }}
          </span>
          <span v-else-if="!isBundle" class="scope-pill">{{ t("messages.coupon.noThreshold") }}</span>
        </div>

        <!-- 使用信息（有效期/限购/券包内容） + 三步流程，与 DetailSheet 同分区 -->
        <span class="sec">{{ t("messages.couponMall.secUsage") }}</span>
        <div class="flex flex-col gap-1 text-xs text-(--ui-text-muted)">
          <span v-if="!isBundle && tpl?.validDays">{{ t("messages.couponMall.validDays", { d: tpl.validDays }) }}</span>
          <span v-if="!isBundle && tpl?.perUserLimit">{{ t("messages.couponMall.perUserLimit", { n: tpl.perUserLimit }) }}</span>
          <div v-if="isBundle" class="flex flex-wrap gap-1.5">
            <span v-for="it in bundleItems" :key="it.id" class="scope-pill">
              {{ it.template ? `${localizeText(it.template.name, locale)} ${it.valueText}` : "—" }} ×{{ it.quantity }}
            </span>
          </div>
        </div>
        <div v-if="flowSteps.length" class="flow-bar">
          <template v-for="(s, i) in flowSteps" :key="s">
            <span v-if="i" class="text-xs text-(--ui-text-muted)">→</span>
            <span class="flex min-w-0 flex-1 items-center gap-1.5 rounded-lg bg-(--ui-bg-elevated) px-2 py-1.5 text-xs">
              <b class="flex h-4 w-4 flex-none items-center justify-center rounded-full bg-(--ui-primary) text-[10px] text-white">{{ i + 1 }}</b>
              <span class="min-w-0 truncate">{{ s }}</span>
            </span>
          </template>
        </div>

        <!-- 购买须知 -->
        <div class="rounded-lg bg-(--ui-bg-elevated) px-3 py-2 text-xs leading-relaxed text-(--ui-text-muted)">
          <b class="font-semibold text-(--ui-text)">{{ t("messages.couponMall.secNotice") }}：</b>
          {{ t("messages.couponMall.noticeText") }}
        </div>

        <!-- 限量进度（限量券） -->
        <div v-if="remain !== null" class="flex items-center gap-2 text-xs text-(--ui-text-muted)">
          <div class="h-1 min-w-0 flex-1 overflow-hidden rounded-full bg-(--ui-bg-elevated)">
            <div class="h-full rounded-full bg-(--ui-primary)" :style="{ width: limitPercent + '%' }" />
          </div>
          <span class="flex-none">{{ remain === 0 ? t("messages.couponMall.soldOut") : t("messages.couponMall.remaining", { n: remain }) }}</span>
        </div>
      </div>

      <!-- 吸底 CTA：价格 + 立即使用（持未用券）/ 抢购（bottom 对齐 TabBar 预留 pb-18=72px，lg 以上无 TabBar 仍成立） -->
      <div class="cta-bar">
        <div class="flex min-w-0 items-baseline gap-1.5">
          <span v-if="promo" class="promo-tag" :class="promo.kind">{{ promoLabel }}</span>
          <s v-if="promo" class="text-xs text-(--ui-text-dimmed)">¥{{ couponYuan(baseFen) }}</s>
          <span class="text-lg font-extrabold text-(--ui-primary)">¥{{ displayPrice }}</span>
        </div>
        <div class="flex flex-none items-center gap-2">
          <UButton v-if="showUseNow" size="md" class="rounded-full px-5" @click="useNow">
            {{ t("messages.coupon.useNow") }}
          </UButton>
          <UButton size="md" :disabled="soldOut" :loading="buying" class="rounded-full px-6" variant="soft" :class="showUseNow && 'px-4'" @click="buy">
            {{ soldOut ? t("messages.couponMall.soldOut") : t("messages.couponMall.buyNow") }}
          </UButton>
        </div>
      </div>

      <CouponPaySheet
        v-if="paySheetOpen"
        v-model="payMode"
        :name="buyName"
        :amount="buyAmount"
        :paying="paying"
        @confirm="confirmPay"
        @close="closePaySheet"
      />

      <!-- 微信 JS-SDK 分享卡：券名 + 券介绍 + 压缩分享图（props 直传，卡片标题不落通用兜底） -->
      <WechatShare :title="name" :description="shareDesc" :image-url="shareCardSrc" />
    </template>
  </main>
</template>

<style scoped>
.deal { font-size: 28px; font-weight: 800; line-height: 1.1; color: var(--ui-primary); }
.mk-tag { position: absolute; top: 10px; left: 10px; border-radius: 999px 999px 999px 2px; background: #dc2626; color: #fff; font-size: 11px; font-weight: 600; padding: 2px 9px; }
.scene-pill { position: absolute; top: 10px; right: 10px; border-radius: 999px; background: rgb(255 255 255 / .92); color: #9a3412; font-size: 11px; font-weight: 500; padding: 2px 9px; }
.sec { font-size: 13px; font-weight: 600; border-left: 3px solid var(--ui-primary); padding-left: 6px; margin-top: 4px; }
.scope-pill { font-size: 11px; color: var(--ui-text); border: 1px solid var(--ui-border); border-radius: 999px; padding: 2px 10px; }
.calc-strip { border: 1px dashed var(--ui-border); background: var(--ui-bg-elevated); border-radius: 8px; padding: 5px 9px; font-size: 11px; color: var(--ui-text-muted); }
.flow-bar { display: flex; align-items: center; gap: 6px; }
.promo-tag { border-radius: 2px 999px 999px 2px; font-size: 11px; font-weight: 500; padding: 0 6px; white-space: nowrap; align-self: center; }
.promo-tag.firstBuy { background: #dc2626; color: #fff; }
.promo-tag.student { background: var(--ui-bg-elevated); color: #0f766e; border: 1px solid #14b8a6; }
.promo-off { color: #dc2626; }
.cta-bar { position: fixed; bottom: 72px; left: 50%; z-index: 40; width: 100%; max-width: 28rem; transform: translateX(-50%); display: flex; justify-content: space-between; align-items: center; gap: 10px; border-top: 1px solid var(--ui-border); background: var(--ui-bg); padding: 10px 14px; }
@media (min-width: 1024px) { .cta-bar { bottom: 0; } }
</style>
