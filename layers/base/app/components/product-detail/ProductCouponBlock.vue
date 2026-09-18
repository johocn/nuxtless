<script setup lang="ts">
// 商品专属券块：展示当前商品可领取的专属券（enabled 且 template.claimable）并支持一键领取。
// 数据加载用 useAsyncData（SSR 预取 + 客户端 hydration 复用 payload，避免闪烁/mismatch）；
// 领取走 useCoupon 的 graphql-request 客户端，游客匿名会话由 cookie token 承载（后端按匿名会话处理）。
import type { ProductCouponBinding } from "../../composables/useCoupon";
import {
  getProductCoupons,
  claimProductCoupon,
  couponErrorMessage,
} from "../../composables/useCoupon";
import { useProductDetailView } from "../../composables/useProductDetailView";

const { t } = useI18n();
const toast = useToast();
const { product } = useProductDetailView();

const productId = computed(() => product.value?.id ?? "");

// SSR 预取商品专属券：key 随 productId 变化自动重新请求；异常静默降级为空列表（块不渲染）
const { data: bindings } = useAsyncData(
  () => `product-coupons-${productId.value}`,
  async () => {
    if (!productId.value) return [] as ProductCouponBinding[];
    try {
      return await getProductCoupons(productId.value);
    } catch (e) {
      console.error("[ProductCouponBlock] 加载商品专属券失败", e);
      return [] as ProductCouponBinding[];
    }
  },
  { server: true },
);

// 仅展示启用且模板可领取的绑定；本会话内领取成功的置灰为「已领取」
const claimedIds = ref<Set<string>>(new Set());
const claimingId = ref<string | null>(null);

const available = computed<ProductCouponBinding[]>(() =>
  (bindings.value ?? []).filter((b) => b.enabled && !!b.template?.claimable),
);

function isClaimed(id: string): boolean {
  return claimedIds.value.has(id);
}

// ── 面额 / 使用门槛 / 有效期 ──
function formatAmount(b: ProductCouponBinding): string {
  const tpl = b.template;
  if (!tpl) return "";
  if (tpl.type === "FULL") return t("messages.detail.couponFull"); // 免单
  if (tpl.type === "FREE_SHIPPING") return t("messages.detail.couponFreeShipping"); // 免运费
  if (tpl.type === "PERCENT") {
    const zhe = tpl.discountValue / 10;
    return `${zhe % 1 === 0 ? zhe.toString() : zhe.toFixed(1)}${t("messages.coupon.unitDiscount")}`;
  }
  return `¥${(tpl.discountValue / 100).toString()}`;
}

function formatCondition(b: ProductCouponBinding): string {
  const tpl = b.template;
  if (!tpl) return "";
  if (tpl.type === "FREE_SHIPPING") return t("messages.detail.couponFreeShipping");
  const minSpend = tpl.minSpend ? tpl.minSpend / 100 : 0;
  if (!minSpend) return t("messages.detail.couponNoThreshold");
  return t("messages.detail.couponMinSpend", { n: minSpend });
}

function formatValidity(b: ProductCouponBinding): string {
  const tpl = b.template;
  if (!tpl) return "";
  if (tpl.endsAt) return t("messages.detail.couponExpires", { date: String(tpl.endsAt).slice(0, 10) });
  if (tpl.validDays) return t("messages.detail.couponValidDays", { n: tpl.validDays });
  return "";
}

// ── 领取 ──
async function claim(b: ProductCouponBinding) {
  if (claimingId.value || isClaimed(b.id)) return;
  claimingId.value = b.id;
  try {
    await claimProductCoupon(b.id);
    toast.add({ title: t("messages.detail.couponClaimSuccess"), color: "success" });
    // 本地标记已领取（置灰），避免后端重复返回可领状态时按钮回跳
    const next = new Set(claimedIds.value);
    next.add(b.id);
    claimedIds.value = next;
  } catch (e) {
    // 失败用 couponErrorMessage 转中文提示；登录类错误（如「登录状态异常，请重新登录」）同样由此呈现
    toast.add({
      title: t("messages.detail.couponClaimFailed"),
      description: couponErrorMessage(e),
      color: "error",
    });
  } finally {
    claimingId.value = null;
  }
}
</script>

<template>
  <div v-if="available.length" class="mt-3 rounded-lg border border-primary/15 bg-primary/5 p-3">
    <div class="mb-2 flex items-center gap-1.5 text-xs font-semibold text-primary">
      <UIcon name="i-lucide-ticket-percent" class="size-3.5" />
      {{ t("messages.detail.couponTitle") }}
    </div>
    <div class="flex flex-col gap-2">
      <div
        v-for="b in available"
        :key="b.id"
        class="flex items-center gap-3 rounded-lg border border-gray-100 bg-white p-2.5"
      >
        <!-- 面额 -->
        <div
          class="flex w-20 shrink-0 flex-col items-center justify-center rounded-md bg-primary/10 py-1.5 text-primary"
        >
          <span class="text-base font-bold leading-tight">{{ formatAmount(b) }}</span>
        </div>
        <!-- 券信息 -->
        <div class="flex min-w-0 flex-1 flex-col">
          <div class="flex flex-wrap items-center gap-1">
            <span
              v-if="b.badgeText"
              class="rounded bg-primary/10 px-1 py-px text-[10px] font-semibold text-primary"
            >{{ b.badgeText }}</span>
            <span
              v-if="b.template?.newCustomerOnly"
              class="rounded bg-orange-100 px-1 py-px text-[10px] font-semibold text-orange-600"
            >{{ t("messages.detail.couponNewCustomer") }}</span>
          </div>
          <p class="mt-0.5 truncate text-xs font-semibold text-gray-800">
            {{ b.promoTitle || b.template?.name }}
          </p>
          <p class="mt-0.5 text-[11px] text-gray-500">{{ formatCondition(b) }}</p>
          <p v-if="formatValidity(b)" class="mt-0.5 text-[11px] text-gray-400">{{ formatValidity(b) }}</p>
        </div>
        <!-- 领取 -->
        <UButton
          size="sm"
          color="primary"
          variant="soft"
          :disabled="isClaimed(b.id) || !!claimingId"
          :loading="claimingId === b.id"
          @click="claim(b)"
        >
          {{ isClaimed(b.id) ? t("messages.detail.couponClaimed") : t("messages.detail.couponClaim") }}
        </UButton>
      </div>
    </div>
  </div>
</template>
