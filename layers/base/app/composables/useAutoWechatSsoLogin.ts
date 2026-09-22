import { isWechatBrowser, useSso } from "./useSso";
import { shouldSkipAutoLogin } from "../utils/sso-return-url";
import { shouldShowOverlay } from "../utils/sso-provider";

const AUTO_JUMP_KEY = "youshop_sso_auto_jumped";

export function useAutoWechatSsoLogin() {
  const { fetchProviders, startProviderPrefetch, getRedirectProvider, getPendingState, loginWithSso } = useSso();

  // 尽早预取（不等 await），app.vue setup 调用即触发，跳转前不阻塞首帧
  if (import.meta.client) void startProviderPrefetch();

  async function run(): Promise<void> {
    if (import.meta.server) return;
    const route = useRoute();
    const authStore = useAuthStore();
    if (authStore.isAuthenticated) return;
    if (shouldSkipAutoLogin(route.path)) return;

    if (isWechatBrowser() && !sessionStorage.getItem(AUTO_JUMP_KEY)) {
      const pending = getPendingState();
      pending.value = true; // 让品牌遮罩立即出现，兜底预取/实时拉取的等待
      const { provider } = await getRedirectProvider();
      if (provider) {
        sessionStorage.setItem(AUTO_JUMP_KEY, "1");
        const invite = typeof route.query.invite === "string" ? route.query.invite : "";
        loginWithSso(provider, {
          inviteCode: invite || undefined,
          returnUrl: route.fullPath,
        });
      } else {
        pending.value = false; // 无提供商：取消遮罩，不跳转
      }
    }
  }

  onMounted(() => {
    void run();
  });

  /** 供 app.vue setup 尽早触发预取（不等待） */
  return { run, startProviderPrefetch: () => void startProviderPrefetch(), fetchProviders };
}