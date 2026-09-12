import { isWechatBrowser, useSso } from "./useSso";

const AUTO_JUMP_KEY = "youshop_sso_auto_jumped";

/** 首页微信环境自动 SSO 登录（走 h.joho.cn 统一登录页）。
 *  仅客户端、仅微信内置浏览器、未登录、且本会话未自动跳转过时，跳转统一登录页；
 *  登录成功后回跳 sso-callback 落点，再由其兑换并回跳首页（带邀请码）。 */
export function useAutoWechatSsoLogin() {
  const localePath = useTenantLocalePath();
  const route = useRoute();
  const { fetchProviders, loginWithSso } = useSso();

  async function run(): Promise<void> {
    if (import.meta.server) return;
    const authStore = useAuthStore();
    if (authStore.isAuthenticated) return;

    // 未登录 + 微信内置浏览器 + 未自动跳转过 → 统一登录页自动登录，回跳首页
    if (isWechatBrowser() && !sessionStorage.getItem(AUTO_JUMP_KEY)) {
      const providers = await fetchProviders();
      const provider = providers[0];
      if (provider) {
        sessionStorage.setItem(AUTO_JUMP_KEY, "1");
        // 分享链接落到首页时保留 ?invite，避免自动登录丢失邀请码
        const invite = typeof route.query.invite === "string" ? route.query.invite : "";
        const home = `${window.location.origin}${localePath("/")}`;
        loginWithSso(provider, {
          inviteCode: invite || undefined,
          returnUrl: invite ? `${home}?invite=${encodeURIComponent(invite)}` : home,
        });
      }
    }
  }

  onMounted(() => {
    void run();
  });

  return { run };
}