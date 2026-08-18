/**
 * 城市服务判断工具：
 * - 未定位 → 不拦截（默认允许）
 * - 商品未配置 belongCity/serviceCities → 视为全城可售
 * - 当前城市名匹配 belongCity 或在 serviceCities 中 → 可服务
 */
export function useCityService() {
  const locationStore = useLocationStore();

  interface ServiceableProduct {
    customFields?: {
      belongCity?: string | null;
      serviceCities?: Array<string | null> | null;
    } | null;
  }

  const matchCity = (name: string, city: string) =>
    name === city || city.startsWith(name) || name.startsWith(city);

  function isServiceable(product: ServiceableProduct | null | undefined): boolean {
    const city = locationStore.cityName;
    if (!city) return true;

    const cf = product?.customFields;
    if (!cf) return true;

    const belong = cf.belongCity?.trim();
    const services = (cf.serviceCities ?? [])
      .map((s) => s?.trim() ?? "")
      .filter(Boolean);

    if (!belong && services.length === 0) return true;

    if (belong && matchCity(belong, city)) return true;
    return services.some((s) => matchCity(s, city));
  }

  return { isServiceable };
}
