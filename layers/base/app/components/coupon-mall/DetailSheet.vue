<script setup lang="ts">
import { hasDetail, parseDetailParagraphs, detailAssetUrl } from "../../utils/coupon-mall";
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
            <span class="scene">{{ tpl.usageScene === "IN_STORE" ? t("messages.coupon.sceneStore") : t("messages.coupon.sceneOnline") }}</span>
          </div>
          <span class="price">¥{{ couponYuan(tpl.salePrice) }}</span>
        </div>
      </div>

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

      <div class="notice">
        <span class="notice-b">{{ t("messages.couponMall.secNotice") }}：</span>
        <span class="notice-t">{{ t("messages.couponMall.noticeText") }}</span>
      </div>

      <div class="cta">
        <span class="big">¥{{ couponYuan(tpl.salePrice) }}</span>
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
.row { display: flex; justify-content: space-between; align-items: center; }
.name { font-size: 16px; font-weight: 600; }
.scene { font-size: 10px; color: var(--ui-primary); background: var(--ui-bg-elevated); border-radius: 999px; padding: 1px 8px; }
.price { font-size: 14px; font-weight: 700; color: var(--ui-primary); }
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
.notice-b { font-size: 12px; font-weight: 600; }
.notice-t { font-size: 12px; color: var(--ui-text-muted); line-height: 1.6; }
.cta { display: flex; justify-content: space-between; align-items: center; margin-top: 4px; }
.big { font-size: 18px; font-weight: 700; color: var(--ui-primary); }
</style>
