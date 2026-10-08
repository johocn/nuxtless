import { writeVendureSessionToken } from "./../app/utils/vendure-session";

/**
 * 会话状态与令牌存储分离（安全收敛，2026-10-08）：
 * - token 只存 `vendure_shop_token` 单一 cookie（app/utils/vendure-session.ts），
 *   不再进 persistedstate 的 `auth` cookie——消除会话凭证双份 JS 可读持久化。
 * - auth store 仅承载用户展示信息（id/email/inviteCode，泄露无害）。
 * - token 读取统一走 readVendureTokenWithContext()（SSR 读请求 cookie，客户端读 document.cookie）。
 */
export const useAuthStore = defineStore(
  "auth",
  () => {
    const session = ref<{
      user?: {
        id: string;
        email: string;
        inviteCode?: string;
      };
    } | null>(null);

    /** 记录会话：token 只写 vendure_shop_token cookie，不进持久化 state */
    function setSession(
      token: string,
      user?: { id: string; email: string },
      _source: "vendure" = "vendure",
    ) {
      writeVendureSessionToken(token);
      if (user) session.value = { user };
    }

    function setUser(user: { id: string; email: string; inviteCode?: string }) {
      session.value = { ...session.value, user };
    }

    function clearSession() {
      session.value = null;
      writeVendureSessionToken(null);
    }

    const isAuthenticated = computed(() => !!session.value?.user?.id);

    return {
      session,
      setSession,
      setUser,
      clearSession,
      isAuthenticated,
    };
  },
  {
    // 只持久化用户展示信息；旧版持久化数据里的 token 字段不在 pick 内，
    // 下次写入即被剔除，不会重新落盘
    persist: { pick: ["session.user"] },
  },
);
