export function useGqlHostUrl(): string {
  if (import.meta.client) {
    // 生产环境 /shop-api 由 Nginx 同源反代，动态跟随当前访问域名，避免烘焙 localhost
    return `${window.location.origin}/shop-api`;
  }
  // SSR：优先运行时配置的 GQL host（生产构建烧录同源 /shop-api，与请求 origin 等价；
  // preview 测试可用 NUXT_PUBLIC_GQL_HOST 免重建指向真实 API）
  const { public: pub } = useRuntimeConfig() as { public: { GQL_HOST?: string } };
  if (pub.GQL_HOST) return pub.GQL_HOST;
  // 兜底：跟随当前请求 Host（Nginx 已透传 Host 头），同样走同源 /shop-api
  const reqUrl = useRequestURL();
  return `${reqUrl.origin}/shop-api`;
}
