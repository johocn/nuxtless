import { isWechatBrowser, useSso } from "./useSso";
import { shouldSkipAutoLogin } from "../utils/sso-return-url";

const AUTO_JUMP_KEY = "youshop_sso_auto_jumped";

/** 微信环境全站自动 SSO 登录（走 h.joho.cn 统一登录页，app.vue 挂载对全站生效）。
 *  仅客户端、仅微信内置浏览器、未登录、非登录/注册/回调页、且本会话未自动跳过时，
 *  跳转统一登录页（参数对齐既有 SSO 方案：app_code/return_url/channel_code/invite_code 一个不少）；
 *  登录成功后回跳 sso-callback 落点，再由其兑换并回跳进入时的原页面（?invite 天然保留在 fullPath）。 */
export function useAutoWechatSsoLogin() {
  const { fetchProviders, loginWithSso } = useSso();

  async function run(): Promise<void> {
    if (import.meta.server) return;
    // 在回调同步前缀内取 route：app.vue 根组件 setup 期不一定有路由上下文，
    // onMounted 回调同步前缀内 getCurrentInstance 可用，useRoute 在此必然安全
    const route = useRoute();
    const authStore = useAuthStore();
    if (authStore.isAuthenticated) return;
    if (shouldSkipAutoLogin(route.path)) return;

    // 未登录 + 微信内置浏览器 + 未自动跳过 → 统一登录页自动登录，回跳进入时的原页
    if (isWechatBrowser() && !sessionStorage.getItem(AUTO_JUMP_KEY)) {
      const providers = await fetchProviders();
      const provider = providers[0];
      if (provider) {
        sessionStorage.setItem(AUTO_JUMP_KEY, "1");
        // 分享链接 ?invite 透传统一页绑定分销关系；回跳目标用 fullPath 保留全部查询参数
        const invite = typeof route.query.invite === "string" ? route.query.invite : "";
        loginWithSso(provider, {
          inviteCode: invite || undefined,
          returnUrl: route.fullPath,
        });
      }
    }
  }

  onMounted(() => {
    void run();
  });

  return { run };
}
