/**
 * passthrough 图片 provider（@nuxt/image v2 自定义 provider）
 *
 * 用途：商品图等均来自远端（如 Vendure 资产管理），无需本地 sharp 优化。
 * 原样返回 src，避免服务器在 Linux 上加载 Windows 构建出的 win32 版 native sharp 二进制而失败。
 */
export default () => ({
  validateDomains: false,
  getImage: (src: string) => ({ url: src }),
});