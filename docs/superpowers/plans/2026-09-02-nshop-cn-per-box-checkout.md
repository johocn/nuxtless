# NShop 逐箱结算（per-box checkout）实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把 nshop 结算页从"整单式"升级为"逐箱式"——每箱展示租户名+配送档案名+本箱商品+券/运费优惠+本箱小计，支持整箱/部分商品结算，支付按"箱支付方式交集"合并 1 单或按箱拆单，除余额外实收按商户分账计入各商家账号。

**Architecture:** 后端 vendure cjk-plugin 扩展 `GetOrderBoxes` 逐箱下发（tenantName、每箱商品明细、可用券、运费优惠、小计、商户分账），并让 `CheckoutSplitted` 支持"boxKey + 部分 lineIds 集"的局部结算；前端 nshop 重构结账页为"商家分组 → 逐箱卡片"积木式布局，复用/升级高德地址联动组件并修复 city 覆盖 bug。Address 字段严格对齐 Vendure（`fullName` 单一收货人、`streetLine1`+`country` 必填、物流邮编必填、region 用 adcode 联动、邮箱/姓属 Customer 不写入地址）。

**Tech Stack:** Nuxt4 + Vue3 + @nuxt/ui4 · cjk-plugin（Vendure TypeORM）· graphql-request 运行时字符串查询（nshop 离线构建）· valibot 校验 · Pinia · 高德 Web 服务 API（行政区划+逆地理）

**仓库：** 后端 `d:\zhao\vendure\packages\cjk-plugin`；前端 `d:\zhao\nshop`。部署：后端 `git pull + pm2 restart`；前端 `node scripts/deploy.mjs`（本地构建）。**一律本地构建，服务器绝不构建。**

***

## 现状基准（需在 T1 复核，字段名以实测为准）

- `GetOrderBoxes` 现返回：`boxKey, profileId, profileName, lineIds, tenantChannelId, shippingProfileIds, availableShippingMethodIds, availableShippingMethods, defaultShippingMethodId, requiresAddress, requiresContact, type, availablePaymentMethodCodes, loginRequiredPaymentCodes, pickupLocations`

- 结算提交：`CheckoutSplitted($method, $metadata)`（当前**不支持**局部 box/line 选择）

- 前端分箱类型：`layers/base/utils/checkout-config.ts`（已有 `checkLayout`）

- 结账级联表单：`layers/base/app/components/checkout/AddressForm.vue`（高德省市区+country 默认语言）；账号新增弹窗 `layers/base/app/components/address/AddressFormModal.vue`（无级联，需替换/升级）

***

## Phase A — 后端：逐箱数据下发 + 局部结算（vendure cjk-plugin）

### Task A1: 复核后端分箱与结算现状

**Files:** 只读核对（不修改）

- `d:\zhao\vendure\packages\cjk-plugin\src\` 下分箱 resolver/service（找 `orderBoxes` 与 `checkoutSplitted` 的实现文件）

- 核对字段：现是否已有 `tenantName`、每箱 line 明细、可用券、运费、小计相关数据可复用

- [ ] **Step 1: 定位实现**
  `rg -n "orderBoxes|checkoutSplitted" d:\zhao\vendure\packages\cjk-plugin\src`

- [ ] **Step 2: 记录现状** 在 plan 批注中列出：分箱函数返回结构、付费拆分是否已有 per-merchant 概念、券结算归属。

- [ ] **Step 3: 提交文档沉淀**（仅 docs）

### Task A2: 新增 GraphQL 类型 + 扩展 orderBoxes 返回

**Files:**

- Modify: `d:\zhao\vendure\packages\cjk-plugin\src\api\...`（组件 GQL 类型定义）

- Modify: 分箱 resolver/service  返回新增字段

- Test/Lint: `tsc -p packages/cjk-plugin/tsconfig.build.json`

后端需为 `orderBoxes` 扩展以下字段（保持既有字段不变）：

```ts
// 新增 per-box 明细产出类型
export interface OrderBoxLine {
  orderLineId: string;
  productVariantId: string;
  productName: string;
  unitPrice: number;      // 含税单价
  quantity: number;
  lineTotal: number;      // unitPrice*quantity（未扣券）
}
export interface BoxCoupon {
  code: string;
  name: string;
  condition: string;
  amount: number;         // 抵扣/免邮金额（正值=省下）
}
export interface MerchantSplit {
  tenantChannelId: string;
  tenantName: string;
  amount: number;         // 该商户应计入（合并单支付时 = 其分账；拆单时 = 其各自订单合计）
}
```

扩展返回值（新增成员）：
`lines: OrderBoxLine[]` · `availableCoupons: BoxCoupon[]` · `shippingCost: number` · `shippingDiscount: number` · `subtotal: number`(= 商品合计 - 券抵扣 + 配送费) · `tenantName: string`

顶层新增：`merchantSplit: MerchantSplit[]`

- [ ] **Step 1: 定义类型** 按上文写出 `OrderBoxLine / BoxCoupon / MerchantSplit` 并在 box 类型上挂 `lines/availableCoupons/shippingCost/shippingDiscount/subtotal/tenantName`。

- [ ] **Step 2: 实现取值** 在分箱服务里，对每箱：按 `lineIds` 读订单行算明细与小计；调券服务取本箱可用券与抵扣；`tenantName` 由 `tenantChannelId` 查租户表（或已有 channel.name）。

- [ ] **Step 3: tsc 编译验证通过**
  `node_modules/.bin/tsc.cmd -p packages/cjk-plugin/tsconfig.build.json`
  Expected: exit 0，产物 `lib/` 含新字段（`Select-String lib/... -Pattern "merchantSplit"`）。

- [ ] **Step 4: 提交**
  `git add packages/cjk-plugin/lib packages/cjk-plugin/src && git commit -m "feat(cjk): 逐箱结算下发 tenantName/per-box 明细/券/优惠/小计/商户分账"`

### Task A3: CheckoutSplitted 支持局部结算

**Files:**

- Modify: `d:\zhao\vendure\packages\cjk-plugin\src\...` 结算 service/resolver

- Modify: `d:\zhao\vendure\packages\cjk-plugin\lib\...`（tsc 产物）

设计：**不改 GraphQL 签名**，复用现有 `metadata`（JSON 字符串）传局部选择：

```json
{ "selectedBoxes": [ { "boxKey": "k1", "lineIds": ["l1","l2"] }, { "boxKey": "k2", "lineIds": ["l3"] } ] }
```

后端结算逻辑：

- 缺省（无 metadata 或空）→ 退化为"全部整箱"（兼容现状）。

- 有 selectedBoxes → 从活动订单按 `boxKey` 过滤出各箱的 `lineIds` 子集构建"结算输入行集"。

- **回流购物车（spec §15.2）**：被排除的未选 line（productVariantId+数量快照）在结算**成功后**按量 `AddItemToOrder` 加回活动购物车（幂等，成功即视为已回流，避免重复加购）；结算失败则不做任何移除（保持 activeOrder 原状，防丢单）。

- **分账时机（spec §15.3）**：在线支付（微信/支付宝）在**支付成功回调**记台账入账；货到付款**待签收**，**签收/收货确认后再入账**。

- 合并/拆单与分账规则沿用 spec §9：所选行聚合后，按"余额→合并 1 单扣共享钱包；非余额且交集非空→合并 1 单按台账分账；交集空→按箱拆多单"。

- **台账分账（本期）**：合并单成功后按 `merchantSplit` 写每商户一行分账台账（商户、订单、商品小计、运费、券抵扣、应计入金额）；**通道级分账属 Roadmap，本期不做**。

- [ ] **Step 1: 写解析函数（纯函数，先单测心智）**
  解析 metadata JSON；坏 JSON/缺字段 → 返回 `null`（视同全部整箱）。

- [ ] **Step 2: 接入结算主流程** 在既有 checkoutSplitted 前段插入"按 selectedBoxes 计算参与行集合"，后接既有拆/合逻辑。

- [ ] **Step 2.5: 实现未选行回流 + 分账台账**
  - 结算前记录被排除 line（variantId+qty）；

  - 结算成功后 `AddItemToOrder` 加回（幂等），失败不动 activeOrder；

  - 在线支付回调/COD 签收分别触发台账入账。

- [ ] **Step 3: tsc 编译 + 本地单测/手工验证**（sqljs 内存库走既有方式）

- [ ] **Step 4: 提交**（源码+lib 一并）

### Task A4: 后端回归 + 提交

- [ ] **Step 1: 运行既有 coupon/checkout 相关 vitest**

- [ ] **Step 2:** **`git pull && pm2 restart`** **部署后端**（本地构建产物已随 git）

- [ ] **Step 3: 提交并记录**

***

## Phase B — 前端先行：高德地址组件共享化 + city 修复（nshop）

> 本 Phase 独立可发、低风险、立即消除"城市可见却报错"卡点。

### Task B1: 修复 AddressForm.vue 的 city 覆盖 bug

**Files:**

- Modify: `d:\zhao\nshop\layers\base\app\components\checkout\AddressForm.vue`

核心改 `syncState()`（现第 78-91 行）与回填：**仅当** **`citySel/...current`** **非空才覆盖对应** **`state.*`，否则保留已存值**：

```ts
function syncState() {
  if (provinceSel.value.current) state.province = provinceSel.value.current;
  if (citySel.value.current) state.city = citySel.value.current;
  if (districtSel.value.current) state.district = districtSel.value.current;
  if (streetSel.value.current) state.street = streetSel.value.current;
  if (!state.streetLine1) state.streetLine1 = fullAddress();
}
```

同时给 `applyExistingState()` 加**adcode 优先比对，中文名兜底**：在 `findCityName()` 辅助下，先用 `state.city` 在高德节点里按 name 匹配，匹配不到且列表唯一项时选中唯一项，**匹配失败则保留 state.city 原值、不因 current 空而清空**。

- [ ] **Step 1: 写回归测试脚本**（`scripts/` 下，串行主义最低：直接复用手机截图脚本验证提交不再报错）或纯函数测试补丁。

- [ ] **Step 2: 修改** **`syncState`** **+** **`applyExistingState`（上文代码）**

- [ ] **Step 3: 手动/截图验证**：从地址簿回填一条含"北京市"的地址，直接提交不再报"未选择城市"。

- [ ] **Step 4: 提交** `git commit -m "fix(checkout): 高德省市级联回填不再覆盖已存 city，提交不报未选城市"`

### Task B2: 抽共享 `useCnAddressForm` 组合式

**Files:**

- Create: `d:\zhao\nshop\layers\base\app\composables\useCnAddressForm.ts`

- Modify: `AddressForm.vue` 改为调用它（逻辑迁移，模板不动）

- Modify: `d:\zhao\nshop\layers\base\app\components\address\AddressFormModal.vue` 升级为用共享组合式（含高德省市区级联 + country 默认语言）

组合式暴露（与 AddressForm.vue 现内部一致）：`countryDefault, provinceSel, citySel, districtSel, streetSel, districtsLoading, onProvinceChange, onCityChange, onDistrictChange, preselectByLocation, applyExistingState, syncState, fullAddress`

- [ ] **Step 1: 把 AddressForm.vue 的级联逻辑整体搬进** **`useCnAddressForm.ts`**（保持对外 API 名一致）

- [ ] **Step 2: AddressForm.vue 改为** **`const f = useCnAddressForm()`** **并替换内部引用**

- [ ] **Step 3: AddressFormModal.vue 升级**：把纯文本 `city` 换成省市区级联 + country 默认语言 + 邮编物流必填（下方 B3）。

- [ ] **Step 4:** **`pnpm typecheck`** **通过 + 页面回归**（结账页能正常加地址）

### Task B3: 地址表单字段对齐（物流邮编必填、company/streetLine2 选填）

**Files:**

- Modify: `d:\zhao\nshop\layers\base\validators\addressForm.ts`

- Modify: 共享表单模板（省市联动后 邮编/公司/地址2）

校验 schema 调整（仅物流地址用必填邮编；自提无地址不涉及）：

```ts
postalCode: pipe(string(), nonEmpty(t("messages.billing.requiredPostalCode"))), // 物流必填
company: optional(string()),
postalLine2: streetLine2 保持可选
```

i18n 在 `zh-CN.ts / en-US.ts` 补 `requiredPostalCode / company / address2` 词条，双语言同步。

- [ ] **Step 1: 更新 schema + 模板字段（含 company 选填、streetLine2 可选可隐藏）**

- [ ] **Step 2: i18n 双语言补词条**

- [ ] **Step 3: typecheck + 截图回归**

***

## Phase C — 前端：逐箱结算 UI（nshop）

### Task C1: 扩展结算布局类型与类型定义

**Files:**

- Modify: `d:\zhao\nshop\layers\base\utils\checkout-config.ts`

- Create: `d:\zhao\nshop\types\perBox.ts`（放逐箱类型）

```ts
// types/perBox.ts —— 与后端 A2 的 OrderBoxLine/BoxCoupon/MerchantSplit 对齐
export interface PerBoxLine { orderLineId: string; productName: string; unitPrice: number; quantity: number; lineTotal: number; }
export interface PerBoxCoupon { code: string; name: string; condition: string; amount: number; }
export interface TenantBox {
  boxKey: string; profileId: string; profileName: string; tenantName: string; type: "delivery" | "pickup";
  lineIds: string[]; lines: PerBoxLine[];
  availableCoupons: PerBoxCoupon[];
  shippingCost: number; shippingDiscount: number; subtotal: number;
  availablePaymentMethodCodes: string[]; requiresContact: boolean;
  shippingMethodId: string | null; address?: Record<string, any>;
}
export interface MerchantSplit { tenantChannelId: string; tenantName: string; amount: number; }
```

- [ ] **Step 1: 写** **`checkLayout`/类型（已有，确认不变）**

- [ ] **Step 2: 建** **`types/perBox.ts`（上文代码）**

- [ ] **Step 3: typecheck 通过**

### Task C2: 扩展 GetOrderBoxes GQL + 解析

**Files:**

- Modify: `d:\zhao\nshop\layers\base\gql\queries\order.gql`

- Create（或沿用）: `d:\zhao\nshop\layers\base\app\composables\usePerBoxCheckout.ts`（解析+按商家分组）

order.gql 增加字段（对齐 A2）：

```graphql
query GetOrderBoxes {
  orderBoxes {
    boxKey profileId profileName tenantName type
    lineIds requiresContact
    availableShippingMethods { id code name }
    defaultShippingMethodId
    availablePaymentMethodCodes
    pickupLocations { id name address phoneNumber businessHours type }
    lines { orderLineId productVariantId productName unitPrice quantity lineTotal }
    availableCoupons { code name condition amount }
    shippingCost shippingDiscount subtotal
  }
  merchantSplit { tenantChannelId tenantName amount }
}
```

usePerBoxCheckout 端：`groupByTenant(boxes): TenantGroup[]`（先租户分区块，组内并列箱）+ 选中态 `selectedBoxes`（默认全选全箱）。

- [ ] **Step 1: 更新 order.gql（上文）**

- [ ] **Step 2: 写** **`usePerBoxCheckout.ts`**（含 `groupByTenant`、`toggleBox`、`toggleLine`、`isSelected`、`selectedSubtotal` 计算）

- [ ] **Step 3: typecheck + 首页无回归**

### Task C3: 逐箱卡片组件

**Files:**

- Create: `d:\zhao\nshop\layers\base\app\components\checkout\PerBoxCard.vue`

- Create(复用): 箱内子块——物流箱沿用 `CheckoutBoxDeliveryBlock` / 自提沿用 `CheckoutBoxPickupBlock`，并接入勾选/数量/删除

PerBoxCard 结构（对齐 spec §2）：

```
└ tenant header（租户名 + 箱数）—— 由 groupByTenant 分组渲染
  └ 箱卡（profileName 标题 + tenantName 副标题 + 整箱勾选框）
    ├ 物流箱: 收货地址卡(默认地址+切换) + 配送方式单选(逐箱)
    │ 自提箱: 自提点(默认+切换) + 联系人(默认+切换，仅姓名电话)
    ├ 商品行: [✓][图][名/价][数量步进][金额][删除]  行首勾选=部分选择
    ├ 本箱可用券 / 运费优惠 / 本箱小计
```

数量步进 + 删除用既有 mutation：`AdjustOrderLine(orderLineId,quantity)` / `RemoveOrderLine(orderLineId)` 并刷新 `GetOrderBoxes`。

- [ ] **Step 1: 建 PerBoxCard.vue（模板按上文结构，收发 props：`box, selected, onToggleBox, onToggleLine, onQty, onRemove`）**

- [ ] **Step 2: 接线既有 block 组件（配送/自提/支付）与商品行子块**

- [ ] **Step 3: 手机视口截图验证**（390×844）逐箱卡片渲染

### Task C4: 支付交集 + 合并/分箱提示 + 商户分账汇总

**Files:**

- Modify: `d:\zhao\nshop\layers\base\app\components\checkout\PaymentBlock.vue`（或新建 PerBoxPayment）

- Create: `d:\zhao\nshop\layers\base\app\components\checkout\PerBoxSummary.vue`

逻辑：

- 交集 = 所有**被选**箱的 `availablePaymentMethodCodes` 求交集。

- 交集空 → 顶部红条 + 每箱显示各自支付方式，不合并。

- 合并时显示："将合并为 1 单支付"+ 商户分账列表（merchantSplit）+ 应付款总额。

- 余额：余额充足才可选；不足禁用并提示转分箱。

```ts
const codes = selectedBoxes.map(b => b.availablePaymentMethodCodes);
const intersection = codes.reduce((a,b)=>a.filter(c=>b.includes(c)), codes[0] ?? []);
const canMerge = intersection.length > 0;
```

- [ ] **Step 1: 求交集并渲染支付区（上文逻辑）**

- [ ] **Step 2: 分账汇总组件**（merchantSplit 列表 + 总额）

- [ ] **Step 3: 三种提示态（可合并 / 交集空 / 余额不足）截图**

### Task C5: 结算提交（局部）

**Files:**

- Modify: `d:\zhao\nshop\layers\base\app\pages\checkout\index.vue`

提交时把局部选择写成 metadata：

```ts
const metadata = JSON.stringify({
  selectedBoxes: selectedBoxes.value.map(b => ({ boxKey: b.boxKey, lineIds: b.selectedLineIds })),
});
await GqlCheckoutSplitted({ method, metadata });
```

- [ ] **Step 1: index.vue 接入局部 metadata（上文）**

- [ ] **Step 2: 手机截图回归**（整箱、部分商品、删除、交集空、余额不足五场景）

- [ ] **Step 3: 提交 Phase C 全部**

### Task C6: 地址簿/联系人分页（>10 条）

**Files:**

- Modify: 地址/联系人列表组件，加分页控件（每页 5 条）

- Modify: `d:\zhao\nshop\layers\base\i18n\locales\{zh-CN,en-US}.ts`（可分页/每页文案）

- [ ] **Step 1: 列表加** **`page`** **state + 上一页/下一页/页码**

- [ ] **Step 2: ＞10 条显示 第 X/Y 页**

- [ ] **Step 3: 截图验证分页**

***

## Phase D — 交付

### Task D1: 全量回归 + 手机截图

- [ ] **Step 1:** **`pnpm typecheck`** **通过**

- [ ] **Step 2:** **`pnpm build`** **本地构建成功**

- [ ] **Step 3:** **`node scripts/deploy.mjs`** **部署 nshop（本地构建 → scp → pm2 restart）**

- [ ] **Step 4: 手机视口截图**（390×844）：整箱/部分/删除/交集空/余额不足/地址CRUD/联系人CRUD/分页/高德城市已选提交

- [ ] **Step 5: e2e 回归通过、无 JS pageerror**

### Task D2: 手册补充

- [ ] **Step 1: web-admin 手册新增「逐箱结算」章节**，含上述截图

- [ ] **Step 2: 上传** **`/e.joho.cn/guanli/static/manual/`，HTTPS 200 验证**

***

## 已定案决策（2026-09-02）

- **分账=台账级（本期）**：合并单支付后写每商户分账台账；**通道级分账列入 Roadmap**（各商户需在支付通道开服务商分账能力，独立勘察，本期不做）。

- **未选箱/行=回流购物车**：结算成功后按量 `AddItemToOrder` 加回（幂等）；失败不动 activeOrder，防丢单。

- **分账时机**：在线支付=支付成功回调入账；货到付款=签收后入账。

- **代销库存台账=新增独立表（Roadmap，见 spec §15.4）**：事实核对确认现有代码无此独立表（仅有 StockMovement/inventory-plugin/redis-stock-plugin，且 redis key 无租户维度）；本项为**新增设计**，与分账台账（钱）并行记货量，经 `settlementLedgerId` 互相对账。**不在本期实现**。

## 风险与开放项

1. **通道级分账（Roadmap，不在本期）**：本期仅台账；后续需为各商户开通支付通道服务商分账并另行勘察。
2. 回流购物车与券资格/库存联动：`AddItemToOrder` 加回时若商品失效需兜底提示"部分商品已失效，请重新加入购物车"——A3 实现时校验。
3. 默认 fallback：即使 `selectedBoxes` 缺失，行为退化为现有"全部整箱"。

## Self-Review 结论

- spec §7 交集/8汇总/9局部归属/4.3 city修复/4.4与5分页 → 均有对应 Task。

- 完成 C4/C5 后，支付合并/分账与 spec §9 对齐。

- 后端分账资金落地见"风险1"，需 PM 拍板后再深入通道级实现。

