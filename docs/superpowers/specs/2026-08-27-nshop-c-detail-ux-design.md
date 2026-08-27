# nshop C 端详情页体验强化 — 图集视频 / 就近库存兜底 / 城市配送提示 设计

- 日期：2026-08-27
- 范围：C 端商品详情页三项体验增强——①图集支持视频优先展示并自动播放、修手机端主图不显示；②就近库存作纯展示层、根治"有货却就近失败"矛盾并提供降级；③城市配送限制提示 + 「可购买城市」折叠查看
- 仓库：`d:\zhao\nshop`（前端）
- 涉及后端：`d:\zhao\vendure\packages\inventory-plugin`（就近库存匹配与服务城市修正）

## 背景与目标

商品详情页已具备三级积木版式（classic / floor / dualBuy，见 `2026-08-27-nshop-product-detail-builder-design.md`）。当前存在三处 C 端体验断点：

1. **主图/组图手机端不显示**：`useProductStore.galleryAssets` 只取 `selectedVariant.assets`，为空才回退 `product.assets`；无资产时图集空白无兜底。
2. **无视频能力**：`galleryAssets` 纯图片（`NuxtImg`），前后端均无视频字段。
3. **有货却"就近库存获取失败"**：`inventory-plugin` 的 `locationServesCity` 用 `serviceCities` **精确匹配**，与前端 `useCityService.matchCity` 的「市=省 / 前缀」匹配不一致；且无定位（无 `coords`）时 `NearbyStores` 整个 section 不渲染、`useNearbyStock` 把后端异常吞掉返回空——界面显示"暂无可查询库存"，与顶部"有货"矛盾。
4. **城市不可购买无引导**：`useCityService` 判断不可服务时，经典版仅有警示，无「可购买城市」入口。

**目标**：三块齐落地，符合项目「多语言 / 多城市 / 四级可回退」C 端模板组合规则（见 `project_memory.md`）。就近库存**纯展示层**，不参与购买门禁（购买只看商品总库存 `stockLevel` + 城市 `serviceable`）。

## 决策记录（brainstorming 已收敛）

| # | 决策 | 结论 |
|---|---|---|
| 1 | 优化范围 | 图集+视频 / 就近库存兜底 / 城市配送提示 三项全做 |
| 2 | 就近库存根因排查 | 前后端链路都查 |
| 3 | 就近失败兜底 | 回退主库存并放行，仅展示层降级提示 |
| 4 | 就近库存角色 | 纯展示层，不阻断购买 |
| 5 | 视频数据来源 | 商品+变体 `customFields` 新增 `videoUrl` 字段 |
| 6 | 就近失败/未定位呈现 | 平滑降级（不报红错、不空白） |
| 7 | 可购买城市交互 | 不可买时折叠行 + 「查看可购买城市」按钮展开 |

## 模块1：图集 + 视频

### 数据模型（后端 customFields 新增）
- `Product.customFields.videoUrl?: string`（商品级视频，可空）。
- `ProductVariant.customFields.videoUrl?: string`（变体级视频，可空）。

> 复用 `customFields` 而非 Vendure Asset 视频体系：避免改造 Asset 预览/缩略图管线，成本最低且与现有 `belongCity/serviceCities` 同源配置。

### 前端类型与请求
- `layers/base/gql/fragments/product.gql`：
  - `ProductBaseFragment.customFields` 补 `videoUrl`。
  - `ProductVariantFragment` 新增 `customFields { videoUrl }`。
- `layers/base/types/product.ts`（或 codegen 生成类型）同步。

### 数据聚合：`useProductStore.galleryAssets`
重写为返回**有序媒体数组**，元素 `{ type: 'image' | 'video', id, src, preview? }`：
- **视频优先**：若存在 `assetVideos`（商品或选中变体 `videoUrl` 非空），取选中变体优先、回退商品，放最前。
- 其余拼接商品/变体 `assets` 图片（沿用现有"选中变体 assets → 商品 assets"回退）。
- 纯图片场景逻辑与现状等价（不回归）。
- `videoAutoplay` 开关：默认开（L2 配置可关，见模块3 S 表）。

### 渲染：`ProductGallery.vue`
- **首项为 video**：首帧渲染视频卡片 `<video :src autoplay muted loop playsinline preload="metadata">`（静音 + playsinline 满足 iOS/现代浏览器自动播放策略），底部缩略图带视频角标，点击缩略图切换对应媒体。
- **纯图片**：维持现有 `UCarousel` + `NuxtImg` + PhotoSwipe。
- **空图集兜底**：`galleryAssets` 为空显示占位图（`assetSrc` 全局占位），消除手机端空白。
- SSR 渲染 `<video>` 不触发真实播放/下载（`preload="metadata"` + 客户端才设 autoplay），规避 hydration 与带宽问题。

## 模块2：就近库存兜底（纯展示层）

### 后端 root-cause 修正（inventory-plugin）
1. **城市服务匹配统一**：`locationServesCity` 由精确 `serviceCities.includes(city)` 改为与前端 `useCityService.matchCity` 一致的前缀/包含匹配（`city===name || city.startsWith(name) || name.startsWith(city)`，大小写归一）。消除"前端可服务、后端空仓"。可选：无 `serviceCities` 时按 `belongCity`（仓归属城市）兜底。
2. **无定位不吞错**：`findNearbyStock` 无 `origin`（无坐标）时返回明确空态（非异常非崩溃），供前端识别 "未定位"。

### 前端 `useNearbyStock` / `NearbyStores.vue`
- 不再用 `catch` 吞错返回空数组。改为三/四态：
  - `state: 'ok'`（有结果）
  - `state: 'no-coords'`（未定位）
  - `state: 'no-stock'`（已定位但无匹配仓/不该仓）
  - `state: 'error'`（接口异常）
- **平滑降级**（决策 6）：
  - `no-coords` → 提示"开启定位查看就近库存"，不渲染报错。
  - `no-stock` → 提示"暂无可查看门店库存"，不报错。
  - `error` → 提示"附近门店库存暂不可查"，不回退费用、不阻断购买。
- `NearbyStores` 保留在 `detailConfig.blocks.nearby` 显隐控制内（默认可见）。
- **购买门禁**：`productServiceable`（城市）与 `stockLevel`（总库存）独立；就近库存**不参与** `disabled`/`serviceable` 判定（决策 4）。

## 模块3：城市配送提示 + 可购买城市

### `useCityService`
增强返回结构化结果（在现有 `serviceable/province/...` 之上补充）：
```
{ serviceable: boolean; reason: 'ok'|'no-city'|'not-served'; serviceCities: string[]; belongCity?: string; }
```
- `matchCity` 已是前缀/包含匹配，前端判定与后端修正后一致。
- `serviceable=false` 时的 `title/text` 文案入 i18n 字典。

### 交互：折叠 + 按钮（决策 7）
- **三版式统一**（classic / floor / dualBuy 的购买栏）：`serviceable=false` 时在购买栏下显示警示条 + **「查看可购买城市」** 按钮。
- 点击展开折叠列表，列出 `[belongCity(商品归属，若有), ...serviceCities]`；`serviceCities` 为空 → 显示"全城配送"。
- 文案 `messages.detail.*`（zh/en）：如 `notServiceable`、`viewServiceCities`、`serviceCitiesTitle`、`nationwide` 等。

## 多语言 / 多城市 / 四级回退对齐（C 端组合规则）

| 层级 | 本设计落点 |
|---|---|
| L1 令牌 | 警示色/主色用 `var(--ui-*)`；`nearby` 降级态文案样式走 `--ui-warning` 语义 |
| L2 页面配置 | `detailConfig.blocks` 新增 `gallery` 的 `videoAutoplay?: boolean`（默认 true）、就近 `visible` 沿用已有 `nearby` |
| L3 功能块 | `gallery.videoAutoplay` 可由块字段覆盖；折叠列表默认收起态可在块内传默认 |
| 兜底链 | `videoUrl` 空→纯图片；`serviceCities` 空→"全城配送"；就近失败→"暂不可查"降级 |
| 多语言 | 全部新增文案进 `messages.detail.*` i18n 字典（至少 zh-CN / en-US，其余走 fallbackLocale），后端可编辑文案沿用 `localizeText` 语义 |

## 复用与降本原则

- 零重写：图集仍用 `ProductGallery`（扩展而非替换）；就近块沿用 `NearbyStores`；城市判定复用 `useCityService`。
- 数据流不破：`useProductStore` 单一响应式，新增 `galleryAssets` 结构兼容纯图片场景。
- 图片仍走 `assetSrc` + 懒加载；视频 `preload="metadata"` 仅按需加载帧。
- 后端仅改 inventory-plugin 的匹配/定位两处，不动 schema 主流程。

## 测试与验收策略

| 层 | 手段 | 验收标准 |
|---|---|---|
| 后端 | inventory-plugin 单测（匹配函数） | 前缀/包含匹配正确；无 origin 返回干净空态 |
| 类型 | `pnpm typecheck` / 前端 codegen | `videoUrl` 进 fragment 并可选；无新增错误 |
| 组件 | 本地 `pnpm dev` + Playwright | 有视频商品首帧 video 渲染且自动播放；纯图片商品图集不回归；`galleryAssets` 空显示占位 |
| 就近兜底 | dev 连线上后端 | 无定位→"开启定位"；有定位无仓→"暂无可查"；有货→购买按钮不受就近失败影响 |
| 城市提示 | Playwright | 不可服务→警示+「可购买城市」展开列出城市；服务城市为空→"全城配送" |
| 回归 | 无 customFields.videoUrl / 无就近配置 / 全服务 | 各回退态与现状等价 |

**成功标准**：视频优先可播；主图/组图手机端不再空白；就近失败不再"有货又说无库存"，购买不被就近查询阻断；不可购城市有引导与可购城市查看；新增文案齐 i18n（zh/en）；无新增 typecheck 错误。

## 不在本次范围（后续迭代）

- Vendure Asset 原生视频资产/转码/多清晰度（本次用 `videoUrl` 直链降本）。
- 就近库存参与履约（自提/同城配送门禁）——本次保持纯展示，需要时再立项。
- 前台"可购买城市"选择器切换城市（本次仅查看+提示，切换走既有城市选择）。
- 其它页（首页/分类/订单）视频与城市增强（本规则后续复用同套模式）。

## 逐步实现（写入实现计划后细化为里程碑）

1. 后端 inventory-plugin：城市匹配统一 + 无定位干净空态 + 单测。
2. 前端 fragment/类型：补 `videoUrl`（商品+变体）+ codegen。
3. `useProductStore.galleryAssets` 重写为媒体数组（视频优先）。
4. `ProductGallery` 支持视频首帧渲染 + 空图集占位。
5. `useNearbyStock`/`NearbyStores` 四态 + 平滑降级。
6. `useCityService` 结构化结果 + 三版式「可购买城市」折叠入口。
7. i18n 词条补充（zh/en）。
8. 本地 dev + Playwright 全项验收 →（按部署铁律）本地构建后部署。