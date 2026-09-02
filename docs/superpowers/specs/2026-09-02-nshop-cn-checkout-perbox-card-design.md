# NShop C 端「逐箱卡片结算」前端版式重构设计

> 关联 repo：`d:\zhao\nshop`（C 端 Nuxt）
> 依据：`2026-09-02-nshop-cn-per-box-checkout-design.md`（逐箱结算设计定稿）
> 状态：定稿（含优惠券切换 / 支付交集 / 商品行预留槽位实现细节）
> 日期：2026-09-02

## 1. 背景与目标

- 现状：`CheckoutLayoutJd.vue` 是**薄装配**——按 `hasDeliveryBox/hasPickupBox` 两级拼 `BoxDeliveryBlock / AddressBlock / BoxPickupBlock / PaymentBlock / PerBoxSummary`。商品明细是**只读列表**（无整箱勾选/部分选择/数量步进/删除），物流块/地址块/自提块**平铺分开**，未实现设计定稿 §2-§3 的「每箱一张卡」与行级结算。
- 目标：把结账前端重构为**统一逐箱卡片渲染**，cn/jd 两版式共用同一渲染器，落地设计定稿逐箱卡片 + 整箱/部分选择 + 切换（地址/联系人/自提点）+ 底部订单汇总 + 回流。

## 2. 范围与前置决策（已拍板）

| 决策点 | 结论 |
|---|---|
| 实现方案 | 方案 A：提取统一 `CheckoutPerBoxList` 逐箱渲染器，cn/jd 仅作外层容器 |
| 默认版式与回退 | 新版逐箱为默认；当前 `CheckoutLayoutJd` 原样另存为 `CheckoutLayoutJdLegacy` 回退槽 |
| 作用范围 | cn / jd 共用同一逐箱渲染，逻辑单一可信 |
| 地址模型 | 共享为主 + 逐箱可选 |
| 优惠券 | **整单一券**（沿用 `applyCouponToOrder`，不做逐箱多券）|

## 3. 组件架构（方案 A）

新增：
- `CheckoutPerBoxList.vue` —— 唯一逐箱渲染路径。从 `orderStore.orderBoxes` 取箱，按「租户分区 → 档案分箱」渲染卡片，承载整箱/行级选择状态（委派给 `usePerBoxSelection`），并汇总传给提交。
- `BoxShippingMethod.vue` —— 物流箱内配送方式单选（源自 `BoxDeliveryBlock` 拆分）。
- `BoxAddress.vue` —— 物流箱内收货地址（共享为主 + 逐箱可选）。
- `BoxPickup.vue` —— 自提箱内自提点单选 + 联系块（源自 `BoxPickupBlock`/`CheckoutPickupContactBlock`）。
- `BoxLines.vue` —— 商品行明细（箱头勾选 + 行勾选 + 数量步进 + 删除 + 行小计）。
- `usePerBoxSelection.ts` —— 选择状态 `selected: Record<boxKey, Record<lineId, qty>>`；派生实时汇总/箱小计/件数。
- `CheckoutLayoutJdLegacy.vue` —— 当前 `CheckoutLayoutJd.vue` 的副本（回退），原文件不可复用索引旧名。

调整：
- `CheckoutLayoutCn.vue` / `CheckoutLayoutJd.vue` → 外层容器内联 `CheckoutPerBoxList`（cn 保留顶部横幅等容器差异化）。
- `CheckoutRenderer.vue` → `checkoutConfig.layout` 映射：默认新逐箱 `jd`/`cn`；`jd-legacy` 指向旧副本。
- `useCheckoutFlow.ts` / `useOrderStore.ts` → 提交接入整箱/行级选择 + 回流。

复用（不重写）：`AddressPicker` / `AddressList` / `AddressFormModal` / `AmapRegionSelect` / `PickupLocationSelect` / `CheckoutPickupContactBlock` / `useCoupon` / `PaymentBlock` / `OrderSummary` / `PerBoxSummary` / `CheckoutCnPromoDrawer`。

## 4. 逐箱卡片结构（对齐设计 §2）

每箱一张卡（移动端纵向堆叠）：
- **箱头**：整箱勾选（默认全选该箱所有行）+ 配送档案名 + 副标题「租户名 · 档案类型(物流/自提)」。
- **物流箱**：地址块（`BoxAddress`）→ 配送方式单选（`BoxShippingMethod`）→ 商品行（`BoxLines`）。
- **自提箱**：自提点选中（近选，`PickupLocationSelect`）→ 联系块（需联系时，姓名+电话）→ 商品行。
- **箱尾**：本箱可用券（整单一券下为展示性切换）→ 运费（含折扣）与本箱小计（含税口径，随已选项实时刷新）。

## 5. 商品行交互（§3）

- **整箱全选**：箱头勾选 = 该箱所有行全选/反选。
- **部分选择**：每行独立勾选框，可只结算部分商品。
- **数量步进**：每行 `− 数量 ＋`（可加可减）。
- **删除**：每行「删除」移除该行（防错兜底）。
- 边界：数量不得减到 0（禁用减号）；某种商品不可拆分时行内仅允许全选该行。
- 汇总、箱小计、件数、券、运费**实时按已选项计算刷新**。

## 5a. 商品行字段与预留槽位

`BoxLines` 每行按「勾选｜图片｜名称+规格名+SKU｜单价｜数量步进｜行小计｜删除」布局：

| 槽位 | 来源字段 | 现状 | 后端需求 |
|---|---|---|---|
| 勾选框 | —— | —— | —— |
| 商品图片 | `featureAsset.source`（Vendure `orderLine.featuredAsset`） | ❌ lines 未下发 | **需增补** |
| 名称 | `productName` | ✅ | —— |
| 规格名 | `variantName`（`orderLine.productVariant.name`，多为 颜色·容量 等规格组合） | ❌ lines 未下发 | **需增补** |
| SKU | `sku` | ❌ 未下发 | 需增补（可空） |
| 单价 | `unitPrice`（含税，分） | ✅ | —— |
| 数量 | `quantity` | ✅ | —— |
| 行小计 | `lineTotal`（含税，随已选项不需要改，仅展示该行整额） | ✅ | —— |
| 删除 | —— | —— | —— |

> 前端按新字段渲染；缺失时示意图占位（`featureAsset` 为空显灰块、`variantName` 为空只显名称），以保证旧数据/未部署新后端时页面不破版。
> 商品行小计展示该行 `lineTotal`；勾选后本轮可用原 `lineTotal`（行级不拆份），整箱/汇总按「被选行」求和——前端本地计算，不需后端重算每行。

## 6. 多租户 × 多档案分组（§1）

- `CheckoutPerBoxList` 按 `tenantId` 分区：每个租户一个**区块头**（商户名），区内并列该商户各配送箱卡。
- 跨租户同档案仍各成卡（`orderBoxes` 已保证零交集）。
- 汇总区再按商户分账。

## 7. 支付方式：交集 + 三态（§7）

实现细节（全局支付区）：
- 输入 = 被选箱的 `availablePaymentMethodCodes` 白名单集合；`intersection = ∩(所有被选箱白名单)`。
- **交集非空** → 显示交集内方式，提示「将合并为 1 单支付」；任选 → 合并 1 单统一收款，实收按商户分账。
- **交集为空** → 顶部红条「各箱支付方式不同，将分箱支付」；支付区改为**按箱分组、箱内单选互斥**：
  - **每箱一个独立分组**，分组头=对应订单「单 N/总计 · 本箱金额 ¥X」，组内为该箱可用方式的**单选**（一次仅一个选中，箱间互不影响）。
  - **唯一方式自动锁定**：某箱白名单仅一种时，该方式灰盘锁死 + 标注「该箱唯一方式 · 自动锁定」，不可改、无歧义。
  - 每箱卡片内呼应「本单由 XXX 支付」。
  - 提交按箱拆单（每箱一单各自支付）；底部**分单对照**：逐单列出「单N 箱名 ¥额 → 方式」，合计 + 拆单数。
  - **严禁**把各箱方式放进同一列表并同时多打勾（歧义）。
- **余额特例**：① 选择「余额」且共享钱包充足，且所有被选箱白名单支持余额 → 合并 1 单共享钱包扣；② 钱包不足 → 余额选项禁用 + 提示「余额不足，分箱支付」。
- **不放合并/分箱开关**，系统自动判定；判定与提交复用后端 `decideAggregation`（`boxKeys`/`lineIds` 局部结算已上线）。

示例：盒A{微信,支付宝} 盒B{支付宝,货到付款} 盒C{货到付款}：
- 选 A+B → ∩={支付宝} → 合并 1 单付支付宝；
- 全选 A+B+C → ∩=∅ → 红条 + 三箱各自支付、按箱拆单。

## 8. 优惠券（整单一券）

实现细节：
- **机制不变**：沿用 `applyCouponToOrder(code)` / `clearCouponFromOrder()`（一单一券、作用于整个活动订单）。**不实现逐箱多券**。
- **UI**：每张卡内「优惠券」行显示 当前已用券 / 未使用；点击展开**券选择抽屉**（弹层）：
  - 列表 = 该店可用我持有的券（`box.availableCoupons` ∩ `useCoupon().getMyCoupons(UNUSED)`），逐项含 券名 / 金额(满X减Y或折扣) / 状态(可用/已过期置灰)。
  - 选中 → `applyCouponToOrder(code)`（**整单一券**，替换旧券）→ 整单重算 → 回填各箱卡「已用：-¥N」+ toast「已使用优惠券，优惠¥N」。
  - 换券 → 先 `clearCouponFromOrder()` 清旧，再 `applyCouponToOrder(新code)`。
  - 取消 → `clearCouponFromOrder()`。
- 折扣仅作用于该券归属店商品行（既有 COUPON_SCOPE 逻辑）；券不可叠加，一单最多一券。

## 9. 收货地址（§4，共享为主 + 逐箱可选）

- 物流卡地址区显示「收货人 电话 · 省市区+详细+邮编」。
- **切换** → 复用 `AddressPicker`（租户级地址簿 `AddressList`）：**默认地址置顶 + 待选**；「新增地址」→ `AddressFormModal`（含 `AmapRegionSelect` 省市区级联；国家随语言 zh→CN/en→US；company/streetLine2 选填；**邮编物流必填**；`streetLine1`+`country` 为后端硬必填）。
- 默认物流箱**共享同一地址**；逐箱可选独立地址（京东→家、顺丰→公司）。
- 条数 > 10 分页（每页 5）。
- 邮箱属 `Customer.emailAddress`（客户级，不入地址）；收货人用 `fullName` 单一字段。

## 10. 自提联系人（§5）

- 需联系的自提卡显示「姓名 电话」。
- **切换** → **联系人簿**（默认 + 待选，CRUD，>10 每页 5）；新增表单仅**姓名+电话**（无邮箱、独立于地址存储）。
- 联系人 = 收货人；仅自提需联系方式时出现。

## 11. 自提点（§6）

- 自提卡显示当前自提点（缺省近选：有定位按距离最近预选；无定位默认所选箱的首个可用项并提示开启定位）。
- **切换** → `PickupLocationSelect`（按距离排序；有无定位双模式）。

## 12. 底部订单汇总（§8）

底部「订单汇总」区块，自上而下：
- **逐箱小计列表**：每箱拆到 商品 → 运费 → 券 三行 + 本箱小计。
- **按商户分账汇总**：每家商户一行的分账金额（复用 `PerBoxSummary`）。
- **应付款总额**：商品合计(件数) + 运费合计 − 优惠券合计 + 税额 = 应付款（合并单取 `totalWithTax`）。拆单时按各订单分项展示。

## 13. 回流（§15.2）

- 提交的是「所选 boxKey + 所选 lineIds」。
- 结算**成功后**，被排除的未选行按 `(variantId, qty)` `AddItemToOrder` 加回活动购物车（幂等）；toast「剩余 N 件未结算，已放回购物车」。
- 结算**失败**则不做任何移除（保持 activeOrder 原状），防丢单。

## 14. 回退机制

- `checkoutConfig.layout`：`jd`(新逐箱) 为默认；`cn` 也用逐箱渲染；`jd-legacy` 保留旧薄装配。
- 部署后可用后台配置切换 `jd` / `cn` / `jd-legacy`，保证回退不出错。

## 15. 数据流与提交

- 选择状态存 `usePerBoxSelection`；提交聚合为 `{selectedBoxes:[{boxKey, lineIds}]}` 经 `checkoutSplitted(method, metadata)` 下发。
- **`$bk`/`$li` 必须声明 `[String!]!`**（非数字 boxKey 不可走 ID 型，否则 Vendure 强转失败）——沿用既有教训。
- 支付合并/拆单与分账逻辑复用后端已定稿实现（`decideAggregation` / `merchantSplit` / `MerchantSettlementLedger`）。

## 16. 错误与边界（§11/§13）

- 数量不可 0；整箱为主 + 部分兜底；空选中阻止提交 + toast。
- 交集空顶部红条；余额不足禁用。
- 地址/联系人 > 10 分页（每页 5）。
- 无定位手选省市区；country 先填后校验；city 用 adcode 比对、空值不覆盖、提交回退（既有 B2 修复沿用）。

## 17. 多语言（i18n）

- 所有固定文案走 i18n 字典，**zh-CN / en-US 同步补齐**（缺 key 会裸显 `messages.checkout.xxx`）。
- 券名/档案名等多语言经既有 `localizeText` + `VENDURE_LOCALE_MAP`（zh-CN→zh_Hans）。

## 18. 后端配合

- **券**：沿用 `applyCouponToOrder`（整单一券），**无后端改造**。
- **`checkoutSplitted`**：已支持 `boxKeys`/`lineIds` 局部结算（Phase A 已上线）——前端按 selectedBoxes 传参即可，无需后端新增。
- **`GetOrderBoxes().lines` 增补字段（本次唯一后端改动）**：物流/自提箱的商品行需增补 `featureAsset { source }`（图）、`variantName`（规格名，映射 `orderLine.productVariant.name`）、`sku`（可空），供 `BoxLines` 预留图片/规格名/SKU 槽位。改后端 `cjk-plugin` order-box-aggregation，重新生成 `lib/` 提交，服务器 git pull + pm2 restart。

## 19. 测试与交付（硬性）

- 功能交付 = 实现 + AP 接口回归 + **手机视口截图**（390×844, dpr=2）+ 操作手册章节补充。
- 覆盖场景：单箱、多箱、多商家多档案、交集空、余额不足、整箱/部分选择、数量步进/删除、回流、地址簿 CRUD+分页、联系人 CRUD+分页、city 修复回归、jd-legacy 回退。
- `npm run typecheck`：本次涉及文件零新增错误（忽略既有基线）。

## 20. 明确不做（Roadmap）

- 逐箱多券（整单一券为本次定稿）。
- 通道级分账、代销库存台账（既有 Roadmap，非本期）。

## 21. 待实施清单（交付 writing-plans）

① 后端 `GetOrderBoxes().lines` 增补 `featureAsset/variantName/sku` + 重出 lib 部署；
② `usePerBoxSelection.ts`；③ `BoxLines / BoxShippingMethod / BoxAddress / BoxPickup`；④ `CheckoutPerBoxList.vue`（分组渲染 + 卡片装配）；⑤ cn/jd 外层容器改造；⑥ `CheckoutLayoutJdLegacy.vue` 回退；⑦ `useCheckoutFlow` 提交 + 回流；⑧ 底部订单汇总；⑨ i18n 双语言补全；⑩ 手机截图 + 操作手册。