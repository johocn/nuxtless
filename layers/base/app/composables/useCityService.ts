/**
 * 城市服务判断工具：
 * - 未定位 → 不拦截（默认允许）
 * - 商品未配置 belongCity/serviceCities → 视为全城可售
 * - 当前城市名匹配 belongCity 或在 serviceCities 中 → 可服务
 *
 * getServiceInfo 返回结构化结果（含可购买城市列表），供「可购买城市」面板复用。
 */
export type ServiceReason = "ok" | "no-city" | "not-served";
export interface ServiceInfo {
  serviceable: boolean;
  reason: ServiceReason;
  serviceCities: string[]; // 去重、trim、过滤空
  belongCity?: string | null;
}

export function useCityService() {
  const locationStore = useLocationStore();

  interface ServiceableProduct {
    // 弱类型规避：加索引签名避免「全可选、无公共属性」引起的强类型拒绝，
    // 同时保留 belongCity/serviceCities 的类型化读取（真实商品 customFields 为两者并集）
    customFields?: {
      belongCity?: string | null;
      serviceCities?: Array<string | null> | null;
      [key: string]: unknown;
    } | null;
  }

  const matchCity = (name: string, city: string) =>
    name === city || city.startsWith(name) || name.startsWith(city);

  function getServiceInfo(product: ServiceableProduct | null | undefined): ServiceInfo {
    const city = locationStore.cityName;
    if (!city) {
      return { serviceable: true, reason: "no-city", serviceCities: [], belongCity: null };
    }
    const cf = product?.customFields;
    if (!cf) {
      return { serviceable: true, reason: "ok", serviceCities: [], belongCity: null };
    }
    const belong = cf.belongCity?.trim();
    const services = (cf.serviceCities ?? [])
      .map((s) => s?.trim() ?? "")
      .filter(Boolean);
    const dedup = Array.from(new Set(services));
    if (!belong && dedup.length === 0) {
      return { serviceable: true, reason: "ok", serviceCities: [], belongCity: belong ?? null };
    }
    const served =
      (belong && matchCity(belong, city)) || dedup.some((s) => matchCity(s, city));
    return {
      serviceable: served,
      reason: served ? "ok" : "not-served",
      serviceCities: dedup,
      belongCity: belong ?? null,
    };
  }

  // isServiceable 复用 getServiceInfo，行为不变
  function isServiceable(product: ServiceableProduct | null | undefined): boolean {
    return getServiceInfo(product).serviceable;
  }

  return { isServiceable, getServiceInfo, matchCity };
}