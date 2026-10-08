<script setup lang="ts">
import { couponYuan } from "~~/layers/base/app/utils/coupon";

/**
 * 券商城支付方式弹层（底部 sheet）。确认/关闭 emit 给页面执行（余额支付 / 微信拉起 / 取消订单）。
 */
defineProps<{
  name: string;
  /** 金额（分） */
  amount: number;
  paying: boolean;
}>();
const emit = defineEmits<{
  (e: "confirm"): void;
  (e: "close"): void;
}>();

const mode = defineModel<"WECHAT" | "BALANCE">({ required: true });

const { t } = useI18n();
</script>

<template>
  <div
    class="fixed inset-0 z-[70] flex items-end justify-center bg-black/40"
    @click.self="emit('close')"
  >
    <div class="w-full max-w-md rounded-t-2xl bg-(--ui-bg) p-5">
      <p class="mb-1 text-lg font-semibold">{{ t("messages.coupon.payTitle") }}</p>
      <p class="mb-4 text-sm text-(--ui-text-muted)">{{ name }} · ¥{{ couponYuan(amount) }}</p>

      <button
        type="button"
        class="mb-2 flex w-full items-center gap-3 rounded-lg border p-3 text-left"
        :class="mode === 'WECHAT' ? 'border-primary' : 'border-(--ui-border)'"
        @click="mode = 'WECHAT'"
      >
        <span
          class="size-3.5 shrink-0 rounded-full border-2"
          :class="mode === 'WECHAT' ? 'border-primary bg-primary' : 'border-(--ui-border)'"
        />
        <span class="flex-1 font-medium">{{ t("messages.coupon.payWechat") }}</span>
        <span class="text-xs text-(--ui-text-muted)">{{ t("messages.coupon.payWechatSub") }}</span>
      </button>
      <button
        type="button"
        class="mb-4 flex w-full items-center gap-3 rounded-lg border p-3 text-left"
        :class="mode === 'BALANCE' ? 'border-primary' : 'border-(--ui-border)'"
        @click="mode = 'BALANCE'"
      >
        <span
          class="size-3.5 shrink-0 rounded-full border-2"
          :class="mode === 'BALANCE' ? 'border-primary bg-primary' : 'border-(--ui-border)'"
        />
        <span class="flex-1 font-medium">{{ t("messages.coupon.payBalance") }}</span>
      </button>

      <div class="flex gap-3">
        <UButton class="flex-1 justify-center" variant="soft" :disabled="paying" @click="emit('close')">
          {{ t("messages.general.cancel") }}
        </UButton>
        <UButton class="flex-1 justify-center" :loading="paying" :disabled="paying" @click="emit('confirm')">
          {{ t("messages.coupon.payConfirm", { n: couponYuan(amount) }) }}
        </UButton>
      </div>
    </div>
  </div>
</template>
