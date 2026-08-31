<script setup lang="ts">
/**
 * 管理端核销页 /admin/redemption
 *
 * 认证：复用后端 Admin GraphQL 会话 token（non-www admin-api，见 scripts/probe-admin.cjs）。
 *   - 管理员在前端录入/通过 login 获取后端 Admin token，前端存 sessionStorage（页面内存持有）。
 *   - 每次请求带 `Authorization: Bearer <adminToken>` 打到 admin-api 的
 *     redemptionLookup / redemptionClaim（后端由 @Allow(Permission.UpdateOrder) 兜底鉴权）。
 *
 * 说明：C 端 graphql-client 的 default client 指向 shop-api，无法复用（admin 操作在
 * admin-api 端），故本页直接用 fetch 打 admin-api。完整 admin 登录（独立登录页/角色路由守卫）
 * 属后续工作；这里为最小可用的 token 录入 + 复用既有 admin login 取 token。
 */
definePageMeta({ title: "admin-redemption" });

const { public: cfg } = useRuntimeConfig();
const { t } = useI18n();
const adminApiBase = computed<string>(() => (cfg as any).adminApiBase || "https://e.joho.cn/admin-api");

/* ---------------- 管理 token（内存 + sessionStorage） ---------------- */
const ADMIN_TOKEN_KEY = "nshop.admin.token";
const adminToken = ref<string>("");
function loadAdminToken() {
  adminToken.value = typeof sessionStorage !== "undefined" ? sessionStorage.getItem(ADMIN_TOKEN_KEY) || "" : "";
}
function persistAdminToken(v: string) {
  adminToken.value = v;
  if (typeof sessionStorage === "undefined") return;
  if (v) sessionStorage.setItem(ADMIN_TOKEN_KEY, v);
  else sessionStorage.removeItem(ADMIN_TOKEN_KEY);
}
loadAdminToken();

/* ---------------- admin-api fetch 封装 ---------------- */
type AdminRes<T> = { data?: T; token?: string; error?: string };
async function adminGql<T = any>(query: string, variables: Record<string, unknown> = {}): Promise<AdminRes<T>> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (adminToken.value) headers.Authorization = `Bearer ${adminToken.value}`;
  let res: Response;
  try {
    res = await fetch(adminApiBase.value, { method: "POST", headers, body: JSON.stringify({ query, variables }) });
  } catch (e) {
    return { error: `${t('messages.order.netError')}：${(e as Error).message}` };
  }
  const newToken = res.headers.get("vendure-auth-token");
  const txt = await res.text();
  let body: any;
  try {
    body = JSON.parse(txt);
  } catch {
    return { error: t('messages.order.nonJsonResponse', { status: res.status }) };
  }
  if (body?.errors?.length) return { error: body.errors[0]?.message ?? t('messages.order.graphqlError') };
  return { data: body?.data as T, token: newToken || undefined };
}

/* ---------------- 登录/取 token（复用后端 admin login mutation，若有则填；否则可粘 token） ---------------- */
const loginForm = reactive({ username: "", password: "" });
const loginLoading = ref(false);
const loginMsg = ref("");
const LOGIN_QUERY = `
mutation AdminLogin($username: String!, $password: String!) {
  login(username: $username, password: $password) {
    ... on CurrentUser { identifier id }
    ... on ErrorResult { message }
  }
}`;

async function doLogin() {
  if (!loginForm.username.trim() || !loginForm.password) return;
  loginLoading.value = true;
  loginMsg.value = "";
  try {
    const res = await adminGql<{ login?: { identifier?: string; message?: string } }>(LOGIN_QUERY, {
      username: loginForm.username.trim(),
      password: loginForm.password,
    });
    if (res.token) {
      persistAdminToken(res.token);
      loginForm.password = "";
      loginMsg.value = t('messages.order.tokenAcquired');
    } else if (res.error) {
      loginMsg.value = res.error;
    } else {
      const login = res.data?.login;
      loginMsg.value = login?.message || t('messages.order.noTokenReturned');
    }
  } finally {
    loginLoading.value = false;
  }
}

function setRawToken() {
  persistAdminToken(rawToken.value.trim());
  rawToken.value = "";
}
const rawToken = ref("");

/* ---------------- 核销码查询 / 核销 ---------------- */
type RedemptionOrder = { id: string; code: string; state: string; totalWithTax: number; currencyCode: string; totalQuantity: number };
type LookupRes = { redemptionLookup: { order: RedemptionOrder | null; claimed: boolean; claimedAt?: string } };
type ClaimRes = { redemptionClaim: { order: RedemptionOrder | null; claimed: boolean; message?: string } };

const LOOKUP_QUERY = `
query AdminRedemptionLookup($code: String!) {
  redemptionLookup(code: $code) {
    claimed
    claimedAt
    order { id code state totalWithTax currencyCode totalQuantity }
  }
}`;
const CLAIM_QUERY = `
mutation AdminRedemptionClaim($code: String!) {
  redemptionClaim(code: $code) {
    claimed
    claimedAt
    message
    order { id code state }
  }
}`;

const code = ref("");
const state = ref<"idle" | "loading" | "found" | "claiming" | "done" | "error">("idle");
const message = ref("");
const lookup = ref<LookupRes["redemptionLookup"] | null>(null);

async function execute() {
  const input = code.value.trim().toUpperCase();
  if (!input) return;
  if (!adminToken.value) {
    message.value = t('messages.order.needTokenFirst');
    state.value = "error";
    return;
  }
  message.value = "";
  state.value = "loading";
  const { data, error } = await adminGql<LookupRes>(LOOKUP_QUERY, { code: input });
  if (error) {
    state.value = "error";
    message.value = error;
    return;
  }
  const r = data?.redemptionLookup;
  if (!r) {
    state.value = "error";
    message.value = t('messages.order.redemptionUnavailable');
    return;
  }
  if (!r.order) {
    state.value = "error";
    message.value = t('messages.order.redeemNotFound');
    return;
  }
  lookup.value = r;
  state.value = "found";
}

async function claim() {
  const input = code.value.trim().toUpperCase();
  if (!input || !lookup.value) return;
  message.value = "";
  state.value = "claiming";
  const { data, error } = await adminGql<ClaimRes>(CLAIM_QUERY, { code: input });
  const already = data?.redemptionClaim?.message === "already";
  if (error) {
    state.value = "error";
    message.value = error;
    return;
  }
  lookup.value = { ...lookup.value, claimed: true };
  message.value = already ? t('messages.order.redeemAlready') : t('messages.order.redeemSuccess');
  state.value = "done";
  // 刷新最新核销时间
  const refetch = await adminGql<LookupRes>(LOOKUP_QUERY, { code: input });
  if (refetch.data?.redemptionLookup) lookup.value = refetch.data.redemptionLookup;
}

const statusLabel = computed(() => {
  switch (state.value) {
    case "loading": return t('messages.order.queryLoading');
    case "claiming": return t('messages.order.claimLoading');
    case "done": return t('messages.order.redeemSuccess');
    case "error": return t('messages.order.opFailed');
    default: return "";
  }
});
</script>

<template>
  <main class="container max-w-2xl py-10">
    <h1 class="mb-2 text-2xl font-semibold">{{ t('messages.order.redemptionAdminTitle') }}</h1>
    <p class="mb-6 text-sm text-neutral-500">{{ t('messages.order.redemptionAdminSub') }}</p>

    <!-- 管理令牌区 -->
    <section class="mb-6 rounded-xl border border-neutral-200 p-4 text-sm dark:border-neutral-800">
      <div class="mb-3 flex items-center justify-between">
        <h2 class="font-semibold">{{ t('messages.order.adminTokenLabel') }}</h2>
        <span class="text-xs text-neutral-500">
          {{ adminToken ? t('messages.order.adminTokenSet') : t('messages.order.adminTokenNotSet') }}
        </span>
      </div>

      <div class="grid grid-cols-1 gap-3 md:grid-cols-4">
        <UInput v-model="loginForm.username" :placeholder="t('messages.order.adminUsername')" autocomplete="off" />
        <UInput v-model="loginForm.password" type="password" :placeholder="t('messages.order.adminPassword')" autocomplete="off" @keyup.enter="doLogin" />
        <UButton :loading="loginLoading" :label="t('messages.order.getToken')" @click="doLogin" />
        <UButton v-if="!adminToken" variant="soft" :label="t('messages.order.clearToken')" @click="persistAdminToken('')" />
      </div>

      <div class="mt-3 flex gap-2">
        <UInput v-model="rawToken" class="flex-1" :placeholder="t('messages.order.pasteToken')" @keyup.enter="setRawToken" />
        <UButton variant="soft" :label="t('messages.order.saveToken')" @click="setRawToken" />
      </div>

      <p v-if="loginMsg" class="mt-2 text-xs text-neutral-500">{{ loginMsg }}</p>
      <p class="mt-2 text-xs text-neutral-400">{{ t('messages.order.adminTokenNote') }}</p>
    </section>

    <!-- 核销码输入（扫码枪：聚焦输入框，键入回车即触发查询） -->
    <div class="flex items-end gap-2">
      <UInput
        v-model="code"
        class="flex-1"
        size="lg"
        autofocus
        :maxlength="6"
        :placeholder="t('messages.order.redemptionCodePlaceholder')"
        :disabled="state === 'loading' || state === 'claiming'"
        @keyup.enter="execute"
      />
      <UButton size="lg" color="primary" :loading="state === 'loading'" :label="t('messages.order.redemptionLookupBtn')" @click="execute" />
    </div>

    <div class="mt-4">
      <UAlert v-if="state === 'error'" color="error" :title="message" variant="outline" />
      <UAlert v-else-if="state === 'done'" color="success" :title="message" variant="outline" />
      <div v-else-if="statusLabel" class="text-sm text-neutral-500">{{ statusLabel }}</div>
    </div>

    <!-- 查询结果 -->
    <div v-if="lookup?.order && (state === 'found' || state === 'claiming' || state === 'done')" class="mt-4 rounded-xl border border-neutral-200 p-4 text-sm dark:border-neutral-800">
      <dl class="space-y-2">
        <div class="flex justify-between"><dt class="text-neutral-500">{{ t('messages.order.orderCodeAdmin') }}</dt><dd class="font-mono font-semibold">{{ lookup.order.code }}</dd></div>
        <div class="flex justify-between"><dt class="text-neutral-500">{{ t('messages.general.status') }}</dt><dd>{{ lookup.order.state }}</dd></div>
        <div class="flex justify-between"><dt class="text-neutral-500">{{ t('messages.order.quantityAmount') }}</dt><dd>{{ lookup.order.totalQuantity }} {{ t('messages.order.unit') }} · {{ lookup.order.totalWithTax }} {{ lookup.order.currencyCode }}</dd></div>
        <div class="flex justify-between"><dt class="text-neutral-500">{{ t('messages.order.redemptionStatus') }}</dt><dd>{{ lookup.claimed ? t('messages.order.redeemed') : t('messages.order.redeemPending') }}</dd></div>
        <div v-if="lookup.claimedAt" class="flex justify-between"><dt class="text-neutral-500">{{ t('messages.order.claimedAt') }}</dt><dd>{{ new Date(lookup.claimedAt).toLocaleString() }}</dd></div>
      </dl>

      <div class="mt-4">
        <UButton v-if="!lookup.claimed" color="primary" :loading="state === 'claiming'" :label="t('messages.order.confirmRedeem')" @click="claim" />
        <UButton v-else variant="soft" :label="t('messages.order.nextOne')" @click="code = ''; lookup = null; state='idle'" />
      </div>
    </div>
  </main>
</template>