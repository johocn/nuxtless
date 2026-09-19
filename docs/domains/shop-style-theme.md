# 领域手册 · 店铺风格/主题/模板回退（Shop Style & Theme Fallback）

> 覆盖 C 端主题令牌、详情页版式、5 级可回退风格体系。凡改「主题色/版式/功能块显隐」相关配置，若 C 端无效或异常，先查本手册。
> 本域由 2026-09-19 五级回退体系 A1-A5 + B1-B5 全量线上实测沉淀。

---

## 1. 概念模型

**五级可回退风格链（逐级兜底，L0 最低）**：

```
L0 代码内建默认 → L1 全局配置(shop_global_config) → L2 风格模板(shop_template)
 → L3 店铺覆盖(channel.customFields.detailConfig) → L4 页面/模块内建默认
```

- **主题令牌链**：L0 默认主色 → L1 `themeTokens` → L2 `template.theme`（palette/tokens）。
  **优先级 L1 < L2**：引用模板时 L1 主色被 L2 模板 palette **覆盖**（设计语义，非 bug）。
  引用模板的店「全店换肤」真实入口 = **编辑模板 palette**；未引用模板渠道才看 L1 主色。
- **页面配置链**：L1 `defaults[page]` → L2 `pages[page]` → L3 `detailConfig`。合并：数组/标量覆盖、null/undefined 跳过，纯函数深合并。
- **块级**：`details/blocks.<key>.visible/style` 缺省 → 内建默认（visible 默认 true）。块之间相互隔离。
- **后端 `shopTemplate` 引用判定**：按当前渠道 `channel.customFields.templateId` 取模板；未引用 / 模板停用 / **跨 app（端）** 三态均返回 null → C 端回退 L1。跨端由后台「目标端」分段器天然避免。
- **主题落点**：SSR 用 `themeTokens` 烘焙 CSS 变量（`app.vue`）；改配置后**需重新 SSR（刷新）**生效。

关键业务域涉及数据模型：
- `shop_global_config`（L1）：列含 `app`、`themeTokens`、`defaults`（JSON，含 product/home 页面默认）。
- `shop_template`（L2）：列含 `app`、`name`、`theme`（JSON：`palette.scheme|palette.tokens` 或顶层 `primaryColor`）、`pages`（JSON）、`enabled`。
- `channel.customFieldsDetailconfig`（L3）：JSON `{"version":2,"layout":"classic|floor|dualBuy|hotel","blocks":{<key>:{visible,style}}}`。

> 模板 theme 两种结构都被消费：`palette.{scheme,tokens}`（scheme 为预设，tokens 覆盖预设）与顶层 `primaryColor/accentColor`。

---

## 2. 文件地图（符号级，行号现场 `rg`）

前端 C 端消费链：
- `layers/base/app/utils/merge-config.ts` — `deepMerge`（递归普通对象，数组/标量覆盖、null 跳过）、`mergeThemeTokens`（{} ← L1.themeTokens ← resolvePalette / L2.theme）、`mergePageConfig`（{} ← L1.defaults[page] ← L2.pages[page] ← L3 detailConfig）。
- `layers/base/app/composables/useThemeConfig.ts` — 拉 `GetShopTemplate/GetShopGlobalConfig/GetChannelTheme`；暴露 `themeTokens`、`pageConfig(page)`。
- `layers/base/app/composables/useDetailConfig.ts` — `pageConfig("product")` → `parseDetailConfig` → `config/layout/visible/promoSchemes/serviceSchemes`。
- `layers/base/app/utils/detail-config.ts` — `detailLayout`（默认 classic）、`blockVisible`（配置 visible → 内建默认 → true）、`blockStyle`、`parseDetailConfig`（坏 JSON/缺字段返回 null）。
- `layers/base/app/components/product-detail/ProductDetailRenderer.vue` — 按 layout 分发 classic/floor/dualBuy/hotel。
- `layers/base/app/components/product-detail/DetailClassic.vue`（各块 `visible('gallery'|'info'|'price'|'promo'|'coupon'|'service'|'nearby'|'variants'|'purchase'|'description'|'reviews'|'related')`）。
- `layers/base/gql/queries/context.gql` — `GetChannelTheme` 读 `customFields { themeId templateId detailConfig orderDetailConfig orderListConfig taxMode ... }`（L3 覆盖读取源）。

后端 / 后台：
- `d:\zhao\vendure\packages\shop-template-plugin\src\shop-template.service.ts` — `shopTemplate`（渠道引用判定，无效/停用/跨端返回 null）。
- `d:\zhao\vshop\web-admin\src\pages\decorate\shop-info\index.vue` — 店铺信息装饰页：详情页版式分段器、`styleTemplate` 目标端（app）分段器（nshop/vshop）+ 模板列表按 `templateApi.list(app)` 过滤。
- `d:\zhao\vshop\web-admin\src\apis\template.ts` — `templateApi.list(app)`。

---

## 3. 设计决策（ADR）

- **D1：主题令牌 L1 < L2**。模板是更高层风格，必然覆盖全局主色；这与「页面配置 L1→L2→L3」同构。成果：引用模板的店换肤走模板，未引用店走 L1。勿把「L1 改了不生效」当 bug。
- **D2：`shopTemplate` 跨端返回 null 而非报错**。使跨 app 引用（预留在 vshop 模板无渠道绑定、nshop 误引 vshop 模板）静默回退 L1，C 端稳定兜底。
- **D3：配置只存「增量差异」+ null 跳过**。数组/标量直接覆盖、null 不合并，保证 L3 只影响声明字段，模板/全局不被污染。
- **D4：判定用浏览器手机视口而非 SSR/curl**。SSR 抓取受无城市 cookie 守卫/空商品干扰，业务文案属客户端 hydration；详见第 4 章坑 4。

---

## 4. 常见坑

1. **改配置 C 端首帧不更新（缓存滞后）**：改模板/渠道/全局后首次加载仍是旧配置。**解法**：冷加载（URL 加 `?_cb=`/不同 `?cb=` 二次 `open`）判定；线上 nginx/SSR 有缓存时尤其。
2. **引用模板时改 L1 主色不生效**：见 D1。要全店换肤须改模板 palette 或解除模板引用。
3. **模板 theme 两种结构混淆**：`palette.scheme+tokens`（预设）vs 顶层 `primaryColor`。改色时确认写对层级（`theme.palette.tokens.primaryColor` 或 `theme.primaryColor`），否则被预设/全局覆盖。
4. **curl/WebClient 抓 SSR 判定不可靠**：商品页无城市 cookie 被守卫差异化渲染/空渲染；业务文案（促销/服务）是 hydration 后才有。**采用 agent-browser 手机视口截图**（390×844，dpr=2）+ 必要 DOM `eval`。
5. **`eval` 复杂表达式在 PowerShell quoting 下失效**：用 `eval -b` base64（`[Convert]::ToBase64String(UTF8(s))`）+ IIFE 包裹（裸 `return` 报 Illegal return）。浏览器 `@ref` 在 PowerShell 须加引号 `'@e2'`（否则被当 splat）。
6. **旧查询残留字段**：改 schema 后 `GetChannelTheme` 若仍含下线字段（如旧 `taxEnabled` 已改 `taxMode`）会 GRAPHQL 校验失败 → C 端回退默认。参考 `pricing-tax.md`。

---

## 5. 问题速查（Bug 知识库）

| 现象 | 根因 | 代码点 | 回归脚本 |
|---|---|---|---|
| 引用模板的店改全局主色无效 | 主题令牌 L1 < L2 模板 palette（设计语义） | `merge-config.ts/mergeThemeTokens` | 后台改 L2 模板 palette 应生效；改 L1 主色在引用模板渠道不生效 |
| 改模板/渠道后 C 端首帧不变 | SSR/nginx 缓存滞后 | N/A（运行时策略） | URL 加 `?_cb=` 冷加载二次 `open` 对比 |
| 详情页版式不变/促销块无效 | L3 覆盖未写入或 JSON 坏 / 块 key 大小写或层级错 | `detail-config.ts/blockVisible` | 写入 `detailConfig={"version":2,"layout":"dualBuy","blocks":{"promo":{"visible":false}}}`；DOM eval 查 `details summary「促销 ▾/服务保障 ▾」` 存在性 |
| 模板列表/配色混入其他端 | 旧版后台未按 app 过滤模板 | `shop-info/index.vue` 目标端分段器 + `apis/template.ts list(app)` | 后台 nshop/vshop 分段器切换，模板列表互不可见对方模板 |
| 停用/删除模板后 C 端空白/报错 | 应为**回退 L1** 而非空白（正常不报错） | `shop-template.service.ts` 三态返回 null | 停用模板 → 主题回退全局主色，不空白 |

---

## 6. 验证脚本清单

- **手动测试主档**：`docs/superpowers/manual/5level-fallback/5level-fallback-manual-test.md` — Part A1-A5（分层矩阵）/ B1-B5（端到端）/ Part C 验收 + 手机截图（`shots/`）。**权威判据 = 浏览器手机视口截图**。
- 生产库操作：`ssh joho "docker exec -i 1Panel-postgresql-pIe0 psql -U youshaop -d vendure"`（查询 `shop_global_config/shop_template/channel.customFieldsTemplateid/Detailconfig`；`Get-Content -Raw <tmp.sql> | ssh ...` 传 SQL）。

## 7. 历史文档索引

- `docs/superpowers/manual/5level-fallback/5level-fallback-manual-test.md` — 测试手册（A/B/C + 截图）。
- `docs/superpowers/specs/2026-09-19-5level-fallback-test-design.md` — 设计文档（P1 补 L1 defaults / P2 后台目标端过滤 / P5 缓存滞后 / P6 L1<L2 语义）。
- 相关：`pricing-tax.md`（taxMode 三态与结算）、`cross-channel-variants.md`（渠道隔离）。