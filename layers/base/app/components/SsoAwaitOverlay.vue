<!-- 品牌等待遮罩：微信端未登录等待 SSO 跳转期间的品牌化兜底层（文案与星枢 dict 同源，品牌紫 #667eea；支持 reduced-motion 降级） -->
<script setup lang="ts">
import { isWechatBrowser, useSso } from "../composables/useSso";
import { shouldShowOverlay } from "../utils/sso-provider";

const { getPendingState } = useSso();
const pending = getPendingState();
const authStore = useAuthStore();

const visible = computed(() =>
  shouldShowOverlay({ pending: pending.value, authenticated: authStore.isAuthenticated, isWechat: isWechatBrowser() }),
);

const TITLE = "星枢统一关系中心";
const SLOGANS = ["一个账号，玩转全部系统", "星枢，让系统彼此相连", "登录一次，处处同步", "安全 · 统一 · 更便捷"];
const STATUS = "正在校验登录凭证…";
const badgeIdx = ref(0);
let timer: number | undefined;

onMounted(() => {
  timer = window.setInterval(() => {
    badgeIdx.value = (badgeIdx.value + 1) % SLOGANS.length;
  }, 2600);
});
onUnmounted(() => timer && window.clearInterval(timer));
</script>

<template>
  <Teleport to="body">
    <div v-if="visible" class="sso-await-overlay">
      <div class="sso-card">
        <svg class="sso-spinner" viewBox="0 0 48 48" width="52" height="52" aria-hidden="true">
          <circle class="sso-spinner-track" cx="24" cy="24" r="20" />
          <circle class="sso-spinner-bar" cx="24" cy="24" r="20" />
        </svg>
        <p class="sso-logo">{{ TITLE }}</p>
        <p class="sso-slogan sso-slogan-anim" :key="badgeIdx">{{ SLOGANS[badgeIdx] }}</p>
        <span class="sso-status">{{ STATUS }}</span>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.sso-await-overlay {
  position: fixed;
  inset: 0;
  z-index: 9999;
  display: flex;
  align-items: center;
  justify-content: center;
  background: #f5f5f7;
}
.sso-card { display: flex; flex-direction: column; align-items: center; gap: 18px; }
.sso-spinner { transform: rotate(-90deg); }
.sso-spinner-track { fill: none; stroke: #e5e7eb; stroke-width: 5; }
.sso-spinner-bar {
  fill: none; stroke: #667eea; stroke-width: 5; stroke-linecap: round;
  stroke-dasharray: 126; stroke-dashoffset: 100;
  animation: sso-rotate 1s linear infinite;
}
@keyframes sso-rotate { to { transform: rotate(360deg); } }
.sso-logo { margin: 0; font-size: 18px; font-weight: 600; color: #333; }
.sso-slogan { margin: 0; font-size: 14px; color: #667eea; min-height: 1.4em; }
.sso-slogan-anim { animation: sso-fade 0.9s ease; }
@keyframes sso-fade { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: none; } }
.sso-status {
  font-size: 13px; color: #8898aa; padding: 6px 14px; border-radius: 999px;
  background: rgba(102, 126, 234, 0.12);
}
@media (prefers-reduced-motion: reduce) {
  .sso-spinner-bar, .sso-slogan-anim { animation: none; }
}
</style>