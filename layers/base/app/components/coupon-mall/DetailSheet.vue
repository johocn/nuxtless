<script setup lang="ts">
import {
  hasDetail,
  parseDetailParagraphs,
  detailAssetUrl,
  couponSavingsExample,
  formatCouponDiscount,
  couponAnchorYuan,
} from "../../utils/coupon-mall";
import { couponYuan, couponTemplateMap, couponBundleItems } from "../../utils/coupon";

/**
 * 券商城：券详情弹层（图文混排介绍/适用范围/使用信息/购买须知）。
 * 容器与 CouponPaySheet 同款自研 fixed 底部弹层；open 由页面 v-if/prop 控制，关闭 emit 给页面。
 */
const props = defineProps<{
  open: boolean;
  tpl: Record<string, any> | null;
  /** 券包（券包卡传入，弹层内用 templates 解析明细） */
  bundle?: Record<string, any> | null;
  /** 目录模板列表（用于解析券包明细的 templateId） */
  templates?: Record<string, any>[];
  buying?: boolean;
  /** 首购立减/学生价展示上下文 */
  promo?: { firstBuyDiscount?: number | null; firstBuyEligible?: boolean | null; studentApproved?: boolean | null };
}>();
const emit = defineEmits<{ (e: "close"): void; (e: "buy"): void }>();
const { t, locale } = useI18n();
const requestURL = useRequestURL();

const paragraphs = computed(() => {
  const desc = props.tpl?.description;
  if (!hasDetail(desc, locale.value)) return [];
  const raw = localizeText(desc as never, locale.value) as string;
  return parseDetailParagraphs(raw);
});
const scopeAll = computed(() => (props.tpl?.scope ?? "ALL") === "ALL");
const bundleItems = computed(() =>
  props.bundle && props.templates
    ? couponBundleItems(props.bundle as never, couponTemplateMap(props.templates as never))
    : [],
);
const introImageFailed = ref(false);
watch(() => props.open, () => { introImageFailed.value = false; });

// ── 券店 PERCENT 付费券增强（条件化，不影响其他租户普通券展示）──
/** PERCENT 且 salePrice>0 才显示算账条 */
const calcBar = computed(() => {
  if (!props.tpl || props.tpl.type !== "PERCENT" || !(props.tpl.salePrice > 0)) return null;
  return couponSavingsExample(props.tpl);
});
/** 算账条折扣措辞：zh「8折」/ en「Save 20%」 */
const calcOff = computed(() => {
  if (!calcBar.value) return "";
  const d = formatCouponDiscount(props.tpl!);
  if (d.kind !== "percent") return "";
  return t("messages.couponStore.percentOff", {
    v: d.percent,
    s: Math.max(0, 100 - Number(props.tpl!.discountValue ?? 0)),
  });
});
/** 仅 IN_STORE 券显示三步流程条 */
const flowSteps = computed(() =>
  props.tpl?.usageScene === "IN_STORE"
    ? [
        t("messages.couponStore.flowStep1"),
        t("messages.couponStore.flowStep2"),
        t("messages.couponStore.flowStep3"),
      ]
    : [],
);
/** 营销标签（后台可配）；空不展示 */
const marketingLabel = computed(() => String(props.tpl?.label ?? "").trim());
/** 真实已售数（PAID 出售单聚合，单券/券包均由后端下发）；>0 才展示 */
const soldCount = computed(() => Math.max(0, Number(props.tpl?.soldCount ?? 0)));
/** 划线锚定价（仅当高于售价时返回元字符串） */
const anchor = computed(() => couponAnchorYuan(props.tpl ?? {}));
/** 首购/学生优惠：单券含学生价路径，券包仅首购路径；null=原价 */
const promo = computed(() => {
  if (!props.promo || !props.tpl) return null;
  return props.bundle
    ? couponPromoPrice({ salePrice: props.bundle.salePrice }, props.promo)
    : couponPromoPrice(props.tpl, props.promo);
});
/** 明细基准价（分）：单券=券售价，券包=包价 */
const baseFen = computed(() => Number(props.bundle?.salePrice ?? props.tpl?.salePrice ?? 0));
/** 明细优惠行文案：到手价与标签 */
const promoLabel = computed(() =>
  promo.value ? (promo.value.kind === "student" ? t("messages.couponStore.studentTag") : t("messages.couponStore.firstBuyTag")) : "",
);
/** 展示价：优惠价 > 原价 */
const displayPrice = computed(() => promo.value?.yuan ?? couponYuan(baseFen.value));
/** 未认证学生引导：券有学生价且当前非认证通过 → 显示认证入口 */
const studentGuide = computed(
  () => Number(props.tpl?.studentPrice ?? 0) > 0 && props.promo?.studentApproved !== true,
);
</script>

<template>
  <div v-if="open && tpl" class="sheet-mask" @click.self="emit('close')">
    <div class="sheet">
      <div class="head">
        <div class="head-left">
          <span class="amount">{{ couponYuan(tpl.discountValue) }}</span>
          <span class="cond">{{ tpl.minSpend > 0 ? t("messages.coupon.minSpend", { n: couponYuan(tpl.minSpend) }) : t("messages.coupon.noThreshold") }}</span>
        </div>
        <div class="head-info">
          <div class="row">
            <span class="name">{{ localizeText(tpl.name, locale) }}</span>
            <span class="row-tags">
              <span v-if="marketingLabel" class="mk">{{ marketingLabel }}</span>
              <span class="scene">{{ tpl.usageScene === "IN_STORE" ? t("messages.coupon.sceneStore") : t("messages.coupon.sceneOnline") }}</span>
            </span>
          </div>
          <span class="price-line">
            <span v-if="promo" class="promo-tag" :class="promo.kind">{{ promoLabel }}</span>
            <s v-if="anchor || promo" class="anchor">¥{{ promo ? couponYuan(baseFen) : anchor }}</s>
            <span class="price">¥{{ displayPrice }}</span>
            <span v-if="soldCount > 0" class="sold">{{ t("messages.couponStore.soldCount", { n: soldCount }) }}</span>
          </span>
        </div>
      </div>

      <!-- 算账条（仅 PERCENT + 付费券） -->
      <div v-if="calcBar" class="calc">
        {{ t("messages.couponStore.calcExample", { spend: calcBar.spend, save: calcBar.save, off: calcOff }) }}
      </div>

      <!-- 价格明细（有首购/学生优惠时展示：券价 → 优惠 → 到手） -->
      <div v-if="promo" class="breakdown">
        <div class="brow"><span class="bl">{{ t("messages.couponStore.basePrice") }}</span><s class="bv">¥{{ couponYuan(baseFen) }}</s></div>
        <div class="brow"><span class="bl">{{ promoLabel }}</span><span class="bv off">−¥{{ couponYuan(baseFen - Math.round(Number(promo.yuan) * 100)) }}</span></div>
        <div class="brow total"><span class="bl">{{ t("messages.couponStore.finalPrice") }}</span><span class="bv final">¥{{ displayPrice }}</span></div>
      </div>
      <!-- 学生认证引导：券有学生价且未认证 -->
      <NuxtLink v-if="studentGuide" to="/coupon/student-verify" class="stu-guide" @click="emit('close')">
        {{ t("messages.couponStore.studentGuide") }} <span class="arr">→</span>
      </NuxtLink>

      <template v-if="paragraphs.length">
        <span class="sec">{{ t("messages.couponMall.secIntro") }}</span>
        <div class="intro">
          <template v-for="(p, i) in paragraphs" :key="i">
            <p v-if="p.type === 'text'" class="para">{{ p.content }}</p>
            <img
              v-else-if="!introImageFailed"
              class="para-img"
              loading="lazy"
              :src="detailAssetUrl(p.content, requestURL.origin)"
              :alt="t('messages.couponMall.secIntro')"
              @error="introImageFailed = true"
            >
            <span v-else class="img-fail">{{ t("messages.couponMall.imageFail") }}</span>
          </template>
        </div>
      </template>

      <span class="sec">{{ t("messages.couponMall.secScope") }}</span>
      <div class="chips">
        <span class="pill">{{ scopeAll ? t("messages.couponMall.scopeAll") : t("messages.couponMall.scopeLimited") }}</span>
        <span class="pill">{{ tpl.usageScene === "IN_STORE" ? t("messages.coupon.sceneStore") : t("messages.coupon.sceneOnline") }}</span>
      </div>

      <span class="sec">{{ t("messages.couponMall.secUsage") }}</span>
      <div class="usage">
        <div v-if="tpl.validDays" class="urow"><span class="v">{{ t("messages.couponMall.validDays", { d: tpl.validDays }) }}</span></div>
        <div v-if="tpl.perUserLimit" class="urow"><span class="v">{{ t("messages.couponMall.perUserLimit", { n: tpl.perUserLimit }) }}</span></div>
      </div>

      <div v-if="bundleItems.length" class="chips">
        <span v-for="it in bundleItems" :key="it.id" class="pill">
          {{ it.template ? `${localizeText(it.template.name, locale)} ¥${couponYuan(it.template.discountValue)}` : "—" }} ×{{ it.quantity }}
        </span>
      </div>

      <!-- 三步流程条（仅 IN_STORE 券） -->
      <div v-if="flowSteps.length" class="flow">
        <template v-for="(s, i) in flowSteps" :key="s">
          <span v-if="i" class="flow-arrow">→</span>
          <span class="flow-step"><b>{{ i + 1 }}</b><span class="flow-txt">{{ s }}</span></span>
        </template>
      </div>

      <div class="notice">
        <span class="notice-b">{{ t("messages.couponMall.secNotice") }}：</span>
        <span class="notice-t">{{ t("messages.couponMall.noticeText") }}</span>
      </div>

      <div class="cta">
        <span class="cta-price">
          <span v-if="promo" class="promo-tag" :class="promo.kind">{{ promoLabel }}</span>
          <s v-if="promo" class="anchor">¥{{ couponYuan(baseFen) }}</s>
          <span class="big">¥{{ displayPrice }}</span>
        </span>
        <UButton :disabled="buying" :loading="buying" @click="emit('buy')">{{ t("messages.couponMall.buyNow") }}</UButton>
      </div>
    </div>
  </div>
</template>

<style scoped>
.sheet-mask { position: fixed; inset: 0; z-index: 70; display: flex; align-items: flex-end; justify-content: center; background: rgb(0 0 0 / 0.4); }
.sheet { width: 100%; max-width: 28rem; padding: 16px; display: flex; flex-direction: column; gap: 10px; max-height: 70vh; overflow-y: auto; border-radius: 16px 16px 0 0; background: var(--ui-bg); }
.head { display: flex; gap: 12px; }
.head-left { min-width: 64px; display: flex; flex-direction: column; align-items: center; border-right: 1px dashed var(--ui-border); padding-right: 12px; }
.amount { font-size: 22px; font-weight: 700; color: var(--ui-primary); }
.cond { font-size: 11px; color: var(--ui-text-muted); }
.head-info { flex: 1; display: flex; flex-direction: column; gap: 4px; }
.row { display: flex; justify-content: space-between; align-items: center; gap: 8px; }
.name { font-size: 16px; font-weight: 600; }
.row-tags { display: flex; align-items: center; gap: 4px; flex: none; }
.mk { font-size: 10px; font-weight: 600; color: #fff; background: #dc2626; border-radius: 999px 999px 999px 2px; padding: 1px 8px; white-space: nowrap; }
.scene { font-size: 10px; color: var(--ui-primary); background: var(--ui-bg-elevated); border-radius: 999px; padding: 1px 8px; }
.price-line { display: flex; align-items: baseline; gap: 6px; }
.anchor { font-size: 12px; color: var(--ui-text-dimmed); }
.sold { font-size: 11px; color: var(--ui-text-muted); margin-left: auto; }
.price { font-size: 14px; font-weight: 700; color: var(--ui-primary); }
.promo-tag { border-radius: 2px 999px 999px 2px; font-size: 10px; font-weight: 500; padding: 0 6px; white-space: nowrap; align-self: center; }
.promo-tag.firstBuy { background: #dc2626; color: #fff; }
.promo-tag.student { background: var(--ui-bg-elevated); color: #0f766e; border: 1px solid #14b8a6; }
.breakdown { display: flex; flex-direction: column; gap: 6px; background: var(--ui-bg-elevated); border-radius: 10px; padding: 10px 12px; }
.brow { display: flex; justify-content: space-between; align-items: baseline; }
.bl { font-size: 12px; color: var(--ui-text-muted); }
.bv { font-size: 12px; color: var(--ui-text); }
.bv.off { color: #dc2626; }
.brow.total .bl { color: var(--ui-text); font-weight: 600; }
.bv.final { font-size: 15px; font-weight: 700; color: var(--ui-primary); }
.stu-guide { display: flex; align-items: center; justify-content: space-between; font-size: 12px; color: #0f766e; background: var(--ui-bg-elevated); border: 1px dashed #14b8a6; border-radius: 10px; padding: 8px 12px; }
.stu-guide .arr { color: #0f766e; }
.sec { font-size: 13px; font-weight: 600; margin-top: 6px; border-left: 3px solid var(--ui-primary); padding-left: 6px; }
.intro { display: flex; flex-direction: column; gap: 6px; }
.para { font-size: 13px; color: var(--ui-text-muted); line-height: 1.6; }
.para-img { width: 100%; border-radius: 8px; }
.img-fail { font-size: 12px; color: var(--ui-text-dimmed); text-align: center; padding: 12px 0; }
.chips { display: flex; flex-wrap: wrap; gap: 4px; }
.pill { font-size: 11px; color: var(--ui-text); border: 1px solid var(--ui-border); border-radius: 999px; padding: 2px 10px; }
.usage { display: flex; flex-direction: column; gap: 4px; }
.urow { display: flex; justify-content: space-between; font-size: 12px; }
.v { font-weight: 500; }
.notice { background: var(--ui-bg-elevated); border-radius: 8px; padding: 8px 12px; }
.calc { border: 1px dashed var(--ui-border); background: var(--ui-bg-elevated); border-radius: 8px; padding: 6px 10px; font-size: 12px; color: var(--ui-text-muted); }
.flow { display: flex; align-items: center; gap: 6px; }
.flow-step { flex: 1; min-width: 0; display: flex; align-items: center; gap: 6px; font-size: 12px; background: var(--ui-bg-elevated); border-radius: 8px; padding: 6px 8px; }
.flow-step b { flex: none; width: 16px; height: 16px; border-radius: 999px; background: var(--ui-primary); color: #fff; font-size: 10px; display: inline-flex; align-items: center; justify-content: center; }
.flow-txt { min-width: 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.flow-arrow { flex: none; font-size: 12px; color: var(--ui-text-muted); }
.notice-b { font-size: 12px; font-weight: 600; }
.notice-t { font-size: 12px; color: var(--ui-text-muted); line-height: 1.6; }
.cta { display: flex; justify-content: space-between; align-items: center; margin-top: 4px; }
.cta-price { display: flex; align-items: baseline; gap: 6px; }
.cta .anchor { font-size: 13px; }
.big { font-size: 18px; font-weight: 700; color: var(--ui-primary); }
</style>
