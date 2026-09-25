# 订单列表 / 订单详情 三版式（cn · jd · mall）— 设计文档

> 日期：2026-09-25
> 前端：`d:\zhao\nshop\layers\base`（Nuxt，`account/orders`）
> 前置：沿用 `2026-09-01-order-template-jd-4level-design.md`（订单四级可回退风格体系）、`2026-09-03-orders-cn-redemption-design.md`（核销码高光卡五状态机，已上线）。
> 定稿 mockup（视觉真源，勿重画）：
> - 源：`d:\zhao\_mockup_gallery\mockups\{order-list,order-detail}-{cn,jd,mall}.html`（6 份，自包含 CSS）
> - 截图：`d:\zhao\_mockup_gallery\shots2\*.png`（390×844 / dpr=2，6 张）
> - 画廊：`http://localhost:52208/index2.html`（本地 serve）

## 0. 决策基线（用户已确认）

| 决策 | 结论 |
|---|---|
| 范围 | **订单列表 + 订单详情（自提·含核销码）各做 cn / jd / mall 三版式**，1:1 对照已定稿 mockup 落地 |
| 落地方式 | 接入**既有 layout 配置体系**（后端 channel customFields JSON → 渲染器 map），而非只做单一版式 |
| 默认版式 | **沿用现状**：列表默认 `card`（既有 `OrderCardList` 不动，视觉零回归）；详情默认 `jd` |
| jd 版式视觉 | 详情 `jd` 视觉**对齐 mockup**（京东红渐变状态头 / 小圆角卡）；列表 `jd` 为**新增**版式，默认值仍为 `card`，须后台显式切 `jd` 才生效 |
| 不改动 | `classic`（备用版式）、`confirmation`（结算确认场景）两块**保持现状**，渲染映射不变 |
| 页面外层 | **页面 chrome 保持不变**：标题栏/返回导航仍由 `pages/account/orders/index.vue`、`[code].vue` 的既有 `<header>` 提供。渲染器只负责「tab 区 + 列表 / 详情块」，**不含标题栏**（mockup 中的 navbar / 顶部标题卡属页面 chrome，不重复实现） |
| 多语言 | 新增词条 zh-CN / en-US **同步补齐**，禁止裸显 key |
| 交付 | 实现 + `typecheck` 无新增错误 + 390×844/dpr2 手机截图 + 操作手册章节 |

### 0.1 与 mockup 的已知偏差（有意为之）

| mockup 元素 | 落地处理 | 理由 |
|---|---|---|
| 列表 cn/jd 顶部 navbar（返回箭头 + 标题）、mall 顶部 sticky 标题卡 | **不实现**，由页面既有 header 承担 | 避免标题重复；页面 chrome 不因版式而变 |
| 列表 jd 商家头部「联系客服 ›」 | **不实现** | 无对应处理逻辑，不落死链 |
| 列表 jd 按「商家名」分组 | 按 **配送类型** 分组（自营 / 自提门店） | `GetOrderHistory` 的 `OrderBase` 片段仅含 `customFields.deliveryType`，无商家名字段；不为此扩 GQL |
| 详情 mall 顶部 sticky 标题卡 | **不实现**，由页面 header 承担 | 同列表 |
| 详情 cn/jd 顶部 navbar | **不实现**，由页面 header 承担 | 同上 |
| 列表 cn/jd/mall「去支付」按钮（画在「待支付」订单上） | **不实现** | 系统没有「对已有未支付订单发起支付」的入口（支付只存在于结算流程内），补按钮只能落死链或误导用户；已与用户确认记为已知偏差 |
| 列表 cn 状态徽标 | 复用既有 `OrderStateBadge`（描边丸） | 复用既有组件，语义色（warning/info/success/error）与全局一致；mockup 的浅底填充为装饰差异 |
| 列表商品行「规格」副标题（如「黑色 · 128G」） | **不实现** | `OrderBase` 片段无规格/选项值字段，不为此扩 GQL |

### 0.2 variant 语义（实现约定，避免「默认变体」误伤旧调用方）

`OrderStatusBanner` / `OrderProgress` / `OrderRedemptionCard` / `OrderActions` / `OrderCardActions` 五个积木统一支持 `variant?: "cn" | "jd" | "mall"`：

- **不传（`undefined`）= 既有观感**（走主题默认），供 `OrderCard`（列表 `card` 版式）、`OrderDetailClassic`、`OrderDetailConfirmation` 等**旧调用方零回归**；
- `"cn"` / `"jd"` / `"mall"` = 对应版式的视觉语言（圆角/配色/描边）。
- 注：`OrderStatusBanner` / `OrderProgress` / `OrderRedemptionCard` 的 `cn` 分支恰好等于它们改动前的既有观感（故这三者内部以 `cn` 为兜底默认）；`OrderActions` / `OrderCardActions` 因被 `card` 版式与 `classic`/`confirmation` 共用，**必须以不传 = 现状**区分，故这两者无默认值。

## 1. 现状（代码事实）

| 位置 | 现状 |
|---|---|
| `components/order/OrderListRenderer.vue` | **硬编码** `OrderTabBar + OrderCardList`，`useOrderListConfig().layout` **取了不用** |
| `utils/order-config.ts` | `OrderListLayout = "card"`；`orderListLayout()` **硬返回 `"card"`**；`OrderDetailLayout = "jd" \| "classic" \| "confirmation"` |
| `components/order/OrderDetailRenderer.vue` | map 仅 `jd` / `classic` / `confirmation(→jd)`，**无 cn / mall** |
| `components/order/OrderCardList.vue` | 单卡片版式：内联 GQL 取数 + 幽灵单/商户子单过滤 + tab 过滤 + 加载更多；渲染 `OrderCard` |
| 详情积木 | `OrderDetail{Status,Progress,Redemption,Address,Items,Pickup,Totals,Meta,Actions}Block`（薄封装：块标题本地化 + 容器样式），被 `OrderDetailClassic` / `OrderDetailJd` / `OrderDetailConfirmation` 使用 |
| 显示积木（可复用内层） | `OrderStatusBanner` / `OrderProgress` / `OrderRedemptionCard` / `OrderItems` / `OrderTotals` / `OrderShippingBreakdown` / `OrderPickupCard` / `OrderAddress` / `OrderMetaCard` / `OrderActions` |
| 列表卡片积木 | `OrderCard` / `OrderCardHeader` / `OrderCardItems` / `OrderCardFooter` / `OrderCardActions` / `OrderStateBadge` / `OrderTabBar` |
| 配置读取 | `useOrderListConfig()` / `useOrderDetailConfig()`：`GetChannelTheme` → `activeChannel.customFields.order{List,Detail}Config` → `parseOrder{List,Detail}Config` → `order{List,Detail}Layout()` |

### 1.1 三版式视觉语言（mockup 定稿摘要）

**订单列表**

| | cn | jd | mall |
|---|---|---|---|
| tab | 药丸（`rounded-full`，选中红底白字 `#e1251b`） | 下划线（选中红色 2px 下划线 `#e1251b`） | 渐变药丸（选中 `#e0433f → #ff6a6c`） |
| 列表容器 | 单卡片纵向流，`gap-12px` | 商家分区（竖条 + 分区名），无卡片 | `gap-14px` |
| 卡片 | `rounded-xl` + `1px #ececec` 描边 + 轻投影 | 分区内平铺行（无卡片） | `rounded-[18px]` 无边框 + `0 3px 14px rgba(17,24,39,.06)` |
| 状态徽标 | 描边浅底丸（amber/sky/emerald 语义色） | 纯文字色（amber/红/绿/灰） | 实心浅底丸（amber/珊瑚/绿/灰） |
| 缩略图圆角 | 8 | 4 | 12 |
| 按钮 | 药丸（取消 浅灰 / 再次购买 浅红 / 查看详情 实心红） | 4px 圆角描边（查看详情 红描边 / 去支付 实心红） | 药丸（取消 白底投影 / 再次购买 浅珊瑚 / 查看详情 珊瑚渐变实心） |

**订单详情（自提·含核销码）**

| | cn | jd | mall |
|---|---|---|---|
| 状态头 | 按订单状态取渐变（info=s天蓝→靛蓝），`rounded-xl` | 固定京东红渐变 `#c8161d → #e1251b → #f04b2f`，`rounded-md` | 固定珊瑚渐变 `#e0433f → #ff6a6c`，`rounded-2xl` |
| 进度步进 | 药丸，选中 `bg-brand-600` | 方块 `rounded-[3px]`，选中 `#e1251b` | 药丸 + 珊瑚渐变，选中带投影 |
| 区块容器 | `rounded-xl` + 描边 + 轻投影（＝既有样式） | `rounded-md`，无描边，`0 1px 2px` | `rounded-[18px]`，无描边，`0 3px 14px`；标题带珊瑚竖条 |
| 区块标题 | 纯文字 | 3px 红竖条 + 文字 | 5px 珊瑚竖条 + 文字（更粗） |
| 核销码区 | 琥珀高光卡 + 码区 `brand-600→brand-500` 渐变 | 白卡 + 2px 红顶边 + 码区京东红渐变 | 白卡 + `#ffe0dd` 边 + 珊瑚投影 + 码区珊瑚渐变 |
| 按钮 | 药丸（取消 浅红 / 再次购买 实心红 / 获取链接 ghost） | 4px 圆角（取消 描边 / 再次购买 实心红 / 获取链接 红描边） | 药丸（取消 白底投影 / 再次购买 珊瑚渐变 / 获取链接 ghost） |

## 2. 架构总览

```
C 端前端 (nshop layers/base)
  pages/account/orders/index.vue           ← 页面 chrome（header 不变）
    OrderListRenderer(读 useOrderListConfig().layout)
      ├─ card  → OrderTabBar + OrderCardList（默认，既有，零改动外观）
      ├─ cn    → OrderListCn    （药丸 tab + 描边白卡流）
      ├─ jd    → OrderListJd    （下划线 tab + 配送类型分区平铺行）
      └─ mall  → OrderListMall  （渐变药丸 tab + 大圆角投影卡）
        └─ 三者共用 composables/useOrderList.ts（取数 / 过滤 / tab / 加载更多）
           与 components/order/useOrderActions（取消 / 再购 / 跳详情）

  pages/account/orders/[code].vue          ← 页面 chrome（header 不变）
    OrderDetailRenderer(读 useOrderDetailConfig().layout)
      ├─ jd           → OrderDetailJd（默认，视觉对齐 mockup）
      ├─ cn           → OrderDetailCn（新增）
      ├─ mall         → OrderDetailMall（新增）
      ├─ classic      → OrderDetailClassic（不动）
      └─ confirmation → OrderDetailJd（映射不变）
        └─ 三者复用同一批显示积木；容器仅决定「区块顺序 / 容器样式 / 标题样式」
           OrderStatusBanner / OrderProgress / OrderRedemptionCard / OrderActions
           ← 新增 variant="cn"|"jd"|"mall" 决定圆角·配色·按钮形态
           OrderItems / OrderTotals / OrderShippingBreakdown / OrderPickupCard /
           OrderAddress / OrderMetaCard ← 无版式差异，原样复用
```

**职责边界（四级可回退不破坏）**
- `order-config.ts`：仍是**唯一解析入口**（纯函数、坏 JSON → `null`、逐级兜底）。
- 版式容器只决定**容器与配色**；块级定制（`blocks[key].title/text/visible/highlight/fontScale/cardRadius`）语义与解析口径**完全不变**。
- 期望的「块顺序」仍是 `Status → Progress → Redemption → Address → Items → Pickup → Totals → ShippingBreakdown → Meta → Actions`（与 `OrderDetailJd` 现序一致）。

## 3. 配置层设计（`utils/order-config.ts`）

```ts
export type OrderVisualVariant = "cn" | "jd" | "mall";
export type OrderDetailLayout = "jd" | "classic" | "confirmation" | "cn" | "mall";
export type OrderListLayout = "card" | "cn" | "jd" | "mall";

const ORDER_DETAIL_LAYOUTS = ["jd", "classic", "confirmation", "cn", "mall"] as const;
const ORDER_LIST_LAYOUTS = ["card", "cn", "jd", "mall"] as const;

export function orderDetailLayout(cfg: OrderDetailConfig | null): OrderDetailLayout {
  // 白名单校验，非法/缺省 → jd（沿用现状默认）
  const v = cfg?.layout;
  return ORDER_DETAIL_LAYOUTS.includes(v as never) ? (v as OrderDetailLayout) : "jd";
}

export function orderListLayout(cfg: OrderListConfig | null): OrderListLayout {
  // 白名单校验，非法/缺省 → card（沿用现状默认）
  const v = cfg?.layout;
  return ORDER_LIST_LAYOUTS.includes(v as never) ? (v as OrderListLayout) : "card";
}
```

**兜底链（L4 不变）**：后端 `customFields.orderXxxConfig`（JSON 字符串）→ `parse…`（坏 JSON / 非对象 → `null`）→ `order…Layout(null)` → 内建默认（`jd` / `card`）。后台可写 `{"version":1,"layout":"mall"}` 切换；写非法值即回退默认，不报错、不白屏。

`useOrderListConfig().layout` / `useOrderDetailConfig().layout` 签名不变，无需改动（已透传）。

## 4. 共享积木的 `variant` 支持

只给**确有版式差异**的 4 个显示积木加 `variant?: OrderVisualVariant`（缺省 `"cn"` = 现有观感，保证 `classic` 零回归）：

| 组件 | variant 差异点 |
|---|---|
| `OrderStatusBanner` | 容器圆角（xl / md / 2xl）、渐变（cn=按状态取；jd=固定京东红；mall=固定珊瑚）、角标圆角（full / sm / full） |
| `OrderProgress` | 步进圆角与选中样式（cn=药丸 `bg-brand-600`；jd=方块 `bg-[#e1251b]`；mall=药丸珊瑚渐变+投影） |
| `OrderRedemptionCard` | 卡容器（cn=琥珀高光；jd=白卡+2px 红顶边；mall=珊瑚边+珊瑚投影）、码区渐变（brand / 京东红 / 珊瑚）、码区圆角（xl / base / 2xl）、状态徽标圆角（full / sm / full）、标题竖条（仅 mall） |
| `OrderActions` | 按钮形态（cn/mall=药丸；jd=4px 圆角）与色彩（cn=红系；jd=红系描边/实心；mall=珊瑚渐变） |

`highlight`（核销块 L3 开关）语义不变：三版式下 `highlight=false` 均回退「白卡 + 描边码区」。

## 5. 列表版式设计

### 5.1 取数复用：`composables/useOrderList.ts`（新增）

把 `OrderCardList` 内联逻辑抽出（**4 处消费**：card / cn / jd / mall），行为逐字保留：

```ts
export function useOrderList(activeTab: Ref<OrderTabKey>) {
  // take / loading / useAsyncGql("GetOrderHistory") / refresh
  // rawItems → orders（过滤幽灵单 totalQuantity>0、过滤 type==="Seller" 商户子单）
  // total（totalItems）、filtered（按 tabOfState 过滤）、loadMore（take+=10 + refresh）
  // onMounted(refresh) → loading=false；changed() → refresh()
  return { loading, error, rawItems, orders, filtered, total, loadMore, changed };
}
```

`OrderCardList.vue` 改为消费该 composable（模板与外观**零改动**）。

### 5.2 三个版式容器

| 组件 | 结构 | 要点 |
|---|---|---|
| `OrderListCn.vue` | 药丸 tab（`OrderTabBar` 不适用：其样式固定，故内联同名 tab 渲染）→ 卡片列表 → 加载更多 | 卡片：`rounded-xl border border-[#ececec] shadow-sm`；头部「🏬 自营 / 自提」+ `OrderStateBadge` 描边丸；`OrderCardItems` 风格行；底「共 N 件 / 实付 ¥」；右侧药丸按钮组 |
| `OrderListMall.vue` | 渐变药丸 tab → 大圆角投影卡列表 → 加载更多 | 卡片：`rounded-[18px] shadow-[0_3px_14px_rgba(17,24,39,.06)]`；实心浅底丸徽标；缩略图 `rounded-xl`；虚线分隔的底部行；珊瑚渐变实心 CTA |
| `OrderListJd.vue` | 下划线 tab → 按 `customFields.deliveryType` 分组（自营 / 自提门店）→ 分区内平铺订单行 → 加载更多 | 分区头：3px 红竖条 + 名称；订单行：日期 + 订单号 + 状态色文字 → 商品行（虚线分隔）→ 共 N 件 / 实付（实付红）→ 4px 圆角按钮组 |

**共用视觉原子**：tab 列表取 `ORDER_TABS`（`utils/order-state.ts`），状态文案/语义色取 `stateBadge(state, order)`；件数/实付取 `messages.order.totalItems` / `actualPaid`；金额格式沿用 `Intl.NumberFormat(locale, {currency})`。

### 5.3 渲染器

```ts
// OrderListRenderer.vue
const map = { card: null, cn: OrderListCn, jd: OrderListJd, mall: OrderListMall };
```
`card` 时渲染既有 `OrderTabBar + OrderCardList`（保持原样）；其余渲染对应容器并 `v-model` 透传 `activeTab`。未知值已由 `orderListLayout()` 收敛为 `card`，不再另设兜底。

## 6. 详情版式设计

三个容器**共同顺序**（与 `OrderDetailJd` 现序一致），各自负责容器/标题样式：

```
Status → Progress → [pickup ? Redemption : Address] → Items
       → [pickup ? Pickup] → Totals(+ShippingBreakdown) → Meta → Actions
```

- 可见性：仍调用 `useOrderDetailConfig().visible(key)` 与 `isPickupOrder(order)`，口径不变。
- 块标题：`blocks[key].title`（`localizeOrderText(locale)`）优先，缺省取 i18n 兜底（`orderSummary` / `amount`）。容器内置 4 行 `title(key, dft)` 帮助函数，替代 `*Block` 薄封装（`*Block` 仍服务于 `classic` / `confirmation`，不删）。
- 容器样式：cn = 既有 `rounded-xl border ... shadow-sm`；jd = `rounded-md shadow-[0_1px_2px_rgba(0,0,0,.05)]` + 标题红竖条；mall = `rounded-[18px] shadow-[0_3px_14px_rgba(17,39,.06)]` + 标题 5px 珊瑚竖条。
- `line-actions` 插槽：`OrderItems` 的 `#line-actions` 继续透传（售后申请按钮依赖此插槽，**必须透传**）。
- `OrderDetailJd.vue` 重写为「京东风容器」（对齐 mockup），积木顺序/可见性/config 读取口径不变。

## 7. 数据流 / 错误处理

- **列表**：`useOrderList(activeTab)` → `GetOrderHistory` → 过滤 → tab 过滤 → 容器渲染；`loadMore` 增量 `take`；错误 → `messages.order.loadFailed`；空 → `messages.order.empty`；加载中 → `messages.general.loading`（三版式统一文案，不新增）。
- **详情**：`GetOrderByCode` → `OrderDetailRenderer` → 版式容器 → 共享积木（`OrderRedemptionCard` 自行拉 `OrderRedemptionCode`）。
- **不崩溃承诺**：坏配置 JSON → `null` → 默认版式；未知 `layout` 值 → 默认版式；自提单缺核销数据 → `OrderRedemptionCard` 既有「未找到核销数据」分支；`deliveryType` 缺失 → 归入「自营」分组。

## 8. 测试与交付

- **typecheck**：`npm run typecheck`，本次涉及文件**零新增错误**（基线既有错误不计）。
- **构建**：`pnpm build` 通过。
- **手机截图（390×844 / dpr=2，Playwright 移动视口）**：列表 3 张（cn/jd/mall）+ 详情 3 张（cn/jd/mall，自提单含核销码）= 6 张，存 `scripts/shots/`，补入操作手册。
- **回归**：默认 `card` 列表与默认 `jd` 详情可正常访问；后台 `layout` 非法值回退默认；`classic` / `confirmation` 不受影响；`line-actions`（售后申请）按钮仍在。
- **双语言**：zh-CN / en-US 同步；截图核对页面无 `messages.` 裸显。
- **部署**：`node scripts/deploy.mjs`（本地构建 → scp），**服务器不构建**。

## 9. 范围外（本期不做）

- 页面 chrome（标题栏 / 返回导航 / sticky 标题卡）的版式化改造（沿用既有 header）。
- `classic` / `confirmation` 版式的视觉改造。
- 按「商家名」分组的完整多商户列表（需后端/ GQL 扩商家字段，本期按配送类型分组）。
- 后台可视化配置 UI（`orderListConfig` / `orderDetailConfig` 仍按 JSON 写 channel customFields）。
- 列表 jd 的「联系客服」入口（无处理逻辑）。

## 10. 关联文件

**改**
- `app/utils/order-config.ts`（类型 + 白名单兜底）
- `app/components/order/OrderStatusBanner.vue`、`OrderProgress.vue`、`OrderRedemptionCard.vue`、`OrderActions.vue`（+ `variant`）
- `app/components/order/OrderCardList.vue`（改用 `useOrderList`）
- `app/components/order/OrderListRenderer.vue`、`OrderDetailRenderer.vue`（map 扩展）
- `app/components/order/OrderDetailJd.vue`（京东风容器，对齐 mockup）
- `i18n/locales/zh-CN.ts`、`en-US.ts`（新增 `merchantPickup` / `pickupRedeemInfo` 等，双语言同步）

**新**
- `app/composables/useOrderList.ts`
- `app/components/order/OrderListCn.vue`、`OrderListJd.vue`、`OrderListMall.vue`
- `app/components/order/OrderDetailCn.vue`、`OrderDetailMall.vue`
- `scripts/_shot_order_layouts.py`（本地截图探针，`_` 前缀不入库产物）

**归档**
- `docs/superpowers/mockups/orders-multi-layout/`（6 份 mockup 源 + 6 张 mockup 截图 + 索引 README）

## 11. 转换到实施

用户确认本设计后，转入 `writing-plans` 生成实施计划（`plans/2026-09-25-orders-multi-layout-cn-jd-mall.md`），按 Task 逐项落地并在手机视口验收。