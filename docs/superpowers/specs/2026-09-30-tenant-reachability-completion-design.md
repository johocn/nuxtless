# 多租户渠道「永久可达」补全 — 设计文档

> 日期：2026-09-30
> 范围：`d:\zhao\nshop`（Nuxt C 端，含 `layers/base`）、`d:\zhao\vshop`（uni-app H5，`src/`）
> 后端：**零改动**（所需两个能力已存在，见 §1.1）
> 前置：`2026-09-30` 多租户渠道「永久可达」改造（路由免费可选段 + 运行时租户表 + 后端 `shopChannels`）
> 参考落地：`layers/base/app/components/header/CitySelector.vue`（页头选择器范式）、`vshop/src/components/TenantBar.vue`（对端切换器）
> 关联既有草案：`d:\zhao\.trae\documents\多租户渠道永久可达改造方案.md`（本文档为其候选方案对比与缺口补全的定稿）

## 0. 决策基线（用户已确认）

| 决策 | 结论 |
| --- | --- |
| 本轮范围 | **三块一起做**：功能缺失（切换器 / 域名直达）+ 卡点（两端行为不一致、SWR 窗口）+ 404 页面完善 |
| 整体架构 | **方案 A「一处解析 + 三处消费」**：租户解析收敛到 Nitro 中间件一处，错误页 / 域名直达 / 切换器三处消费同一结果（否决「就地打补丁」与「nginx 301 归一」） |
| 未知 / 停用租户 | **明示错误页 + 恢复引导**（nshop 保 404 语义不改成「回退默认店」，避免软 404 污染 SEO） |
| 自定义域名 | **纳入**：nshop 支持按 host 直达 |
| 域名直达后的站内导航 | **同域归一为 `/<code>`**（服务端 301，域名不变）；不做「隐式租户无前缀」 |
| 404 版式 | **两种各管一类**：租户未命中（店铺不存在）用**居中卡片式**；路由未匹配（页面不存在）用**左对齐 + 推荐店铺** |
| 交付 | 实现 + HTTP 断言/e2e 回归 + **手机视口截图（390×844 / dpr=2）** 进操作手册 + 操作手册/测试用例文档 |

### 0.1 不做项（有意排除）

| 不做 | 理由 |
| --- | --- |
| 支持 `/zh/<code>` 这类「非完整 locale」首段 | `zh` 从来不是合法 locale（`locales.ts` 中 code 为 `zh-CN`）；额外支持会凭空多出一套重复 URL，对 SEO 有害。**维持 404** |
| nshop 未知租户改为「回退默认店」 | 会让不存在的分店 URL 返回 200（软 404），搜索引擎按重复内容收录 |
| 购物车跨渠道合并 / 迁移 | Vendure `activeOrder` 与 channel 强绑定，跨渠道搬运属后端语义改造；本轮只做「切店时的正确处置」（见 §3 卡点 2） |
| 前端烘焙渠道清单（回到构建期白名单） | 与本轮「永久可达」目标（新增渠道无需重建前端）直接冲突 |
| 推荐算法（错误页「你或许想去」） | 系统无推荐引擎；该区块取 `shopChannels` 前 N 项（默认优先），不虚构算法 |

## 1. 现状（代码事实）

### 1.1 后端能力已就绪（零改动）

* `vendure/packages/cjk-plugin/src/tenant/domain-resolver.service.ts:41-55` — `resolveByDomain(ctx, host)`：`emptyCtx` 跨渠道 `findAll`，逐渠道比对 `channel.customFields.customDomains: string[]`（`:49`），命中返回 `{ token, code }`。
* 同文件 `:94-116` — `listShopChannels()`：排除 `customFields.enabled === false`，包含默认渠道并标记 `isDefault`（`:35` `DEFAULT_CHANNEL_CODE = '__default_channel__'`），排序「默认优先 + 其余 code 升序」。条目形态见 `:25-32` `ShopChannelEntry`（`code / token / name / tenantNo / isOfficial / isDefault`）。
* 已暴露为公开查询 `shopChannels`（`domain-shop.resolver.ts`，SDL 同时含 `resolveChannelByDomain(host)`）。
* vshop 已消费：`vshop/src/api/queries/channel.ts:39-45` 的 `resolveChannelByDomain`。

### 1.2 nshop 现状

* 路由：租户段为**免费可选段** `:tenantCode?`（非构建期白名单），真伪运行时判定。
* `server/middleware/tenant.ts` — 只做**正向命中**（命中才写 `event.context.tenant`），**绝不判 404**（避免误伤 `/favicon.ico`、`/_nuxt/**`、`/en/product/foo`）。
* `server/utils/tenant-registry.ts:35-36` — `TENANT_TTL_MS = 60_000`、`FETCH_TIMEOUT_MS = 3_000`；SWR + 负向缓存 + 三级降级（运行时 → 上次成功 → 构建期种子 `tenant-channels.json`）。
* `layers/base/app/middleware/tenant.global.ts:14-46` — **唯一**判定 404 的地方；缺省时 `to.params.tenantCode` 是空字符串 `""`（非 `undefined`），必须 falsy 判断。`:33` 与 `:45` 文案 `"店铺不存在"` 为**硬编码中文**。
* `layers/base/app/composables/useTenantChannel.ts:40-47` — `applyResolved(hit)` 写 `resolvedMap` + `activeTenant` + `useGqlHeaders({ "vendure-token": hit.token })`。
* `layers/base/app/composables/useTenantLocalePath.ts:7-12` — 站内链接统一 `localePath(tc + path)`，`tc` 取自 `useTenantChannel().code`（≈30 处引用）。
* `layers/base/app/components/AppHeader.vue:59-64` — `#right` 现有 `HeaderCitySelector` / `SearchModal` / `AccountMenu` / `CartTrigger`；移动端由 `UHeader toggle-side="left"` 的 `#body` 抽屉承载导航。

### 1.3 已核实的缺口（本轮要补的）

| # | 缺口 | 证据 |
| --- | --- | --- |
| G1 | nshop **无 `error.vue`**，404/500 全走 Nuxt 默认错误页（英文 "Server Error" + "Go back home"，无站点框架） | `Glob **/error.vue` → 无匹配 |
| G2 | nshop **无 catch-all `[...slug].vue`**，「路径不存在」与「租户不存在」两类 404 无法区分呈现 | `layers/base/app/pages/**` 文件清单 |
| G3 | nshop **无店铺切换器 UI** | `layers/base/app` 内 grep `TenantBar\|tenant-switch\|switchTenant\|店铺切换` → 无匹配 |
| G4 | nshop **不消费自定义域名**（只认路径前缀） | `layers/base/app` 内 grep `resolveChannelByDomain` → 仅 `useTenantLocalePath.ts` 同名方法命中，无 domain 解析调用 |
| G5 | nshop i18n **无错误页词条**；404 文案硬编码中文 | 见 §1.2 第三条 |
| G6 | vshop 未知租户**静默回退默认店**，与 nshop 的 404 行为不一致 | `vshop/src/stores/tenant.ts` `initTenant` 降级链 |

## 2. 设计

### 2.1 租户解析收敛（架构骨架）

`server/middleware/tenant.ts` 从「只认路径首段」扩为**三级解析**，仍是**唯一**的正向命中点：

| 优先级 | 输入 | 解析方式 |
| --- | --- | --- |
| 1 | 路径首段 `/<code>` | 复用现有运行时租户表（SWR 60s + 三级降级，**不改**） |
| 2 | 访问域名 host | **新增**：调 `resolveChannelByDomain(host)`，命中结果并入同一张运行时表（共享 SWR 与降级链） |
| 3 | — | 平台默认店 |

约束：

* 404 判定**仍只在** `middleware/tenant.global.ts` 一处，不新增第二套解析逻辑。
* 域名解析结果与路径解析结果写入**同一张**表，避免出现「错误页说不存在、切换器却列得出」的分歧。

### 2.2 错误页（nshop 新增 `error.vue`）

* 新增 `layers/base/app/error.vue`，**同时**覆盖 404 与 500（现状二者都落默认页，见 G1）。
* 文案全部 i18n 化：新增 `messages.error.*` 词条并**同步全部 12 个语言包**（`en` / `zh-CN` / `bg` / `ru` / `fa` / `de` / `es` / `fr` / `it` / `pt` / `ja` / `ko`，见 `layers/base/i18n/locales.ts:3-27`）。
* `middleware/tenant.global.ts:33,45` 的硬编码 `"店铺不存在"` 改为 `createError({ statusCode: 404 })` + 由错误页用 i18n 渲染（错误对象不再承载展示文案）。
* **两类 404 区分呈现**（用户已选）：

| 场景 | 判别依据 | 版式 | 主文案 |
| --- | --- | --- | --- |
| 租户未命中 | `error.data.kind === "shop-not-found"` | **居中卡片式** | `店铺不存在` / `该店铺可能已更名或停用` |
| 路由未匹配 | `statusCode === 404` 且无上述标记 | **左对齐 + 推荐店铺** | `页面不存在` / `这个页面可能已被移除` |
| 服务端错误 | `statusCode >= 500` | 居中卡片式（复用第一种） | `服务暂时不可用` |

* **判别机制（必须显式约定）**：`error.vue` 中**不可依赖 `route.params`** —— 错误态下路由参数不可靠。因此由「租户未命中」的抛错方在错误对象上打标记：
  `middleware/tenant.global.ts` 改为 `showError(createError({ statusCode: 404, data: { kind: "shop-not-found" } }))`；
  `error.vue` 依 `props.error.data?.kind` 分流，无标记的 404（Nuxt 内建的路由未匹配）走「页面不存在」版式。
* 主文案只从 i18n 取，**不放进 `createError` 的 `message`**（避免出现未本地化英文）。
* 页面保留站点框架（`AppHeader` / `AppFooter`），保证错误页仍可导航。
* 「返回首页」用 `clearError({ redirect: useTenantLocalePath()("/") })`，确保带租户前缀回首页而非落到默认店。
* 恢复出口（两种版式共有）：**返回首页**（见上）；**选择其他店铺** —— 在错误页**就地展开店铺列表**，而非去触发页头弹层（错误页不应依赖 `AppHeader` 的交互状态）。两者复用同一个「租户列表 + 切换动作」composable（§2.4），仅展示容器不同。
* 左对齐版式额外渲染「你或许想去」：取 `shopChannels` **默认渠道优先的前 3 项**（排除当前已失效 code），点击直达 `/<code>`。
* **i18n 词条清单**（`messages.error`）：`title404`、`title500`、`shopNotFound`、`shopNotFoundDesc`、`pageNotFound`、`pageNotFoundDesc`、`serverError`、`serverErrorDesc`、`backHome`、`chooseShop`、`maybeLike`。
* `fa`（rtl）需确认版式在 `dir="rtl"` 下不溢出（左对齐版式的推荐区在 rtl 下自然右对齐即可）。

### 2.3 域名直达（同域归一）

```
shopA.com/product/x
  └─ Nitro: 无路径租户段 → host = shopa.com
       └─ resolveChannelByDomain → 命中 t1
            └─ 301 → shopA.com/t1/product/x     ← 域名不变，仅补路径段
                 └─ 二次请求走现有路径解析（逻辑完全复用）
```

约束：

* **301 排除清单（必须）**：`/_nuxt/**`、`/favicon.ico`、`/robots.txt`、`/sitemap*.xml`、`/shop-api/**`、`/api/**`、`/_ipx/**`、`/images/**`、`/static/**` —— 否则静态资源与站点地图会被打乱。
* **未命中域名不 301**：如平台域 `www.youshop.cn`，按默认店直接服务（即当前行为，零回归）。
* 域名模式下不做「隐式租户无前缀」——301 之后 URL 始终带 `/<code>`，因此 `useTenantLocalePath` 取到的 `code` 恒有值，站内点击**不会**掉回默认店（这正是卡点 1 的解法）。
* 部署侧只需把各店铺域的 `server_name` 指向同一 Nuxt 实例，**不改 nginx 路径规则**。

### 2.4 店铺切换器（nshop 新增 `HeaderTenantSelector`）

* 新组件 `layers/base/app/components/header/TenantSelector.vue`（目录前缀 ⇒ Nuxt 自动注册为 `HeaderTenantSelector`，与 `HeaderCitySelector` 同规则）。
* **桌面端**：插入 `AppHeader.vue:59-64` 的 `#right`，排在 `HeaderCitySelector` 之后；交互照抄 `header/CitySelector.vue` 的 `UPopover + UButton` 范式（`i-lucide-store` 图标 + 当前店名）。
* **移动端**：不塞进 `#right`（会挤），改由 `UHeader` 的 `#body` 抽屉承载（同 `AppHeader.vue:66-73` 现有导航的收纳方式）。
* 数据源：`shopChannels`（已含 `name` / `isOfficial` / `isDefault`），**无需新增接口**。`isDefault` 项显示「平台官方」标记。
* **共享逻辑抽到 composable**：新增 `layers/base/app/composables/useTenantSwitcher.ts`，暴露 `list()`（取 `shopChannels`，含 `?fresh=1` 强制刷新与频控）与 `switchTo(code)`（跳转 + 更新 `activeTenant` / GQL 头 + 清空城市）。页头 `HeaderTenantSelector` 与错误页的就地列表**共用同一份实现**，避免两处逻辑分叉。
* 切换动作：跳转 `/<目标code>/<当前路径去掉旧租户段>`，**保留语言前缀**（`/en/t2/...` → `/en/t3/...`）。切换后经 `applyResolved` 更新 `activeTenant` 与 `vendure-token` 头。
* **空列表 / 接口失败：不渲染入口**（不引入新的失败态，零回归）。

### 2.5 vshop 对齐

* `vshop/src/stores/tenant.ts` 的 `initTenant` 解析链**保留**（`?tenant=` > `localStorage.tenant_code` > `resolveChannelByDomain(host)` > 默认），仅把「未知租户静默回退」改为**明示**：渲染错误态，文案与出口（回默认店 / 打开 `TenantBar` 切换）与 nshop 对齐。
* `vshop/src/components/TenantBar.vue` 沿用，不再新增切换入口。

## 3. 卡点与策略

### 卡点 1 — 域名直达与站内链接冲突 ✅ 已解

见 §2.3：同域 301 归一后 `code` 恒有值，`useTenantLocalePath` 行为不变。

### 卡点 2 — 切店 = 切 Vendure channel

拆两半处理：

* **城市**：切店后**清空当前城市选择**并提示重选。依据：`header/CitySelector.vue:9` 的 `useAvailableCities()` 按渠道配送能力推导可用城市，不清会让用户停在新店送不到的城市上。
* **购物车**：Vendure `activeOrder` 与 channel 强绑定，nshop 现有购物车是否跨 channel 复用 **尚未验证**。列为 §5「实施前必须验证」第 1 项，结论决定是「切店后自动新建购物车」还是「提示用户购物车将清空」。

### 卡点 3 — SWR 60s 生效窗口

* 切换器**打开时**带 `?fresh=1` 绕过 TTL 强制刷一次，运营在后台改完渠道即可立刻看到。
* 频控：`force` 刷新最小间隔 5s，避免被高频点击刷爆后端。
* 其余 SSR 请求保持 60s SWR 不变，不牺牲性能。

### 卡点 4 — `/zh/<code>` ✅ 已定

见 §0.1：**维持 404，不做兼容**。

## 4. 涉及文件清单

### 新增

| 文件 | 作用 |
| --- | --- |
| `nshop/layers/base/app/error.vue` | 全局错误页（两类 404 + 500），i18n 化、带站点框架与恢复出口 |
| `nshop/layers/base/app/components/header/TenantSelector.vue` | 店铺切换器（自动注册 `HeaderTenantSelector`） |
| `nshop/layers/base/app/composables/useTenantSwitcher.ts` | 切换器与错误页共用的「租户列表 + 切换动作」（含 `?fresh=1` 与频控） |

### 修改

| 文件 | 改动 |
| --- | --- |
| `nshop/server/middleware/tenant.ts` | 新增 host 解析（`resolveChannelByDomain`）与 301 归一（含排除清单） |
| `nshop/server/utils/tenant-registry.ts` | 域名解析结果并入同一张运行时表；`?fresh=1` 强制刷新入口与 5s 频控 |
| `nshop/layers/base/app/middleware/tenant.global.ts` | 去除硬编码文案，改传 `statusCode: 404`；区分「租户未命中」与「路由未匹配」 |
| `nshop/layers/base/app/components/AppHeader.vue` | `#right` 接入 `HeaderTenantSelector`；移动端 `#body` 收纳 |
| `nshop/layers/base/i18n/locales/*.ts` | 新增 `messages.error.*` 共 11 个词条 × **12 个语言包** |
| `nshop/layers/base/app/composables/useTenantChannel.ts` | 暴露切换动作（保留语言前缀、更新 `activeTenant` 与 GQL 头） |
| `vshop/src/stores/tenant.ts` | 未知租户由静默回退改为明示错误态 |

### 不改动

* Vendure 全部（`resolveChannelByDomain` / `shopChannels` 已存在）。
* `layers/base/app/composables/useTenantLocalePath.ts`（§2.3 归一后行为无需变更）。

## 5. 验证与验收

### 5.1 实施前必须验证（阻塞项）

1. **购物车是否跨 channel 复用**：读 nshop 现有 `activeOrder` 取用逻辑，确认切店后的购物车语义（决定卡点 2 的落地形态）。
2. **店铺域是否已在 nginx 配 `server_name`** 指向同一 Nuxt 实例；未配则域名直达无法在线上成立。
3. **`customFields.customDomains` 是否已有数据**（目前是否仅 vshop 在用）。

### 5.2 HTTP 断言

| 断言 | 期望 |
| --- | --- |
| `GET https://www.youshop.cn/<code>` | 200 |
| `GET https://www.youshop.cn/en/<code>` | 200，`<title>` 为该店名 |
| `GET /<不存在>` | **404**，页面含站点框架与「店铺不存在」 |
| `GET /<不存在路径>`（无租户段） | **404**，页面含「页面不存在」+ 推荐店铺 |
| `GET https://<店铺域>/product/x` | **301**，`Location: https://<店铺域>/<code>/product/x` |
| `GET https://<店铺域>/_nuxt/**.js` | **200（不被 301）** |
| `GET https://www.youshop.cn/` | 200（默认店，不 301，零回归） |
| admin-api 置某渠道 `enabled=false` 后 | 该 `/<code>` 由 200 转 404（生效窗口 ≤ 60s + 一次 `?fresh=1` 即时报） |

### 5.3 UI 与截图

* 手机视口（390×844、dpr=2、`is_mobile`、`has_touch`、`locale=zh-CN`）截图：
  * 两类 404 页（租户未命中 / 路由未匹配）
  * 桌面 + 移动端的店铺切换器（收起 / 展开）
  * vshop 未知租户明示态
* 切换语言至 `en` 与 `fa`(rtl) 各截一张错误页，验证无裸 i18n key、无溢出。

### 5.4 回归

* 现有可达性取证脚本 `vshop/web-admin/scripts/_tenant_reach_shots.mjs` 的 9 项断言全部保持通过。
* C 端既有 e2e（首页 / 商品详情 / 下单 / 售后）不回归。

### 5.5 文档

* 操作手册新增「多租户可达性」章节（含上述截图与断言表）。
* 更新 `d:\zhao\.trae\documents\多租户渠道永久可达改造方案.md`，指向本 spec（去掉「计划口吻」，回填现状与缺口）。

## 6. 风险与回滚

| 风险 | 缓解 |
| --- | --- |
| 301 规则误伤静态资源导致白屏 | 排除清单在 §2.3 明示；验证含 `/_nuxt/**` 不被 301 的断言 |
| 域名解析拖慢 SSR（每次冷启动多一次后端调用） | 复用现有 3s 超时 + 60s SWR + 负向缓存；失败静默降级为默认店 |
| 切店清空城市引发用户困惑 | 清空时给出显式提示文案（i18n） |
| `error.vue` 影响正常页面渲染 | `error.vue` 仅在错误态接管；回归含常规页面 200 断言 |
| 回滚 | 三批各自独立可回滚：① 错误页（删 `error.vue` + 还原文案）② 域名直达（关闭中间件 301 分支）③ 切换器（从 `AppHeader` 摘除组件）。后端无改动，无数据迁移 |

## 7. 落地顺序

| 批次 | 内容 | 独立验收 |
| --- | --- | --- |
| ① | 错误页 + i18n（12 包）+ vshop 明示化 | §5.2 两类 404 断言 + §5.3 四类截图 + 多语言无裸 key |
| ② | 域名直达 + 301 排除清单 | §5.2 域名为单位的 301/Location 断言 + `/_nuxt/**` 不被 301 |
| ③ | 店铺切换器 UI（桌面 + 移动） | §5.3 切换器截图 + 切店后语言前缀保留断言 + 城市清空提示 |

部署顺序：**nshop → vshop**（后端无改动）。
