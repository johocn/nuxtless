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
  },
});
