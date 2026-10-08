// 装修/运营配置跳转链接白名单（纯函数，SSR 友好）。
// 后台配置的链接不可信：外部 URL、协议相对地址（//evil.com）、伪协议一律回退 fallback。
// 消费点均为 <NuxtLink :to> / router.push —— vue-router 把外部 URL 当站内路径解析不会外跳，
// 但 // 协议相对形态仍可能被浏览器按外域处理，且 localePath 对非法路径可能抛错，前置收敛。
export function safeDecorLink(link: string | null | undefined, fallback = "/"): string {
  if (!link) return fallback;
  if (!link.startsWith("/") || link.startsWith("//")) return fallback;
  return link;
}
