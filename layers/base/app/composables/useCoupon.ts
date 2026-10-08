/**
 * 优惠券 C 端能力（coupon-plugin shop API）。
 *
 * 设计约束：
 * - 不依赖 nuxt-graphql-client 的 codegen 类型（避免 build 时内省 schema），
 *   改用 `graphql-request`（nshop 已依赖 7.4.0）以运行时字符串查询实现，携带本地 TS 类型。
 * - 鉴权/渠道/语言头统一复用既有会话约定（参考 useGqlSession.ts / plugins/gql-session.ts）：
 *   `Authorization: Bearer <token>`（登录态 authStore → 游客 cookie）、
 *   `vendure-token`（runtime public.channelToken）、`Accept-Language`（当前 locale）。
 */
import { GraphQLClient } from "graphql-request";
import { toVendureLanguageCode } from "../utils/schemes";
import {
  VENDURE_AUTH_HEADER,
  readVendureTokenWithContext,
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
export type CouponIssuedBy = "CENTRE" | "ADMIN" | "EXCHANGE" | "SALE";
export type CouponChannel =
  | "CENTRE"
  | "SALE"
  | "POINTS"
  | "CODE"
  | "PRODUCT"
  | "GRANT";
export type CouponSaleStatus = "PENDING" | "PAID" | "CANCELLED" | "REFUNDED";
export type CouponSalePayMode = "WECHAT" | "ORDER_SURCHARGE";

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
  /** 券使用场景：ONLINE 仅线上 / IN_STORE 到店买单 / ALL 通用（后端现有字段，仅补充类型） */
  usageScene?: "ONLINE" | "IN_STORE" | "ALL" | null;
  /** 是否可被 C 端直接领取（商品专属券/兑换码券模板由后端扩展字段驱动） */
  claimable: boolean;
  /** 兑换码（凭码领券，非空时走 redeemCouponByCode） */
  claimCode?: string | null;
  /** 领取后有效天数 */
  validDays?: number | null;
  /** 是否仅限新客领取 */
  newCustomerOnly: boolean;
  /** 会员等级限制（如 GOLD），null 表示不限 */
  memberLevel?: string | null;
  /** 分发渠道（逗号分隔：CENTRE,SALE,POINTS,CODE,PRODUCT,GRANT）；null=未显式配置（按老字段推导） */
  distributionChannels?: string | null;
  /** 出售价（分）；0=不可售 */
  salePrice: number;
  createdAt: string;
  updatedAt: string;
}

/** 券包（出售型）：items 仅含 templateId + quantity，模板详情需用 catalogue.templates 映射 */
export interface CouponBundleItem {
  id: string;
  bundleId: string;
  templateId: string;
  quantity: number;
}

export interface CouponBundle {
  id: string;
  name: string;
  description?: string | null;
  /** 整包售价（分） */
  salePrice: number;
  enabled: boolean;
  channelId: string;
  items: CouponBundleItem[];
}

/** 券商城目录：可售单券模板 + 启用券包 */
export interface CouponSaleCatalogue {
  templates: CouponTemplate[];
  bundles: CouponBundle[];
}

/** 出售单（独立单据，不生成 Vendure Order） */
export interface CouponSaleOrder {
  id: string;
  customerId: string;
  payMode: CouponSalePayMode;
  templateId?: string | null;
  bundleId?: string | null;
  orderId?: string | null;
  amount: number;
  status: CouponSaleStatus;
  paidAt?: string | null;
  refundedAt?: string | null;
  createdAt: string;
}

/** 微信支付参数（对齐充值卡 CouponWechatPayParams） */
export interface CouponWechatPayParams {
  payType: string;
  prepayId?: string | null;
  appId?: string | null;
  timeStamp?: string | null;
  nonceStr?: string | null;
  package?: string | null;
  signType?: string | null;
  paySign?: string | null;
  payUrl?: string | null;
}

export interface CouponWechatPayResult {
  saleOrderId: string;
  outTradeNo: string;
  pay: CouponWechatPayParams;
}

/** 积分兑换结果 */
export interface ExchangeCouponResult {
  coupon: CustomerCoupon;
  spentPoints: number;
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

/** 商品专属券绑定（商品详情页可展示并一键领取；shop 侧无 remark 字段） */
export interface ProductCouponBinding {
  id: string;
  productId: string;
  variantIds?: string[] | null;
  couponTemplateId: string;
  enabled: boolean;
  displayOrder: number;
  badgeText?: string | null;
  promoTitle?: string | null;
  template?: CouponTemplate | null;
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

/**
 * 只读当前 locale。禁止在事件回调里直接调用 `useI18n()`——vue-i18n 要求组件 setup 上下文，
 * 在点击/提交等 handler 中 getCurrentInstance() 为 null，会抛 vue-i18n 错误 26
 * (MUST_BE_CALL_SETUP_TOP)，导致领券等请求在发出前就同步失败。
 * 这里优先全局 $i18n 实例（不依赖 setup 上下文），失败再回退默认 zh-CN。
 */
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

function resolveClient(): GraphQLClient {
  const { token: channelToken } = useTenantChannel();
  const locale = readLocale();
  const gqlHost = useGqlHostUrl();
  const headers: Record<string, string> = { "Content-Type": "application/json" };

  // 会话 token 单一来源 cookie（vendure_shop_token，登录态/游客共用，与 useGqlSession 一致）
  const token = readVendureTokenWithContext();
  if (token) headers.authorization = `Bearer ${token}`;
  if (channelToken.value) headers["vendure-token"] = channelToken.value;
  if (locale) headers["Accept-Language"] = locale;

  const client = new GraphQLClient(
    `${gqlHost}?languageCode=${toVendureLanguageCode(locale)}`,
    {
      headers,
      // 复刻 gql-session 插件：捕获响应头 `vendure-auth-token` 持久化，保证游客/登录同会话
      responseMiddleware: (response: any) => {
        const headersObj = response?.headers ?? response?.response?.headers;
        const sessionToken =
          headersObj?.get?.(VENDURE_AUTH_HEADER) ??
          headersObj?.entries?.()?.find?.(([k]: [string, string]) => k.toLowerCase() === VENDURE_AUTH_HEADER.toLowerCase())?.[1];
        if (sessionToken) writeVendureSessionToken(sessionToken);
      },
    },
  );

  return client;
}

// ─────────────────────────────────────────────────────────────
// 字符串查询（按真实 SDL 字段）
// ─────────────────────────────────────────────────────────────

const COUPON_TEMPLATE_FIELDS = `
  id name description type discountValue minSpend
  startsAt endsAt totalCount claimedCount pointsPrice perUserLimit
  scope categoryId variantId enabled shopId usageScene createdAt updatedAt
  claimable claimCode validDays newCustomerOnly memberLevel
  distributionChannels salePrice
`;

const BUNDLE_FIELDS = `
  id name description salePrice enabled channelId
  items { id bundleId templateId quantity }
`;

const SALE_ORDER_FIELDS = `
  id customerId payMode templateId bundleId orderId amount status
  paidAt refundedAt createdAt
`;

const CUSTOMER_COUPON_FIELDS = `
  id customerId templateId code status issuedBy
  reservedOrderId usedOrderId issuedAt usedAt expiredAt
  template { ${COUPON_TEMPLATE_FIELDS} }
  createdAt updatedAt
`;

const PRODUCT_COUPON_BINDING_FIELDS = `
  id productId variantIds couponTemplateId enabled displayOrder
  badgeText promoTitle
  template { ${COUPON_TEMPLATE_FIELDS} }
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
interface ProductCouponsQuery {
  productCoupons: ProductCouponBinding[];
}
interface ClaimProductCouponMutation {
  claimProductCoupon: CustomerCoupon;
}
interface RedeemCouponByCodeMutation {
  redeemCouponByCode: CustomerCoupon;
}
interface PointsMallQuery {
  pointsMallTemplates: CouponTemplate[];
}
interface ExchangeWithPointsMutation {
  exchangeCouponWithPoints: ExchangeCouponResult;
}
interface CouponSaleCatalogueQuery {
  couponSaleCatalogue: CouponSaleCatalogue;
}
interface MyCouponSaleOrdersQuery {
  myCouponSaleOrders: CouponSaleOrder[];
}
interface CreateCouponSaleOrderMutation {
  createCouponSaleOrder: CouponSaleOrder;
}
interface PayCouponSaleWithBalanceMutation {
  payCouponSaleWithBalance: CouponSaleOrder;
}
interface CreateWechatCouponPaymentMutation {
  createWechatCouponPayment: CouponWechatPayResult;
}
interface CancelCouponSaleOrderMutation {
  cancelCouponSaleOrder: CouponSaleOrder;
}
interface AttachCouponToOrderMutation {
  attachCouponToOrder: CouponSaleOrder;
}
interface DetachCouponFromOrderMutation {
  detachCouponFromOrder: boolean;
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

/** 商品专属券：查询指定商品可领取的专属优惠券绑定列表（含模板详情） */
export async function getProductCoupons(productId: string): Promise<ProductCouponBinding[]> {
  const client = resolveClient();
  const data = await client.request<ProductCouponsQuery>(
    `query ProductCoupons($productId: ID!) {
      productCoupons(productId: $productId) { ${PRODUCT_COUPON_BINDING_FIELDS} }
    }`,
    { productId },
  );
  return data.productCoupons;
}

/** 领取商品专属券（按 binding id），成功返回 CustomerCoupon */
export async function claimProductCoupon(bindingId: string): Promise<CustomerCoupon> {
  const client = resolveClient();
  const data = await client.request<ClaimProductCouponMutation>(
    `mutation ClaimProductCoupon($bindingId: ID!) {
      claimProductCoupon(bindingId: $bindingId) { ${CUSTOMER_COUPON_FIELDS} }
    }`,
    { bindingId },
  );
  return data.claimProductCoupon;
}

/** 凭兑换码领券，成功返回 CustomerCoupon */
export async function redeemCouponByCode(claimCode: string): Promise<CustomerCoupon> {
  const client = resolveClient();
  const data = await client.request<RedeemCouponByCodeMutation>(
    `mutation RedeemCouponByCode($claimCode: String!) {
      redeemCouponByCode(claimCode: $claimCode) { ${CUSTOMER_COUPON_FIELDS} }
    }`,
    { claimCode },
  );
  return data.redeemCouponByCode;
}

/* ------------------------- 积分商城 ------------------------- */

/** 积分商城：可用积分兑换的券模板列表 */
export async function getPointsMallTemplates(): Promise<CouponTemplate[]> {
  const client = resolveClient();
  const data = await client.request<PointsMallQuery>(`query PointsMallTemplates {
    pointsMallTemplates { ${COUPON_TEMPLATE_FIELDS} }
  }`);
  return data.pointsMallTemplates;
}

/** 积分兑换券，成功返回兑换结果（含新券与消耗积分） */
export async function exchangeCouponWithPoints(
  templateId: string,
): Promise<ExchangeCouponResult> {
  const client = resolveClient();
  const data = await client.request<ExchangeWithPointsMutation>(
    `mutation ExchangeCouponWithPoints($templateId: ID!) {
      exchangeCouponWithPoints(templateId: $templateId) {
        spentPoints
        coupon { ${CUSTOMER_COUPON_FIELDS} }
      }
    }`,
    { templateId },
  );
  return data.exchangeCouponWithPoints;
}

/* ------------------------- 券商城（出售单） ------------------------- */

/** 券商城目录：可售单券 + 启用券包；scene 缺省 ONLINE */
export async function getCouponSaleCatalogue(
  scene?: "ONLINE" | "IN_STORE" | "ALL",
): Promise<CouponSaleCatalogue> {
  const client = resolveClient();
  const data = await client.request<CouponSaleCatalogueQuery>(
    `query CouponSaleCatalogue($scene: CouponUsageScene) {
      couponSaleCatalogue(scene: $scene) {
        templates { ${COUPON_TEMPLATE_FIELDS} }
        bundles { ${BUNDLE_FIELDS} }
      }
    }`,
    { scene: scene ?? null },
  );
  return data.couponSaleCatalogue;
}

/** 创建出售单（templateId / bundleId 二选一），返回 PENDING 单 */
export async function createCouponSaleOrder(input: {
  templateId?: string;
  bundleId?: string;
}): Promise<CouponSaleOrder> {
  const client = resolveClient();
  const data = await client.request<CreateCouponSaleOrderMutation>(
    `mutation CreateCouponSaleOrder($templateId: ID, $bundleId: ID) {
      createCouponSaleOrder(templateId: $templateId, bundleId: $bundleId) { ${SALE_ORDER_FIELDS} }
    }`,
    { templateId: input.templateId ?? null, bundleId: input.bundleId ?? null },
  );
  return data.createCouponSaleOrder;
}

/** 生成微信支付参数（openid 由后端从客户档案推导，前端可不传） */
export async function createWechatCouponPayment(
  saleOrderId: string,
  tradeType?: "JSAPI" | "NATIVE" | "H5" | "APP",
  openid?: string,
): Promise<CouponWechatPayResult> {
  const client = resolveClient();
  const data = await client.request<CreateWechatCouponPaymentMutation>(
    `mutation CreateWechatCouponPayment($saleOrderId: ID!, $tradeType: String, $openid: String) {
      createWechatCouponPayment(saleOrderId: $saleOrderId, tradeType: $tradeType, openid: $openid) {
        saleOrderId outTradeNo
        pay { payType prepayId appId timeStamp nonceStr package signType paySign payUrl }
      }
    }`,
    { saleOrderId, tradeType: tradeType ?? null, openid: openid ?? null },
  );
  return data.createWechatCouponPayment;
}

/** 余额支付（同步结算） */
export async function payCouponSaleWithBalance(
  id: string,
): Promise<CouponSaleOrder> {
  const client = resolveClient();
  const data = await client.request<PayCouponSaleWithBalanceMutation>(
    `mutation PayCouponSaleWithBalance($id: ID!) {
      payCouponSaleWithBalance(id: $id) { ${SALE_ORDER_FIELDS} }
    }`,
    { id },
  );
  return data.payCouponSaleWithBalance;
}

/** 取消出售单（仅 PENDING） */
export async function cancelCouponSaleOrder(
  id: string,
): Promise<CouponSaleOrder> {
  const client = resolveClient();
  const data = await client.request<CancelCouponSaleOrderMutation>(
    `mutation CancelCouponSaleOrder($id: ID!) {
      cancelCouponSaleOrder(id: $id) { ${SALE_ORDER_FIELDS} }
    }`,
    { id },
  );
  return data.cancelCouponSaleOrder;
}

/** 我的出售单（含 PENDING/PAID/…） */
export async function getMyCouponSaleOrders(): Promise<CouponSaleOrder[]> {
  const client = resolveClient();
  const data = await client.request<MyCouponSaleOrdersQuery>(
    `query MyCouponSaleOrders { myCouponSaleOrders { ${SALE_ORDER_FIELDS} } }`,
  );
  return data.myCouponSaleOrders;
}

/* ------------------------- 商品页加价购 ------------------------- */

/** 加价购挂券到活动订单（券价随主订单结算） */
export async function attachCouponToOrder(
  orderId: string,
  templateId: string,
): Promise<CouponSaleOrder> {
  const client = resolveClient();
  const data = await client.request<AttachCouponToOrderMutation>(
    `mutation AttachCouponToOrder($orderId: ID!, $templateId: ID!) {
      attachCouponToOrder(orderId: $orderId, templateId: $templateId) { ${SALE_ORDER_FIELDS} }
    }`,
    { orderId, templateId },
  );
  return data.attachCouponToOrder;
}

/** 取消加价购（移除 surcharge + 出售单置 CANCELLED） */
export async function detachCouponFromOrder(
  orderId: string,
  templateId: string,
): Promise<boolean> {
  const client = resolveClient();
  const data = await client.request<DetachCouponFromOrderMutation>(
    `mutation DetachCouponFromOrder($orderId: ID!, $templateId: ID!) {
      detachCouponFromOrder(orderId: $orderId, templateId: $templateId)
    }`,
    { orderId, templateId },
  );
  return data.detachCouponFromOrder;
}

/** 判断模板分发渠道是否包含指定渠道（distributionChannels 为逗号分隔字符串） */
export function templateHasChannel(
  tpl: Pick<CouponTemplate, "distributionChannels">,
  channel: CouponChannel,
): boolean {
  const raw = tpl.distributionChannels;
  if (!raw) return false;
  return raw
    .split(",")
    .map((s) => s.trim().toUpperCase())
    .includes(channel);
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
  ["Binding not found", "商品专属券不存在或已下架"],
  ["Coupon is not claimable", "该券暂不可领取"],
  ["Invalid claim code", "兑换码无效"],
  ["Claim code not available in this shop", "该兑换码在当前店铺不可用"],
  ["Coupon is for new customers only", "该券仅限新客领取"],
  // —— 券商城 / 出售单 / 加价购 / 积分兑换 ——
  ["Balance payment is not available", "余额支付暂不可用，请改用微信支付"],
  ["Payment gateway not configured", "支付通道未配置，请稍后再试"],
  ["Coupon sale order not found", "出售单不存在或不属于当前店铺"],
  ["templateId or bundleId is required", "请选择要购买的券或券包"],
  ["Only one of templateId / bundleId is allowed", "单券与券包只能二选一"],
  ["Coupon is not for sale", "该券暂不可购买"],
  ["Coupon has no sale price", "该券暂不可购买"],
  ["Coupon is not available in this shop", "该券在当前店铺不可用"],
  ["Coupon bundle not found", "券包不存在或已下架"],
  ["Coupon bundle has no sale price", "该券包暂不可购买"],
  ["Coupon bundle is empty", "该券包暂无可发放的券"],
  ["Bundle template", "券包内含不可用的券，暂不可购买"],
  ["Balance refund is not available", "余额退款暂不可用，请联系客服"],
  ["Please refund the main order instead", "该券随主订单购买，请在订单中申请退款"],
  ["Coupon already used, refund rejected", "券已使用，无法退款"],
  ["Coupon sale order is", "该出售单当前不可支付或退款"],
  ["Order does not belong to the current customer", "只能操作本人的订单"],
  ["Coupon already attached to this order", "该券已加购"],
  ["Coupon is not available for online orders", "该券仅限到店使用，无法线上加购"],
  ["No customer for the current user", "登录状态异常，请重新登录"],
  ["This coupon is not exchangeable with points", "该券暂不支持积分兑换"],
  ["Points service is not enabled", "积分功能暂不可用"],
  ["Insufficient points", "积分不足"],
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
    getProductCoupons,
    claimProductCoupon,
    redeemCouponByCode,
    applyCouponToOrder,
    clearCouponFromOrder,
    // 积分商城
    getPointsMallTemplates,
    exchangeCouponWithPoints,
    // 券商城 / 出售单
    getCouponSaleCatalogue,
    createCouponSaleOrder,
    createWechatCouponPayment,
    payCouponSaleWithBalance,
    cancelCouponSaleOrder,
    getMyCouponSaleOrders,
    // 商品页加价购
    attachCouponToOrder,
    detachCouponFromOrder,
    // 工具
    templateHasChannel,
    couponErrorMessage,
  };
}