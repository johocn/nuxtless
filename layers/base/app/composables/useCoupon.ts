/**
 * 优惠券 C 端能力（coupon-plugin shop API）。
 *
 * 设计约束：
 * - 不依赖 nuxt-graphql-client 的 codegen 类型（避免 build 时内省 schema），
 *   改用 `graphql-request`（nshop 已依赖 7.4.0）以运行时字符串查询实现，携带本地 TS 类型。
 * - 鉴权/渠道/语言头统一复用既有会话约定（参考 useGqlSession.ts / plugins/gql-session.ts）：
 *   `Authorization: Bearer <token>`（登录态 authStore → 游客 cookie）、
 *   `vendure-channel-token`（runtime public.channelToken）、`Accept-Language`（当前 locale）。
 */
import { GraphQLClient } from "graphql-request";
import { useAuthStore } from "../../stores/useAuthStore";
import {
  VENDURE_AUTH_HEADER,
  readVendureSessionToken,
  writeVendureSessionToken,
} from "../utils/vendure-session";

// ─────────────────────────────────────────────────────────────
// 本地类型（与 coupon-plugin SDL 对齐，运行时字符串查询，无需 codegen）
// ─────────────────────────────────────────────────────────────

export type CouponType = "FIXED" | "PERCENT" | "FULL" | "FREE_SHIPPING";
export type CouponStatus =
  | "UNUSED"
  | "USED"
  | "RETURNED"
  | "EXPIRED"
  | "INVALID";
export type CouponIssuedBy = "CENTRE" | "ADMIN" | "EXCHANGE";

export interface CouponTemplate {
  id: string;
  name: string;
  description?: string | null;
  type: CouponType;
  /** FIXED/FULL = 金额（分）；PERCENT = 1-99 折扣值（85=8.5折）；FREE_SHIPPING 无意义 */
  discountValue: number;
  minSpend: number;
  startsAt?: string | null;
  endsAt?: string | null;
  totalCount: number;
  claimedCount: number;
  pointsPrice: number;
  perUserLimit: number;
  scope: string;
  categoryId?: string | null;
  variantId?: string | null;
  enabled: boolean;
  shopId?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CustomerCoupon {
  id: string;
  customerId: string;
  templateId: string;
  code: string;
  status: CouponStatus;
  issuedBy: CouponIssuedBy;
  reservedOrderId?: string | null;
  usedOrderId?: string | null;
  issuedAt?: string | null;
  usedAt?: string | null;
  expiredAt?: string | null;
  template?: CouponTemplate | null;
  createdAt: string;
  updatedAt: string;
}

/** applyCouponToOrder / clearCouponFromOrder 返回的订单轻量信息（仅用于判别已绑定券与触发刷新） */
export interface AppliedOrderResult {
  id: string;
  totalWithTax: number;
}

// ─────────────────────────────────────────────────────────────
// GraphQLClient 构建（复用既有会话头）
// ─────────────────────────────────────────────────────────────

export interface CouponClientOptions {
  gqlHost?: string;
  channelToken?: string;
  locale?: string;
}

function resolveClient(): GraphQLClient {
  const { channelToken } = useRuntimeConfig().public;
  const i18n = useI18n();
  const gqlHost = useGqlHostUrl();
  const authStore = useAuthStore();

  const headers: Record<string, string> = { "Content-Type": "application/json" };

  // 优先登录态 token，游客回退 cookie 中的匿名会话 token（与 useGqlSession 一致）
  const token = authStore.session?.token ?? readVendureSessionToken();
  if (token) headers.authorization = `Bearer ${token}`;
  if (channelToken) headers["vendure-channel-token"] = channelToken;
  if (i18n.locale.value) headers["Accept-Language"] = i18n.locale.value;

  const client = new GraphQLClient(`${gqlHost}?languageCode=${i18n.locale.value}`, {
    // 复刻 gql-session 插件：捕获响应头 `vendure-auth-token` 持久化，保证游客/登录同会话
    responseMiddleware: (response: any) => {
      const headersObj = response?.headers ?? response?.response?.headers;
      const sessionToken =
        headersObj?.get?.(VENDURE_AUTH_HEADER) ??
        headersObj?.entries?.()?.find?.(([k]: [string, string]) => k.toLowerCase() === VENDURE_AUTH_HEADER.toLowerCase())?.[1];
      if (sessionToken) writeVendureSessionToken(sessionToken);
    },
  });

  return client;
}

// ─────────────────────────────────────────────────────────────
// 字符串查询（按真实 SDL 字段）
// ─────────────────────────────────────────────────────────────

const COUPON_TEMPLATE_FIELDS = `
  id name description type discountValue minSpend
  startsAt endsAt totalCount claimedCount pointsPrice perUserLimit
  scope categoryId variantId enabled shopId createdAt updatedAt
`;

const CUSTOMER_COUPON_FIELDS = `
  id customerId templateId code status issuedBy
  reservedOrderId usedOrderId issuedAt usedAt expiredAt
  template { ${COUPON_TEMPLATE_FIELDS} }
  createdAt updatedAt
`;

const ORDER_RESULT_FIELDS = `id totalWithTax`;

interface CouponCentreQuery {
  couponCentre: CouponTemplate[];
}
interface MyCouponsQuery {
  myCoupons: CustomerCoupon[];
}
interface ClaimCouponMutation {
  claimCoupon: CustomerCoupon;
}
interface ApplyMutation {
  applyCouponToOrder: AppliedOrderResult;
}
interface ClearMutation {
  clearCouponFromOrder: AppliedOrderResult;
}

/** 领券中心：当前可领取的优惠券模板列表 */
export async function getCouponCentre(): Promise<CouponTemplate[]> {
  const client = resolveClient();
  const data = await client.request<CouponCentreQuery>(`query CouponCentre {
    couponCentre { ${COUPON_TEMPLATE_FIELDS} }
  }`);
  return data.couponCentre;
}

/** 我的券包（已领取的券），可按状态过滤：UNUSED / USED / RETURNED / EXPIRED / INVALID */
export async function getMyCoupons(status?: CouponStatus): Promise<CustomerCoupon[]> {
  const client = resolveClient();
  const data = await client.request<MyCouponsQuery>(
    `query MyCoupons($status: CouponStatus) {
      myCoupons(status: $status) { ${CUSTOMER_COUPON_FIELDS} }
    }`,
    { status: status ?? null },
  );
  return data.myCoupons;
}

/** 领取优惠券（按模板 id），成功返回 CustomerCoupon */
export async function claimCoupon(templateId: string): Promise<CustomerCoupon> {
  const client = resolveClient();
  const data = await client.request<ClaimCouponMutation>(
    `mutation ClaimCoupon($templateId: ID!) {
      claimCoupon(templateId: $templateId) { ${CUSTOMER_COUPON_FIELDS} }
    }`,
    { templateId },
  );
  return data.claimCoupon;
}

/** 应用优惠券码到当前活动订单（一单一券），成功返回更新后的订单摘要 */
export async function applyCouponToOrder(code: string): Promise<AppliedOrderResult> {
  const client = resolveClient();
  const data = await client.request<ApplyMutation>(
    `mutation ApplyCouponToOrder($code: String!) {
      applyCouponToOrder(code: $code) { ${ORDER_RESULT_FIELDS} }
    }`,
    { code },
  );
  return data.applyCouponToOrder;
}

/** 清除当前活动订单上已应用的优惠券 */
export async function clearCouponFromOrder(): Promise<AppliedOrderResult> {
  const client = resolveClient();
  const data = await client.request<ClearMutation>(`mutation ClearCouponFromOrder {
    clearCouponFromOrder { ${ORDER_RESULT_FIELDS} }
  }`);
  return data.clearCouponFromOrder;
}

// ─────────────────────────────────────────────────────────────
// 错误映射
// ─────────────────────────────────────────────────────────────

const COUPON_ERROR_MAP: Record<string, string> = {
  COUPON_SCOPE_MISMATCH: "本券仅限本店商品订单使用",
};

const COUPON_ERROR_MESSAGES: Array<[string, string]> = [
  ["Coupon not found or does not belong to you", "优惠券不存在或不属于您"],
  ["Coupon is not in a usable state", "该优惠券当前不可用"],
  ["Coupon template is disabled", "该优惠券已下架"],
  ["Coupon has expired", "优惠券已过期"],
  ["Coupon not yet started", "优惠券尚未开始"],
  ["Coupon not yet active", "优惠券尚未生效"],
  ["Per-user coupon limit reached", "已达该券每人限领次数"],
  ["Coupon sold out", "该优惠券已抢完"],
  ["Coupon redeemed", "该优惠券已领取"],
  ["Order total below minimum spend", "未达到该券使用门槛"],
  ["No active order to apply coupon", "暂无可使用该券的订单"],
  ["Order has no customer", "订单信息不完整，请稍后重试"],
  ["No customer for the current user", "登录状态异常，请重新登录"],
  ["You can only apply coupons to your own order", "只能对本人订单使用优惠券"],
];

/** 将 coupon 接口抛出的 GraphQL 错误规范化为友好中文提示 */
export function couponErrorMessage(e: unknown): string {
  const anyE = e as {
    message?: string;
    response?: { errors?: { message?: string; extensions?: { code?: string } }[] };
    errors?: { message?: string; extensions?: { code?: string } }[];
  };
  const errors = anyE?.response?.errors || anyE?.errors || [];
  for (const er of errors) {
    const code = er?.extensions?.code;
    if (code && COUPON_ERROR_MAP[code]) return COUPON_ERROR_MAP[code];
  }
  const msg = String(anyE?.message || "");
  for (const key of Object.keys(COUPON_ERROR_MAP)) {
    const mapped = COUPON_ERROR_MAP[key];
    if (mapped && msg.includes(key)) return mapped;
  }
  for (const [en, zh] of COUPON_ERROR_MESSAGES) {
    if (msg.includes(en)) return zh;
  }
  return msg || "优惠券不可用";
}

/** 组合：Provide 供页面调用（返回函数集合，等价 useCoupon()） */
export function useCoupon() {
  return {
    getCouponCentre,
    getMyCoupons,
    claimCoupon,
    applyCouponToOrder,
    clearCouponFromOrder,
    couponErrorMessage,
  };
}