# NShop C 端「逐箱卡片结算」前端版式重构设计

> 关联 repo：`d:\zhao\nshop`（C 端 Nuxt）
> 依据：`2026-09-02-nshop-cn-per-box-checkout-design.md`（逐箱结算设计定稿）
> 状态：待审阅
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

## 6. 多租户 × 多档案分组（§1）

- `CheckoutPerBoxList` 按 `tenantId` 分区：每个租户一个**区块头**（商户名），区内并列该商户各配送箱卡。
- 跨租户同档案仍各成卡（`orderBoxes` 已保证零交集）。
- 汇总区再按商户分账。

## 7. 支付方式：交集 + 三态（§7）

- 支付区（全局）计算**被选箱白名单交集**。
- **交集非空** → 显示交集内方式，提示「将合并为 1 单支付」；任选 → 合并 1 单统一收款，实收按商户分账。
- **交集为空** → 顶部红条「各箱支付方式不同，将分箱支付」；支付区按箱列出各自唯一方式，提交按箱拆单。
- **余额**：共享钱包充足可选合并；不足 → 禁用 + 「余额不足，分箱支付」。
- **不放合并/分箱开关**，系统自动判定。

## 8. 优惠券（整单一券）

- **约束**：沿用 `applyCouponToOrder`/`clearCouponFromOrder`（一单一券、作用于整个活动订单）。**不实现逐箱多券**。
- **UI**：每张卡内「优惠券」行显示当前已用券/未用，点开展开该店可用券（`box.availableCoupons` ∩ `useCoupon().getMyCoupons(UNUSED)`）。任一箱内选中即 `applyCouponToOrder(code)`（替换整单一券）；切换/清除调用 `clearCouponFromOrder`。折扣仅作用于该券归属店商品行（既有 COUPON_SCOPE 逻辑）。
- 提示：一单最多一券；换券前清除旧券。toast 展示券抵扣。

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

- 券：沿用 `applyCouponToOrder`（整单一券），**无后端改造**。
- `checkoutSplitted` 已支持 `boxKeys`/`lineIds` 局部结算（Phase A 已上线）——前端按 selectedBoxes 传参即可。无需后端新增。

## 19. 测试与交付（硬性）

- 功能交付 = 实现 + AP 接口回归 + **手机视口截图**（390×844, dpr=2）+ 操作手册章节补充。
- 覆盖场景：单箱、多箱、多商家多档案、交集空、余额不足、整箱/部分选择、数量步进/删除、回流、地址簿 CRUD+分页、联系人 CRUD+分页、city 修复回归、jd-legacy 回退。
- `npm run typecheck`：本次涉及文件零新增错误（忽略既有基线）。

## 20. 明确不做（Roadmap）

- 逐箱多券（整单一券为本次定稿）。
- 通道级分账、代销库存台账（既有 Roadmap，非本期）。

## 21. 待实施清单（交付 writing-plans）

① `usePerBoxSelection.ts`；② `BoxLines / BoxShippingMethod / BoxAddress / BoxPickup`；③ `CheckoutPerBoxList.vue`（分组渲染 + 卡片装配）；④ cn/jd 外层容器改造；⑤ `CheckoutLayoutJdLegacy.vue` 回退；⑥ `useCheckoutFlow` 提交 + 回流；⑦ 底部订单汇总；⑧ i18n 双语言补全；⑨ 手机截图 + 操作手册。