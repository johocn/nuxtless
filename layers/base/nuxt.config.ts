import type { LocaleObject } from "@nuxtjs/i18n";
import { appLocales } from "./i18n/locales";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

// 读取租户 code 白名单（与 useTenantChannel 共用同一份 data/tenant-channels.json）
function tenantCodes(): string[] {
  try {
    const json = JSON.parse(
      readFileSync(resolve(process.cwd(), "layers/base/data/tenant-channels.json"), "utf8"),
    );
    return (json.tenants || []).map((t: { code: string }) => t.code);
  } catch {
    return [];
  }
}

export default defineNuxtConfig({
  // 多租户路径前缀：在 i18n 之前为每条页面路由注入可选 :tenantCode 段。
  // 默认中文 => /t2/product/x；英文 => /en/t2/product/x（i18n 会把整条 path 前缀上 locale）。
  hooks: {
    "pages:extend"(pages: { path: string }[]) {
      const codes = tenantCodes();
      if (!codes.length) return;
      const rx = codes.slice(0, 200).join("|");
      const seg = `:tenantCode(${rx})?`;
      for (const route of pages) {
        if (typeof route.path !== "string" || !route.path.startsWith("/")) continue;
        route.path = route.path === "/" ? `/${seg}` : `/${seg}${route.path}`;
      }
    },
  },

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
      link: [
        // 显式声明 ico（浏览器地址栏/标签页兜底，避免 Nuxt 默认透明占位 ico 命中旧缓存）
        { rel: "icon", type: "image/x-icon", href: "/favicon.ico" },
        { rel: "icon", type: "image/svg+xml", href: "/favicon.svg" },
      ],
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
          "vendure-token": process.env.CHANNEL_TOKEN!,
        },
        // 让 requestMiddleware 以 `Authorization: Bearer <token>` 注入会话 token。
        // token 值 + 响应头捕获由 plugins/gql-session.ts 提供（游客/登录一致）。
        token: { name: "Authorization", type: "Bearer" },
      },
    },
  },

  // Global i18n Configuration
  i18n: {
    baseUrl: process.env.I18N_BASE_URL,
    locales: appLocales as LocaleObject[],
    defaultLocale: "zh-CN",
  },
});
