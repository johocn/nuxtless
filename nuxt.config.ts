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
    // 注意：不要给 /_og/** 加 nitro routeRules 缓存（swr/cache 均会破坏 og-image 渲染：
    // 实测 swr 导致 satori "No fonts are loaded" 全量 500）。
    // og:image 同 URL 重复请求由 nuxt-og-image 内置内存缓存兜底（实测同 URL 二次 ~0.26s），
    // 同一商品（价格/内容不变时 og URL 固定）重复分享秒回，无需额外缓存层。
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
    // 本地开发：客户端动态使用同源 /shop-api，经 devProxy 服务端代理到后端（生产由 Nginx 反代）。
    // 默认指向线上 https://www.youshop.cn/shop-api，实现"本地 HMR 秒级预览 + 线上真实数据"的热更闭环；
    // 需要本地独立 Vendure(如连数据快照)时，用 DEV_PROXY_TARGET 环境变量覆盖为 http://localhost:3000/shop-api。
    // 注意：nitro devProxy 经 h3 app.use 挂载时会剥离路由前缀（/shop-api 被剥成 /），
    // 故 target 需带上 /shop-api 路径，利用 http-proxy prependPath 重新拼接为 /shop-api/。
    devProxy: {
      "/shop-api": {
        target: process.env.DEV_PROXY_TARGET || "https://www.youshop.cn/shop-api",
        changeOrigin: true,
        secure: true,
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
