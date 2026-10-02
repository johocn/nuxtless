<script setup lang="ts">
// 商品专属券块：展示当前商品可领取的专属券（enabled 且 template.claimable）并支持一键领取。
// 数据加载用 useAsyncData（SSR 预取 + 客户端 hydration 复用 payload，避免闪烁/mismatch）；
// 领取走 useCoupon 的 graphql-request 客户端，游客匿名会话由 cookie token 承载（后端按匿名会话处理）。
import type { ProductCouponBinding } from "../../composables/useCoupon";
import {
  getProductCoupons,
  claimProductCoupon,
  attachCouponToOrder,
  detachCouponFromOrder,
  templateHasChannel,
  couponErrorMessage,
} from "../../composables/useCoupon";
import { useProductDetailView } from "../../composables/useProductDetailView";

const { t } = useI18n();
const toast = useToast();
const { product } = useProductDetailView();
const orderStore = useOrderStore();
const { order } = storeToRefs(orderStore);

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

/** 是否可经 PRODUCT 渠道领取：显式渠道配置优先；未配置时回落 claimable（与后端 resolveCouponChannels 同口径）。
 *  后端 productCoupons 同时返回 SALE 渠道绑定（供加价购），故此处必须按渠道区分，
 *  否则 SALE-only 的券会误入领取区（点击领取会被后端拒绝）。 */
function claimableViaProduct(b: ProductCouponBinding): boolean {
  const tpl = b.template;
  if (!tpl) return false;
  const explicit = (tpl.distributionChannels ?? "").trim();
  if (explicit) return templateHasChannel(tpl, "PRODUCT");
  return !!tpl.claimable;
}

const available = computed<ProductCouponBinding[]>(() =>
  (bindings.value ?? []).filter((b) => b.enabled && claimableViaProduct(b)),
);

// 到店可用标签：场景为 IN_STORE 或 ALL
function isStore(b: ProductCouponBinding): boolean {
  const s = (b.template?.usageScene ?? "").toUpperCase();
  return s === "IN_STORE" || s === "ALL";
}

// 加价购可售券：模板渠道含 SALE 且 salePrice>0；且非纯到店券（到店券不可线上加购）
const saleable = computed<ProductCouponBinding[]>(() =>
  (bindings.value ?? []).filter(
    (b) =>
      b.enabled &&
      !!b.template &&
      templateHasChannel(b.template, "SALE") &&
      (b.template.salePrice ?? 0) > 0 &&
      (b.template.usageScene ?? "ONLINE").toUpperCase() !== "IN_STORE",
  ),
);

const attachingTplId = ref<string | null>(null);
const attachedTplIds = ref<Set<string>>(new Set());

function isAttached(tplId?: string | null): boolean {
  return !!tplId && attachedTplIds.value.has(tplId);
}

/** 取活动订单 id；无活动订单时先拉取（未下单返回 null） */
async function ensureOrderId(): Promise<string | null> {
  if (order.value?.id) return order.value.id;
  try {
    await orderStore.fetchOrder("base");
  } catch {
    // 忽略：未登录/无活动订单
  }
  return order.value?.id ?? null;
}

async function attachAddon(b: ProductCouponBinding) {
  const tplId = b.template?.id;
  if (!tplId || attachingTplId.value) return;
  attachingTplId.value = tplId;
  try {
    const orderId = await ensureOrderId();
    if (!orderId) {
      toast.add({ title: t("messages.coupon.surchargeNeedCart"), color: "warning" });
      return;
    }
    await attachCouponToOrder(orderId, tplId);
    const next = new Set(attachedTplIds.value);
    next.add(tplId);
    attachedTplIds.value = next;
    toast.add({ title: t("messages.coupon.surchargeAdded"), color: "success" });
  } catch (e) {
    toast.add({
      title: t("messages.coupon.surchargeFailed"),
      description: couponErrorMessage(e),
      color: "error",
    });
  } finally {
    attachingTplId.value = null;
  }
}

async function detachAddon(b: ProductCouponBinding) {
  const tplId = b.template?.id;
  if (!tplId) return;
  const orderId = order.value?.id ?? (await ensureOrderId());
  if (!orderId) return;
  try {
    await detachCouponFromOrder(orderId, tplId);
    const next = new Set(attachedTplIds.value);
    next.delete(tplId);
    attachedTplIds.value = next;
  } catch (e) {
    toast.add({
      title: t("messages.coupon.surchargeFailed"),
      description: couponErrorMessage(e),
      color: "error",
    });
  }
}

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
  <div v-if="available.length || saleable.length" class="mt-3 rounded-lg border border-primary/15 bg-primary/5 p-3">
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
            <span
              v-if="isStore(b)"
              class="rounded bg-primary/10 px-1 py-px text-[10px] font-semibold text-primary"
            >{{ t("messages.coupon.storeUsable") }}</span>
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

      <!-- 加价购券（随主订单结算） -->
      <template v-if="saleable.length">
        <div class="my-1 border-t border-dashed border-primary/25" />
        <div class="mb-1 flex items-center gap-1.5 text-xs font-semibold text-primary">
          <UIcon name="i-lucide-plus-circle" class="size-3.5" />
          {{ t("messages.coupon.surchargeTitle") }}
        </div>
        <div
          v-for="b in saleable"
          :key="'addon-' + b.id"
          class="flex items-center gap-3 rounded-lg border border-gray-100 bg-white p-2.5"
        >
          <div
            class="flex w-20 shrink-0 flex-col items-center justify-center rounded-md bg-primary/10 py-1.5 text-primary"
          >
            <span class="text-base font-bold leading-tight">{{ formatAmount(b) }}</span>
          </div>
          <div class="flex min-w-0 flex-1 flex-col">
            <p class="mt-0.5 truncate text-xs font-semibold text-gray-800">
              {{ b.promoTitle || b.template?.name }}
            </p>
            <p class="mt-0.5 text-[11px] text-gray-500">
              {{ t("messages.coupon.surchargePrice", { n: ((b.template?.salePrice ?? 0) / 100).toString() }) }}
            </p>
          </div>
          <UButton
            v-if="isAttached(b.template?.id)"
            size="sm"
            color="neutral"
            variant="soft"
            @click="detachAddon(b)"
          >
            {{ t("messages.coupon.surchargeRemove") }}
          </UButton>
          <UButton
            v-else
            size="sm"
            color="primary"
            variant="soft"
            :disabled="!!attachingTplId"
            :loading="attachingTplId === b.template?.id"
            @click="attachAddon(b)"
          >
            {{ t("messages.coupon.surchargeBuy") }}
          </UButton>
        </div>
      </template>
    </div>
  </div>
</template>
