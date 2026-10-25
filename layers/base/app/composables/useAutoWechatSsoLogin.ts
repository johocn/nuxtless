import { isWechatBrowser, useSso } from "./useSso";
import { shouldSkipAutoLogin } from "../utils/sso-return-url";
import { shouldShowOverlay } from "../utils/sso-provider";

const AUTO_JUMP_KEY = "youshop_sso_auto_jumped";
/** 等待 provider 的上限：超时即放弃本轮跳转并撤掉遮罩（网络挂起时不能永久遮挡首页） */
const PROVIDER_WAIT_TIMEOUT_MS = 10_000;

/** 给 Promise 加超时：超时返回 null，避免 fetch 挂起导致 await 永不返回 */
function withTimeout<T>(p: Promise<T>, ms: number): Promise<T | null> {
  return Promise.race([p, new Promise<null>(resolve => setTimeout(() => resolve(null), ms))]);
}

export function useAutoWechatSsoLogin() {
  const { fetchProviders, startProviderPrefetch, getRedirectProvider, getPendingState, loginWithSso } = useSso();

  // 尽早预取（不等 await），app.vue setup 调用即触发，跳转前不阻塞首帧。
  // 预取失败不能冒泡成 unhandledRejection，也不影响后续实时拉取。
  if (import.meta.client) {
    void startProviderPrefetch().catch((err) => console.warn("[sso] provider 预取失败", err));
  }

  async function run(): Promise<void> {
    if (import.meta.server) return;
    const route = useRoute();
    const authStore = useAuthStore();
    if (authStore.isAuthenticated) return;
    if (shouldSkipAutoLogin(route.path)) return;

    if (isWechatBrowser() && !sessionStorage.getItem(AUTO_JUMP_KEY)) {
      const pending = getPendingState();
      pending.value = true; // 让品牌遮罩立即出现，兜底预取/实时拉取的等待
      let jumped = false;
      try {
        const result = await withTimeout(getRedirectProvider(), PROVIDER_WAIT_TIMEOUT_MS);
        const provider = result?.provider;
        if (provider) {
          sessionStorage.setItem(AUTO_JUMP_KEY, "1");
          const invite = typeof route.query.invite === "string" ? route.query.invite : "";
          loginWithSso(provider, {
            inviteCode: invite || undefined,
            returnUrl: route.fullPath,
          });
          jumped = true;
        }
      } catch (err) {
        // provider 拉取失败（502/断网）：撤掉本轮跳转标记，同一 session 下次进入仍可重试
        sessionStorage.removeItem(AUTO_JUMP_KEY);
        console.warn("[sso] 微信自动登录跳过（provider 拉取失败）", err);
      } finally {
        // 只有未发起跳转才复位遮罩：发起跳转时保持遮罩到页面离开，避免闪一下首页
        if (!jumped) pending.value = false;
      }
    }
  }

  onMounted(() => {
    void run();
  });

  /** 供 app.vue setup 尽早触发预取（不等待） */
  return { run, startProviderPrefetch: () => void startProviderPrefetch().catch(() => {}), fetchProviders };
}