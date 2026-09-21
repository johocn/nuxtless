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