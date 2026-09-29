import type { LocaleObject } from "@nuxtjs/i18n";
import { appLocales } from "./i18n/locales";

export default defineNuxtConfig({
  // 多租户路径前缀：在 i18n 之前为每条页面路由注入「免费」可选 :tenantCode 段。
  // 段内容不再受构建期白名单约束（真伪判定下移到运行时租户表 server/utils/tenant-registry.ts
  // + Vue 全局路由中间件 middleware/tenant.global.ts），从而使新增/启用渠道无需重新构建部署。
  // 默认中文 => /t2/product/x；英文 => /en/t2/product/x（i18n 会把整条 path 前缀上 locale）。
  //
  // 不遮蔽真实路由的依据：① 默认参数模式 [^/]+? 不含 /（段数 = token 数，无歧义）；
  // ② 整条路径锚定 ^...$；③ PathScore 静态段(40+40) 远高于动态段(20)，段数不足直接落败。
  // ⚠️ 缺省时 route.params.tenantCode 为空字符串 ""（非 undefined），判断必须用 falsy。
  hooks: {
    "pages:extend"(pages: { path: string }[]) {
      const seg = ":tenantCode?";
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

  // Pinia 持久化：默认落 cookie（pinia-plugin-persistedstate Nuxt 模块默认 storage=cookies）。
  // auth store 含会话 token/user，显式加固 cookie 属性：SameSite=Lax + path=/，
  // 生产环境追加 Secure（HTTPS 专用），避免无 Secure/SameSite 的明文 cookie 泄露。
  piniaPluginPersistedstate: {
    cookieOptions: {
      sameSite: "lax",
      path: "/",
      secure: process.env.NODE_ENV === "production",
    },
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

  // OG Image 渲染缓存持久化：og:image 走 satori 动态渲染（冷渲染 3-4s 超微信抓取阈值 → 微信回默认图）。
  // 默认缓存用 Nitro 内存 storage，PM2 restart 即清空，微信首抓必然冷渲染超时。
  // 改用文件系统持久缓存：渲染过的 og 卡写盘，进程重启不丢，微信每次抓都命中缓存秒回。
  ogImage: {
    runtimeCacheStorage: {
      driver: "fs",
      base: "/tmp/nshop-og-image",
    },
    cacheVersion: "v5",
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
