export type DeliveryMethod = 'MAIL' | 'SELF_PICKUP';

export interface VisibilityCtx {
  /** 当前城市；null=未授权 */
  city: string | null;
  /** 模块级配送选择 */
  delivery: DeliveryMethod;
}

export interface ProductLike {
  customFields?: {
    belongCity?: string | null;
    serviceCities?: Array<string | null> | null;
    deliveryMethods?: DeliveryMethod[] | null;
  } | null;
}

export function isProductVisible(p: ProductLike | null | undefined, ctx: VisibilityCtx): boolean {
  const cf = p?.customFields ?? {};
  const serviceCities: string[] = (cf.serviceCities ?? []).map((s) => s?.trim() ?? '').filter(Boolean);
  const belongCity: string = cf.belongCity?.trim() ?? '';
  // 空 deliveryMethods 视为两者都支持（旧数据兜底）
  const methods: DeliveryMethod[] = cf.deliveryMethods?.length ? cf.deliveryMethods : ['MAIL', 'SELF_PICKUP'];
  const isMail = methods.includes('MAIL');
  const isPickup = methods.includes('SELF_PICKUP');
  const map = (s: string[]) => s.some((x) => x === ctx.city); // 精确匹配（与 useCityService 的前缀匹配不同：本过滤用精确城市名）
  // 可寄到 X：MAIL 方式 && (城市未知 或 serviceCities 空=全城 或 含 X)
  const canMail = isMail && (!ctx.city || !serviceCities.length || map(serviceCities));
  // 可自提于 X：SELF_PICKUP 方式 && belongCity===X
  const canPickup = isPickup && !!belongCity && ctx.city === belongCity;
  return ctx.delivery === 'SELF_PICKUP' ? canPickup : canMail;
}
