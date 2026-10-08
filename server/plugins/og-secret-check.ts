/**
 * /_og 渲染端点防护提示（启动时校验）：
 * OG_IMAGE_SECRET 未注入时 nuxt-og-image 的签名校验关闭——任意构造参数可触发
 * satori 冷渲染（单次 3-4s CPU）并按唯一 URL 灌爆 fs 缓存目录（/tmp/nshop-og-image）。
 * 构建时已把 process.env.OG_IMAGE_SECRET 注入 ogImage.security.secret（nuxt.config.ts），
 * 此处对运行环境做二次确认：缺失则显式报错提醒补配，不做行为变更（避免阻断启动）。
 */
export default defineNitroPlugin(() => {
  const buildSecret = useRuntimeConfig()?.ogImage?.security?.secret as string | undefined;
  if (!buildSecret) {
    console.error(
      "[og-image] OG_IMAGE_SECRET 未配置：/_og 渲染端点无签名校验，存在 CPU/缓存滥用风险。" +
        "请在部署环境注入该密钥后重新构建部署。",
    );
  }
});
