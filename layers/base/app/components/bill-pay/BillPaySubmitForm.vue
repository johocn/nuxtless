<script setup lang="ts">
import { UButton, UTextarea } from "#components";
import { invokeWechatPay, isWechatBrowser } from "../../utils/coupon";
import CouponPaySheet from "../coupon/PaySheet.vue";
import {
  billpayYuan,
  billpayErrorMessage,
  createBillPayOrder,
  createWechatBillPayment,
  payBillPayOrderWithBalance,
  quoteBillPreview,
  type BillPayConfig,
  type BillPayOrder,
} from "~~/layers/base/app/composables/useBillPay";

/**
 * 代买单提交表单（mockup A 版式主体）：商家输入（历史联想）→ 预计金额 → 备注 →
 * 报价卡（算账式预估）→《委托服务协议》强制勾选 → 提交并支付。
 * 提交后按返回报价走 PaySheet（微信 JSAPI / 余额），微信支付后短轮询确认。
 */
const props = defineProps<{ config: BillPayConfig | null; historyMerchants: string[] }>();
const emit = defineEmits<{ created: [order: BillPayOrder] }>();

const { t } = useI18n();
const toast = useToast();
const localePath = useTenantLocalePath();
const { isAuthenticated } = storeToRefs(useAuthStore());

const merchantName = ref("");
const amountYuan = ref<string>("");
const remark = ref("");
const agreed = ref(false);
const submitting = ref(false);
const paying = ref(false);

// 协议页（同 tab 跳转带 from=submit，「同意并返回」后回填勾选）
const agreementTo = computed(() => `${localePath("/billpay/agreement")}?from=submit`);
onMounted(() => {
  agreed.value = useState("billpay-agreed", () => false).value;
});

// 报价预估（前端同规则；最终以后端为准）
const amountCents = computed(() => {
  const n = Number(amountYuan.value);
  return Number.isFinite(n) && n > 0 ? Math.round(n * 100) : 0;
});
const preview = computed(() =>
  props.config && amountCents.value > 0 ? quoteBillPreview(amountCents.value, props.config) : null,
);
const quoteHint = computed(() => {
  if (!props.config || amountCents.value <= 0) return "";
  const r = preview.value;
  if (!r || r.payable == null) {
    if (r?.reason === "BELOW_MIN") return t("messages.billpay.belowMin", { amount: billpayYuan(props.config.minAmount) });
    if (r?.reason === "ABOVE_MAX") return t("messages.billpay.aboveMax", { amount: billpayYuan(props.config.maxAmount) });
    return "";
  }
  return "";
});
const canSubmit = computed(
  () => Boolean(merchantName.value.trim()) && amountCents.value > 0 && agreed.value && !submitting.value,
);

// 支付弹层（复用 CouponPaySheet）
const paySheetOpen = ref(false);
const payMode = ref<"WECHAT" | "BALANCE">("WECHAT");
const pendingOrder = ref<BillPayOrder | null>(null);

function requireLogin(): boolean {
  if (isAuthenticated.value) return true;
  const localePath = useTenantLocalePath();
  navigateTo(localePath("/account/login"));
  return false;
}

async function submit() {
  if (!requireLogin()) return;
  if (!canSubmit.value || submitting.value) return;
  submitting.value = true;
  try {
    const order = await createBillPayOrder({
      merchantName: merchantName.value.trim(),
      expectedAmount: amountCents.value,
      remark: remark.value.trim() || undefined,
    });
    emit("created", order);
    if (order.status === "PENDING_QUOTE") {
      // 超限额/人工报价：不弹支付，提示等待管家报价
      toast.add({ title: t("messages.billpay.submittedManual"), color: "success" });
      const localePath = useTenantLocalePath();
      navigateTo(localePath(`/billpay/orders/${order.id}`));
      return;
    }
    pendingOrder.value = order;
    payMode.value = isWechatBrowser() ? "WECHAT" : "BALANCE";
    paySheetOpen.value = true;
  } catch (e) {
    const raw = billpayErrorMessage(e);
    // 单日累计限额超限：后端 UserInputError('Daily bill pay limit exceeded') 映射为友好文案
    const description = /Daily bill pay limit exceeded/i.test(raw)
      ? t("messages.billpay.dailyLimitExceeded")
      : raw;
    toast.add({ title: t("messages.billpay.submitFailed"), description, color: "error" });
  } finally {
    submitting.value = false;
  }
}

/** 微信回调结算为异步：短轮询确认已支付（对齐 useCouponSaleFlow.waitForPaid） */
async function waitForPaid(orderId: string): Promise<void> {
  const { getBillPayOrder } = await import("~~/layers/base/app/composables/useBillPay");
  for (let i = 0; i < 5; i++) {
    try {
      const o = await getBillPayOrder(orderId);
      if (o.status === "PAID") return;
    } catch {
      // 轮询异常继续重试
    }
    await new Promise((r) => setTimeout(r, 1200));
  }
}

async function confirmPay() {
  const order = pendingOrder.value;
  if (!order || paying.value) return;
  paying.value = true;
  try {
    if (payMode.value === "BALANCE") {
      await payBillPayOrderWithBalance(order.id);
      await onPaid();
    } else {
      if (!isWechatBrowser()) {
        toast.add({ title: t("messages.coupon.notInWechat"), color: "warning" });
        return;
      }
      const res = await createWechatBillPayment(order.id);
      if (!res?.pay?.paySign) {
        toast.add({ title: t("messages.coupon.noOpenid"), color: "warning" });
        return;
      }
      try {
        await invokeWechatPay(res.pay);
      } catch (e) {
        toast.add({ title: t("messages.coupon.payCancelled"), description: billpayErrorMessage(e), color: "error" });
        return;
      }
      await waitForPaid(order.id);
      await onPaid();
    }
  } catch (e) {
    toast.add({ title: t("messages.coupon.payFailed"), description: billpayErrorMessage(e), color: "error" });
  } finally {
    paying.value = false;
  }
}

async function onPaid() {
  const order = pendingOrder.value;
  paySheetOpen.value = false;
  pendingOrder.value = null;
  toast.add({ title: t("messages.billpay.paySuccess"), color: "success" });
  const localePath = useTenantLocalePath();
  if (order) navigateTo(localePath(`/billpay/orders/${order.id}`));
}

function closePaySheet() {
  // 委托单已支付不可关单（区别于券单取消）：关闭仅收起弹层，单据留在「待支付」可稍后支付
  paySheetOpen.value = false;
  pendingOrder.value = null;
}
</script>

<template>
  <div class="flex flex-col gap-3">
    <!-- 商家 -->
    <div class="field">
      <label class="f-label" for="bp-merchant">{{ t("messages.billpay.merchantName") }}</label>
      <input
        id="bp-merchant"
        v-model="merchantName"
        class="f-input"
        type="text"
        :placeholder="t('messages.billpay.merchantPlaceholder')"
        maxlength="50"
        autocomplete="off"
      />
      <div v-if="historyMerchants.length" class="f-chips">
        <button
          v-for="m in historyMerchants.slice(0, 5)"
          :key="m"
          type="button"
          class="f-chip"
          @click="merchantName = m"
        >
          {{ m }}
        </button>
      </div>
    </div>

    <!-- 金额 -->
    <div class="field">
      <label class="f-label" for="bp-amount">{{ t("messages.billpay.expectedAmountTitle") }}</label>
      <div class="f-amount">
        <i>¥</i>
        <input
          id="bp-amount"
          v-model="amountYuan"
          class="f-input f-input-amount"
          type="number"
          inputmode="decimal"
          min="0"
          step="0.01"
          :placeholder="t('messages.billpay.amountPlaceholder')"
        />
      </div>
    </div>

    <!-- 备注 -->
    <div class="field">
      <label class="f-label" for="bp-remark">{{ t("messages.billpay.remarkTitle") }}</label>
      <UTextarea
        id="bp-remark"
        v-model="remark"
        :placeholder="t('messages.billpay.remarkPlaceholder')"
        :rows="2"
        :maxlength="100"
        class="w-full"
      />
    </div>

    <!-- 报价卡 -->
    <BillPayQuoteCard :config="config" :preview="preview" :base-amount="amountCents" :hint="quoteHint" />

    <!-- 身份声明（合规 §13 固定文案） -->
    <p class="identity-note">{{ t("messages.billpay.identityNote") }}</p>

    <!-- 协议勾选 -->
    <label class="agree-row">
      <UCheckbox v-model="agreed" />
      <span>
        {{ t("messages.billpay.agreePrefix") }}
        <NuxtLink :to="agreementTo" class="agree-link">{{ t("messages.billpay.agreementName") }}</NuxtLink>
      </span>
    </label>

    <UButton block size="lg" :loading="submitting" :disabled="!canSubmit" @click="submit">
      {{ t("messages.billpay.submitAndPay") }}
    </UButton>

    <CouponPaySheet
      v-if="paySheetOpen"
      v-model="payMode"
      :name="t('messages.billpay.paySheetName', { merchant: pendingOrder?.merchantName ?? '' })"
      :amount="pendingOrder?.quoteAmount ?? 0"
      :paying="paying"
      @confirm="confirmPay"
      @close="closePaySheet"
    />
  </div>
</template>

<style scoped>
.field { display: flex; flex-direction: column; gap: 6px; }
.f-label { font-size: 13px; font-weight: 600; color: var(--ui-text-highlighted); }
.f-input { width: 100%; border-radius: 12px; border: 1px solid var(--ui-border); background: var(--ui-bg); padding: 12px 14px; font-size: 16px; outline: none; }
.f-input:focus { border-color: var(--ui-primary); }
.f-input-amount { font-size: 22px; font-weight: 700; padding-left: 26px; }
.f-amount { position: relative; }
.f-amount > i { position: absolute; left: 14px; top: 50%; transform: translateY(-50%); font-style: normal; color: var(--ui-text-muted); font-size: 16px; }
.f-chips { display: flex; flex-wrap: wrap; gap: 6px; }
.f-chip { border-radius: 999px; border: 1px solid var(--ui-border); background: var(--ui-bg-muted); padding: 4px 12px; font-size: 12px; color: var(--ui-text-muted); cursor: pointer; }
.f-chip:hover { color: var(--ui-primary); border-color: var(--ui-primary); }
.identity-note { border-radius: 10px; background: var(--ui-bg-muted); color: var(--ui-text-muted); font-size: 12px; line-height: 1.6; padding: 10px 12px; }
.agree-row { display: flex; align-items: flex-start; gap: 8px; font-size: 12px; color: var(--ui-text-muted); line-height: 1.5; }
.agree-link { color: var(--ui-primary); }
</style>
