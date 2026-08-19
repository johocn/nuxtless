export function useGqlHostUrl(): string {
  if (import.meta.client) {
    // 生产环境 /shop-api 由 Nginx 同源反代，动态跟随当前访问域名，避免烘焙 localhost
    return `${window.location.origin}/shop-api`;
  }
  // SSR：跟随当前请求 Host（Nginx 已透传 Host 头），同样走同源 /shop-api
  const reqUrl = useRequestURL();
  return `${reqUrl.origin}/shop-api`;
}
