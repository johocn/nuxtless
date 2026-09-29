/**
 * 租户表启动预热
 *
 * Nitro 启动时异步拉取一次租户表，使首个请求不必等待（否则冷启动后第一个页面请求
 * 会在 server/middleware/tenant.ts 里同步等待一次 shopChannels 拉取，最长 3s）。
 * 失败静默：租户表按「上一次结果 → 构建期种子」降级，请求路径会自动重试。
 */

import { refreshTenantRegistry } from "../utils/tenant-registry";

export default defineNitroPlugin(() => {
  void refreshTenantRegistry();
});
