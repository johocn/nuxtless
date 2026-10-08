<script setup lang="ts">
import type { CouponBundle, CouponTemplate } from "~~/layers/base/app/composables/useCoupon";
import { useCouponFormat } from "~~/layers/base/app/composables/useCouponFormat";
import {
  couponBundleItems,
  couponBundleSave,
  couponBundleTotalQty,
  couponBundleTypeCount,
  couponTemplateMap,
  couponYuan,
  type CouponBuyTarget,
  type CouponSceneKey,
} from "~~/layers/base/app/utils/coupon";

/**
 * ② 券商城：场景筛选 + 券包大卡 + 单券卡。购买动作 emit 给页面执行（需登录 + 下单 + 支付弹层）。
 */
const props = defineProps<{
  bundles: CouponBundle[];
  templates: CouponTemplate[];
  buyingId: string | null;
  loading: boolean;
  scene: Exclude<CouponSceneKey, "ALL">;
}>();
const emit = defineEmits<{
  (e: "update:scene", v: Exclude<CouponSceneKey, "ALL">): void;
  (e: "buy", target: CouponBuyTarget): void;
}>();

const { t } = useI18n();
const { typeTip, formatAmount, formatUnit, formatCondition, formatDateRange } = useCouponFormat();

// 券包内券模板映射（items 仅含 templateId）
const tplMap = computed(() => couponTemplateMap(props.templates));

function bundleItems(b: CouponBundle) {
  return couponBundleItems(b, tplMap.value);
}

function bundleSave(b: CouponBundle): number {
  return couponBundleSave(b, tplMap.value);
}
</script>

<template>
  <div class="mb-6 flex gap-2">
    <UButton
      size="sm"
      :variant="scene === 'ONLINE' ? 'solid' : 'soft'"
      @click="emit('update:scene', 'ONLINE')"
    >{{ t("messages.coupon.sceneOnline") }}</UButton>
    <UButton
      size="sm"
      :variant="scene === 'IN_STORE' ? 'solid' : 'soft'"
      @click="emit('update:scene', 'IN_STORE')"
    >{{ t("messages.coupon.sceneStore") }}</UButton>
  </div>

  <BaseLoader v-if="loading" width="sm:w-xs md:w-sm" />
  <template v-else>
    <div v-if="bundles.length || templates.length" class="grid gap-4 md:grid-cols-2">
      <!-- 券包大卡 -->
      <div
        v-for="b in bundles"
        :key="'b-' + b.id"
        class="rounded-xl border border-(--ui-border) p-4"
      >
        <div class="flex items-start justify-between gap-3">
          <div class="min-w-0">
            <p class="font-semibold">{{ b.name }}</p>
            <p class="mt-0.5 text-xs text-(--ui-text-muted)">
              {{ t("messages.coupon.bundleContains", { n: couponBundleTypeCount(b), m: couponBundleTotalQty(b) }) }}
              <span v-if="bundleSave(b)">· {{ t("messages.coupon.bundleSave", { n: couponYuan(bundleSave(b)) }) }}</span>
            </p>
          </div>
          <div class="shrink-0 text-right">
            <span class="text-lg font-bold text-primary">¥{{ couponYuan(b.salePrice) }}</span>
          </div>
        </div>
        <div class="mt-2 flex flex-wrap gap-1">
          <span
            v-for="it in bundleItems(b)"
            :key="it.id"
            class="rounded bg-(--ui-bg-elevated) px-1.5 py-0.5 text-xs text-(--ui-text-muted)"
          >
            {{ it.template ? `${formatAmount(it.template.type, it.template.discountValue)}${formatUnit(it.template.type)}` : t('messages.coupon.coupon') }} ×{{ it.quantity }}
          </span>
        </div>
        <UButton
          class="mt-4 w-full justify-center"
          :loading="buyingId === b.id"
          :disabled="!!buyingId"
          @click="emit('buy', { kind: 'bundle', id: b.id, name: b.name, amount: b.salePrice })"
        >
          {{ t("messages.coupon.buyNow") }}
        </UButton>
      </div>

      <!-- 单券卡 -->
      <div
        v-for="c in templates"
        :key="'t-' + c.id"
        class="flex flex-col rounded-xl border border-(--ui-border) p-4"
      >
        <div class="flex items-stretch gap-4">
          <CouponFace :type="c.type" :value="c.discountValue" />
          <div class="flex min-w-0 flex-1 flex-col">
            <p class="font-semibold">{{ c.name }}</p>
            <p class="mt-1 text-sm text-(--ui-text-muted)">{{ formatCondition(c) }}</p>
            <p class="mt-1 text-xs text-(--ui-text-muted)">
              {{ t("messages.coupon.validity") }}：{{ formatDateRange(c) }}
            </p>
          </div>
        </div>
        <UButton
          class="mt-4 w-full justify-center"
          :loading="buyingId === c.id"
          :disabled="!!buyingId"
          @click="emit('buy', { kind: 'template', id: c.id, name: c.name, amount: c.salePrice })"
        >
          {{ t("messages.coupon.buyNow") }} ¥{{ couponYuan(c.salePrice) }}
        </UButton>
      </div>
    </div>
    <p v-else>{{ t("messages.coupon.saleEmpty") }}</p>
  </template>
</template>
