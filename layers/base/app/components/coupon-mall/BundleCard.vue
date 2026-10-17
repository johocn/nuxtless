<script setup lang="ts">
import { hasDetail } from "../../utils/coupon-mall";
import { couponYuan, couponTemplateMap, couponBundleItems } from "../../utils/coupon";

/**
 * 券商城：券包卡。items 仅含 templateId，模板详情由 templates 映射；购买/详情 emit 给页面执行。
 */
const props = defineProps<{
  bundle: Record<string, any>;
  /** 目录模板列表（用于解析 bundle.items 的 templateId） */
  templates: Record<string, any>[];
  buying?: boolean;
}>();
const emit = defineEmits<{ (e: "buy"): void; (e: "detail"): void }>();
const { t, locale } = useI18n();
const detailable = computed(() => hasDetail(props.bundle.description, locale.value));
const items = computed(() => couponBundleItems(props.bundle as never, couponTemplateMap(props.templates as never)));
</script>

<template>
  <div class="bundle-card" @click="detailable && emit('detail')">
    <div class="head">
      <span class="name">{{ localizeText(bundle.name, locale) }}</span>
      <span v-if="detailable" class="detail" @click.stop="emit('detail')">{{ t("messages.couponMall.viewDetail") }}</span>
    </div>
    <div class="chips">
      <span v-for="it in items" :key="it.id" class="chip">
        {{ it.template ? `${localizeText(it.template.name, locale)} ¥${couponYuan(it.template.discountValue)}` : "—" }} ×{{ it.quantity }}
      </span>
    </div>
    <div class="foot">
      <span class="price">¥{{ couponYuan(bundle.salePrice) }}</span>
      <UButton size="sm" :disabled="buying" :loading="buying" @click.stop="emit('buy')">
        {{ t("messages.couponMall.buyNow") }}
      </UButton>
    </div>
  </div>
</template>

<style scoped>
.bundle-card { background: var(--ui-bg); border: 1px solid var(--ui-border); border-radius: 12px; padding: 12px; display: flex; flex-direction: column; gap: 8px; }
.head { display: flex; justify-content: space-between; align-items: center; }
.name { font-size: 15px; font-weight: 700; }
.detail { font-size: 12px; color: var(--ui-text-muted); }
.chips { display: flex; flex-wrap: wrap; gap: 4px; }
.chip { font-size: 11px; color: var(--ui-text-muted); background: var(--ui-bg-elevated); border-radius: 999px; padding: 2px 8px; }
.foot { display: flex; justify-content: space-between; align-items: center; }
.price { font-size: 18px; font-weight: 700; color: var(--ui-primary); }
</style>
