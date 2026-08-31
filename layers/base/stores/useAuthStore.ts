import { writeVendureSessionToken } from "./../app/utils/vendure-session";

export const useAuthStore = defineStore(
  "auth",
  () => {
    const session = ref<{
      token: string | null;
      tokenSource?: "vendure";
      user?: {
        id: string;
        email: string;
      };
    } | null>(null);

    function setSession(
      token: string,
      user?: { id: string; email: string },
      source: "vendure" = "vendure",
    ) {
      session.value = { token, tokenSource: source, user };
      writeVendureSessionToken(token);
    }

    function setUser(user: { id: string; email: string }) {
      if (session.value?.token) {
        session.value = { ...session.value, user };
      }
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
    persist: true,
  },
);
