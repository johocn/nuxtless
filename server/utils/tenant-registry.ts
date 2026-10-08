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

/** 取 GraphQL 端点：与 layers/base/app/composables/useGqlHostUrl.ts 同口径（同源 /shop-api）。
 *  缺失时不回退 localhost——生产漏配会静默打到 127.0.0.1 造成难排查的假数据故障；
 *  返回 null 由调用方跳过刷新，走既有降级链（上次成功结果 → 构建期种子）。 */
let gqlHostWarned = false;
function gqlEndpoint(): string | null {
  const { public: pub } = useRuntimeConfig();
  const host = (pub.GQL_HOST as string) || "";
  if (!host) {
    if (!gqlHostWarned) {
      gqlHostWarned = true;
      console.error(
        "[tenant-registry] public.GQL_HOST 未配置：租户表运行时刷新停用，恒用构建期种子 tenant-channels.json",
      );
    }
    return null;
  }
  return host;
}

async function fetchShopChannels(): Promise<TenantEntry[] | null> {
  const endpoint = gqlEndpoint();
  if (!endpoint) return null;
  const { public: pub } = useRuntimeConfig();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(endpoint, {
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

/** ?fresh=1 强制刷新的最小间隔：避免被高频点击刷爆后端 */
const FORCE_MIN_INTERVAL_MS = 5_000;
let lastForceAt = 0;

/**
 * 运营侧「立即生效」入口：绕过 SWR 的 TTL 强制刷新一次租户表。
 * 5s 内重复调用直接复用上一次结果，不重复打后端。
 */
export async function refreshTenantRegistryForced(): Promise<void> {
  if (Date.now() - lastForceAt < FORCE_MIN_INTERVAL_MS) return;
  lastForceAt = Date.now();
  await refreshTenantRegistry(true);
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

/** Vendure 默认渠道 code：命中默认渠道时不 301（默认店本就不带前缀） */
const DEFAULT_CHANNEL_CODE = "__default_channel__";

const RESOLVE_BY_DOMAIN_QUERY = `query ResolveChannelByDomainForRegistry($host: String!) {
  resolveChannelByDomain(host: $host) { token code }
}`;

/** 域名 → 渠道（含负向缓存），TTL 与租户表一致 */
const domainCache = new Map<string, { token: string; code: string; at: number }>();

async function fetchChannelByDomain(host: string): Promise<{ token: string; code: string } | null> {
  const endpoint = gqlEndpoint();
  if (!endpoint) return null;
  const { public: pub } = useRuntimeConfig();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(endpoint, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "vendure-token": (pub.channelToken as string) || "",
      },
      body: JSON.stringify({
        query: RESOLVE_BY_DOMAIN_QUERY,
        variables: { host },
      }),
      signal: controller.signal,
    });
    if (!res.ok) return null;
    const json = (await res.json()) as {
      data?: { resolveChannelByDomain?: { token: string; code: string } | null };
    };
    const hit = json.data?.resolveChannelByDomain;
    if (!hit?.code || hit.code === DEFAULT_CHANNEL_CODE) return null;
    return { token: hit.token, code: hit.code };
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * 按访问域名解析租户（一店一域）。域名清单无法枚举（后端只提供按 host 单查），
 * 因此按 host 逐条做 60s 缓存，未命中同样写入负向缓存。
 */
export async function resolveTenantByDomain(host: string): Promise<TenantHit | null> {
  const h = host.split(":")[0]?.toLowerCase() ?? "";
  if (!h) return null;

  const cached = domainCache.get(h);
  if (cached && Date.now() - cached.at < TENANT_TTL_MS) {
    if (!cached.code) return null;
    const name = (await getTenantRegistry()).get(cached.code)?.name || cached.code;
    return { status: "ok", code: cached.code, token: cached.token, name };
  }

  const found = await fetchChannelByDomain(h);
  domainCache.set(h, found ? { ...found, at: Date.now() } : { token: "", code: "", at: Date.now() });
  if (!found) return null;

  const name = (await getTenantRegistry()).get(found.code)?.name || found.code;
  return { status: "ok", code: found.code, token: found.token, name };
}
