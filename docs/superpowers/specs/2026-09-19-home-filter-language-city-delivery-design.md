# 首页商品/分类/促销按「语言·城市·配送」过滤 设计文档

- 日期：2026-09-19
- 状态：已确认（用户拍板方案 B：Nuxt SSR 后置过滤）
- 范围：首页商品/分类/促销模块（含 GoodsFloor / JdProductGrid / GoodsMasonryGrid / GoodsSingleList / 首页兜底楼层）
- 需求一句话：不满足「当前语言 / 当前城市 / 配送方式」条件的商品不展示。例：仅长春自提的商品北京不可见，邮寄全国可见；中文商品英文环境不可见。

## 1. 背景与目标

### 1.1 需求原文
首页的商品、分类、促销模块增加过滤条件：按「语言」「城市」「配送方式」过滤。不满足条件的商品不展示：
- 仅「长春自提」的商品，北京不应该看见；支持邮寄的北京可见。
- 中文商品，英文环境看不见。

### 1.2 已拍板的决策（对话确认）
1. **触发方式 = C1**：城市、语言按用户当前上下文**自动**过滤；配送方式提供**显式切换**入口。
2. **数据模型 = A**：复用现有字段 `customFields.serviceCities`（该商品可服务的城市列表，空=全国可寄）与 `customFields.belongCity`（归属地/自提城市）。语言维度 = 同商品多翻译（Vendure 原生多语言，不新增实体）。
3. **配送切换 = A（真过滤）**：切「自提」→ 只显示当前城市可自提商品；切「邮寄」→ 只显示可邮寄商品。
4. **默认行为**：① 用户首次进入/城市未授权 → 按「邮寄/全国可看」放行，避免空首页；② 分类、促销模块**同样套用**语言+城市自动过滤（规则统一）。
5. **配送控制粒度 = 每个商品模块各自控制**（非全局一刀切）：每个商品模块有独立「自提/邮寄」选择，只作用于该模块。
6. **服务端过滤方案 = B（Nuxt SSR 后置过滤）**：查询仍走现有 `SearchProducts`+`GetProductsByIds` 取全量（补 `serviceCities`/`belongCity` 字段），在 **Nuxt 服务端层**过滤后，只把「可见商品」写进 HTML/payload。不改 Vendure 后端。

### 1.3 性能要求（用户明确关心）
新设计对网页加载速度的影响要小。见 §5 性能评估。

## 2. 过滤语义（核心纯函数）

所有判定收敛为**纯函数**，SSR 与客户端复用同一实现（SSR 后置过滤 + 客户端模块内切换复用）。

### 2.1 语言维度 —— 不过滤
- 同商品多翻译，由后端 `Accept-Language` / `languageCode` 返回对应语言文案，商品实体不变。
- 零过滤成本；语言缺失回退链沿用现有 `localizeText()`（当前 locale → defaultLocale → 首个值 → 占位）。

### 2.2 城市维度 —— 自动（SSR）
商品对城市 X 可见 ⟺ `canMailTo(X) || canPickupAt(X)`

- `canMailTo(X)` = `serviceCities` 为空（全国可寄）**或** `serviceCities` 含 X。
- `canPickupAt(X)` = 商品支持自提 且 `belongCity === X`。
- **城市未授权（默认①）**：视作「邮寄/全国可看」，放行所有 `canMailTo` 商品（不空首页）。

### 2.3 配送维度 —— 显式切换（模块级，SSR 初筛 + 客户端切换）
- 新增模块级配送状态 `useModuleDelivery(moduleId)`：`SELF_PICKUP` / `MAIL`，localStorage 持久化，每模块独立。
- `MAIL`：只显示 `canMailTo(当前城市)` 的商品。
- `SELF_PICKUP`：只显示 `canPickupAt(当前城市)` 的商品（`belongCity===当前城市` 且支持自提）。
- 未切换/城市未知：按 2.2 城市自动规则放行（等价 MAIL）。

### 2.4 判定函数签名（草案）
> **模型补强（已拍板）**：现有字段无法表达「自提 vs 邮寄」——`serviceCities` 空=「全城可售」（非「个人只可邮寄」），与 useCityService 现有语义冲突。故 **Product customFields 新增可多选数组 `deliveryMethods: ["MAIL","SELF_PICKUP"]`**（空=默认两者都支持；只含 `SELF_PICKUP`=仅自提）。字段在前端 fragment 需补查、后端需注册+旧数据兜底为空=两者&全城可售。

```ts
type DeliveryMethod = "MAIL" | "SELF_PICKUP";
type VisibilityCtx = {
  city: string | null;              // 当前城市；null=未授权
  delivery: DeliveryMethod;         // 模块级配送选择
};
function isProductVisible(p: ProductLike, ctx: VisibilityCtx): boolean {
  const cf = p.customFields ?? {};
  const serviceCities: string[] = cf.serviceCities ?? [];
  const belongCity: string = cf.belongCity ?? "";
  const methods: DeliveryMethod[] = cf.deliveryMethods ?? ["MAIL", "SELF_PICKUP"];
  const isMail = methods.includes("MAIL");
  const isPickup = methods.includes("SELF_PICKUP");
  // 可寄到 X：serviceCities 空(=全城) 或 含 X；城市未知放行
  const canMail = isMail && (!ctx.city || !serviceCities.length || serviceCities.includes(ctx.city));
  // 可自提于 X：belongCity===X；城市未知无法判定
  const canPickup = isPickup && !!belongCity && ctx.city === belongCity;
  return ctx.delivery === "SELF_PICKUP" ? canPickup : canMail;
}
```
> **边界**：城市未知（null）+ 切「自提」→ `canPickup` 恒 false（无法判定自提归属），该模块显示空态「请先选择城市」，语义合理无歧义。

## 3. 数据流与接入点

### 3.1 查询补字段
- `SearchProducts` / `GetProductsByIds` 查询补上 `customFields { serviceCities belongCity deliveryMethods }`（每商品几字节）。
- 现有路径：`app/pages/index.vue`（首页兜底楼层）、`layers/base/app/composables/useHomeContent.ts`、`layers/base/app/components/home/blocks/GoodsFloor.vue` 均按此补齐。

### 3.0 前置：后端新增 `deliveryMethods` 字段（跨仓库）
- `belongCity/serviceCities` 的注册在**独立的 Vendure 后端仓库**（不在 nshop），nshop 仅读生成类型。
- 新增可多选数组 `deliveryMethods` 到 Product customFields：→ 后端插件注册 → 前端 **codegen 重生成 GQL 类型** → 旧数据兜底为空（视为 MAIL+SELF_PICKUP & 全城可售）。

### 3.2 SSR 后置过滤点（方案 B 核心）
- 数据补齐（`GetProductsByIds` 拿到 customFields）之后、渲染之前，逐商品跑 `isProductVisible` 过滤。
- 过滤后结果写进 SSR HTML / payload，**客户端只见可见商品**（客户端负载变小）。

### 3.3 配送切换（客户端）
- 模块内「自提/邮寄」切换：在模块内对已下发的可见商品**即时客户端过滤**（零网络）。
- 切换后空态处理：见 §4。

### 3.4 城市来源
- 首页 SSR 城市从 **cookie** 读取（与现有 locationStore 持久化一致；cookie 方案实现简单、SSR 可同步）。
- 客户端城市变更时同步写 cookie，刷新/SSR 生效。

## 4. 边界与默认

| 场景 | 行为 |
|------|------|
| 城市未授权 | 按邮寄/全国放行（默认①） |
| 配送切换 | 模块级独立，localStorage 持久化，刷新保留 |
| 过滤后为空 | 显示空态「当前城市/配送无可用商品」，不显示空格 |
| SSR 防闪烁 | cookie 读到城市则 SSR 过滤；读不到则 SSR 全量、hydration 后客户端按城市隐藏（当前商品量小，闪烁可忽略） |
| 默认配送 | 每个模块首次加载默认「MAIL」 |

## 5. 性能评估（方案 B）

- **首屏请求不变**：仍是一次 SSR 请求，无额外网络往返。
- **首屏 payload 变小**：SSR 只把可见商品写进 HTML/payload，隐藏商品不进客户端 → 客户端下载/解析/内存均减小（净收益）。
- **配送切换**：模块内纯客户端即时过滤，零网络。
- **查询开销**：仅多带 `serviceCities`/`belongCity` 两个字段（几字节/商品），可忽略。
- **结论**：对网页加载速度**净收益**，无新增开销；较方案一（客户端过滤）还少了隐藏商品的数据传输。

## 6. 模块接入范围

| 模块 | 接入 |
|------|------|
| 首页兜底商品楼层（index.vue） | SSR 过滤 + 模块切换 |
| GoodsFloor（collectionId 商品区块） | SSR 过滤 + 模块切换 |
| JdProductGrid | SSR 过滤 + 模块切换 |
| GoodsMasonryGrid | SSR 过滤 + 模块切换 |
| GoodsSingleList | SSR 过滤 + 模块切换 |
| 促销绑定商品推荐位 | SSR 套同一判定 |
| 纯 banner 轮播（publishedContent 图片+URL） | **全显**（无商品维度，不误伤） |

## 7. 测试（硬规范）

1. **纯函数单测**：
   - 长春自提-only 商品：北京隐藏、长春显示。
   - 邮寄全国（serviceCities 空）：任何城市可见。
   - `serviceCities` 含 X：仅 X 可见。
   - `SELF_PICKUP` 切换：邮寄-only 商品消失，自提-only 出现。
2. **Playwright 移动视口（390×844）手机截图**：
   - 北京城市下自提-only 商品不出现。
   - 切「自提」→ 邮寄-only 商品消失。
   - 切英文语言 → 显示翻译文案。
3. 截图补充到操作手册。

## 8. 实施边界（YAGNI）

- 不做 Vendure 搜索层过滤（方案 A）、不做后端专用接口（方案 C）。
- 不做 banner 按城市/语言出图（可选扩展，本次不进）。
- 不做「虚拟/服务类商品白名单」（`customFields.eligible`）——当前所有商品默认参与过滤；如后续需要再扩展。
- 不做服务端分页过滤的深度翻页（首页当前一次性取全量场景足够）。
