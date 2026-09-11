<script setup lang="ts">
import { isWechatBrowser, useSso } from "../composables/useSso";

// 条件引导条：URL 带 ?invite 且未登录 → 底部弹「微信一键登录」，登录走直连授权并精确回跳本页。
// 一次性提示（可关闭），本会话后不再打扰。
const route = useRoute();
const localePath = useTenantLocalePath();
const { t } = useI18n();
const authStore = useAuthStore();
const { fetchProviders, loginWithWechat } = useSso();

const SKIP_KEY = "youshop_invite_bar_skipped";
const invite = computed(() => (route.query.invite as string) || "");
const show = ref(false);

async function goLogin() {
  const providers = await fetchProviders();
  const provider = providers[0];
  if (provider) {
    loginWithWechat(provider, { inviteCode: invite.value, returnUrl: route.fullPath });
  }
}

onMounted(() => {
  if (
    invite.value &&
    !authStore.isAuthenticated &&
    !sessionStorage.getItem(SKIP_KEY) &&
    isWechatBrowser()
  ) {
    show.value = true;
  }
});

function dismiss() {
  show.value = false;
  sessionStorage.setItem(SKIP_KEY, "1");
}
</script>

<template>
  <div
    v-if="show"
    class="fixed inset-x-0 bottom-0 z-[75] border-t border-gray-100 bg-white p-3 shadow-[0_-2px_16px_rgba(0,0,0,0.10)]"
  >
    <div class="mx-auto flex max-w-md items-center gap-3">
      <p class="flex-1 text-sm font-medium text-gray-700">{{ t("messages.share.inviteBar") }}</p>
      <UButton
        icon="i-lucide-x"
        variant="ghost"
        color="neutral"
        class="h-8 w-8 !p-0"
        :aria-label="t('messages.share.inviteBarClose')"
        @click="dismiss"
      />
    </div>
    <UButton class="mt-2 w-full justify-center" color="primary" size="lg" @click="goLogin">
      {{ t("messages.share.wechatLogin") }}
    </UButton>
  </div>
</template>