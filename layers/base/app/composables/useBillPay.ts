import { GraphQLClient } from "graphql-request";

/**
 * 代买单（委托单模式）API 编排（对标 useCoupon.ts 模式）：
 * - 鉴权/渠道/语言头统一复用既有会话约定（vendure_shop_token cookie + vendure-token 渠道头）
 * - 金额单位一律「分」；settleRate 等费率为百分数整数
 * - 后端：vendure bill-pay-plugin（BP-* 单号，状态机 PENDING_QUOTE→…→SETTLED）
 */

// ─────────────────────────────────────────────────────────────
// 类型
// ─────────────────────────────────────────────────────────────

export type BillPayStatus =
  | "PENDING_QUOTE"
  | "QUOTED"
  | "PAID"
  | "IN_SERVICE"
  | "COMPLETED"
  | "SETTLED"
  | "CANCELLED"
  | "REFUNDED";

export interface BillPayDiscountItem {
  rule: string;
  label?: string | Record<string, string> | null;
  amount: number;
}

export interface BillPayOrder {
  id: string;
  createdAt: string;
  updatedAt?: string;
  code?: string | null;
  merchantName: string;
  expectedAmount: number;
  quoteAmount?: number | null;
  actualAmount?: number | null;
  discountDetail?: BillPayDiscountItem[] | string | null;
  status: BillPayStatus;
  remark?: string | null;
  quoteNote?: string | null;
  quoteExpireAt?: string | null;
  proofUrl?: string | null;
  paymentMethod?: string | null;
  paidAt?: string | null;
  completedAt?: string | null;
  settledAt?: string | null;
  refundedAt?: string | null;
}

export interface BillPayConfig {
  autoQuote: boolean;
  quoteExpireMinutes: number;
  couponEnabled: boolean;
  tolerancePercent: number;
  dailyLimitAmount: number;
  minAmount: number;
  maxAmount: number;
  memberDiscount?: { percent: number; label?: string | Record<string, string> | null } | null;
  thresholds: { minSpend: number; reduce: number; label?: string | Record<string, string> | null }[];
}

export interface BillPayWechatPayResult {
  billPayOrderId: string;
  outTradeNo: string;
  pay: {
    payType: string;
    prepayId?: string | null;
    appId?: string | null;
    timeStamp?: string | null;
    nonceStr?: string | null;
    package?: string | null;
    signType?: string | null;
    paySign?: string | null;
    payUrl?: string | null;
  };
}

/** LocalizedText 解析：当前 locale → 语言主码 → 首个值 → 空串（与后端 LocalizedLabel 兜底链对齐）。
 * 注意 i18n locale 用短码（en/ja/…）而后端 label 键多为全码（en-US/ja-JP/…），
 * 主码匹配按 `key.split("-")[0]` 归一，en 即可命中 en-US 键。 */
export function billpayLabel(
  label: string | Record<string, string> | null | undefined,
  locale: string,
): string {
  if (!label) return "";
  if (typeof label === "string") return label;
  const rec = label as Record<string, string>;
  const lower = (s: string) => s.toLowerCase().replace(/_/g, "-");
  const want = lower(locale);
  const main = want.split("-")[0];
  const keys = Object.keys(rec);
  const hit =
    keys.find((k) => lower(k) === want) ??
    keys.find((k) => lower(k).split("-")[0] === main);
  return (hit && rec[hit]) || Object.values(rec)[0] || "";
}

/** 分 → 元字符串（整元免小数，对齐 couponYuan） */
export function billpayYuan(cents: number | null | undefined): string {
  if (cents == null || !Number.isFinite(Number(cents))) return "—";
  const v = Number(cents);
  return (v / 100).toFixed(v % 100 === 0 ? 0 : 2);
}

// ─────────────────────────────────────────────────────────────
// GraphQLClient 构建（复制 useCoupon.ts resolveClient 模式，不改其文件）
// ─────────────────────────────────────────────────────────────

function readLocale(): string {
  try {
    const $i18n = useNuxtApp().$i18n as
      | { global?: { locale?: { value?: string } }; locale?: { value?: string } }
      | undefined;
    return $i18n?.global?.locale?.value ?? $i18n?.locale?.value ?? "zh-CN";
  } catch {
    try {
      return useI18n().locale.value;
    } catch {
      return "zh-CN";
    }
  }
}

/**
 * 每次请求新建 client（对齐 useCoupon.resolveClient）：会话头/渠道头/语言头实时刷新，
 * 捕获响应头 vendure-auth-token 回写，保证游客/登录同会话。
 */
export function billpayRequest<T, V extends Record<string, any> = Record<string, any>>(
  query: string,
  variables?: V,
): Promise<T> {
  const { token: channelToken } = useTenantChannel();
  const locale = readLocale();
  const gqlHost = useGqlHostUrl();
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  const token = readVendureTokenWithContext();
  if (token) headers.authorization = `Bearer ${token}`;
  if (channelToken.value) headers["vendure-token"] = channelToken.value;
  if (locale) headers["Accept-Language"] = locale;

  const client = new GraphQLClient(`${gqlHost}?languageCode=${toVendureLanguageCode(locale)}`, {
    headers,
    responseMiddleware: (response: any) => {
      const headersObj = response?.headers ?? response?.response?.headers;
      const sessionToken =
        headersObj?.get?.(VENDURE_AUTH_HEADER) ??
        headersObj?.entries?.()?.find?.(([k]: [string, string]) => k.toLowerCase() === VENDURE_AUTH_HEADER.toLowerCase())?.[1];
      if (sessionToken) writeVendureSessionToken(sessionToken);
    },
  });
  // graphql-request v7 的泛型重载不接受泛型 V 元组展开，此处断言收口（variables 必传对象）
  return client.request<T>(query, (variables ?? {}) as any) as Promise<T>;
}

// ─────────────────────────────────────────────────────────────
// 字符串查询（bill-pay-plugin shop-api SDL）
// ─────────────────────────────────────────────────────────────

const ORDER_FIELDS = `
  id createdAt updatedAt code merchantName expectedAmount quoteAmount actualAmount
  discountDetail status remark quoteNote quoteExpireAt proofUrl paymentMethod
  paidAt completedAt settledAt refundedAt
`;

const CONFIG_FIELDS = `
  autoQuote quoteExpireMinutes couponEnabled tolerancePercent dailyLimitAmount
  minAmount maxAmount
  memberDiscount { percent label }
  thresholds { minSpend reduce label }
`;

export async function getBillPayConfig(): Promise<BillPayConfig> {
  const data = await billpayRequest<{ billPayConfig: BillPayConfig }>(
    `query BillPayConfig { billPayConfig { ${CONFIG_FIELDS} } }`,
  );
  const c = data.billPayConfig;
  return { ...c, thresholds: Array.isArray(c.thresholds) ? c.thresholds : [] };
}

export async function getMyBillPayOrders(statuses?: BillPayStatus[]): Promise<BillPayOrder[]> {
  const data = await billpayRequest<{ billPayOrders: { items: BillPayOrder[]; totalItems: number } }>(
    `query MyBillPayOrders($status: BillPayStatus) {
       billPayOrders(options: { take: 50, status: $status }) {
         items { ${ORDER_FIELDS} }
         totalItems
       }
     }`,
    statuses?.length ? { status: statuses[0] } : {},
  );
  return data.billPayOrders?.items ?? [];
}

export async function getBillPayOrder(id: string): Promise<BillPayOrder> {
  const data = await billpayRequest<{ billPayOrder: BillPayOrder }>(
    `query BillPayOrder($id: ID!) { billPayOrder(id: $id) { ${ORDER_FIELDS} } }`,
    { id },
  );
  return data.billPayOrder;
}

export async function createBillPayOrder(input: {
  merchantName: string;
  expectedAmount: number;
  remark?: string;
}): Promise<BillPayOrder> {
  const data = await billpayRequest<{ createBillPayOrder: BillPayOrder }>(
    `mutation CreateBillPayOrder($input: CreateBillPayOrderInput!) {
       createBillPayOrder(input: $input) { ${ORDER_FIELDS} }
     }`,
    { input },
  );
  return data.createBillPayOrder;
}

export async function cancelBillPayOrder(id: string): Promise<BillPayOrder> {
  const data = await billpayRequest<{ cancelBillPayOrder: BillPayOrder }>(
    `mutation CancelBillPayOrder($id: ID!) { cancelBillPayOrder(id: $id) { ${ORDER_FIELDS} } }`,
    { id },
  );
  return data.cancelBillPayOrder;
}

export async function createWechatBillPayment(id: string): Promise<BillPayWechatPayResult> {
  const data = await billpayRequest<{ createWechatBillPayment: BillPayWechatPayResult }>(
    `mutation CreateWechatBillPayment($id: ID!) {
       createWechatBillPayment(id: $id) {
         billPayOrderId outTradeNo
         pay { payType appId timeStamp nonceStr package signType paySign payUrl }
       }
     }`,
    { id },
  );
  return data.createWechatBillPayment;
}

export async function payBillPayOrderWithBalance(id: string): Promise<BillPayOrder> {
  const data = await billpayRequest<{ payBillPayOrderWithBalance: BillPayOrder }>(
    `mutation PayBillPayOrderWithBalance($id: ID!) {
       payBillPayOrderWithBalance(id: $id) { ${ORDER_FIELDS} }
     }`,
    { id },
  );
  return data.payBillPayOrderWithBalance;
}

// ─────────────────────────────────────────────────────────────
// 辅助
// ─────────────────────────────────────────────────────────────

/** 历史商家联想：既有委托单 merchantName 去重（最近在前） */
export function distinctMerchants(orders: BillPayOrder[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const o of orders) {
    const name = (o.merchantName ?? "").trim();
    if (name && !seen.has(name)) {
      seen.add(name);
      out.push(name);
    }
  }
  return out;
}

/** 报价是否过期（QUOTED + 超时 → 待重新报价） */
export function isQuoteExpired(order: BillPayOrder): boolean {
  if (order.status !== "QUOTED" || !order.quoteExpireAt) return false;
  return new Date(order.quoteExpireAt).getTime() < Date.now();
}

// ─────────────────────────────────────────────────────────────
// 前端报价预估（与后端 quote-engine 同规则：会员折扣 → 最优满减，分单位）
// 提交前展示用；最终报价以后端创建返回为准
// ─────────────────────────────────────────────────────────────

export interface QuotePreview {
  payable: number | null;
  discountDetail: { rule: string; label?: string | Record<string, string> | null; amount: number }[];
  reason?: "BELOW_MIN" | "ABOVE_MAX" | "INVALID_AMOUNT";
  /** 单笔金额超单日累计限额（非阻断警告，独立于报价路径；最终以后端创建时当日累计校验为准） */
  overDaily?: boolean;
}

export function quoteBillPreview(expectedAmount: number, config: BillPayConfig): QuotePreview {
  const amount = Math.round(Number(expectedAmount));
  if (!Number.isFinite(amount) || amount <= 0) return { payable: null, discountDetail: [], reason: "INVALID_AMOUNT" };
  // 单日累计限额预检（非阻断）：仅警告，最终以后端创建时的当日累计校验为准
  const overDaily = config.dailyLimitAmount > 0 && amount > config.dailyLimitAmount;
  const dailyFlag = overDaily ? { overDaily } : {};
  if (amount < config.minAmount) return { payable: null, discountDetail: [], reason: "BELOW_MIN" };
  if (amount > config.maxAmount) return { payable: null, discountDetail: [], reason: "ABOVE_MAX", ...dailyFlag };

  const discountDetail: QuotePreview["discountDetail"] = [];
  let payable = amount;
  const md = config.memberDiscount;
  if (md && Number(md.percent) > 0 && Number(md.percent) < 100) {
    const after = Math.round((amount * Number(md.percent)) / 100);
    if (after < payable) {
      discountDetail.push({ rule: "memberDiscount", label: md.label, amount: payable - after });
      payable = after;
    }
  }
  let best: { minSpend: number; reduce: number; label?: string | Record<string, string> | null } | null = null;
  for (const t of config.thresholds ?? []) {
    const minSpend = Math.round(Number(t?.minSpend));
    const reduce = Math.round(Number(t?.reduce));
    if (!Number.isFinite(minSpend) || !Number.isFinite(reduce) || reduce <= 0) continue;
    if (payable >= minSpend && (!best || reduce > best.reduce)) best = { minSpend, reduce, label: t.label };
  }
  if (best && best.reduce < payable) {
    discountDetail.push({ rule: "threshold", label: best.label, amount: best.reduce });
    payable -= best.reduce;
  }
  return { payable, discountDetail, ...dailyFlag };
}

/** 后端错误信息提取（对齐 couponErrorMessage） */
export function billpayErrorMessage(e: unknown): string {
  const anyErr = e as any;
  const msg = anyErr?.response?.errors?.[0]?.message ?? anyErr?.message ?? String(e);
  return String(msg).replace(/^GraphQL Error( \(\d+\))?:\s*/i, "");
}
