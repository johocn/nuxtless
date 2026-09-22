<!-- 品牌等待遮罩：微信端未登录等待 SSO 跳转期间的品牌化兜底层。动效=放大星轨卫星环；上移居中排版；
     标题「星枢关系中心」；状态「星枢正在为您护航…」；广告语 4 条轮播；reduced-motion 降级 -->
<script setup lang="ts">
import { isWechatBrowser, useSso } from "../composables/useSso";
import { shouldShowOverlay } from "../utils/sso-provider";

const { getPendingState } = useSso();
const pending = getPendingState();
const authStore = useAuthStore();

const visible = computed(() =>
  shouldShowOverlay({ pending: pending.value, authenticated: authStore.isAuthenticated, isWechat: isWechatBrowser() }),
);

const TITLE = "星枢关系中心";
const SLOGANS = ["一个账号，玩转全部系统", "星枢，让系统彼此相连", "登录一次，处处同步", "安全 · 统一 · 更便捷"];
const STATUS = "星枢正在为您护航…";
const badgeIdx = ref(0);
let timer: number | undefined;

onMounted(() => {
  // Vue app 已接管：移除 SSR 首字节注入的纯 CSS 静态遮罩壳，避免与本组件叠加。
  // 本组件仅在微信端未登录等待 SSO 跳转时可见（visible 为 true），此时静态壳被真正的
  // 动效遮罩无缝顶替；非该场景（普通用户）下 app 渲染时静态壳随此回调一并被清掉，无感。
  document.getElementById("sso-static-await")?.remove();
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
        <div class="sso-orb" aria-hidden="true">
          <div class="sso-orb-core"></div>
          <div class="sso-orb-ring"></div>
          <div class="sso-orb-sat"></div>
        </div>
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
  background: linear-gradient(170deg, #f9f7ff 0%, #f1ecfb 100%);
  padding-top: 8vh; /* 视觉重心上移但不顶死 */
}
.sso-card { display: flex; flex-direction: column; align-items: center; gap: 16px; }

/* 星轨卫星环（放大主视觉） */
.sso-orb { width: 104px; height: 104px; position: relative; flex: none; }
.sso-orb-core {
  position: absolute; inset: 8px; border-radius: 50%;
  background: radial-gradient(circle at 32% 30%, #a5b4fc, #667eea 70%);
  box-shadow: 0 0 26px rgba(102, 126, 234, 0.7);
}
.sso-orb-ring {
  position: absolute; inset: 0; border-radius: 50%;
  border: 2px dashed rgba(102, 126, 234, 0.35);
}
.sso-orb-sat {
  position: absolute; top: -4px; left: 50%;
  width: 14px; height: 14px; border-radius: 50%; background: #fff;
  box-shadow: 0 0 12px #667eea;
  transform-origin: 7px 56px;
  animation: sso-orbit 1.6s linear infinite;
}
@keyframes sso-orbit { to { transform: rotate(360deg); } }

.sso-logo { margin: 0; font-size: 20px; font-weight: 600; color: #333; }
.sso-slogan { margin: 0; font-size: 14px; color: #667eea; min-height: 1.4em; }
.sso-slogan-anim { animation: sso-fade 0.9s ease; }
@keyframes sso-fade { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: none; } }
.sso-status {
  font-size: 13px; color: #8898aa; padding: 6px 14px; border-radius: 999px;
  background: rgba(102, 126, 234, 0.12);
}
@media (prefers-reduced-motion: reduce) {
  .sso-orb-sat, .sso-slogan-anim { animation: none; }
}
</style>