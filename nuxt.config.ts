// https://nuxt.com/docs/api/configuration/nuxt-config
import tailwindcss from "@tailwindcss/vite";
import { siteIdentity } from "./schema/identity";

export default defineNuxtConfig({
  compatibilityDate: "2025-07-15",
  devtools: { enabled: import.meta.env.DEV },

  experimental: {
    typescriptPlugin: true,
  },

  nitro: {
    preset: "node-server",
    // nitro 默认 node-externals 有缓存 bug（nitrojs/nitro#2369），会导致模块反复重新解析、
    // 内存指数增长，Windows 上 "Building Nuxt Nitro server" 卡 30-60 分钟甚至死锁。
    // 开启 legacyExternals 可将构建从 1 小时降到约 2 分钟。
    // 注意：dev 模式（import.meta.env.PROD=false）必须关闭 legacyExternals，
    // 否则 Nuxt 4.4.x 在 Windows 上对 vite-builder 虚拟导入发出裸盘符路径（如 'D:/...'），
    // 触发 ERR_UNSUPPORTED_ESM_URL_SCHEME（github.com/nuxt/nuxt/issues/35491，上游 nitro 问题未修复）。
    // 仅构建时启用，兼顾构建速度与 dev 可用性。
    experimental: {
      legacyExternals: import.meta.env.PROD,
    },
    // Windows + extends 分层 + node-server 下，对超大 server bundle 压缩也会显著拖慢，关闭压缩。
    minify: false,
    // 本地开发：客户端动态使用同源 /shop-api，需代理到本地 Vendure（生产由 Nginx 反代）。
    // 注意：nitro devProxy 经 h3 app.use 挂载时会剥离路由前缀（/shop-api 被剥成 /），
    // 故 target 需带上 /shop-api 路径，利用 http-proxy prependPath 重新拼接为 /shop-api/。
    devProxy: {
      "/shop-api": {
        target: "http://localhost:3000/shop-api",
        changeOrigin: true,
      },
    },
  },

  extends: ["./layers/base"],

  css: ["./app/assets/css/main.css"],

  vite: {
    plugins: [tailwindcss()],
  },

  runtimeConfig: {
    public: {
      GQL_HOST: process.env.GQL_HOST,
      channelToken: process.env.CHANNEL_TOKEN,
      i18NBaseUrl: process.env.I18N_BASE_URL,
      stripeAccountId: process.env.STRIPE_ACCOUNT_ID,
      stripePublicKey: process.env.STRIPE_PUBLIC_KEY,
      unsplashApiKey: process.env.UNSPLASH_API_KEY,
    },
  },

  // NuxtSEO Modules Config
  ogImage: {
    security: {
      secret: process.env.OG_IMAGE_SECRET,
    },
    compatibility: {
      runtime: {
        // 使用 satori 默认渲染器；resvg 强制走 WASM 运行时，
        // 避免 win32 构建产物在 Linux 服务器上加载 @resvg/resvg-js native 二进制失败（部署铁律：服务器不构建/不安装）
        resvg: "wasm",
      },
    },
  },

  robots: {
    disallow: ["/account", "/checkout", "/confirmation", "/cart", "/search"],
    allow: "/",
    blockNonSeoBots: true,
  },

  schemaOrg: {
    identity: siteIdentity,
  },

  site: {
    url: siteIdentity.url,
    name: siteIdentity.name,
    description: siteIdentity.description,
    env: process.env.NODE_ENV,
    indexable: process.env.NODE_ENV === "production",
    trailingSlash: false,
  },

  sitemap: {
    sources: [
      // Optional sitemap integration.
      // Requires custom logic to fetch Vendure products and collections.
      // This can be handled via a third-party backend service.
      // A recipe or mapping example can be provided on request.
    ],
  },
});
