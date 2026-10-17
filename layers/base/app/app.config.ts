export default defineAppConfig({
  baseLayer: {
    name: "Base Layer",
  },

  countryCodeDefault: "CN",

  logoTop: {
    light: "/logo-top.svg",
    dark: "/logo-top.svg",
  },

  logoFull: {
    light: "/logo-full.svg",
    dark: "/logo-full.svg",
  },

  // 客服联系方式（售后页「联系客服」卡片数据源，可按需修改）
  customerService: {
    phone: "400-888-6666",
    wechat: "youshop-customerservice",
    hours: "09:00 - 21:00",
  },

  ui: {
    colors: {
      primary: "brand",
    },
    // 注：v4 组件主题（badge px 字号等）不从此处合并进运行时主题（工厂硬编码），
    // 大字版 rem 兜底走全局 CSS（见 assets/css/tailwind.css 末尾的 Nuxt UI px 字号兜底段）。
  },
});
