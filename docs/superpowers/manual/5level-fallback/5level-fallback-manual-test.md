# 5 级可回退风格体系 · 手动测试文档

> 环境：线上 C 端 www.youshop.cn + web-admin 运营后台（e.joho.cn/guanli）
> 视口：统一手机 390×844（dpr=2=780×1688），截图依项目铁律
> 范围：nshop C 端详情页/首页/主题换肤；分层矩阵证明每级有效性 + 端到端场景

---

## 0. 理解 5 级回退链

```
L0 代码内建默认  → L1 全局配置(shop_global_config) → L2 风格模板(shop_template)
 → L3 店铺覆盖(channel customFields) → L4 页面/模块内建默认
```

- 每级**只定义自己较上一级的差异**，未配置则回溯上一级，逐级兜底。
- 主题令牌：`L0 默认 #ff6600` → L1 themeTokens → L2 palette/theme。
- 页面配置：`L1 defaults[page]` → L2 pages[page] → `L3 detailConfig/shopContent`。
- 块级：`visible/style` 缺省回退内建默认。

---

## O1 · 现状观察（只读基线，2026-09-19）

不改任何配置、只做线上只读观察，记录当前生效层级与截图，作为后续分层测试的开始基线。

### 默认渠道（__default_channel__，templateId=1 橙色经典）

| 观察项 | 实测结果 | 截图 |
|---|---|---|
| 首页主题 | 橙色 #FF6B00，导航渐变橙红、价格/标签/CTA 全橙 | `shots/screenshot-1789794702514.png` |
| 首页热门商品 | 卡片显示划线价（如 洗车 ¥20 ¥35） | 同上 |
| 详情主题/版式 | classic 版式，橙色主题，立即购买橙底白字 | `shots/screenshot-1789794865168.png` |
| 详情功能块 | gallery/info/price/promo/service/variants/purchase/description/reviews 全部可见 | 同上 |

**结论**：默认渠道当前实际落在 **L2 模板「橙色经典」** 之上（非 L1/L0），说明模板引用链路线上生效。这是分层测试的基线——A3 步骤已验证 L2 已生效，后续测 L0/L1/L3/L4 均从该基线上做差异操作。

> 截图已按项目铁律保存至 `shots/`，用于回归对比。

---

## Part A · 分层矩阵（核心测试法：制造上级差异 → 逐级撤销 → 验证回退）

> 通用原则：每测一层，先让上层留空，再在当层制造唯一变量，C 端应只反映当层差异。

### A1 L0 代码内建默认（无任何配置）

**前置**：渠道 `__default_channel__` 模板置「不使用模板」；全局 defaults 清空为 `{}`。

| 步骤 | 操作 | 预期结果 |
|---|---|---|
| 1 | web-admin → 店铺信息 → 风格模板选「不使用模板」，保存 | 保存成功 |
| 2 | web-admin → 全局配置(nshop) → defaults 清空为 `{}`，保存 | 保存成功 |
| 3 | 手机访问 www.youshop.cn 打开任意商品详情 | 主题主色为代码默认 `#ff6600`；详情页为 classic 布局 |
| 4 | 检查各功能块 | 全部可见（gallery/info/price/promo/coupon/service/variants/purchase/description/reviews 均显示）|
| 5 | 截图留档 | 标「L0」 |

**通过标准**：无任何配置时 C 端按内建默认渲染，不报错、不空白。

**回滚**：恢复全局 defaults 为修复后值（见附录）。

### A2 L1 全局配置（主题色 + 页面级 defaults）

**前置**：渠道不引用模板；只改 L1。

| 步骤 | 操作 | 预期结果 |
|---|---|---|
| 1 | 全局配置(nshop) → 主色改为 `#4caf50`（绿色），defaults.product 写入 `{"version":2,"layout":"floor","blocks":{}}`，保存 | 保存成功 |
| 2 | 手机刷新详情页 | 主题色变绿；详情页变 `floor` 楼层版式（证明 L1 页面级 defaults 生效）|
| 3 | 首页 | 仍 L0（defaults.home 未配则回溯 L0：sections 空 → 空首页）|
| 4 | 截图留档 | 标「L1」 |

**通过标准**：无模板时 L1 全局配置对主题/页面级均生效；未配页面回溯 L0。

**回滚**：主色改回 `#ff6600`，defaults 恢复修复后值。

### A3 L2 风格模板（模板覆盖 L1 + 引用无效回退）

**前置**：全局 defaults 保持 A2 值；改渠道模板引用。

| 步骤 | 操作 | 预期结果 |
|---|---|---|
| 1 | 模板库确认「橙色经典(id=1)」启用 | 状态启用 |
| 2 | 店铺信息要将模板选「橙色经典」 | 保存成功 |
| 3 | 手机刷新详情页 | 主题色变橙 `#e1251b`（覆盖 L1 绿）；版式按模板 pages.product（覆盖 L1 floor）|
| 4 | 截图留档 | 标「L2-有效」 |
| 5 | 模板库把「橙色经典」停用 | 确认弹窗提示「停用后 C 端回退全局默认」|
| 6 | 手机刷新详情页 | 回退 L1：主题色变回绿；版式回 floor |

**通过标准**：有效模板覆盖 L1；引用停用模板时后端返回 null → C 端回退 L1（不报错不空白）。

**跨端测试（P3 相关）**：若把该 nshop 店铺模板误选成 vshop 模板（id=4/5/6），后端应判跨端返回 null → 回退 L1。P2 修复后后台已按 app 过滤，正常不会出现跨端模板。

**回滚**：恢复「橙色经典」启用。

### A4 L3 店铺覆盖（channel detailConfig 覆盖模板）

**前置**：渠道引用「橙色经典」模板；模板 pages.product 只含 `layout:classic`。

| 步骤 | 操作 | 预期结果 |
|---|---|---|
| 1 | 店铺信息 → 详情页版式选「floor」，价格样式先不动 → 保存 | 保存成功（写入渠道 detailConfig）|
| 2 | 手机刷新详情页 | 版式变 `floor`（覆盖模板 L2 的 classic）；主题色仍橙（模板 L2 未被覆盖）|
| 3 | 店铺信息 → 促销方案库去掉所有方案 → 保存 | C 端详情页促销块无方案（块级打包隐藏/空态势）|
| 4 | 截图留档 | 标「L3-有效」 |
| 5 | 店铺信息把详情页版式选回「classic」保存 | C 端回退模板 L2 的 classic |

**通过标准**：L3 只覆盖其明确声明的字段；未覆盖字段保持 L2 值；撤销后回退 L2。

**回滚**：详情页版式选回 classic。

### A5 L4 块内建默认（单块缺省）

**前置**：渠道引用「橙色经典」；模板 pages.product.blocks 只写单个块（如 `"service":{"visible":false}`），其余块不写。

| 步骤 | 操作 | 预期结果 |
|---|---|---|
| 1 | 编辑「橙色经典」pages.product.blocks = `{"service":{"visible":false}}`，保存 | 保存成功 |
| 2 | 手机刷新详情页 | 服务块隐藏（L2 模板显式 false）；其余块（gallery/price/promo 等）**仍显示**＝内建默认 true |
| 3 | 截图留档 | 标「L4-缺省回退」 |
| 4 | 把模板 blocks 改回 `{}` 保存 | 服务块恢复显示（回溯内建默认 true）|

**通过标准**：单块缺省时，该块回退内建默认，不受同层其他块影响。

**回滚**：blocks 恢复 `{}`。

---

## Part B · 端到端场景

### B1 全店换肤
1. 全局配置(nshop) 主色改粉 `#ff9a9e`,保存 → 全站 C 端主色整体变粉（首页/详情/购物车/我的）。
2. 截图全站；改回 `#ff6600`。

### B2 切换模板
1. 店铺信息模板「生鲜绿」→ 详情页/首页配色与版式联动变化。
2. 截图；切回「橙色经典」。

### B3 单店覆盖
1. 渠道 detailConfig `{"layout":"dualBuy","blocks":{"promo":{"visible":false}}}`（JSON 写入）。
2. C 端该渠道详情页变双买版式 + 促销块隐藏；全局/模板不被污染（其他渠道不变）。
3. 截图；清空渠道 detailConfig 恢复。

### B4 模板停用/删除回退
1. 停用店铺引用的模板 → C 端回退 L1（主题绿/floor）。
2. 删除模板 → 同上回退，不报错。
3. 重新启用/重建模板恢复。

### B5 新增店铺默认 L1
1. 新建渠道（不引用模板）→ C 端直接走 L1 全局配置，无空白。

---

## Part C · 线上验收与回滚

### 验收清单（每层关键断言 + 截图）
- [ ] L0：空配置 → 主题 `#ff6600` + 全块可见 + classic
- [ ] L1：改主题色 + defaults.product → 色变 + 版式变 floor
- [ ] L2：引用模板 → 覆盖 L1；停用/跨端 → 回退 L1
- [ ] L3：detailConfig → 覆盖模板；撤销 → 回退 L2
- [ ] L4：单块 visible:false → 仅该块隐藏，其余回退 true
- [ ] P1 验证：全局配置页 defaults 能读到 nshop 的 product/home 示例值
- [ ] P2 验证：店铺信息模板原色列表已按目标端过滤（nshop 看不到 vshop 模板）

### 回滚要点
1. 改任一配置前先记录原值（尤其主题色/模板 id/detailConfig/defulats）。
2. 恢复顺序**逆向**：先还原 L3 → 再 L2 → 再 L1。
3. 停用/误删的模板：立即重新启用/用「复制」重建并重新引用。
4. 所有回滚后刷新 C 端确认恢复原审美。

### 异常判断
- 某级配置后 C 端无变化 → 检查 `GetShopTemplate/GetShopGlobalConfig/GetChannelTheme` 三查询返回：
  - `shopTemplate` 为 null → 引用跨端/停用/未引用，回退 L1（符合预期）。
  - 页面块空白 → 疑坏 JSON：核实 `detailConfig/pages` JSON 是否合法对象。
- `useThemeConfig.refreshTheme` 仅在页面/操作后触发；改分布配置后**刷新页面**重新 SSR。

---

## 附录：本次修复说明（2026-09-19）

| 编号 | 问题 | 修复 | 验证 |
|---|---|---|---|
| P1 | 生产 nshop `shop_global_config.defaults` 为空 `{}` | 写入 `{"product":{"version":2,"layout":"classic","blocks":{}},"home":{"sections":[]}}`（与 L0 等价，不改变未引用模板渠道展示） | SQL 已 UPDATE 1；全局配置页可读到 |
| P2 | 店铺覆盖页模板列表不过滤 app（`templateApi.list()` 不带 app） | `shop-info/index.vue` 新增「目标端」分段器 tplApp + `switchTplApp`，列表按 `templateApi.list(tplApp)` 拉取，`enabledTemplates` 过滤 `t.app===tplApp` | 需 web-admin 部署后验证 |
| P3 | vshop 模板（id=4/5/6）零渠道引用 | 不处理，属预留（跨端引用会自动回退 L1 | — |
| P4 | 其余渠道未设模板 → 天然 L1 回退 | 不处理，作为 A2/B5 测试场景利用 | — |

**涉及代码**
- `d:\zhao\vshop\web-admin\src\pages\decorate\shop-info\index.vue`（P2）
- 生产库存：`shop_global_config`（P1）

**部署状态**：P1 已直接改库生效；P2 需 web-admin 本地 build:h5 → deploy 后生效。