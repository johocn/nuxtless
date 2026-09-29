/**
 * 多租户运行时租户表（Nitro 侧唯一数据源）
 *
 * 背景：nshop 的多租户路由段曾是「构建期硬编码白名单」（layers/base/nuxt.config.ts 读取
 * data/tenant-channels.json 拼成正则注入路由），导致新增/启用渠道必须重跑生成脚本 + 重新
 * 构建部署。本模块把「租户清单」搬到运行时：数据来自后端公开查询 shopChannels，前端只做
 * SWR 缓存，因此新增渠道无需重建前端即可访问。
 *
 * 降级链（三级）：运行时拉取（SWR 60s）→ 上一次成功结果 → 构建期种子 tenant-channels.json。
 * 即 Vendure 不可用时，已知渠道仍可正常服务。
 */

import seed from "../../layers/base/data/tenant-channels.json";

export interface TenantEntry {
  code: string;
  token: string;
  name: string;
}

/** Nitro 中间件写入 event.context.tenant 的「正向命中」结果 */
export interface TenantHit {
  status: "ok";
  code: string;
  token: string;
  name: string;
}

/** 客户端解析接口的返回形态 */
export type TenantResolve =
  | TenantHit
  | { status: "unknown"; code: string }
  | { status: "none" };

const TENANT_TTL_MS = 60_000;
const FETCH_TIMEOUT_MS = 3_000;

const SHOP_CHANNELS_QUERY = `query ShopChannelsForRegistry {
  shopChannels { code token name }
}`;

/** 构建期种子（last-known-good）：形状与运行时拉取结果一致 */
const SEED: Map<string, TenantEntry> = new Map(
  ((seed as unknown as { tenants: TenantEntry[] })?.tenants || []).map((t) => [
    t.code,
    { code: t.code, token: t.token, name: t.name || t.code },
  ]),
);

let cache: Map<string, TenantEntry> | null = null;
let fetchedAt = 0;
/** 上次「尝试拉取」的时间戳：用于负向缓存，避免后端故障时每个 SSR 请求都等满超时 */
let lastAttemptAt = 0;
let inFlight: Promise<void> | null = null;

/** 取 GraphQL 端点：与 layers/base/app/composables/useGqlHostUrl.ts 同口径（同源 /shop-api） */
function gqlEndpoint(): string {
  const { public: pub } = useRuntimeConfig();
  return (pub.GQL_HOST as string) || "http://localhost:3000/shop-api";
}

async function fetchShopChannels(): Promise<TenantEntry[] | null> {
  const { public: pub } = useRuntimeConfig();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(gqlEndpoint(), {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "vendure-token": (pub.channelToken as string) || "",
      },
      body: JSON.stringify({ query: SHOP_CHANNELS_QUERY }),
      signal: controller.signal,
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const json = (await res.json()) as {
      data?: { shopChannels?: TenantEntry[] };
      errors?: unknown;
    };
    if (json.errors) throw new Error(`GraphQL errors: ${JSON.stringify(json.errors)}`);
    const list = json.data?.shopChannels;
    if (!Array.isArray(list)) return null;
    return list
      .filter((t) => t && typeof t.code === "string")
      .map((t) => ({ code: t.code, token: t.token, name: t.name || t.code }));
  } finally {
    clearTimeout(timer);
  }
}

/**
 * 刷新租户表（预热 / SWR 后台刷新用）。失败时静默保留上一次结果（或种子）。
 * 负向缓存：距上次尝试不足 TTL 时直接跳过（`force` 可绕过），这样 Vendure 不可达时
 * 也不会让每个 SSR 请求都去等满 FETCH_TIMEOUT_MS。
 */
export function refreshTenantRegistry(force = false): Promise<void> {
  if (inFlight) return inFlight;
  if (!force && Date.now() - lastAttemptAt < TENANT_TTL_MS) return Promise.resolve();
  lastAttemptAt = Date.now();
  inFlight = (async () => {
    try {
      const list = await fetchShopChannels();
      // 空列表视为异常（正常至少含默认渠道），不覆盖现有结果
      if (list && list.length) {
        cache = new Map(list.map((t) => [t.code, t]));
        fetchedAt = Date.now();
      }
    } catch (err) {
      console.warn("[tenant-registry] shopChannels 拉取失败，沿用上一次结果/种子", err);
    }
  })().finally(() => {
    inFlight = null;
  });
  return inFlight;
}

/**
 * SWR 读取租户表：
 * - 新鲜（< TTL）：直接返回；
 * - 已过期但有旧值：立即返回旧值，后台异步刷新（不阻塞 SSR）；
 * - 冷启动：等待一次刷新，失败回退种子。
 */
export async function getTenantRegistry(): Promise<Map<string, TenantEntry>> {
  if (cache && Date.now() - fetchedAt < TENANT_TTL_MS) return cache;
  if (cache) {
    void refreshTenantRegistry();
    return cache;
  }
  await refreshTenantRegistry();
  return cache ?? SEED;
}

/** 解析租户 code → 命中信息；未命中返回 null（是否 404 由 Vue 路由层判定） */
export async function resolveTenant(code: string): Promise<TenantHit | null> {
  const entry = (await getTenantRegistry()).get(code);
  if (!entry) return null;
  return { status: "ok", code: entry.code, token: entry.token, name: entry.name };
}
