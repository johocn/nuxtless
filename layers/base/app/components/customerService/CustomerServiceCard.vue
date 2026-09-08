<script setup lang="ts">
// 客服联系卡片：电话/微信/服务时间，数据源 app.config.ts customerService。
// 供售后列表页、售后详情页等需要引导用户联系客服的场景复用。
const { t } = useI18n();
const toast = useToast();
const { customerService } = useAppConfig();

const phone = computed(() => customerService.phone);
const wechat = computed(() => customerService.wechat);
const hours = computed(() => customerService.hours);

async function copyWechat() {
  if (!wechat.value) return;
  try {
    await navigator.clipboard.writeText(wechat.value);
    toast.add({ title: t("messages.afterSales.wechatCopied"), color: "success" });
  } catch {
    // 剪切板不可用时退化：展示可手动复制
  }
}
</script>

<template>
  <section
    aria-labelledby="customer-service-heading"
    class="rounded-lg border border-neutral-200 p-4 dark:border-neutral-800"
  >
    <div class="mb-3 flex items-center gap-2">
      <span class="h-3.5 w-1 rounded-sm bg-primary-500" />
      <h3 id="customer-service-heading" class="text-base font-medium">{{ t("messages.afterSales.customerService") }}</h3>
    </div>
    <p class="mb-3 text-sm text-neutral-500">{{ t("messages.afterSales.customerServiceHint") }}</p>

    <div class="flex flex-col gap-2 text-sm">
      <a
        v-if="phone"
        :href="`tel:${phone}`"
        class="flex items-center gap-2 rounded-md border border-neutral-200 bg-neutral-50 px-3 py-2 dark:border-neutral-800 dark:bg-neutral-900/40"
      >
        <UIcon name="i-lucide-phone" class="h-4 w-4 text-primary" />
        <span class="text-neutral-700 dark:text-neutral-300">{{ phone }}</span>
      </a>
      <div
        v-if="wechat"
        class="flex items-center justify-between gap-2 rounded-md border border-neutral-200 bg-neutral-50 px-3 py-2 dark:border-neutral-800 dark:bg-neutral-900/40"
      >
        <div class="flex items-center gap-2">
          <UIcon name="i-lucide-message-circle" class="h-4 w-4 text-primary" />
          <span class="text-neutral-700 dark:text-neutral-300">
            {{ t("messages.afterSales.wechat") }}: {{ wechat }}
          </span>
        </div>
        <UButton size="sm" variant="soft" :label="t('messages.afterSales.wechat')" @click="copyWechat" />
      </div>
      <p v-if="hours" class="flex items-center gap-2 px-1 text-xs text-neutral-500">
        <UIcon name="i-lucide-clock" class="h-4 w-4" />
        {{ t("messages.afterSales.hours") }}: {{ hours }}
      </p>
    </div>
  </section>
</template>