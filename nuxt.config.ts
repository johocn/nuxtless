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
    // 本地开发：客户端动态使用同源 /shop-api，需代理到本地 Vendure（生产由 Nginx 反代）
    devProxy: {
      "/shop-api": {
        target: "http://localhost:3000",
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
