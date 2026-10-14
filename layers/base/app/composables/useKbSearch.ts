/**
 * MeiliSearch 统一知识库 C 端搜索（P2）。
 *
 * 链路：前端 → 同源 /search-api/（nginx 反代 127.0.0.1:7700，仅 GET/POST，search key 鉴权）
 * 索引：kb-zh / kb-en 双语各一，locale 归档规则与后端 content-mapper 一致（zh 系 → kb-zh，其余 → kb-en）。
 *
 * SSR 与 CSR 双通道（缺一不可）：
 *  - 服务端（SSR）：node 内相对路径 fetch 只会命中 nitro 自身（生产无 /search-api 路由 → 404），
 *    必须用绝对地址直连 Meili（服务器本机回环，runtimeConfig.meiliInternalHost）。
 *  - 浏览器（CSR/hydration 后）：同源相对路径 /search-api/，由 nginx 反代。
 *
 * 降级：key 缺失 / 网络错误 / 索引 404 一律吞错返回空结果（EMPTY_RESPONSE），页面渲染空态。
 * 高亮：Meili 原生 attributesToHighlight（_formatted.title/_formatted.body，已转义，可安全 v-html）。
 */

export interface KbHit {
  id: string;
  type: "product" | "article" | "faq" | "tutorial" | "case" | "download" | string;
  sourceId: string;
  sourceSystem: "vendure" | "strapi" | string;
  title: string;
  body: string;
  updatedAt: number;
  /** 商品价格，单位分（展示 ÷100） */
  price?: number;
  /** 商品 slug（slugZh || slugEn）；内容文档不用（跳 /kb/[type]/[sourceId]） */
  slug?: string;
  /** 商品主图绝对地址，可缺省 */
  thumbnail?: string;
  tags?: string[];
  channelId?: string;
  status?: string;
  /** Meili 高亮副本（highlightPre/PostTag 包裹，已转义，v-html 安全） */
  _formatted?: Partial<{ title: string; body: string }>;
}

export interface KbSearchResponse {
  hits: KbHit[];
  estimatedTotalHits: number;
  limit: number;
  offset: number;
  processingTimeMs: number;
}

export interface KbSearchParams {
  q: string;
  /** Meili filter 表达式，如 `type = "product"` / `type != "product"` / `type IN ["article","faq"]` */
  filter?: string;
  limit?: number;
  offset?: number;
  /** 如 ["updatedAt:desc"] */
  sort?: string[];
}

/** 索引归档：与 strapi zhao-search content-mapper 的 toIndexLocale 保持一致 */
export function kbIndexFor(locale: string): "kb-zh" | "kb-en" {
  return String(locale ?? "").toLowerCase().startsWith("zh") ? "kb-zh" : "kb-en";
}

/** 手动拼 YYYY-MM-DD（禁 toLocaleDateString/Intl：SSR/CSR 时区与实现差异会导致 hydration mismatch） */
export function kbFormatDate(ts: number): string {
  if (!Number.isFinite(ts)) return "";
  const d = new Date(ts);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** 类型键 → i18n 词条（messages.search.typeArticle / typeFaq / typeGeoArticle / ...）；product 复用「商品」词条 */
export function kbTypeLabelKey(type: string): string {
  if (type === "product") return "messages.search.products";
  // kebab-case 转 camel（geo-article → GeoArticle），保证生成的 i18n 键合法
  const camel = String(type)
    .replace(/-([a-z])/g, (_, c: string) => c.toUpperCase());
  return `messages.search.type${camel.charAt(0).toUpperCase()}${camel.slice(1)}`;
}

const EMPTY_RESPONSE: KbSearchResponse = {
  hits: [],
  estimatedTotalHits: 0,
  limit: 0,
  offset: 0,
  processingTimeMs: 0,
};

/** 解析当前搜索环境（索引 + 通道 + 搜索函数）；仅在组件 setup 上下文调用。 */
function useKbEnv() {
  const { locale } = useI18n();
  const config = useRuntimeConfig();
  const index = computed(() => kbIndexFor(locale.value));
  const apiKey = (config.public.meiliSearchKey as string | undefined) ?? "";
  // 注意用 || 而非 ??：runtimeConfig 未注入时值为空串 ""，nullish 合并不回退，会导致 SSR 请求落相对路径打到 nitro 自身 404
  const base = import.meta.server
    ? (config.meiliInternalHost as string | undefined) || "http://127.0.0.1:7700"
    : "/search-api";

  async function search(params: KbSearchParams): Promise<KbSearchResponse> {
    // 无 key / 空词且无 filter（无界 browse 会拉全库）一律降级空结果；
    // 相关内容推荐等「空词 + filter」的合法查询不受影响
    if (!apiKey || (!String(params.q ?? "").trim() && !params.filter)) return EMPTY_RESPONSE;
    try {
      return await $fetch<KbSearchResponse>(`${base}/indexes/${index.value}/search`, {
        method: "POST",
        headers: { Authorization: `Bearer ${apiKey}` },
        body: {
          q: params.q ?? "",
          limit: params.limit ?? 10,
          offset: params.offset ?? 0,
          ...(params.filter ? { filter: params.filter } : {}),
          ...(params.sort?.length ? { sort: params.sort } : {}),
          attributesToHighlight: ["title", "body"],
          highlightPreTag: "<mark>",
          highlightPostTag: "</mark>",
          // body 摘片（_formatted.body 按 match 裁剪），详情页正文用非 _formatted 字段不受影响
          attributesToCrop: ["body"],
          cropLength: 30,
        },
      });
    } catch (e) {
      console.error("[kb-search] 搜索请求失败（降级为空结果）", e);
      return EMPTY_RESPONSE;
    }
  }

  return { index, search };
}

/**
 * 知识库搜索（useAsyncData 包装，SSR 安全）。
 * @param params 参数 getter；配合 opts.watch 中传入的响应源（如 q/filter 的 ref）实现参数变化自动重取
 * @param opts.key useAsyncData key（同页多处调用必须显式区分）
 */
export function useKbSearch(
  params: () => KbSearchParams,
  opts: { key?: string; watch?: WatchSource[]; immediate?: boolean } = {},
) {
  const { index, search } = useKbEnv();
  const watchSources: WatchSource[] = [index, ...(opts.watch ?? [])];
  const asyncData = useAsyncData<KbSearchResponse>(opts.key ?? "kb-search", () => search(params()), {
    default: () => EMPTY_RESPONSE,
    immediate: opts.immediate ?? true,
    watch: watchSources,
  });
  return {
    ...asyncData,
    /** 供「加载更多」等手动追加场景使用（closure 持有索引/通道，事件回调中可安全调用） */
    searchOnce: search,
  };
}

/**
 * 按 type + sourceId 直取单篇内容文档（/kb/[type]/[id] 详情页）。
 * 文档 id 构造与 strapi content-mapper 一致：`${type}-${documentId}-${zh|en}`；
 * 商品（type=product）不经 /kb 详情页（走 /product/[slug]），恒返回 null。
 * 取不到（404/网络错误/未配 key）返回 null，由页面抛 404。
 */
export function useKbDocument(type: () => string, sourceId: () => string, opts: { key?: string } = {}) {
  const { locale } = useI18n();
  const config = useRuntimeConfig();
  const apiKey = (config.public.meiliSearchKey as string | undefined) ?? "";
  // 同上：|| 防 runtimeConfig 空串不回退
  const base = import.meta.server
    ? (config.meiliInternalHost as string | undefined) || "http://127.0.0.1:7700"
    : "/search-api";

  async function fetchDoc(): Promise<KbHit | null> {
    const ty = String(type() ?? "");
    const sid = String(sourceId() ?? "");
    if (!apiKey || !ty || !sid || ty === "product") return null;
    const index = kbIndexFor(locale.value);
    const docId = `${ty}-${sid}-${index.slice(3)}`;
    try {
      return await $fetch<KbHit>(`${base}/indexes/${index}/documents/${docId}`, {
        headers: { Authorization: `Bearer ${apiKey}` },
      });
    } catch (e) {
      console.error(`[kb-doc] 获取文档失败 ${docId}（降级为 null）`, e);
      return null;
    }
  }

  return useAsyncData<KbHit | null>(opts.key ?? "kb-doc", fetchDoc, { default: () => null });
}
