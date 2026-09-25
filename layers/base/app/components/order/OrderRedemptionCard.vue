<script setup lang="ts">
import type { OrderVisualVariant } from "../../utils/order-config";

const { t } = useI18n();
const gql = useGql();

const props = withDefaults(defineProps<{
  orderCode: string;
  phone?: string;
  /** 高光卡开关（L3/L2 覆盖，缺省 true） */
  highlight?: boolean;
  /** 门店名（nullable：订单无自提信息则隐藏门店行） */
  pickupName?: string | null;
  /** 版式变体（缺省 cn = 现状观感，classic / confirmation 调用方零回归） */
  variant?: OrderVisualVariant;
}>(), { highlight: true, pickupName: null, variant: "cn" });

interface RedemptionResult {
  redemptionCode?: string | null;
  qrPayload?: string | null;
  claimed: boolean;
  canAccess?: boolean;
  status?: string;
  expiresAt?: string | null;
  reissueable?: boolean;
  version?: number | null;
}

const result = ref<RedemptionResult | null>(null);
const loading = ref(true);
const error = ref(false);

onMounted(async () => {
  try {
    const res: any = await gql("OrderRedemptionCode", {
      input: { orderCode: props.orderCode, phone: props.phone },
    });
    result.value = (res?.orderRedemptionCode ?? null) as RedemptionResult | null;
  } catch {
    error.value = true;
  } finally {
    loading.value = false;
  }
});

const qrDataUrl = ref("");
watch(result, async (r) => {
  if (r?.qrPayload) {
    try {
      const QRCode = (await import("qrcode")).default;
      qrDataUrl.value = await QRCode.toDataURL(r.qrPayload, { width: 164, margin: 1 });
    } catch {
      qrDataUrl.value = "";
    }
  }
}, { immediate: true });

// 状态机判优：已核销 > 已过期；重发仅作徽标（version>1）
const isClaimed = computed(() => !!result.value?.claimed);
const isExpired = computed(() => !isClaimed.value && result.value?.status === "expired");
const isExpiring = computed(() => !isClaimed.value && result.value?.status === "expiring_soon");
const isReissued = computed(() => (result.value?.version ?? 1) > 1);

const expiresText = computed(() => {
  const iso = result.value?.expiresAt;
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return t("messages.order.redeemExpiresTo", { date: `${mm}-${dd}` });
});

const fontScale = computed(() => props.highlight ? undefined : undefined); // 样式缩放由外层 config 传入

/** 卡容器：cn=琥珀高光 / jd=白卡+2px 红顶边 / mall=珊瑚边+珊瑚投影 */
const sectionClass = computed(() => {
  if (props.variant === "jd") {
    return [
      "overflow-hidden rounded-md bg-white shadow-[0_1px_2px_#0000000d]",
      props.highlight && "border-t-2 border-t-[#e1251b]",
    ];
  }
  if (props.variant === "mall") {
    return [
      "overflow-hidden rounded-2xl border bg-white",
      props.highlight
        ? "border-[#ffe0dd] shadow-[0_4px_18px_#e0433f29]"
        : "border-neutral-200",
    ];
  }
  return [
    "overflow-hidden rounded-2xl border shadow-sm",
    props.highlight
      ? "border-amber-150 from-amber-50 to-white bg-gradient-to-b dark:from-neutral-800 dark:to-neutral-900"
      : "border-neutral-200 bg-white dark:border-neutral-800 dark:bg-neutral-900",
  ];
});

/** 码区：cn=brand 渐变 / jd=京东红渐变 / mall=珊瑚渐变；highlight=false 回退描边白底 */
const codeBoxClass = computed(() => {
  const radius = props.variant === "jd"
    ? "rounded"
    : props.variant === "mall" ? "rounded-2xl" : "rounded-xl";
  if (!props.highlight) return [radius, "border border-neutral-200"];
  const gradient = props.variant === "jd"
    ? "from-[#c8161d] via-[#e1251b] to-[#f04b2f]"
    : props.variant === "mall"
      ? "from-[#e0433f] to-[#ff6a6c]"
      : "from-brand-600 to-brand-500";
  return [radius, "bg-gradient-to-r text-white", gradient];
});

/** 状态徽标圆角：jd 方块感，cn/mall 药丸 */
const badgeRadius = computed(() => (props.variant === "jd" ? "rounded-sm" : "rounded-full"));
/** 标题竖条：仅 mall 展示（珊瑚） */
const showTitleBar = computed(() => props.variant === "mall");
</script>

<template>
  <section :class="sectionClass">
    <header class="flex items-center justify-between px-4 pb-2 pt-3">
      <h2 class="flex items-center font-semibold" :class="variant === 'mall' && 'font-extrabold'">
        <span v-if="showTitleBar" class="mr-2 h-[15px] w-[5px] rounded bg-[#e0433f]" />
        {{ t("messages.order.redemptionTitle") }}
      </h2>
      <span v-if="isExpired" class="bg-neutral-200 px-2 py-0.5 text-xs font-medium text-neutral-600" :class="badgeRadius">
        {{ t("messages.order.redeemStatusExpired") }}
      </span>
      <span v-else-if="isExpiring" class="bg-orange-100 px-2 py-0.5 text-xs font-medium text-orange-600" :class="badgeRadius">
        {{ t("messages.order.redeemStatusExpiring") }}
      </span>
      <span v-else-if="isReissued" class="bg-green-100 px-2 py-0.5 text-xs font-medium text-green-700" :class="badgeRadius">
        {{ t("messages.order.redeemStatusReissued") }}
      </span>
      <span v-else-if="isClaimed" class="bg-neutral-200 px-2 py-0.5 text-xs font-medium text-neutral-500" :class="badgeRadius">
        {{ t("messages.order.redeemed") }}
      </span>
      <span v-else class="bg-brand-50 px-2 py-0.5 text-xs font-medium text-brand-700" :class="badgeRadius">
        {{ t("messages.order.redeemStatusPending") }}
      </span>
    </header>

    <div v-if="loading" class="px-4 pb-4 text-sm text-neutral-500">{{ t("messages.general.loading") }}</div>
    <p v-else-if="error" class="px-4 pb-4 text-sm text-neutral-500">
      {{ t("messages.order.redemptionUnavailable") }}
    </p>

    <div v-else-if="result" class="px-4 pb-4">
      <!-- 码区：已过期置灰遮罩 -->
      <div :class="['flex items-center justify-between px-4 py-3', codeBoxClass, isExpired && 'opacity-60 grayscale']">
        <div class="min-w-0">
          <p class="text-xs opacity-80">{{ t("messages.order.redemptionCodeLabel") }}</p>
          <p class="mt-1 break-all font-mono text-3xl font-bold tracking-[0.3em]">
            {{ result.redemptionCode || "--" }}
          </p>
        </div>
        <img v-if="qrDataUrl" :src="qrDataUrl" alt="核销码" class="h-20 w-20 shrink-0 rounded bg-white p-1" />
      </div>

      <!-- 门店行（可空隐藏） -->
      <div v-if="pickupName" class="mt-3 flex items-center justify-between text-sm">
        <span class="text-neutral-500">{{ t("messages.order.redeemPoint") }}</span>
        <span class="font-medium text-neutral-800">{{ pickupName }}</span>
      </div>

      <!-- 有效期与提示 -->
      <div class="mt-2 flex items-center justify-between text-sm">
        <span v-if="expiresText" class="text-neutral-500">{{ expiresText }}</span>
        <span v-if="isExpiring" class="text-orange-600">{{ t("messages.order.redeemExpireSoonTip") }}</span>
        <span v-else-if="isExpired" class="text-neutral-500">{{ t("messages.order.redeemExpiredTip") }}</span>
        <span v-else-if="isReissued" class="text-green-700">{{ t("messages.order.redeemReissuedTip") }}</span>
      </div>
    </div>
  </section>
</template>