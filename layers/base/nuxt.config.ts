import type { LocaleObject } from "@nuxtjs/i18n";
import { appLocales } from "./i18n/locales";

export default defineNuxtConfig({
  modules: [
    "@nuxt/eslint",
    "@nuxt/fonts",
    "@nuxtjs/i18n",
    "@nuxt/icon",
    "@nuxt/image",
    "@nuxt/scripts",
    "@nuxt/test-utils",
    "@nuxt/ui",
    "@nuxtjs/robots",
    "@nuxtjs/sitemap",
    "@pinia/nuxt",
    "@vueuse/nuxt",
    "nitro-cloudflare-dev",
    "nuxt-graphql-client",
    "nuxt-link-checker",
    "nuxt-og-image",
    "nuxt-schema-org",
    "pinia-plugin-persistedstate/nuxt",
  ],

  // App-Wide Settings
  app: {
    head: {
      link: [{ rel: "icon", type: "image/svg+xml", href: "/favicon.svg" }],
    },
  },

  css: ["~/assets/css/theme.css"],

  // Pinia Configuration
  pinia: {
    storesDirs: ["../stores/**"],
  },

  // Global NuxtImage  Configuration
  image: {
    domains: ["localhost"], // passthrough 关闭域名校验，此处保留仅为兼容
    provider: "passthrough",
    providers: {
      // 自定义 provider：原样返回图片 src，不做本地 sharp 处理，
      // 规避 win32 构建产物在 Linux 服务器上加载 native 二进制失败的问题（部署铁律：服务器不安装）
      passthrough: {
        name: "passthrough",
        provider: "~/image/passthrough",
        options: {},
      },
    },
  },

  // Fonts Configuration
  // 禁用 google / googleicons 字体 provider：构建与运行时均不访问 fonts.googleapis.com / fonts.google.com
  // （国内网络访问 google 会超时拉慢/卡死构建）。改用 Bunny Fonts（Google Fonts 的 CDN 镜像，国内可直连）兜底。
  fonts: {
    providers: {
      google: false,
      googleicons: false,
    },
    priority: ["bunny", "fontsource"],
  },

  // ColorMode Settings (currently defaults)
  colorMode: {
    preference: "system",
    fallback: "light",
  },

  // NuxtScripts Registry
  scripts: {
    registry: {
      stripe: true,
    },
  },

  // Global GraphQL Client Configuration
  "graphql-client": {
    codegen: {
      disableOnBuild: false,
      onlyOperationTypes: false,
    },
    documentPaths: [
      "../layers/base/gql/queries",
      "../layers/base/gql/fragments",
    ],
    clients: {
      default: {
        schema: "../graphql.schema.json",
        host: process.env.GQL_HOST!,
        headers: {
          "vendure-channel-token": process.env.CHANNEL_TOKEN!,
        },
      },
    },
  },

  // Global i18n Configuration
  i18n: {
    baseUrl: process.env.I18N_BASE_URL,
    locales: appLocales as LocaleObject[],
    defaultLocale: "zh-CN",
    fallbackLocale: "zh-CN",
  },
});
