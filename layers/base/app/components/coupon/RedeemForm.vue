<script setup lang="ts">
/**
 * ④ 兑换码表单。提交动作 emit 给页面执行（需登录 + API + 刷新跳转）。
 */
const redeemCode = defineModel<string>({ required: true });

defineProps<{ redeeming: boolean }>();
const emit = defineEmits<{ (e: "submit"): void }>();

const { t } = useI18n();
</script>

<template>
  <div class="flex flex-wrap items-center gap-3 rounded-xl border border-(--ui-border) p-4">
    <p class="font-semibold">{{ t("messages.coupon.redeemTitle") }}</p>
    <UInput
      v-model="redeemCode"
      class="w-52"
      :placeholder="t('messages.coupon.redeemPlaceholder')"
      :disabled="redeeming"
      @keyup.enter="emit('submit')"
    />
    <UButton
      color="primary"
      :loading="redeeming"
      :disabled="!redeemCode.trim() || redeeming"
      @click="emit('submit')"
    >
      {{ t("messages.coupon.redeemBtn") }}
    </UButton>
  </div>
</template>
