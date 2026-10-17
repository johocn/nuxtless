# 领域手册 · 店铺风格/主题/模板回退（Shop Style & Theme Fallback）

> 覆盖 C 端主题令牌、详情页版式、5 级可回退风格体系。凡改「主题色/版式/功能块显隐」相关配置，若 C 端无效或异常，先查本手册。
> 本域由 2026-09-19 五级回退体系 A1-A5 + B1-B5 全量线上实测沉淀。
> 2026-09-21 追加：L3 **令牌层** `themeTokensOverride`、后台「主题风格」页为唯一风格入口、`themeId` 只读兼容与一键迁移、`palettePresets` 权威副本。

---

## 1. 概念模型

**五级可回退风格链（逐级兜底，L0 最低）**：

```
L0 代码内建默认 → L1 全局配置(shop_global_config) → L2 风格模板(shop_template)
 → L3 店铺覆盖(channel.customFields) → L4 页面/模块内建默认
```

- **主题令牌链**：L0 默认主色 → L1 `themeTokens` → L2 `template.theme`（palette/tokens）→ **L3 `channel.customFields.themeTokensOverride`**。
  **优先级 L1 < L2 < L3（L3 last-wins）**：引用模板时 L1 主色被 L2 模板 palette **覆盖**（设计语义，非 bug）；店铺若在「主题风格」页填了令牌覆盖，则 L3 再覆盖 L2。
  引用模板的店「全店换肤」入口 = **编辑模板 palette**；只改单店 = **主题风格页令牌覆盖（L3）**；未引用模板渠道才看 L1 主色。
- **页面配置链**：L1 `defaults[page]` → L2 `pages[page]` → L3 `detailConfig`。合并：数组/标量覆盖、null/undefined 跳过，纯函数深合并。
- **L3 令牌字段载体**：`channel.customFields.themeTokensOverride`（**nullable text**，存 JSON 字符串），后台「主题风格」页结构化成 6 段表单写入，不再手写 JSON。
- **块级**：`details/blocks.<key>.visible/style` 缺省 → 内建默认（visible 默认 true）。块之间相互隔离。
- **后端 `shopTemplate` 引用判定**：按当前渠道 `channel.customFields.templateId` 取模板；未引用 / 模板停用 / **跨 app（端）** 三态均返回 null → C 端回退 L1。跨端由后台「目标端」分段器天然避免。
- **主题落点**：nshop SSR 用 `themeTokens` 烘焙 CSS 变量（`app.vue`）；**vshop C 端**（uni-app）由 `App.vue` 的 `applyThemeTokens` 写入根节点 CSS 变量（`--brand-color`/`--theme-primary`、`--brand-color-light`/`--theme-accent`、`--theme-radius`）。改配置后**需冷加载（刷新）**生效。

关键业务域涉及数据模型：
- `shop_global_config`（L1）：列含 `app`、`themeTokens`、`defaults`（JSON，含 product/home 页面默认）。
- `shop_template`（L2）：列含 `app`、`name`、`theme`（JSON：`palette.scheme|palette.tokens` 或顶层 `primaryColor`）、`pages`（JSON）、`enabled`。
- `channel.customFieldsDetailconfig`（L3 页面）：JSON `{"version":2,"layout":"classic|floor|dualBuy|hotel","blocks":{<key>:{visible,style}}}`。
- `channel.customFieldsThemetokensoverride`（L3 令牌，2026-09-20 新增）：nullable text，JSON `{"primaryColor":"#..","accentColor":"#..","radius":8}`；未设/坏 JSON → 视为不覆盖。

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
- `d:\zhao\vendure\packages\shop-template-plugin\src\shop-template.service.ts` — `shopTemplate`（渠道引用判定，无效/停用/跨端返回 null）、`findGlobalConfig`/`upsertGlobalConfig`、`mergedPreview`（L1←L2←overrides 预览）。
- `d:\zhao\vendure\packages\shop-template-plugin\src\merge-config.ts` — `deepMerge`/`mergePreview`（`sourceByKey` 顺序 L1→L2→L3，**最后写者胜**）。
- 后端 **`palettePresets` 权威副本**（`query { palettePresets }`，8 套）：dawn-gold/jd-red/taobao-orange/pdd-red/vip-blue/tech-blue/fresh-green/midnight。**三处同步**：后端 resolver ← `web-admin/src/constants/palette-presets.ts` ← `nshop`/`vshop` 的 `utils/palette-presets.ts`；新增预设必须三处同名同步，否则后台能选、C 端解析不到（回退 {}）。
- `d:\zhao\vshop\web-admin\src\pages\decorate\theme\index.vue` — **「主题风格」页（唯一风格入口，版式 A 六段：端分段器 / 生效摘要卡 / 模板卡片网格 / 令牌覆盖 / 旧版主题提示条 / 合并结果预览）**。
- `d:\zhao\vshop\web-admin\src\constants\theme-migration.ts` — `isLegacyThemeId`、`buildThemeIdMigration`（旧 `themeId` → `themeTokensOverride` 一次性映射：`taobao-orange→{"primaryColor":"#FF5000","radius":8}`、`jd-red→#E1251B/6`、`modern-minimal→#111827/6`）。
- `d:\zhao\vshop\web-admin\src\apis\template.ts` — `templateApi.list(app)` / `palettePresets` / `globalConfig` / `mergedPreview` / `versions` / `restore`。
- `d:\zhao\vshop\web-admin\src\pages\decorate\shop-info\index.vue` — 店铺信息装饰页：详情页版式分段器；**模板分区已移除**（避免与主题页互相覆盖），改为跳转主题页。
- vshop C 端消费链：`d:\zhao\vshop\src\utils\merge-config.ts`（`mergeThemeTokens(globalConfig, template, channelThemeOverride)`、`mergePageConfig`、`resolvePaletteTokens`、`parseThemeTokensOverride`）、`d:\zhao\vshop\src\stores\tenant.ts`（`loadTenantDetails` → `loadChannelConfig` → `loadTemplateConfig`）、`d:\zhao\vshop\src\api\queries\channel.ts`（`getActiveChannelConfig` 含 `themeTokensOverride`；**`resolveChannelByCode` 不暴露该字段**）、`d:\zhao\vshop\src\App.vue`（`applyThemeTokens` 写 CSS 变量）。

---

## 3. 设计决策（ADR）

- **D1：主题令牌 L1 < L2**。模板是更高层风格，必然覆盖全局主色；这与「页面配置 L1→L2→L3」同构。成果：引用模板的店换肤走模板，未引用店走 L1。勿把「L1 改了不生效」当 bug。
- **D2：`shopTemplate` 跨端返回 null 而非报错**。使跨 app 引用（预留在 vshop 模板无渠道绑定、nshop 误引 vshop 模板）静默回退 L1，C 端稳定兜底。
- **D3：配置只存「增量差异」+ null 跳过**。数组/标量直接覆盖、null 不合并，保证 L3 只影响声明字段，模板/全局不被污染。
- **D4：判定用浏览器手机视口而非 SSR/curl**。SSR 抓取受无城市 cookie 守卫/空商品干扰，业务文案属客户端 hydration；详见第 4 章坑 4。
- **D5（2026-09-21）：后台「主题风格」页是唯一风格入口**。店铺信息页的模板选择已移除，两页不再互相覆盖（旧版两页都写 `templateId` 是「保存后互相打回」的病灶）。
- **D6（2026-09-21）：L3 令牌层 `themeTokensOverride` last-wins**。合并链 `mergeThemeTokens(L1, L2, L3)`，L3 写在最后 → 单店临时改色无需改模板/全局；清空（null）即回退 L2/L1。
- **D7（2026-09-21）：旧 `themeId` 只读兼容，不得再新增写 `themeId` 的代码**。存量渠道的 `themeId` 仅在主题页显示提示条 + 一键迁移（`buildThemeIdMigration` → 写 `themeTokensOverride`，同时清空 `themeId`）。新功能一律走 `templateId` + `themeTokensOverride`。
- **D8（2026-09-21，已知限制）：后台「合并预览」`templateMergedPreview` 只按给定 `templateId` 展开 L2，不校验模板 `app` 与 `enabled`**；而 C 端 `shopTemplate` 会校验并在跨端/停用时返回 null。故店铺 `templateId` 指向跨端或已停用模板时，**后台预览显示 L2 配色、C 端实际回退 L1**。判定以 C 端实机为准，本批次不修。

---

## 4. 常见坑

1. **改配置 C 端首帧不更新（缓存滞后）**：改模板/渠道/全局后首次加载仍是旧配置。**解法**：冷加载（URL 加 `?_cb=`/不同 `?cb=` 二次 `open`）判定；线上 nginx/SSR 有缓存时尤其。
2. **引用模板时改 L1 主色不生效**：见 D1。要全店换肤须改模板 palette 或解除模板引用。
3. **模板 theme 两种结构混淆**：`palette.scheme+tokens`（预设）vs 顶层 `primaryColor`。改色时确认写对层级（`theme.palette.tokens.primaryColor` 或 `theme.primaryColor`），否则被预设/全局覆盖。
4. **curl/WebClient 抓 SSR 判定不可靠**：商品页无城市 cookie 被守卫差异化渲染/空渲染；业务文案（促销/服务）是 hydration 后才有。**采用 agent-browser 手机视口截图**（390×844，dpr=2）+ 必要 DOM `eval`。
5. **`eval` 复杂表达式在 PowerShell quoting 下失效**：用 `eval -b` base64（`[Convert]::ToBase64String(UTF8(s))`）+ IIFE 包裹（裸 `return` 报 Illegal return）。浏览器 `@ref` 在 PowerShell 须加引号 `'@e2'`（否则被当 splat）。
6. **旧查询残留字段**：改 schema 后 `GetChannelTheme` 若仍含下线字段（如旧 `taxEnabled` 已改 `taxMode`）会 GRAPHQL 校验失败 → C 端回退默认。参考 `pricing-tax.md`。
7. **（2026-09-21）vshop L3 令牌读不到 → 必须走 `activeChannel`，不能走 `resolveChannelByCode`**：cjk-plugin 的 `ChannelResolveCustomFields`（`resolveChannelByCode`/`resolveChannelByDomain` 的返回类型）**未暴露** `themeTokensOverride`；vshop C 端在 `loadTenantDetails` 里改为调用 `getActiveChannelConfig()`（`activeChannel.customFields`）读取。给新渠道字段排查时的判据：先 `POST /shop-api` 打 `query { activeChannel { customFields { <字段> } } }` 看字段是否有值。
8. **（2026-09-21）e.joho.cn 上 `?tenant=` 不生效（被域名绑定吃掉）**：vshop `initTenant` 的优先级是「① `resolveChannelByDomain(host)` → ② `?tenant=` URL 参数 → ③ localStorage → ④ default」，而生产 `e.joho.cn` 已绑定到 `__default_channel__`（`resolveChannelByDomain('e.joho.cn')` 返回默认渠道），第 ① 步命中即 return，`?tenant=t2` 被忽略（页面显示默认渠道商品）。**验证多租户时勿用 e.joho.cn**；本地 `localhost` 会跳过域名解析，`?tenant=` 才生效。若要线上验，直接改目标渠道的 `themeTokensOverride`，或临时解除该渠道的域名绑定。

---

## 5. 问题速查（Bug 知识库）

| 现象 | 根因 | 代码点 | 回归脚本 |
|---|---|---|---|
| 引用模板的店改全局主色无效 | 主题令牌 L1 < L2 模板 palette（设计语义） | `merge-config.ts/mergeThemeTokens` | 后台改 L2 模板 palette 应生效；改 L1 主色在引用模板渠道不生效 |
| 改模板/渠道后 C 端首帧不变 | SSR/nginx 缓存滞后 | N/A（运行时策略） | URL 加 `?_cb=` 冷加载二次 `open` 对比 |
| 详情页版式不变/促销块无效 | L3 覆盖未写入或 JSON 坏 / 块 key 大小写或层级错 | `detail-config.ts/blockVisible` | 写入 `detailConfig={"version":2,"layout":"dualBuy","blocks":{"promo":{"visible":false}}}`；DOM eval 查 `details summary「促销 ▾/服务保障 ▾」` 存在性 |
| 模板列表/配色混入其他端 | 旧版后台未按 app 过滤模板 | `shop-info/index.vue` 目标端分段器 + `apis/template.ts list(app)` | 后台 nshop/vshop 分段器切换，模板列表互不可见对方模板 |
| 停用/删除模板后 C 端空白/报错 | 应为**回退 L1** 而非空白（正常不报错） | `shop-template.service.ts` 三态返回 null | 停用模板 → 主题回退全局主色，不空白 |
| 主题页填了令牌覆盖但 C 端不变色 | vshop 侧走 `resolveChannelByCode` 读 L3（该返回类型无此字段） | `vshop/src/stores/tenant.ts loadChannelConfig` + `api/queries/channel.ts` | 生产 `activeChannel.customFields.themeTokensOverride` 有值 → 手机视口 `--brand-color` 应等于覆盖值 |
| 后台预览有 L2 配色、C 端却是 L1 | 见 D8：`mergedPreview` 不校验模板 app/enabled | `shop-template.service.ts mergedPreview` | 给渠道引一个跨端/已停用模板：后台预览显 L2、C 端回退 L1（预期不一致） |
| 后台能选某配色预设、C 端不生效 | `palettePresets` 三处副本未同步（后端 / web-admin / nshop·vshop） | `constants/palette-presets.ts` ×3 + 后端 resolver | `query { palettePresets }` 的 key 集合与前端常量逐一对齐 |
| `?tenant=xxx` 在 e.joho.cn 无效 | 域名绑定优先于 URL 参数（坑 8） | `vshop/src/stores/tenant.ts initTenant` | `resolveChannelByDomain('e.joho.cn').code` 有值即会吃掉 `?tenant`；本地 localhost 对照验证 |

---

## 6. 验证脚本清单

- **手动测试主档**：`docs/superpowers/manual/5level-fallback/5level-fallback-manual-test.md` — Part A1-A5（分层矩阵）/ B1-B5（端到端）/ Part C 验收 + 手机截图（`shots/`）。**权威判据 = 浏览器手机视口截图**。
- 生产库操作：`ssh joho "docker exec -i 1Panel-postgresql-pIe0 psql -U youshaop -d vendure"`（查询 `shop_global_config/shop_template/channel.customFieldsTemplateid/Detailconfig`；`Get-Content -Raw <tmp.sql> | ssh ...` 传 SQL）。
- **批1（L3 令牌层，2026-09-21）验收证据**：后台手册 `vshop/web-admin/docs/theme-admin-manual/theme-admin-manual.html` §8「主题风格页与五级体系（L0–L4）」——含五级链速查表、六段结构表、7 条验收对照表（实测色值）、旧 `themeId` 迁移映射、回归结果 18/18；22 张 390×844 dpr=2 截图在 `docs/theme-admin-manual/assets/`（源 `web-admin/src/static/manual/shots/`）。
- **线上 L3 实测（2026-09-21，生产产物 + 生产后端）**：本地静态服务 `vshop/dist/build/h5`（与 e.joho.cn 线上 JS/CSS 字节一致 487047/12744）→ 手机视口访问 `localhost:5310/?tenant=t2`（产物内 API 指向生产 `https://e.joho.cn/shop-api`）：`--brand-color` 无覆盖 = `#ff6600`（L1），设 `t2.themeTokensOverride={"primaryColor":"#7b2ff7","accentColor":"#ede4ff"}` 后 = `#7b2ff7`/`#ede4ff`（L3）→ **PASS**，验后 t2 已还原 `null`。

---

## 7. 历史文档索引

- `docs/superpowers/manual/5level-fallback/5level-fallback-manual-test.md` — 测试手册（A/B/C + 截图）。
- `docs/superpowers/specs/2026-09-19-5level-fallback-test-design.md` — 设计文档（P1 补 L1 defaults / P2 后台目标端过滤 / P5 缓存滞后 / P6 L1<L2 语义）。
- `d:\zhao\vshop\web-admin\docs\superpowers\plans\2026-09-20-shop-style-theme-unify.md` + 同名 `specs/...-design.md` — 批1（L3 令牌层 / 主题风格页 / themeId 迁移）计划与设计。
- `d:\zhao\vshop\web-admin\docs\theme-admin-manual\theme-admin-manual.html` — 后台主题/模板操作手册（§8 为本域内容）。`d:\zhao\vshop\web-admin\src\static\manual\index.html` 章 `op-5b` 为同内容的运营速览版。
- 相关：`pricing-tax.md`（taxMode 三态与结算）、`cross-channel-variants.md`（渠道隔离）。

---

## 8. 部署要点（2026-09-21）

- **vshop C 端（`e.joho.cn/` 根）**：本地 `cd d:\zhao\vshop && npm run build:h5`（`uni build`）→ 产物 `dist/build/h5` → `tar -C dist/build/h5 -cf _vshop_c.tar .` → `scp` 到 `joho:/tmp/` → 服务器 `sudo cp -r $SITE ${SITE}.bak_$(date +%s)`（保留最近 3 份）→ `sudo rm -rf $SITE/assets` → `sudo tar -xf /tmp/_vshop_c.tar -C $SITE` → `docker exec 1Panel-openresty-3I6S openresty -t && ... -s reload`。站点根 `SITE=/opt/1panel/apps/openresty/openresty/www/sites/e.joho.cn/index`（**静态替换即时生效**）。**vshop 仓库无 deploy.mjs**，web-admin 才有（`d:\zhao\vshop\web-admin && node scripts/deploy.mjs`，站点 `.../e.joho.cn/guanli`）。
- 产物校验：`index.html` 存在、`assets` 非空、总大小 ≥ 100KB；上线后 `curl.exe -sk https://e.joho.cn/assets/<新hash>.js -o NUL -w "%{http_code} %{size_download}"` 与本地字节数对齐。
- **PowerShell 调 ssh 的坑**：远程命令里的 `$(date +%s)` / `${SITE}` 会被 PowerShell 抢先解析 → 用**单引号**包住整条 ssh 参数（`ssh joho '...'`），让远端 shell 展开。

---

## 9. 跨端积木新楼层 video/pointsGoods/flash（2026-10-17）

vshop 五级积木体系重写（版式注册表 + sections 优先仲裁 + `pages.home.layout`）后，后台装修编辑器成为**跨端类型超集**（16 种楼层），`channel.customFields.shopContent` 为 nshop/vshop **共用**。nshop 按白名单静默丢弃不认识的类型 → 后台新增的 `video`/`pointsGoods` 楼层在 nshop 首页消失。本次优化（方案 A）：

- **类型**：`shop-content.ts` 新增 `VideoSection`（`poster`+`videoUrl`，零数据依赖）与 `PointsGoodsSection`（`title`+`limit`，数据自共享 shop-api `pointsProducts` 查询，points-mall-plugin 按 `ctx.channelId` 过滤）。
- **白名单**：`home-skeleton.ts` `KNOWN_TYPES` 加入两类型；二者不锚定骨架槽位，按原序**追加首页末尾**（与 richText 同机制），兜底槽位不受影响。
- **组件**：`components/home/blocks/VideoFloorBlock.vue`（`<video controls playsinline>`，videoUrl 为空不渲染、onError toast 整层保留）、`PointsGoodsFloorBlock.vue`（onMounted 客户端拉数，`limit` clamp 1-20 默认 6，仅渲染 `inStock`，失败/为空整层隐藏；点击卡片/查看更多 → 引导 toast「请前往积分商城兑换该商品」，兑换闭环留在积分商城端）。
- **后台**：`platform/templates` 首页版式下拉加 `app === 'vshop'` 条件——`layout` 字段仅被 vshop C 端消费，nshop 首页是 usemall 骨架不读该字段，对 nshop 模板开放会误导运营。
- **onMounted 上下文安全性**：`resolveClient()` 在钩子同步段内完成 `useTenantChannel()`（`useRuntimeConfig`/`useState`），首个 `await` 之前，不会抛 nuxt instance unavailable；`readVendureTokenWithContext` 客户端直接读 `document.cookie`。
- **i18n**：`messages.home.videoFloor/pointsGoodsFloor/pointsGuide/videoLoadFail` 12 语言包全量同步；积分价复用 `messages.coupon.pointsPrice`。

验证（生产库 ch1 备份→追加两楼层→还原，字节级校验一致；nuxt dev 同源代理线上 API）：
单测 18/18（新增跨端新楼层 2 用例）；390×844 dpr=2 手机视口截图 `docs/manual/shots/2026-10-17-home-video-points-floors/`（视频楼层含海报+控件、积分楼层横滑卡片+积分价、点击引导 toast、整页序）。
坑：改库后 dev SSR 首帧可能命中旧 payload（疑似首编译期取数缓存），重取即新；`devProxy` 仅 dev 生效，生产 .output 的 /shop-api 靠 Nginx 反代。

### 9.1 flash 限时秒杀楼层（同日补齐）

后台 schema 的 `flash`（FlashSection：`source:'flashSale'`、`layout:'row'|'grid2'`、`limit` 1-20 缺省 4）此前同样被 nshop 白名单丢弃。本次补齐（A+B 双版式 + 隐藏更多——nshop 无秒杀专区页，不做假引导，卡片直接进商品详情）：

- **类型**：`shop-content.ts` 新增 `FlashSection`；`home-skeleton.ts` `KNOWN_TYPES` 加入 `flash`（末尾追加，同 video/pointsGoods 机制）。
- **数据链路**：`composables/useFlashSale.ts` → shop-api `activeFlashSaleActivities`（flash-sale plugin，价格单位分）→ `utils/flash-sale.ts` 纯函数（`normalizeFlashActivities` 过滤非 active/已结束/售罄/脏数据，与 vshop flash-normalize 同口径；`earliestEndAt`/`formatCountdown`/`soldPercent`）→ `getFlashSaleItems(limit)` 按 productId 批量查 products 补 name/slug/featuredAsset/变体 priceWithTax（划线价），补不到商品信息的活动剔除。
- **组件**：`FlashFloorBlock.vue` 白卡楼层；头部标题 + 黑底倒计时胶囊（全场最早 endAt，每秒 tick，到点自动重取）；row 横滑（w-28 卡）与 grid2 双列（h-36 大图）随后台 `layout` 切换；卡片 = 「秒杀」badge + 名称 2 行 + 秒杀价（formatCents）+ 划线原价（仅当高于秒杀价）+ 已售进度条；`onMounted` 拉数，失败/为空整层隐藏。
- **i18n**：`messages.home.flashFloor/flashEndsIn/flashBadge/flashSold/flashFallbackName` 12 语言包全量同步。

验证：单测 22 个文件 190 用例全过（新增 `flash-sale.spec.ts` 14 用例 + home-skeleton flash 用例）；生产库造 3 条渠道 1 测试活动（关联温泉商品，秒杀价 ¥99/¥699/¥159 + 划线价 + 已售 34%/30%/75%），row/grid2 双版式 390×844 dpr=2 截图 `docs/manual/shots/2026-10-17-home-flash-floor/`（倒计时胶囊正确取最早 endAt）；验证后测试活动删除、shopContent 字节级还原。

**坑（重要，跨项目可复用）**：
1. **Vendure 秒杀活动时间时区语义**：`flash_sale_activity` 的 `startAt/endAt` 列为 `timestamp without time zone`，**应用侧按 Asia/Shanghai（+08）解读**（node-pg 会话时区跟随服务端）。用 `docker exec psql`（容器会话 UTC）写 `NOW()+6h` 造测试数据，会被应用当成「+08 的 09:02」= 01:02Z → **已经结束**，API 返回空。造数须显式写北京时间字符串（如 `'2026-10-17 18:00:00'`）或拉宽窗口验证。
2. **排查手段**：API 返回与 DB 不符时，用 `ALTER SYSTEM SET log_min_duration_statement=0` + `log_parameter_max_length=0` + `pg_reload_conf()` 抓 app 实际执行的 SQL 与参数（用完即还原）；本次靠它确认 SQL 与手写模拟完全一致，最终定位到时区参数差异。
3. **低内存服务器 OOM 崩溃循环**：1.8G 内存机上 vendure（400MB+）被 OOM 杀后 pm2 反复拉起会陷入崩溃循环（502）。处置：临时 `pm2 stop` 内存大户（nshop/strapi）让 vendure 站稳，验证后恢复；strapi 本就崩溃循环 5116 次处于 waiting 状态，本次保持 stopped（需另行修复）。

### 9.2 limitGoods/hotGoods 楼层（同日补齐）

后台 schema 的 `limitGoods`（`collectionSlug`+`limit` 1-20 缺省 6）与 `hotGoods`（`collectionSlug`+`pageSize` 1-20 缺省 10）——两个「按集合取商品」楼层，此前同样被 nshop 白名单丢弃。本次补齐（mockup 定稿：limitGoods=sliding 大卡横滑、hotGoods=compact 京东双列网格，与 vshop 同版式）：

- **类型**：`shop-content.ts` 新增 `LimitGoodsSection`/`HotPicksSection` + `floorCount(n, fallback)` 纯函数（正整数原样、越界截 20、非法回缺省，与后台校验 1-20 对齐）；`KNOWN_TYPES` 加入两类型（末尾追加，同 video/pointsGoods 机制）。
- **组件**：`LimitGoodsFloorBlock.vue`/`HotPicksFloorBlock.vue` 均**薄壳归一化**——把 section 转成 `{type:'recommend', source: collectionSlug?'collection':'auto', collectionId: slug, limit: floorCount(...), layout:'sliding'|'compact', dedupe:false}` 复用既有 `useCuratedGoods`（零新增取数逻辑；`dedupe:false` 使独立楼层不参与同页去重，useAsyncData key 含 slug+limit 天然隔离）。标题走 LocalizedText 回退链 → i18n `messages.home.limitFloor/hotPicksFloor` 12 语言包全量同步。

验证：单测 22 个文件 194 用例全过（新增 `floorCount` 3 用例 + home-skeleton limitGoods/hotGoods 用例）；生产库 ch1 shopContent 追加两楼层（limitGoods→hot-spring 集合、hotGoods 走 auto），390×844 dpr=2 截图 `docs/manual/shots/2026-10-17-home-limit-hot-floors/`（横滑大卡/双列网格、邮寄自提过滤条、热门商品 badge、整页序）；验证后 shopContent 字节级还原（md5 一致）。**部署上线后补做线上等价写入验证**：生产 ch1 再追加两楼层 → `https://www.youshop.cn/` 手机视口实测 SSR+客户端渲染正常（live-floor-0/1.png、home-live-full.png，两楼层按骨架末尾追加序显示、其余楼层零影响）→ 还原。**后台表单 UI 实测**：superadmin 登录 web-admin（`e.joho.cn/guanli`）→ 渠道选择 → 首页装修 → 点「+ 限时精选」「+ 热门推荐」，两编辑块字段/placeholder/默认值（limit 6、pageSize 10）渲染正确（admin-form-addbar/limitgoods/hotgoods/full.png；本地态添加、未点保存，生产零影响）。

**后台 UI 自动化坑（跨项目可复用）**：① 装修页直连 URL 必须带尾段 `/index`（`#/pages/decorate/home/index`，菜单注册的完整路径）；② 登录后强制过「渠道选择」页（pick → dashboard），自动化须先点渠道；③ Playwright `text=` 不加引号是**子串匹配**——addbar 里「+ 限时精选（秒杀）」（flash）与「+ 限时精选」（limitGoods）同前缀，会误点前者，必须 `text="+ 限时精选"` 引号精确匹配。

**坑（重要，跨项目可复用）**：
1. **SearchItem 的 productAsset 来自 search_index_item，不回查 product 表**：DefaultSearchPlugin `search-strategy-utils` 直接用索引行 `si_productAssetId`/`si_productPreview` 组 productAsset（preview 还靠索引列，格式 `preview/xx/xxx__preview.png`，序列化时补 asset-server origin）。**直接 SQL 改 `product.featuredAssetId` 绕过 TypeORM 订阅器不会重算索引** → API 依旧返回 null；造/还原测试数据须同步改 `search_index_item`（productAssetId + productPreview，后者 NOT NULL、无图商品原值为空串 `''`）。
2. **psql `-c` 多语句是单事务**：一条失败整段回滚（含前面已打 UPDATE 1 的语句），分步验证时每条单独跑。
3. **Playwright `route.continue({url})` 不允许跨协议改写**（http→https 报 "New URL must have same protocol"）；dev 下商品图动态 origin 指向 localhost、静态资源只有线上有 → 截图脚本内用 `fetch(生产URL)` + `route.fulfill({body})` 代理（仅脚本内，业务代码零改动）。
4. **首页 sticky 遮挡楼层标题**：AppHeader（`sticky top-0`）+ 红色分类栏 JdCategoryNav（`sticky top-[52px]`）会盖住楼层截图顶部；截图脚本 addStyleTag 将二者 `position:static`（保留文档流，不破坏页面高度）。

## 10. 大字版适配规范（2026-10-17 全站收口）

**机制**：全站 Tailwind 类为 rem 单位，项目不设 html/root font-size（nuxt.config/main.css/theme.css 均无覆盖）→ 浏览器/系统根字号直接生效。大字版（用户调大系统字体，根字号 16px→20px+）下 rem 尺寸全放大而视口宽度固定，**混用 px 的地方产生失配**：内容 px 字号相对变小（价格块比例失调）、px 容器装 rem 文字（溢出/截断加剧）、rem 图标按钮放大挤压 logo。已有先例：6c33eeb 详情页券楼层+底栏「方案 A」。

**适配规范（R1-R6，新组件必须遵守）**：
- **R1 内容文字一律 rem**：禁止内容性 px 字号；Tailwind `text-[Npx]` 写法换算 `N/16 rem`（如 `text-[13px]`→`text-[0.8125rem]`），**100% 档字节级等价、仅 125%+ 放大，零回归风险**。内联 style 同理。
- **R2 结构元素锁 px**：图标按钮（`h-[36px]! w-[36px]! min-w-0!`）、券面额块（`w-[72px]`）等锁 px 防吃横向空间，flex 子项配 `min-w-0`。
- **R3 px 容器装 rem 内容 → 容器转 rem**：如积分卡 `w-[120px]`→`w-[7.5rem]`（整卡随档位放大，与秒杀楼 `w-28` 同体系）。
- **R4 flex 多元素行**：文本子项 `min-w-0` + `truncate`/`line-clamp-2`；短标签（价格/有效期）`whitespace-nowrap`。
- **R5 固定列 grid**：单元格文字 clamp、图标锁 px。
- **R6 底部固定条**：延续 ProductDetailBottomBar 先例（min-w-0 + 文字锁 px + 高度随内容自适应）；DetailFloor/DetailMall 内联底栏仅 `lg:flex` PC 显示，移动端一律由统一吸底栏接管。

**px 白名单（装饰/叠图/SSR 图，保持 px 合理）**：① satori OG 图组件（非浏览器渲染）；② 绝对定位叠图角标 badge（flashBadge/NEW/购物车角标等，不参与排版挤压）；③ 面额块内部小字（锁块锁字）；④ ProductDetailBottomBar 按钮文字 `text-[15px]`（6c33eeb 定稿）；⑤ 图片高度（无文字溢出问题）；⑥ JdPcHeader（PC 端）。

**本次修复清单（2026-10-17，27 组件文件）**：PriceBlockJdA/JdB 全量 px→rem（mockup 定稿方案 A）；PointsGoodsFloorBlock 卡 120/110px→rem（方案 A）；CouponFloorBlock 券卡 `w-[220px]`→`w-[13.75rem]`；JdBrandFloor `w-[76px]`→`w-[4.75rem]`；流内内容小字 px→rem：BoxLines/BoxDeliveryBlock/BoxPickupBlock/CheckoutCnSummaryBar/CartItem/AfterSalesCreateModal/category 页/JdPlazaGrid/DetailFloor/DetailClassic/DetailMall（skuLabel）/GoodsMasonryGrid/GoodsSingleList/ProductCouponBlock/CouponFloorBlock（条件+按钮）/OrderListCn/OrderListMall/OrderListJd/FlashFloorBlock（倒计时/划线价/已售，badge 保持 px）/coupon 页与 CentreList/WalletList/SsoAwaitOverlay。header 5 组件（AppHeader/SearchModal/AccountMenu/CartTrigger/CitySelector）锁 36px 收口同批提交。

**验证矩阵与验收标准**：
- 档位：100%（回归基线）/125%（html 20px）/150%（html 24px）；模拟口径 = Playwright `addStyleTag html{font-size:Npx!important}`（等价系统大字号对根字号的作用）。
- 视口 390×844 dpr=2 iPhone UA；引擎 Chromium + WebKit；页面矩阵 P0 = 首页/详情×2/分类/搜索/券中心/结算/登录 + P1 抽查 faq（账户/订单/售后匿名落登录墙，登录态页面靠静态审计兜底）。
- 验收：125%/150% 无文字溢出丢字（line-clamp 省略号可接受）、无重叠、无布局错乱、交互区可点；100% 与基线对照无劣化；vitest 全过；内容性 px 字号 grep 清零或命中白名单。
- 截图归档：`docs/manual/shots/2026-10-17-bigfont-audit/`（修复前后全矩阵 ×2 引擎）。

**真机抽查清单（手册兜底，模拟口径之外）**：微信 webview（Android 系统字体最大档）、iOS Safari（设置→辅助功能→更大字体）、Chrome Android（无障碍→文字大小）；重点看首页楼层卡、详情价格块与底栏、结算底栏。

**坑（跨项目可复用）**：
1. **Playwright ESM 不认 NODE_PATH**：`.mjs` 里直接 `import ... from 'file:///C:/nvm4w/nodejs/node_modules/playwright/index.mjs'`。
2. **addStyleTag 与客户端导航竞态**（"Execution context was destroyed"）：goto 后先 waitForTimeout 再注入，try/catch 重试 3 次。
3. **dev server 端口看启动日志**（本项目 8080 非 3000）；`pageerror` 收集进 audit-log JSON 便于回溯。