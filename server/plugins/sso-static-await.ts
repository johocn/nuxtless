// 静态品牌星轨遮罩（SSR 首字节注入）
// ---------------------------------------------------------------
// 背景：SSO 登录等待期的品牌遮罩 <SsoAwaitOverlay /> 是 Vue 组件，只有 app
// 渲染/hydration 后才可能 paint，盖不住「Vue 应用加载前」的几秒空白（GetChannelTheme
// 顶层 await loadTheme() 阻塞 app，首帧前无任何内容）。本 plugin 把一套纯 CSS 的
// 星轨遮罩作为静态外壳写入 SSR 首字节 HTML，不依赖 Vue、不依赖 JS 执行，保证从首字节
// 就存在。Vue app 接管后由 SsoAwaitOverlay.vue 在 onMounted 时移除（见该组件）。
export default defineNitroPlugin((nitroApp) => {
  nitroApp.hooks.hook("render:html", (html) => {
    // 星轨遮罩结构（纯 CSS 动画，无 JS）——与 SsoAwaitOverlay 视觉一致的静态版
    html.bodyAppend.push(`
<div id="sso-static-await">
  <div class="sso-static-card">
    <div class="sso-static-orb"><div class="sso-static-core"></div><div class="sso-static-ring"></div><div class="sso-static-sat"></div></div>
    <div class="sso-static-title">星枢关系中心</div>
    <div class="sso-static-status">星枢正在为您护航…</div>
  </div>
</div>
`);

    // 纯 CSS 自包含样式，全部作用域限定在 #sso-static-await 内，避免污染业务样式
    html.head.push(`
<style id="sso-static-await-style">
#sso-static-await {
  position: fixed; inset: 0; z-index: 9999;
  display: flex; align-items: center; justify-content: center;
  background: linear-gradient(170deg, #f9f7ff 0%, #f1ecfb 100%);
  padding-top: 8vh;
}
#sso-static-await .sso-static-card { display: flex; flex-direction: column; align-items: center; gap: 16px; }
#sso-static-await .sso-static-orb { width: 104px; height: 104px; position: relative; flex: none; }
#sso-static-await .sso-static-core {
  position: absolute; inset: 8px; border-radius: 50%;
  background: radial-gradient(circle at 32% 30%, #a5b4fc, #667eea 70%);
  box-shadow: 0 0 26px rgba(102, 126, 234, 0.7);
}
#sso-static-await .sso-static-ring {
  position: absolute; inset: 0; border-radius: 50%;
  border: 2px dashed rgba(102, 126, 234, 0.35);
}
#sso-static-await .sso-static-sat {
  position: absolute; top: -4px; left: 50%;
  width: 14px; height: 14px; border-radius: 50%; background: #fff;
  box-shadow: 0 0 12px #667eea;
  transform-origin: 7px 56px;
  animation: sso-static-orbit 1.6s linear infinite;
}
@keyframes sso-static-orbit { to { transform: rotate(360deg); } }
#sso-static-await .sso-static-title { margin: 0; font-size: 20px; font-weight: 600; color: #333; }
#sso-static-await .sso-static-status {
  margin: 0; font-size: 13px; color: #8898aa; padding: 6px 14px; border-radius: 999px;
  background: rgba(102, 126, 234, 0.12);
}
@media (prefers-reduced-motion: reduce) {
  #sso-static-await .sso-static-sat { animation: none; }
}
</style>
`);
  });
});