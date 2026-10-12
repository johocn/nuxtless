<script setup lang="ts">
/**
 * 取消订单二次确认弹窗（OrderActions / OrderCardActions 共用）。
 * UModal 默认插槽是触发器，内容必须放 #body，否则整块常驻页面。
 * 确认动作交由父组件执行（loading 状态由父侧通过 confirmLoading 回传）。
 */
const open = defineModel<boolean>("open", { default: false });

const props = defineProps<{ confirmLoading?: boolean }>();
const emit = defineEmits<{ (e: "confirm"): void }>();

const { t } = useI18n();

function onConfirm() {
  emit("confirm");
}
</script>

<template>
  <UModal v-model:open="open" :ui="{ content: 'sm:max-w-sm', header: 'hidden' }">
    <template #body>
      <div class="p-5 text-center">
        <h2 class="text-base font-medium text-neutral-900">
          {{ t("messages.order.cancelConfirmTitle") }}
        </h2>
        <p class="mt-2 text-sm text-neutral-500">
          {{ t("messages.order.cancelConfirmDesc") }}
        </p>
        <div class="mt-5 flex justify-center gap-3">
          <UButton
            variant="soft"
            color="neutral"
            :label="t('messages.order.cancelKeep')"
            :disabled="confirmLoading"
            @click="open = false"
          />
          <UButton
            color="error"
            :label="t('messages.order.cancelConfirmBtn')"
            :loading="confirmLoading"
            @click="onConfirm"
          />
        </div>
      </div>
    </template>
  </UModal>
</template>
