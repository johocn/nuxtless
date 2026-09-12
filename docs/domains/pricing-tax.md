# 价格/税档三态领域手册（Pricing & Tax）

> 入口指针：`project_memory.md`「后台商品价格一致性」「税率三态配置」「taxMode 三态改造」「跨渠道价格语义」速查卡 → 本手册。
> 覆盖：后端 vendure `packages/cjk-plugin`（渠道 customFields）、C 端 nshop `layers/base`、运营端 vshop `web-admin`。
> 权威蓝本：`docs/superpowers/specs/2026-09-13-domains-sso-login-design.md` §4.2。

## 1. 概念模型

| 概念 | 关键字段/函数 | 说明 |
|---|---|---|
| 后台价格一致性 | 后台 `price` 字段（元×100 存分） | 后台录入价格 = 商品计价依据：后台上录 200，就是 200（存分 20000）。**全渠道后台商品价格必须一致 = 录入原值**，禁止因税率对后台商品价格做任何再计算——不允许 200→226/113，不允许不同渠道后台价互相 ×/÷1.13，web-admin 保存商品时不得乘税率写库。后台 `price` 字段直存录入原值 |
| taxMode 三态 | `Channel.customFields.taxMode`（inclusive / zero / exclusive） | 后端 `taxEnabled`(布尔) 升级为三态字符串。运营端「店铺信息」页三态分段器「税率方式」设置，保存时通过 `myUpdateChannelCustomFields` 合并写入 |
| 前端取价 basis | 后台 `price` 字段（禁用 `priceWithTax`） | 前台计价来源统一取后台录入原值 P（`price` 字段）。**不可用 `priceWithTax`**：`priceWithTax` 会随渠道 `pricesIncludeTax` 解释漂移（false→P×1.13、true→P），作价困难 |
| 展示换算函数 | `displayCentsFromNet(P, mode)` | inclusive/zero 原样返回 P；exclusive 返回 P×1.13（价税分离，加收）。定义于 `utils/tax-price.ts` |
| 税额拆分函数 | `taxFromGross(总额, mode)` | inclusive 用 P（价内拆税，展示不加收）；exclusive 用 P×1.13（加收）；zero 返回 null（不显示税额行） |
| 渠道读取 | `useTaxMode` + `utils/tax-price.ts` | 复用 `GetChannelTheme` 查询（与 themeId/shopContent 同一请求，SSR 去重），兼容旧 `taxEnabled` 布尔（true→inclusive，false→zero） |

**三态展示/结算规则（basis = 后台录入原值 P）**：

- **inclusive（含税）**：展示 = P，应付 = P，税额 = 价内拆税 P − P/1.13（仅展示拆分，**不加收**）。
- **zero（零税）**：展示 = P，应付 = P，无税额行（`taxFromGross` 返回 null）。
- **exclusive（价税分离）**：商品页主价**显示含税价 P×1.13=226**，应付 = P×1.13=226，税额 = P×0.13=26（加收，应付 = 净价 + 税）。

**作用域分层（核心）**：
- **后台价格一致 = 硬性要求**：只约束「后台商品价格」这一层，全渠道必须一致（录入原值）。
- **前台差异化 = 允许**：前台展示价/结算价可各自按渠道税档（inclusive/zero/exclusive）做价税呈现，可各渠道不同；**此层不受「后台价格一致」规则约束**。前台换算**不写回**后台商品价格。

**渠道价字段解释差异（pricesIncludeTax）**：`__default_channel__`(id 1) = `pricesIncludeTax:false`（变体 `price` 字段**直接存净价**，C 端含税展示 = net×(1+13%)）；t2 等租户渠道 = `pricesIncludeTax:true`（`price` 字段**存含税价**，回读 net=price/1.13）。同一存储值由各渠道 `pricesIncludeTax` 解释出不同展示。

## 2. 文件地图（符号级，行号用 rg 现查）

### C 端 nshop `layers/base/`
| 文件 | 职责 | 关键符号 |
|---|---|---|
| `layers/base/app/utils/tax-price.ts` | 按渠道 taxMode 把运营端录入净价(分)换算成 C 端展示价(分)；SSR 友好纯计算，前后端协同同一口径 | `TaxMode` 类型（'inclusive'\|'zero'\|'exclusive'）、`TAX_RATE_PERCENT`（=13，当前生产默认税率）、`displayCentsFromNet(netCents, mode, ratePercent?)`（inclusive/zero 原样返回，exclusive 返回 net×(1+rate/100)）、`taxFromGross(grossCents, mode, ratePercent?)`（inclusive/exclusive 拆税额 gross−gross/(1+rate)，zero 返回 null） |
| `layers/base/app/composables/useTaxMode.ts` | 租户级税率方式三态 + 渠道价字段解释 | `useTaxMode()` → `{ taxMode, pricesIncludeTax }`；复用 `GetChannelTheme`（useAsyncGql，`{ server: true }`），兼容旧 `taxEnabled` 布尔 |
| `layers/base/app/utils/display-price.ts` | 商品卡片/列表对客价取数 | `pickDisplayPrice(item, mode, pricesIncludeTax)` —— **已知坑：直接返回 `priceWithTax` 是错的**（inclusive 会错显成 P×1.13=226），应改为以 `price` 为 basis 再按 taxMode 换算；另有 `displayCentsFromNet` 包装调用 |
| `layers/base/gql/queries/context.gql` | 渠道上下文查询 | `GetChannelTheme` **必须用 `taxMode`**（旧 `taxEnabled` 已从 schema 移除，留着会 GRAPHQL VALIDATION_FAILED） |
| `layers/base/app/components/checkout/OrderSummary.vue` | 结算页金额汇总 | `showTaxRow`（按 taxMode 显隐税款行）、`displayCentsFromNet(netGoods, "exclusive")`（exclusive 档应付 = 净商品额×1.13） |
| `layers/base/app/components/product`（含 ProductForm.vue 对应 C 端商品页） | 商品页主价展示 | 按 `useTaxMode` 三态出对客价（inclusive 展示 P / zero 展示 P / exclusive 展示 P×1.13） |

### 运营端 vshop `web-admin/`
| 文件 | 职责 | 关键符号 |
|---|---|---|
| `vshop/web-admin/scripts/calibrate-prices.mjs` | 存量商品价格校准脚本 | 内部**固定**按 `targetNet×factor(×1.13)` 写 price 输入——只对 `pricesIncludeTax=true` 的租户渠道（如 t2）正确；幂等 state 按 variantId 记录，跨渠道共用一份 |
| `vshop/web-admin/src/pages/shop/info/index.vue`（「店铺信息」页） | 渠道配置维护 | 三态分段器「税率方式」→ `taxMode`；保存经 `myUpdateChannelCustomFields` 合并写入**当前选中店铺渠道**（由 `vendure-token` 头决定） |
| `vshop/web-admin/src/.../ProductForm.vue` | 商品表单（价格/划线价/成本价录入） | 后台 `price` 字段直存录入原值；无规格（单品）提交前须把 `priceYuan`（元）×100 同步进默认变体行；**不得乘税率写库** |

## 3. 设计决策（ADR 式）

| 决策 | 理由 |
|---|---|
| 后台商品价格全渠道一致 = 录入原值直存，禁止税率再换算 | 用户最高优先级定稿：后台上录 200 就是 200（存分 20000）。旧写法 `fetchTaxRatePercent()+grossPriceFromNet()×1.13` 已被否决；`price` 字段是各渠道的计价锚点，换算会破坏一致性 |
| 后台一致 + 前台差异化 | 后台价格一致是硬性要求；前台展示/结算按渠道税档（inclusive/zero/exclusive）差异化呈现是允许的。两层面解耦，前端呈现由当前渠道税档决定 |
| 前台换算不写回后台 | C 端按渠道税档做的换算（如 exclusive 的 P×1.13）只在展示层发生，绝不回写 `price` 字段，防污染全局一致的原值 |
| 前端计价 basis 用 `price` 而非 `priceWithTax` | `priceWithTax` 随渠道 `pricesIncludeTax` 解释漂移（false→P×1.13、true→P），作价困难；`price` 是稳定的录入原值 |
| `taxMode` 三态替代 `taxEnabled` 布尔 | 布尔只能表达「有无税」，无法表达「价内含税 / 价税分离」两种含税模式的差异；三态字符串（inclusive/zero/exclusive）由后端 customFields 承载 |
| `displayCentsFromNet` 为 SSR 友好纯函数 | 同一口径在 SSR 与客户端复用，避免服务端渲染与客户端水合价格不一致 |
| `pickDisplayPrice` 应改以 `price` 为 basis | 当前直接返回 `priceWithTax`，inclusive 档会错显成 P×1.13(226)；应改为 `displayCentsFromNet(price, mode)`（待修，见 Bug 库） |

## 4. 常见坑

| 现象 | 根因 | 解法 |
|---|---|---|
| 默认渠道执行 calibrate-prices.mjs `--set` 写 price=22600（应 20000） | **校准口径相反**：默认渠道 `pricesIncludeTax=false`（price 直存净价，校准应直接写 price=目标净价）；t2 渠道 `pricesIncludeTax=true`（price 存含税价，校准应写 price=目标净价×1.13）。脚本内部固定 ×1.13 只对 t2 类正确 | **默认渠道校准须绕过脚本**直接写 `price=目标净价`（实测变体58 默认渠道 price=20000→net20000/withTax22600 正确） |
| 校准脚本重复校准/重复放大 | 幂等 state 文件按 variantId 记录，但跨渠道共用一份 state，渠道间切换容易误判 | 校准前核对 state 文件内容；不同渠道校准分开记录目标 |
| 共享变体在任一渠道 `updateProductVariants` 写 price，两侧同时被改，无法按渠道独立存值 | **共享变体单源价格**：默认渠道 `assignProductVariantsToChannel` 共享的变体只有一个存储值，由各渠道 `pricesIncludeTax` 解释出不同展示；无法同时让两渠道都显示同一 ¥200 | 接受单源共享语义；后台 price 一律直存录入原值（不再按任何渠道做 ×1.13），前台差异由各渠道税档在前台层呈现 |
| `GetChannelTheme` 用旧 `taxEnabled` → GRAPHQL VALIDATION_FAILED → useAsyncData 空 → 回退 inclusive → 结算页错显税款行 | `taxEnabled` 已从 schema 移除（升级为 `taxMode`），死字段触发校验失败 | 改用 `taxMode`；改 schema 字段后本地 `graphql.schema.json`（gitignored，codegen schema 源，更新滞后）须 `node tmp-refresh-schema.mjs` 从生产 shop-api 重拉 introspection |
| 本地 graphql.schema.json 滞后导致 codegen 出旧类型 | introspection 未重拉 | `node tmp-refresh-schema.mjs`；注意 shop-api introspection 只含 shop 端字段，**不含仅存在于 admin-api 的字段**（如 redemption*），`layers/base/gql/queries/AdminRedemption.gql` 这类死 gql 应删除 |
| 单独将渠道 `pricesIncludeTax` 改为 true → C 端展示价隐性降低 13% | 渠道 `pricesIncludeTax` 单独翻转，Vendure 对 `price` 字段的解释随之翻转（false→net、true→gross），同一存储值展示变低 | 勿单独改 `pricesIncludeTax`，需配合 C 端取价逻辑（taxMode 三态）改造后才能动 |
| web-admin「店铺信息」保存后前台 www.youshop.cn 不生效 | **渠道配置错位/错写**：保存写入的是**当前选中店铺渠道**（由 `vendure-token` 头决定），而前台解析的是 `__default_channel__`(id=1) 渠道；两者不一致则配置修改后前台不生效 | 保存前核对当前渠道 token；改配置前先 `channels{items{id code}}` 查真实渠道 id（t2=37、__default_channel__=1），勿臆测 |

## 5. 问题速查（Bug 知识库）

| 现象 | 根因 | 代码点 | 验证 |
|---|---|---|---|
| 默认渠道校准把净价再放大（写 22600 非 20000），得到校准前状态 | 校准口径相反：默认渠道 `pricesIncludeTax=false` price 直存净价，脚本固定 ×1.13 只对 t2 类（true）正确 | `vshop/web-admin/scripts/calibrate-prices.mjs` | 默认渠道绕过脚本直接写 price=目标净价后查库/查 API |
| 商品页显示价格与结算应付金额不一致（商品页 ¥200，结算应付 ¥226） | `__default_channel__`(id 1) 与 `test-marketplace-shop`(id 29) 存在 `pricesIncludeTax=false` 与 `taxMode=inclusive` 配置错位 | `layers/base/gql/queries/context.gql` `GetChannelTheme` / `composables/useTaxMode.ts` | 结算页三态显隐检查 + 对账两渠道 pricesIncludeTax 与 taxMode |
| 结算页错显税款行（zero 档仍显示税款） | `GetChannelTheme` 用旧 `taxEnabled`（已从 schema 移除）→ GRAPHQL VALIDATION_FAILED → useAsyncData 空 → 回退 inclusive → 错显税款行 | `layers/base/gql/queries/context.gql`、`composables/useTaxMode.ts` 回退分支 | `node tmp-refresh-schema.mjs` 重拉 introspection 后 `rg -n taxMode context.gql` |
| 变体 58 默认渠道校准状态异常 | 走脚本固定 ×1.13 会把净价再放大；正确做法：默认渠道直接写 price=20000（pricesIncludeTax=false，price 直存净价） | `vshop/web-admin/scripts/calibrate-prices.mjs` + 幂等 state 文件（按 variantId，跨渠道共用一份） | 查变体58 默认渠道：price=20000 → net20000/withTax22600 为正确态 |
| 店铺信息配置修改后前台不生效 | 保存写入当前选中店铺渠道（`vendure-token` 头决定），前台解析 `__default_channel__`(id=1)，两渠道不一致 | web-admin「店铺信息」页 `myUpdateChannelCustomFields` | 核对 vendure-token 渠道 vs 目标渠道；改后查 `activeChannel{ customFields{ taxMode } }` |

## 6. 验证脚本清单

| 脚本/手段 | 用途 | 运行方式 |
|---|---|---|
| `vshop/web-admin/scripts/calibrate-prices.mjs` | 存量商品价格校准（**仅限 t2 等 `pricesIncludeTax=true` 渠道**；注意幂等 state 文件按 variantId 跨渠道共用；**默认渠道校准须绕过脚本**直接写 price=目标净价） | `node scripts/calibrate-prices.mjs --set <variantId> <目标净价> ...`（参数以脚本实际用法为准） |
| `vshop/web-admin/scripts/_final_calibrate_t2.py` | t2 渠道最终校准辅助脚本 | `python scripts/_final_calibrate_t2.py` |
| 结算页税额行三态显隐检查 | 按渠道 taxMode 验证结算页 `showTaxRow`：inclusive 单列税额 / zero 不列 / exclusive 单列且应付=P×1.13 | C 端结算页 + `rg -n showTaxRow layers/base/app/components/checkout/OrderSummary.vue` |
| `tmp/refresh-schema.mjs`（`tmp-refresh-schema.mjs`） | 从生产 shop-api 重拉 introspection 刷新本地 `graphql.schema.json`（改 schema 字段后必跑） | `node tmp-refresh-schema.mjs`（目录以实际位置为准） |
| 渠道配置核对 | `activeChannel{ pricesIncludeTax customFields{ taxMode } }` + `channels{items{id code pricesIncludeTax}}`，防配置错位（false 配 inclusive） | admin-api GraphQL 查询 |

## 7. 历史文档索引

**设计/实现**：
- `docs/superpowers/specs/2026-09-13-domains-sso-login-design.md` — 领域手册总设计，**§4.2 为本手册权威蓝本**（价格/税档三态：概念、坑、验证）
- `docs/superpowers/specs/2026-09-12-domain-knowledge-design.md` + `plans/2026-09-12-domain-knowledge.md` — 领域知识机制本身（三层架构 + 四件套）

**project_memory 速查段落（`c:\Users\lenovo\.trae-cn\memory\projects\-d-zhao--p2-cd6bb1a37c153a452cb2\project_memory.md`）**：
- 「后台商品价格一致性」段落（Engineering Conventions）— 录入原值直存、全渠道一致、禁止税率再换算、后台一致 + 前台差异化
- 「税率三态配置」「结算环节税率展示规则」「C端取价」段落 — 三态分段器写入 `myUpdateChannelCustomFields`；结算页按 taxMode 单列/不列税额
- 「前端三档展示/结算/税额定稿」段落 — basis=后台录入原值 P、禁用 `priceWithTax`、`displayCentsFromNet`/`taxFromGross` 语义、`pickDisplayPrice` 已知坑
- 「价格/划线价/成本价录入口径」段落（Lessons Learned）— 旧写法 `fetchTaxRatePercent()+grossPriceFromNet()` 被否决
- 「多渠道 price 语义差异 + 校准脚本坑」段落 — 默认渠道 vs t2 校准口径相反、幂等 state、共享变体单源价格
- 「taxMode 三态改造」段落 — 上线完成、`GetChannelTheme` 用 `taxMode`、graphql.schema.json 滞后、死 gql 删除
- 「渠道配置错位」「单独修改 pricesIncludeTax 风险」「渠道配置保存与前台展示不一致」段落 — 三处渠道配置相关坑

**关联手册**：
- `docs/domains/cross-channel-variants.md` — 跨渠道商品变体分配/双轨隔离/上架迁移（变体 Channel 归属、`assignProductVariantsToChannel`、共享变体单源价格语义的姊妹篇）
- `docs/domains/shipping-profile.md` / `docs/domains/checkout.md` — 结算页相关领域（与结算页税额行渲染互引）
- `docs/domains/README.md` — 7 章模板规范
