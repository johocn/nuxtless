// 首个 GQL 请求前解析 URL 首段租户并切换 vendure-channel-token。
// 运行于 app.vue setup 之前，确保 SSR 首帧（主题/菜单）就带正确租户 token。
export default defineNuxtPlugin(() => {
  const { activeTenant, tenants } = useTenantChannel();
  const path = import.meta.server ? useRequestURL().pathname : useRoute().path;
  const seg = (path.split("/").filter(Boolean)[0] || "") as string;
  // 仅命中已知租户 code 才记录，避免把真实页面段（如 /products/x）误当租户
  const hit = tenants.some((t) => t.code === seg);
  activeTenant.value = hit ? seg : null;

  // 在任意 typed GQL 之前设置租户渠道头。
  // 注意：本 Vendure 部署的 apiOptions.channelTokenKey 被覆盖为 "vendure-token"
  // （非默认 "vendure-channel-token"），header 键须一致后端才能切换渠道。
  const { token } = useTenantChannel();
  if (token.value) {
    useGqlHeaders({ "vendure-token": token.value });
  }
});