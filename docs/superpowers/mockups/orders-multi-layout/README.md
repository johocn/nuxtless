# 订单列表 / 订单详情 三版式（cn · jd · mall）— mockup 归档

> 归档日期：2026-09-25
> 视觉真源：本目录 6 份 HTML（自包含 CSS，可直接双击或用任意静态 server 打开）
> 截图：`shots/*.png`（390×844 / dpr=2 / fullPage，与交付验收口径一致）
> 对应设计：`docs/superpowers/specs/2026-09-25-orders-multi-layout-cn-jd-mall-design.md`
> 对应实现计划：`docs/superpowers/plans/2026-09-25-orders-multi-layout-cn-jd-mall.md`

## 1. 索引

| 版式 | 源 mockup | 截图 | 落地组件 |
|---|---|---|---|
| 列表 `cn` | [order-list-cn.html](./order-list-cn.html) | [order-list-cn.png](./shots/order-list-cn.png) | `layers/base/app/components/order/OrderListCn.vue` |
| 列表 `jd` | [order-list-jd.html](./order-list-jd.html) | [order-list-jd.png](./shots/order-list-jd.png) | `layers/base/app/components/order/OrderListJd.vue` |
| 列表 `mall` | [order-list-mall.html](./order-list-mall.html) | [order-list-mall.png](./shots/order-list-mall.png) | `layers/base/app/components/order/OrderListMall.vue` |
| 详情 `cn` | [order-detail-cn.html](./order-detail-cn.html) | [order-detail-cn.png](./shots/order-detail-cn.png) | `layers/base/app/components/order/OrderDetailCn.vue` |
| 详情 `jd` | [order-detail-jd.html](./order-detail-jd.html) | [order-detail-jd.png](./shots/order-detail-jd.png) | `layers/base/app/components/order/OrderDetailJd.vue` |
| 详情 `mall` | [order-detail-mall.html](./order-detail-mall.html) | [order-detail-mall.png](./shots/order-detail-mall.png) | `layers/base/app/components/order/OrderDetailMall.vue` |

版式路由：`OrderListRenderer.vue` / `OrderDetailRenderer.vue` 按 channel `customFields.orderListConfig` / `orderDetailConfig` 的 `layout` 字段选组件。

## 2. 视觉语言速查

**订单列表**

| | cn | jd | mall |
|---|---|---|---|
| tab | 药丸，选中 `#e1251b` 红底白字 | 下划线，选中 2px `#e1251b` 下划线 | 渐变药丸 `#e0433f → #ff6a6c` |
| 列表容器 | 单卡片纵向流 `gap-12px` | 分区（竖条 + 分区名），无卡片 | `gap-14px` |
| 卡片 | `rounded-xl` + 1px `#ececec` 描边 + 轻投影 | 分区内平铺行（无卡片） | `rounded-[18px]` 无边框 + `0 3px 14px #1118270f` |
| 状态徽标 | 描边浅底丸（语义色） | 纯文字色 | 实心浅底丸 |
| 缩略图圆角 | 8 | 4 | 12 |
| 按钮 | 药丸 | 4px 圆角描边 | 药丸（CTA 珊瑚渐变实心） |

**订单详情（自提·含核销码）**

| | cn | jd | mall |
|---|---|---|---|
| 状态头 | 按订单状态取语义渐变，`rounded-xl` | 固定京东红渐变 `#c8161d → #e1251b → #f04b2f`，`rounded-md` | 固定珊瑚渐变 `#e0433f → #ff6a6c`，`rounded-2xl` |
| 进度步进 | 药丸，选中 `bg-brand-600` | 方块 `rounded-[3px]`，选中 `#e1251b` | 药丸 + 珊瑚渐变 + 投影 |
| 区块容器 | `rounded-xl` + 描边 + 轻投影 | `rounded-md` 无描边 + `0 1px 2px` | `rounded-[18px]` 无描边 + `0 3px 14px` |
| 区块标题 | 纯文字 | 3px 红竖条 | 5px 珊瑚竖条（更粗） |
| 核销码区 | 琥珀高光卡 + `brand-600→brand-500` 码区 | 白卡 + 2px 红顶边 + 京东红码区 | 白卡 + `#ffe0dd` 边 + 珊瑚投影 + 珊瑚码区 |
| 按钮 | 药丸 | 4px 圆角 | 药丸 |

## 3. 与 mockup 的有意偏差（实现时勿照 mockup 补）

| mockup 元素 | 落地处理 | 理由 |
|---|---|---|
| 各版式顶部 navbar / sticky 标题卡 | 不实现，由页面既有 `<header>` 承担 | 页面 chrome 不因版式而变，避免标题重复 |
| 列表 jd 商家头部「联系客服 ›」 | 不实现 | 无对应逻辑，不落死链 |
| 列表 jd 按「商家名」分组 | 改为按**配送类型**分组（自营 / 自提门店） | `GetOrderHistory` 的 `OrderBase` 片段无商家名字段 |
| 列表 cn/jd/mall「去支付」按钮 | 不实现 | 系统无「对已有未支付订单发起支付」入口，补按钮只能落死链 |
| 列表 cn 状态徽标浅底填充 | 复用既有 `OrderStateBadge` 描边丸 | 复用既有组件，语义色与全局一致 |
| 列表商品行「规格」副标题 | 不实现 | `OrderBase` 片段无规格/选项值字段 |

## 4. 分叉说明（勿照错稿做）

- 仓库根下的 `.superpowers/brainstorm/671-1788361862/content/detail-finalize.html` 画的是**行级「− 2 ＋」数量步进**。提交 `9f50263`（fix(checkout): 逐箱结算收敛为整行粒度）已把逐箱结算收敛为**整行粒度**——**该稿已过时，勿照错稿做**。
- 本轮定稿的是本目录 6 份 `order-{list,detail}-{cn,jd,mall}.html`，以此为准。