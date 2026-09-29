<script setup lang="ts">
import { useAfterSales } from "../../composables/useAfterSales";

const props = defineProps<{
  orderId: string;
  orderLine: { id: string; proratedLinePrice?: number; productVariant?: { name?: string } | null };
  maxAmount: number;
}>();

const isOpen = defineModel<boolean>("open", { default: false });
const { loading, createRequest } = useAfterSales();
const { t } = useI18n();
const localePath = useTenantLocalePath();

type TypeKey = "return_refund" | "refund_only" | "exchange";

const MAX_EVIDENCE = 3;
const MAX_DESC = 200;

const TYPE_OPTIONS: { value: TypeKey; labelKey: string; descKey: string; hintKey: string }[] = [
  {
    value: "return_refund",
    labelKey: "messages.afterSales.typeReturnRefund",
    descKey: "messages.afterSales.typeReturnRefundDesc",
    hintKey: "messages.afterSales.hintReturnRefund",
  },
  {
    value: "refund_only",
    labelKey: "messages.afterSales.typeRefundOnly",
    descKey: "messages.afterSales.typeRefundOnlyDesc",
    hintKey: "messages.afterSales.hintRefundOnly",
  },
  {
    value: "exchange",
    labelKey: "messages.afterSales.typeExchange",
    descKey: "messages.afterSales.typeExchangeDesc",
    hintKey: "messages.afterSales.hintExchange",
  },
];

const REASON_KEYS = [
  "quality",
  "damaged",
  "sizeMismatch",
  "notAsDescribed",
  "wrongItem",
  "missingItem",
  "noLongerNeeded",
  "other",
] as const;

const selectedType = ref<TypeKey>("return_refund");
/** 对外单位：元（字符串，避免 number 输入框吃掉小数位） */
const amountText = ref("");
const reasonKey = ref<string>("");
const reasonOther = ref("");
const description = ref("");
const evidenceUrls = ref<string[]>([]);
const formError = ref<string | null>(null);
const submitting = ref(false);
const evidenceRef = ref<{ hasPending: boolean; hasFailed: boolean } | null>(null);
const discardConfirmOpen = ref(false);

const maxYuan = computed(() => props.maxAmount / 100);
const isExchange = computed(() => selectedType.value === "exchange");
const isOther = computed(() => reasonKey.value === "other");
const productName = computed(() => props.orderLine.productVariant?.name ?? "");

const amountNumber = computed(() => Number(amountText.value));

const amountError = computed(() => {
  if (isExchange.value) return null;
  if (!amountText.value.trim()) return t("messages.afterSales.errAmountRequired");
  if (!Number.isFinite(amountNumber.value) || amountNumber.value <= 0)
    return t("messages.afterSales.errAmountPositive");
  if (amountNumber.value > maxYuan.value + 1e-9)
    return t("messages.afterSales.errAmountMax", { amount: maxYuan.value.toFixed(2) });
  return null;
});

const reasonValue = computed(() =>
  isOther.value ? reasonOther.value.trim() : reasonKey.value ? t(`messages.afterSales.reason_${reasonKey.value}`) : "",
);

const busy = computed(() => !!evidenceRef.value?.hasPending);
const failed = computed(() => !!evidenceRef.value?.hasFailed);

const canSubmit = computed(
  () =>
    !loading.value &&
    !submitting.value &&
    !busy.value &&
    !failed.value &&
    !!reasonValue.value &&
    (isExchange.value || !amountError.value),
);

const disabledReason = computed(() => {
  if (busy.value) return t("messages.afterSales.errUploading");
  if (failed.value) return t("messages.afterSales.errUploadFailed");
  if (!reasonValue.value) return t("messages.afterSales.errReasonRequired");
  if (!isExchange.value && amountError.value) return amountError.value;
  return null;
});

const hasDraft = computed(
  () =>
    !!reasonKey.value ||
    !!reasonOther.value.trim() ||
    !!description.value.trim() ||
    !!amountText.value.trim() ||
    evidenceUrls.value.length > 0,
);

function resetForm() {
  selectedType.value = "return_refund";
  amountText.value = maxYuan.value > 0 ? maxYuan.value.toFixed(2) : "";
  reasonKey.value = "";
  reasonOther.value = "";
  description.value = "";
  evidenceUrls.value = [];
  formError.value = null;
  submitting.value = false;
}

// 打开时重置全部字段（修掉「重开表单残留上次填写内容」）
watch(isOpen, (open) => {
  if (open) resetForm();
});

// 类型切换：换货 → 退款类，金额按上限重新预填（不清空原因/描述）
watch(selectedType, (next, prev) => {
  if (next !== "exchange" && prev === "exchange") {
    amountText.value = maxYuan.value > 0 ? maxYuan.value.toFixed(2) : "";
  }
});

function onAmountInput(e: Event) {
  const raw = (e.target as HTMLInputElement).value;
  // 自动截断到两位小数
  const cleaned = raw.replace(/[^\d.]/g, "");
  const [int = "", ...rest] = cleaned.split(".");
  amountText.value = rest.length ? `${int}.${rest.join("").slice(0, 2)}` : int;
}

function fillFullAmount() {
  amountText.value = maxYuan.value.toFixed(2);
}

function pickReason(key: string) {
  reasonKey.value = key;
  if (key !== "other") reasonOther.value = "";
}

function requestClose() {
  if (submitting.value) return;
  if (hasDraft.value) {
    discardConfirmOpen.value = true;
    return;
  }
  isOpen.value = false;
}

const SERVER_ERROR_MAP: { match: RegExp; key: string }[] = [
  { match: /After-sales already exists/i, key: "messages.afterSales.errDuplicate" },
  { match: /exceeds max/i, key: "messages.afterSales.errAmountMaxServer" },
  { match: /days limit/i, key: "messages.afterSales.errExpired" },
];

function mapServerError(msg: string): string {
  const hit = SERVER_ERROR_MAP.find((m) => m.match.test(msg));
  return hit ? t(hit.key) : `${t("messages.afterSales.errGeneric")}`;
}

async function onSubmit() {
  formError.value = null;
  if (!canSubmit.value) return;
  submitting.value = true;
  const res = await createRequest({
    orderId: props.orderId,
    orderLineId: props.orderLine.id,
    type: selectedType.value,
    reason: reasonValue.value,
    description: description.value.trim() || null,
    evidenceImages: evidenceUrls.value.length ? evidenceUrls.value : null,
    // 换货不产生退款：后端 refundAmount 为必填 Int!，固定提交 0
    refundAmount: isExchange.value ? 0 : Math.round(amountNumber.value * 100),
  });
  submitting.value = false;
  if (res.ok && res.id) {
    isOpen.value = false;
    useToast().add({ title: t("messages.afterSales.createSuccess"), color: "success" });
    navigateTo(localePath(`/account/after-sales/${res.id}`));
    return;
  }
  // 失败时弹层不关闭，保留全部已填内容与已上传图片
  formError.value = mapServerError(res.message ?? "");
}
</script>

<template>
  <UModal v-model:open="isOpen" :ui="{ content: 'sm:max-w-lg' }" :close="false">
    <template #body>
      <div class="max-h-[80vh] overflow-y-auto">
        <h3 class="mb-3 text-lg font-semibold">{{ t("messages.afterSales.applyTitle") }}</h3>

        <!-- ① 商品行（只读） -->
        <div class="mb-4 flex items-center gap-3 rounded-md bg-neutral-50 p-3 dark:bg-neutral-900">
          <div class="min-w-0">
            <p class="truncate text-sm font-medium">{{ productName }}</p>
            <p class="text-xs text-neutral-500">
              {{ t("messages.afterSales.maxRefundable", { amount: maxYuan.toFixed(2) }) }}
            </p>
          </div>
        </div>

        <!-- ② 售后类型 -->
        <p class="mb-2 text-sm font-medium">{{ t("messages.afterSales.type") }}</p>
        <div class="mb-4 grid grid-cols-3 gap-2">
          <button
            v-for="opt in TYPE_OPTIONS"
            :key="opt.value"
            type="button"
            class="rounded-md border p-2 text-left text-xs"
            :class="
              selectedType === opt.value
                ? 'border-primary bg-primary/5 text-primary'
                : 'border-neutral-200 text-neutral-600 dark:border-neutral-800 dark:text-neutral-300'
            "
            @click="selectedType = opt.value"
          >
            <span class="block text-sm font-medium">{{ t(opt.labelKey) }}</span>
            <span class="mt-0.5 block text-[11px] text-neutral-500">{{ t(opt.descKey) }}</span>
          </button>
        </div>
        <p class="mb-4 text-xs text-neutral-500">
          {{ t(TYPE_OPTIONS.find((o) => o.value === selectedType)!.hintKey) }}
        </p>

        <!-- ③ 退款金额（换货隐藏） -->
        <template v-if="!isExchange">
          <div class="mb-1 flex items-center justify-between">
            <span class="text-sm font-medium">{{ t("messages.afterSales.refundAmount") }}</span>
            <button type="button" class="text-xs text-primary" @click="fillFullAmount">
              {{ t("messages.afterSales.fullAmount") }}
            </button>
          </div>
          <div class="mb-1 flex items-center gap-2">
            <span class="text-sm">¥</span>
            <input
              :value="amountText"
              inputmode="decimal"
              class="w-full rounded-md border border-neutral-300 px-3 py-2 text-base dark:border-neutral-700 dark:bg-neutral-900"
              @input="onAmountInput"
            />
          </div>
          <p v-if="amountError" class="mb-4 text-xs text-error">{{ amountError }}</p>
          <div v-else class="mb-4" />
        </template>

        <!-- ④ 申请原因 -->
        <p class="mb-2 text-sm font-medium">
          {{ t("messages.afterSales.reason") }} <span class="text-error">*</span>
        </p>
        <div class="mb-2 flex flex-wrap gap-2">
          <button
            v-for="k in REASON_KEYS"
            :key="k"
            type="button"
            class="rounded-full border px-3 py-1.5 text-xs"
            :class="
              reasonKey === k
                ? 'border-primary bg-primary text-white'
                : 'border-neutral-200 text-neutral-600 dark:border-neutral-800 dark:text-neutral-300'
            "
            @click="pickReason(k)"
          >
            {{ t(`messages.afterSales.reason_${k}`) }}
          </button>
        </div>
        <input
          v-if="isOther"
          v-model="reasonOther"
          :placeholder="t('messages.afterSales.reasonOtherPlaceholder')"
          class="mb-4 w-full rounded-md border border-neutral-300 px-3 py-2 text-base dark:border-neutral-700 dark:bg-neutral-900"
        />
        <div v-else class="mb-4" />

        <!-- ⑤ 问题描述 -->
        <p class="mb-2 text-sm font-medium">{{ t("messages.afterSales.description") }}</p>
        <div class="relative mb-4">
          <textarea
            v-model="description"
            :maxlength="MAX_DESC"
            rows="3"
            :placeholder="t('messages.afterSales.descPlaceholder')"
            class="w-full rounded-md border border-neutral-300 px-3 py-2 text-base dark:border-neutral-700 dark:bg-neutral-900"
          />
          <span class="absolute bottom-2 right-2 text-xs text-neutral-400">
            {{ description.length }}/{{ MAX_DESC }}
          </span>
        </div>

        <!-- ⑥ 凭证图 -->
        <p class="mb-2 text-sm font-medium">{{ t("messages.afterSales.evidence") }}</p>
        <AfterSalesEvidenceUploader ref="evidenceRef" v-model="evidenceUrls" :max="MAX_EVIDENCE" />

        <p v-if="formError" class="mt-4 text-sm text-error">{{ formError }}</p>
      </div>
    </template>

    <template #footer>
      <div class="flex items-center justify-between gap-3">
        <span class="text-xs text-neutral-500">{{ disabledReason }}</span>
        <div class="flex gap-3">
          <UButton variant="ghost" :label="t('messages.afterSales.cancel')" @click="requestClose" />
          <UButton
            color="primary"
            :loading="submitting"
            :disabled="!canSubmit"
            :label="submitting ? t('messages.afterSales.submitting') : t('messages.afterSales.submit')"
            @click="onSubmit"
          />
        </div>
      </div>
    </template>
  </UModal>

  <!-- 放弃填写二次确认 -->
  <UModal v-model:open="discardConfirmOpen" :ui="{ content: 'sm:max-w-sm' }">
    <div class="p-5 text-center">
      <h2 class="text-base font-medium">{{ t("messages.afterSales.discardTitle") }}</h2>
      <p class="mt-1 text-sm text-neutral-500">{{ t("messages.afterSales.discardDesc") }}</p>
      <div class="mt-5 flex justify-center gap-3">
        <UButton variant="soft" :label="t('messages.afterSales.keepEditing')" @click="discardConfirmOpen = false" />
        <UButton
          color="error"
          :label="t('messages.afterSales.discard')"
          @click="
            () => {
              discardConfirmOpen = false;
              isOpen = false;
            }
          "
        />
      </div>
    </div>
  </UModal>
</template>
