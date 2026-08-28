# nshop 中英文多语言本地化实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让 nshop 前端在默认中文界面下不再出现英文文案——补齐 `zh-CN.ts` 词库英文词条为准确中文、核对 `en-US.ts`、抽离组件模板硬编码英文，实现中英触底、其它语言回退中文。

**Architecture:** 完全复用现有 `@nuxtjs/i18n` 体系，不改 `nuxt.config.ts`、不改 fallback 策略、不新依赖。核心是把 `layers/base/i18n/locales/zh-CN.ts` 中仍是英文的词条整体重写为中文，并将 `app/components` 与 `app/pages` 中残余硬编码英文抽成 i18n 词条（中英同步）。品牌名与营销性 tagline（如 nshop/SKU/Nuxtless）保留不动。

**Tech Stack:** Nuxt 3、@nuxtjs/i18n、vue-i18n、@nuxt/ui（`t()` = `$t()` + `messages.` 前缀路径）。

---

## 背景：词库中英文现状

`layers/base/i18n/locales/zh-CN.ts` 当前中英文混杂：

- **已中文**（保留）：`detail` / `checkout` / `order` / `afterSales` / `shop`（部分） / `account.addresses`（部分）。
- **仍英文**（本次重写）：`pages` / `general`（含 `shopFeatures`、`footer`）/ `account`（表单与文案）/ `billing` / `error` / `shop`（部分英文词条）。
- **保留品牌/营销**（不动）：`site` 整块（Nuxtless 品牌与国际化 tagline）、`account` 中已是中文的地址相关词条、`shop` 中 `filters` 等已中文化词条。

语言访问路径：组件内用 `t("messages.general.cancel")`（外层 `messages` 前缀），语言包文件内层即 `messages: { general: { cancel } }`。

---

## 文件结构

- 修改：`layers/base/i18n/locales/zh-CN.ts` —— 重写英文词条为中文
- 修改：`layers/base/i18n/locales/en-US.ts` —— 确保键位结构一致、英文准确
- 修改：`layers/base/app/components/SearchModal.vue` —— 抽硬编码
- 修改：`layers/base/app/components/header/MobileMenu.vue` —— 抽硬编码
- 修改：`layers/base/app/pages/checkout/index.vue` —— 抽 sr-only 硬编码
- 修改：`layers/base/app/pages/checkout/confirmation/[code].client.vue` —— 抽 sr-only 硬编码
- 修改：`layers/base/app/pages/category/[slug].vue` —— 抽 sr-only 硬编码
- 修改：`layers/base/app/pages/account/index.vue` —— 抽 sr-only 硬编码
- 修改：`layers/base/app/pages/account/verify.vue` —— 抽硬编码
- 修改：`layers/base/app/components/product-detail/DetailFloor.vue` —— SKU 标签
- 修改：`layers/base/app/components/product-detail/DetailClassic.vue` —— SKU 标签
- 保留（品牌）：`site` 区块、`GoodsMasonryGrid.vue` 的 nshop、`JdPcHeader.vue` 的 youShop/JD、SKU 术语本身

---

## Task 1: 重写 `zh-CN.ts` 为完整中文

**Files:**
- Write: `layers/base/i18n/locales/zh-CN.ts`

- [ ] **Step 1: 用以下完整内容覆盖 `zh-CN.ts`**

```ts
export default defineI18nLocale(() => ({
  messages: {
    site: {
      // 品牌名与国际化 tagline 保留英文（非 UI 操作文案）
      title: "Nuxtless",
      tagline: "Nuxt Level Headless E-commerce",
      shortDescription:
        "A modern, fast, and secure foundation for building headless online stores with Nuxt and Vendure.",
      description:
        "Nuxtless is a flexible and modular starter project for headless e-commerce, designed for high performance, excellent SEO, and clean architecture. It offers ready integrations with Vendure, Nuxt UI, and Payload, type-safe code, and professional security practices — a solid foundation for any professional online store.",
    },
    detail: {
      reviews: '商品评价',
      reviewsEmpty: '暂无评价，成为第一个评价的人',
      serviceItems: ['正品保障', '极速发货', '售后无忧'],
      promoItems: ['支持7天无理由退换', '满99元包邮'],
      buyNow: '立即购买',
      addToCart: '加入购物车',
      promoSummary: '促销',
      serviceSummary: '服务保障',
      inStock: '有货',
      outOfStock: '无货',
      floorDescription: '详情',
      floorSpecs: '参数',
      floorReviews: '评价',
      floorService: '售后',
      notServiceable: '该商品暂不支持配送至当前城市',
      viewServiceCities: '查看可购买城市',
      serviceCitiesTitle: '可购买城市',
      nationwide: '全城配送',
      nearbyLoading: '正在查询就近库存…',
      nearbyNoCoords: '开启定位可查看就近库存',
      nearbyError: '就近门店库存暂不可查',
      nearbyNoStock: '暂无可查看的门店库存',
      addedToCart: '已加入购物车',
      buyNowFailed: '购买失败，请重试',
      stockShortage: '库存不足，已加入 {n} 件',
    },
    pages: {
      index: {
        welcome: '欢迎使用',
      },
      account: {
        signIn: '登录您的账户',
        requestPasswordReset: '重置密码',
        accountVerify: '账户验证',
      },
    },
    general: {
      cancel: '取消',
      save: '保存',
      colorMode: '外观模式',
      system: '跟随系统',
      light: '浅色',
      dark: '深色',
      actions: '操作',
      details: '详情',
      getLink: '复制链接',
      getLinkSuccess: '订单链接已复制到剪贴板！',
      citySearchHint: '输入城市进行搜索…',
      date: '日期',
      na: '—',
      status: '状态',
      amount: '金额',
      paymentMethod: '支付方式',
      shipping: '配送',
      shippingDetails: '配送详情',
      shippingSelect: '配送方式',
      shippingAddress: '收货地址',
      tax: '税费',
      home: '首页',
      product: '商品',
      menu: '菜单',
      mobileMenu: '移动端菜单',
      apply: '应用',
      loading: '请稍候…',
      printReceipt: '打印回执',
      generalMessage: '请稍后重试或联系客服。',
      shopFeatures: {
        shipping: '全场包邮',
        shippingText: '所有订单满 50 元免运费。',
        returns: '30 天退换',
        returnsText: '不满意？可在 30 天内退换。',
        checkout: '安全结算',
        checkoutText: '采用安全加密支付，保障资金安全。',
        support: '随时在线',
        supportText: '全年无休在线客服，为您答疑。',
      },
      footer: {
        unstack: '用 ❤️ 打造',
      },
    },
    checkout: {
      deliveryMethod: "配送方式",
      pickupMethod: "自提方式",
      logisticsDelivery: "物流配送",
      storePickup: "门店自提",
      employeePickup: "职工单位自提",
      pointPickup: "自提点自提",
      deliveryTo: "配送至",
      deliveryToDesc: "收货人、电话、省市区、街道",
      addAddress: "新增地址",
      switchAddress: "切换地址",
      saveAddress: "保存收货地址",
      needAddress: "请先填写收货地址",
      useBook: "使用地址簿",
      invalidAddress: "收货地址不完整",
      choosePickup: "选择自提点",
      nearestHint: "已按就近预选，可手动更改",
      locateHint: "开启定位可按距离就近排序并自动预选最近自提点",
      noPickup: "当前定位附近暂无可自提点，可切换其他方式",
      needPickup: "请先选择自提点",
      noShippingMethod: "暂无可配送方式",
      noShippingMethodDesc: "当前收货地址暂无可配送方式，可尝试门店自提/自提点，或修改收货地址。",
    },
    account: {
      password: '密码',
      newPassword: '新密码',
      confirmNewPassword: '确认新密码',
      updatePassword: '更新密码',
      forgotPassword: '忘记密码？',
      rememberPassword: '想起密码了？',
      passwordPlaceholder: '请输入密码',
      firstName: '姓氏',
      firstNamePlaceholder: '请输入姓氏',
      lastName: '名字',
      lastNamePlaceholder: '请输入名字',
      enterPassword: '输入密码',
      confirmPassword: '确认您的密码',
      email: '邮箱',
      emailPlaceholder: '请输入邮箱',
      login: '登录',
      logout: '退出登录',
      backToLogin: '返回登录。',
      ifRegistered: '如果您输入的邮箱已注册，我们将发送一封重置密码的邮件到您的邮箱。',
      resetPassword: '重置密码',
      sendPasswordResetEmail: '发送邮件',
      register: '注册',
      accountRegister: '注册',
      noAccount: '还没有账户？',
      hasAccount: '已有账户？',
      myAccount: '我的账户',
      profile: '个人资料',
      myPhone: '我的手机号',
      myAddress: '我的地址',
      orders: '我的订单',
      loginToAccount: '登录您的账户',
      loginSuccess: '登录成功',
      successMessage: '您已成功登录账户。',
      loginFail: '登录失败',
      failMessage: '账号或密码错误。',
      registerSuccess: '注册成功',
      registerSuccessMessage: '请查收邮件以验证您的账户。',
      registerFail: '注册失败',
      verifySuccess: '账户已验证',
      verifySuccessMessage: '您现在可以使用邮箱和密码登录了。',
      resetSuccess: '密码重置',
      resetMessage: '您的密码已重置。',
      addresses: "收货地址",
      addAddress: "新增地址",
      edit: "编辑",
      delete: "删除",
      defaultAddress: "默认",
      noAddresses: "暂无收货地址",
      selectAddress: "从地址簿选择",
      saveSuccess: "保存成功",
      deleteSuccess: "已删除",
      backToAccount: "返回我的账户",
      contactName: "联系人",
      phone: "联系电话",
      afterSales: "售后/退换",
      noDefaultAddress: "暂无默认地址",
      profileInfo: "个人资料",
      phoneLabel: "手机号",
      addressLabel: "地址",
      accountActions: "账户操作",
      verifyingAccount: "正在验证您的账户…",
      verificationComplete: "验证完成，正在跳转…",
    },
    afterSales: {
      title: "售后/退换",
      detailTitle: "售后详情",
      backToList: "返回售后列表",
      apply: "申请售后",
      applyTitle: "申请售后/退换",
      type: "类型",
      typeReturnRefund: "退货退款",
      typeRefundOnly: "仅退款",
      typeExchange: "换货",
      typeUnknown: "售后",
      refundAmount: "退款金额",
      amountHint: "上限",
      amount: "退款金额",
      reason: "原因",
      reasonPlaceholder: "请描述售后原因",
      reasonHint: "请填写原因且金额不超过上限",
      description: "详细说明",
      descPlaceholder: "选填，补充说明",
      submit: "提交申请",
      submitTracking: "提交单号",
      cancel: "取消",
      cancelSuccess: "已取消售后申请",
      createSuccess: "售后申请已提交",
      trackingSuccess: "回寄单号已更新",
      trackingNo: "回寄单号",
      carrier: "承运商/物流公司",
      carrierPlaceholder: "如：中通快递",
      trackingPlaceholder: "输入运单号",
      trackTitle: "填写回寄物流单号",
      orderCode: "订单号",
      rejectReason: "驳回原因",
      empty: "暂无售后记录",
      notFound: "售后记录不存在",
      tabAll: "全部",
      tabPending: "待审核",
      tabToReturn: "待退货",
      tabReturning: "退货退款中",
      tabRefunded: "已退款",
      tabRejected: "已驳回",
      tabClosed: "已关闭",
      statePending: "待商家审核",
      stateApproved: "审核通过·待退货",
      stateRejected: "已驳回",
      stateReturning: "退货中",
      stateReceived: "已收货·退款处理中",
      stateRefunded: "已退款",
      stateClosed: "已关闭",
      stateUnknown: "处理中",
      stepPending: "申请",
      stepApproved: "审核通过",
      stepReturning: "退货中",
      stepReceived: "已收货",
      stepRefunded: "已退款",
    },
    shop: {
      category: "分类",
      shopByCategory: "按分类选购",
      popularProducts: "热门商品",
      inStock: "有货",
      lowStock: "库存紧张",
      outOfStock: "缺货",
      price: "价格",
      priceFrom: "起",
      addToCart: "加入购物车",
      close: "关闭",
      rateEmail: "您的邮箱",
      orderSummary: "订单摘要",
      orderReceived: "订单已受理",
      orderCode: "订单号",
      orderDetails: "订单详情",
      orderThanks:
        "感谢您的下单！请查收邮件获取详细订单信息（如未收到请检查垃圾邮件）。如果您提供的邮箱有误或 5–10 分钟内未收到确认邮件，请联系客服并提供订单号。标准配送约需 3–5 个工作日。再次感谢您的信任！",
      thankYou: "感谢！",
      total: "合计",
      subtotal: "小计",
      yourCart: "您的购物车",
      cartDescription: "您购物车中的商品",
      cartEmpty: "购物车是空的。",
      browseProducts: "去逛逛",
      browseOurProducts: "浏览我们的商品",
      quantity: "数量",
      checkout: "去结算",
      searchProducts: "搜索商品",
      searchPlaceholder: "输入关键词搜索…",
      searchLoading: "搜索中…",
      searchProductsAria: "搜索商品",
      couponCode: "优惠券码",
      noProductsFound: {
        title: "未找到商品",
      },
      filters: "筛选",
      noFilters: "暂无筛选条件",
      clearFilters: "清空筛选",
      applyFilters: "应用筛选",
      outOfArea: "超区商品",
      pickupInfo: "自提 / 核销信息",
      pickupClaimed: "已核销",
      pickupPending: "待核销",
      packageShipping: "每包运费明细",
      warehouse: "仓",
      shippingAdjustmentCharge: "补收",
      shippingAdjustmentRefund: "退还",
    },
    order: {
      tabAll: "全部",
      tabPaymentPending: "待支付",
      tabToShip: "待发货",
      tabToReceive: "待收货",
      tabCompleted: "已完成",
      tabCancelled: "已取消",
      statePaymentPending: "待支付",
      statePaid: "待发货",
      stateShipped: "待收货",
      stateDelivered: "已完成",
      stateCancelled: "已取消",
      stateProcessing: "处理中",
      progressPlaced: "下单",
      progressPaid: "支付",
      progressShipped: "发货",
      progressCompleted: "完成",
      delivery: "配送方式",
      expressNo: "运单号",
      expressCompany: "物流公司",
      pickupType: "自提类型",
      cancel: "取消订单",
      cancelNotAllowed: "已付款/已发货订单请在客服协助下处理",
      cancelSuccess: "订单已取消",
      cancelFailed: "取消失败",
      reorder: "再次购买",
      reorderSuccess: "已加入购物车",
      reorderFailed: "加入购物车失败",
      noAddress: "无收货地址",
    },
    billing: {
      firstName: '姓氏',
      lastName: '名字',
      address1: '街道地址',
      address2: '地址 2（楼栋、楼层、门牌）',
      city: '城市',
      zip: '邮政编码',
      country: '国家/地区',
      phoneNumber: '手机号',
      email: '邮箱',
    },
    error: {
      invalidPasswordResetLink: '密码重置链接无效。',
      resetFail: '重置失败',
      general: '出错了',
      generalMessage: '请稍后重试或联系客服。',
      noOrder: '未找到订单',
      orderNotFound: '未找到您的订单，请登录后查看。',
    },
  },
}));
```

- [ ] **Step 2: 验证语法与结构**

Run: `npx tsc --noEmit -p tsconfig.json` 或 `npx eslint layers/base/i18n/locales/zh-CN.ts`
Expected: 无类型/语法错误（文件为 `defineI18nLocale` 包裹的普通 TS，仅校验可解析即可）。

- [ ] **Step 3: Commit**

```bash
git add layers/base/i18n/locales/zh-CN.ts
git commit -m "feat(i18n): zh-CN 词库完整中文化"
```

---

## Task 2: 核对 `en-US.ts` 键位与英文

**Files:**
- Modify: `layers/base/i18n/locales/en-US.ts`

说明：`en-US.ts` 目前为英文，键位结构需与 zh-CN 保持一致。本任务主要是**核对并补齐 Task 1 新增的词条键**（`account.noDefaultAddress` / `profileInfo` / `phoneLabel` / `addressLabel` / `accountActions` / `verifyingAccount` / `verificationComplete`、`shop.searchPlaceholder` / `searchLoading` / `searchProductsAria`），使其在英文下也能正确回显对应文本，避免因缺键在 en-US 下静默不显示。

- [ ] **Step 1: 在 `en-US.ts` 的对应位置补齐新增键**

在 `account` 区块末尾（`afterSales` 之后）追加：

```ts
      noDefaultAddress: 'No default address',
      profileInfo: 'Profile Information',
      phoneLabel: 'Phone',
      addressLabel: 'Address',
      accountActions: 'Account Actions',
      verifyingAccount: 'Verifying your account...',
      verificationComplete: 'Verification complete. Redirecting…',
```

在 `shop` 区块的 `searchProducts` 之后追加：

```ts
      searchPlaceholder: 'Type to search...',
      searchLoading: 'Loading',
      searchProductsAria: 'Search products',
```

- [ ] **Step 2: 键位一致性检查**

Run: 用 Node 快速对比两个文件的顶层 key 集合

```bash
node -e "const a=require('fs').readFileSync('layers/base/i18n/locales/zh-CN.ts','utf8');const e=require('fs').readFileSync('layers/base/i18n/locales/en-US.ts','utf8');const ks=s=>[...s.matchAll(/^\s+(\w+):/gm)].map(m=>m[1]).sort().join(',');const za=ks(a),ea=ks(e);console.log('zh 键数可对比，en 键数：', ea.split(',').length);"
```

Expected: 英文中各区块包含 zh 中新增的所有键（zh 拥有而 en 缺失的键应已在 Step 1 补齐）。若仍有缺键，沿用同在上一区块的翻译文字补入。

- [ ] **Step 3: Commit**

```bash
git add layers/base/i18n/locales/en-US.ts
git commit -m "feat(i18n): en-US 补齐新增键位"
```

---

## Task 3: 抽取 `SearchModal.vue` 硬编码

**Files:**
- Modify: `layers/base/app/components/SearchModal.vue`

- [ ] **Step 1: 替换硬编码占位符与文案**

将 `SearchModal.vue` 中 `placeholder="Type to search..."` 改 `:placeholder="$t('messages.shop.searchPlaceholder')"`；`aria-label="Search products"` 改 `:aria-label="$t('messages.shop.searchProductsAria')"`；`<p v-if="pending">Loading</p>` 改 `<p v-if="pending">{{ $t('messages.shop.searchLoading') }}</p>`。

具体（模板内）：
```html
      <UInput
        :placeholder="$t('messages.shop.searchPlaceholder')"
        size="lg"
        variant="ghost"
        class="mb-4 w-full"
        :aria-label="$t('messages.shop.searchProductsAria')"
      />
      <div>
        <p v-if="pending">{{ $t('messages.shop.searchLoading') }}</p>
```

- [ ] **Step 2: Commit**

```bash
git add layers/base/app/components/SearchModal.vue
git commit -m "feat(i18n): SearchModal 抽离硬编码英文"
```

---

## Task 4: 抽取 `MobileMenu.vue` 硬编码

**Files:**
- Modify: `layers/base/app/components/header/MobileMenu.vue`

- [ ] **Step 1: 替换 Footer 占位文本**

```html
    <template #footer>
      <div class="flex gap-2">{{ $t('messages.general.footer.unstack') }}</div>
    </template>
```

说明：用已有 `general.footer.unstack`（"用 ❤️ 打造"）承载该占位容器文本。

- [ ] **Step 2: Commit**

```bash
git add layers/base/app/components/header/MobileMenu.vue
git commit -m "feat(i18n): MobileMenu 抽离硬编码英文"
```

---

## Task 5: 抽取 `checkout/index.vue` sr-only 标题

**Files:**
- Modify: `layers/base/app/pages/checkout/index.vue`

- [ ] **Step 1: 替换 4 处 sr-only 标题**

```html
    <h1 id="checkout-title" class="sr-only">{{ $t('messages.shop.checkout') }}</h1>
```
```html
        <h2 id="cart-empty-title" class="sr-only">{{ $t('messages.shop.cartEmpty') }}</h2>
```
```html
            <h2 id="shipping-heading" class="sr-only">{{ $t('messages.general.shippingSelect') }}</h2>
```
```html
            <h2 id="payment-heading" class="sr-only">{{ $t('messages.general.paymentMethod') }}</h2>
```

- [ ] **Step 2: Commit**

```bash
git add layers/base/app/pages/checkout/index.vue
git commit -m "feat(i18n): checkout 无障碍标题中文化"
```

---

## Task 6: 抽取订单确认页 sr-only 标题

**Files:**
- Modify: `layers/base/app/pages/checkout/confirmation/[code].client.vue`

- [ ] **Step 1: 替换 2 处 sr-only 标题**

```html
      <h2 id="order-meta-heading" class="sr-only">{{ $t('messages.shop.orderDetails') }}</h2>
```
```html
      <h2 id="actions-heading" class="sr-only">{{ $t('messages.general.actions') }}</h2>
```

- [ ] **Step 2: Commit**

```bash
git add "layers/base/app/pages/checkout/confirmation/[code].client.vue"
git commit -m "feat(i18n): 订单确认页无障碍标题中文化"
```

---

## Task 7: 抽取分类页 sr-only 标题

**Files:**
- Modify: `layers/base/app/pages/category/[slug].vue`

- [ ] **Step 1: 替换 sr-only 标题**

```html
      <h2 id="category-products-heading" class="sr-only">{{ $t('messages.shop.browseOurProducts') }}</h2>
```

- [ ] **Step 2: Commit**

```bash
git add "layers/base/app/pages/category/[slug].vue"
git commit -m "feat(i18n): 分类页无障碍标题中文化"
```

---

## Task 8: 抽取账户页 sr-only 与文案

**Files:**
- Modify: `layers/base/app/pages/account/index.vue`

- [ ] **Step 1: 替换 sr-only 标题与无默认地址文案**

```html
      <h2 id="profile-info" class="sr-only">{{ $t('messages.account.profileInfo') }}</h2>
```
```html
        <dt class="sr-only">{{ $t('messages.account.phoneLabel') }}</dt>
```
```html
        <dt class="sr-only">{{ $t('messages.account.addressLabel') }}</dt>
```
```html
          <span v-else>{{ $t('messages.account.noDefaultAddress') }}</span>
```
```html
      <h2 id="account-actions" class="sr-only">{{ $t('messages.account.accountActions') }}</h2>
```

- [ ] **Step 2: Commit**

```bash
git add layers/base/app/pages/account/index.vue
git commit -m "feat(i18n): 账户页无障碍标题与文案中文化"
```

---

## Task 9: 抽取账户验证页文案

**Files:**
- Modify: `layers/base/app/pages/account/verify.vue`

- [ ] **Step 1: 替换两段 verify 文案**

```html
        <p v-if="verifying">{{ $t('messages.account.verifyingAccount') }}</p>
        <p v-else-if="error" role="alert" class="text-red-600">{{ error }}</p>
        <p v-else>{{ $t('messages.account.verificationComplete') }}</p>
```

- [ ] **Step 2: Commit**

```bash
git add layers/base/app/pages/account/verify.vue
git commit -m "feat(i18n): 账户验证页文案中文化"
```

---

## Task 10: 商品详情页 SKU 标签抽词条

**Files:**
- Modify: `layers/base/app/components/product-detail/DetailFloor.vue`
- Modify: `layers/base/app/components/product-detail/DetailClassic.vue`

说明：`SKU` 本身是保留术语，但两处模板硬编码 `SKU: {{ sku }}` 应统一为 i18n 词条，便于后续一致调整。

- [ ] **Step 1: 在 `zh-CN.ts` 与 `en-US.ts` 的 `detail` 区块同步新增 `sku` 词条**

`zh-CN.ts` 中加 `sku: 'SKU: {code}'`，`en-US.ts` 加 `sku: 'SKU: {code}'`（中英一致，保留 SKU 术语）。

- [ ] **Step 2: 替换 `DetailFloor.vue` 与 `DetailClassic.vue`**

`DetailFloor.vue:81` 与 `DetailClassic.vue:36` 均改为：
```html
          <span v-if="selectedVariant.sku" class="text-[11px] text-gray-400">{{ $t('messages.detail.sku', { code: selectedVariant.sku }) }}</span>
```
（`DetailClassic.vue` 中变量为 `selectedVariant?.sku`，改用 `selectedVariant` 断言或保留可选链：`v-if="selectedVariant?.sku"` 时用 `{ code: selectedVariant!.sku }`。）

- [ ] **Step 3: Commit**

```bash
git add layers/base/app/components/product-detail/DetailFloor.vue layers/base/app/components/product-detail/DetailClassic.vue layers/base/i18n/locales/zh-CN.ts layers/base/i18n/locales/en-US.ts
git commit -m "feat(i18n): 详情页 SKU 标签抽词条"
```

---

## Task 11: 本地验证（dev + 多语言切换）

**Files:**
- 无（验证步骤）

- [ ] **Step 1: 启动本地预览（连线上后端）**

Run: `pnpm dev`  预期启动 `localhost:3001`（devProxy 连 `https://www.youshop.cn/shop-api`，仅浏览/UI 验证安全）。
Expected: 启动无编译错误。

- [ ] **Step 2: 切换语言逐一验证关键页面**

在页面右上角用 LangSwitcher 依次切 `简体中文` / `English` / 任一第三方（如 `Deutsch`），检查并确认核心页面无红屏/编译错误、无 `$t` 解析警告：

- 首页（`/`）
- 商品详情页（进任一商品，检查 SR-only 标题、SKU、评价/参数/售后楼层）
- 购物车/结账（`/checkout`，检查 sr-only 标题、配送/支付文案）
- 订单与售后（`/account/orders`、`/account/after-sales`）
- 账户页（`/account`，检查 sr-only、默认地址）
- 搜索弹层（检查 placeholder / loading 文案）

Expected 文案断言：
- 中文：`登录`、`注册`、`密码`、`外观模式`、`跟随系统`、`保存`、`取消`、`状态`、`金额`、`税费` 等为中文；sr-only 标题为中文。
- English：对应英文正确。
- Deutsch：`site` 等英文/德文原样展示 + 中文 fallback 词条正确回退，无报错。

- [ ] **Step 3: 处理占位符冲突**

若 `detail.stockShortage`（含 `{n}`）等含 `{}` 占位符的词条与 vue-i18n 语法冲突，参考已处理案例（`noPickup` 移除占位符）修正。Expected: 无 `Not allowed nest placeholder` / `Missing interpolation value` 报错。

- [ ] **Step 4: 记录验证结果**

无代码提交；在 README 或 CHANGELOG 记录验证结论（可选）。

---

## Task 12: 部署上线

**Files:**
- 无（部署步骤）

遵循项目部署铁律（本地构建、绝不在服务器构建）。

- [ ] **Step 1: 本地构建**

Run: `pnpm build`
Expected: 构建成功，产出 `.output/`。

- [ ] **Step 2: 确认将 dist 提交纳入 git 版本（若 .gitignore 策略要求提交 dist）**

按 `项目构建说明`（README）与 git 约定处理 dist。

- [ ] **Step 3: 部署到服务器**

Run: `node scripts/deploy.mjs`（或按项目实际部署脚本），触发 SCP 上传 `.output/` + `pm2 restart nshop`。
Expected: pm2 进程 `nshop` online，线上生效。

- [ ] **Step 4: 线上抽验**

访问 `https://www.youshop.cn`，默认中文界面确认关键文案为中文；切 English 确认英文正常。

---

## Self-Review

**Spec 覆盖：**
- 词库补齐 → Task 1（zh-CN 完整中文化）+ Task 2（en-US 键位）
- 硬编码抽取 → Task 3–10
- 其它语言回退 → 由既有 `fallbackLocale: "zh-CN"` 保证，无需改动（Task 11 含德文回退验证）
- 保留品牌 → `site` 区块与 nshop/SKU 术语未改（多 Task 中注明）
- 测试/验收 → Task 11；部署 → Task 12

**占位符扫描：** 每一步均给出完整代码或精确替换目标，无 TBD/TODO；含 `{}` 的模板变量给出调用方式（`$t(key, { code })`）。

**类型一致性：** 新增键名（`account.noDefaultAddress` 等、`shop.searchPlaceholder` 等、`detail.sku`）在 zh-CN（Task 1/10）与 en-US（Task 2/10）同步引进，调用方（各 Vue 文件）引用路径一致。