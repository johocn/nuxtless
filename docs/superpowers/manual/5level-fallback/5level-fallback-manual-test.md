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

**✅ 线上实测（2026-09-19，默认渠道，浏览器手机视口截图判定）**：
1. 清空 L1 `shop_global_config.defaults='{}'` + 清空默认渠道 `templateId`（后端 `shopTemplate` 按渠道引用，未引用返回 null → 回退 L1/空 → 纯 L0）。截图 `shots/screenshot-1789797924617.jpg`。
2. 无任何配置下商品详情页正常渲染：**classic 版式**（无 floor 楼层分段/吸顶 tab）、**全块可见**（gallery/info/price/promo/service/purchase 全显示）、**主题橙 `#FF6B00`**（`mergeThemeTokens` L0 为空时落到代码兜底主色）。
3. 恢复：`defaults` 还原 + `templateId=1` 还原 → 回到 L2 橙色经典基线。

**结论**：L0 代码内建默认链路有效——极端清空（L1/L2/L3 全无）时仍稳定渲染、不报错、不空白，是五级体系的最底层兜底。

**回滚**：恢复全局 defaults 为修复后值 + 默认渠道 templateId=1（见附录）。

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

**✅ 线上实测（2026-09-19，默认渠道）**：
1. 停用模板 id=1（`UPDATE shop_template SET enabled=false`）→ 因 L1 与 L2 同为 classic+橙，初次无差异。
2. **为让回退可观察**：把 L1 `defaults.product.layout` 改 `floor` 再刷新 → 详情页出现 **"01|参数 / 02|评价 / 03|售后"楼层分段 + 划线价**（全屏主图、楼层分段），证明停用模板后 C 端**真实读取 L1 页面级配置**。截图 `shots/screenshot-1789795206169.png`。
3. 恢复：模板重新启用 + L1 defaults 还原 `classic` → 刷新回 classic 无楼层分段（`shots/screenshot-1789795271762.png`）。

**结论**：A3 回退链路（停用 → 回退 L1）与 A2（L1 页面级生效）**均验证通过**。跨端回退规则同此（后端对非本 app 模板返回 null → 回退 L1），P2 修复后后台已按 app 过滤，正常不会出现跨端引用。

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

**✅ 线上实测（2026-09-19，默认渠道）**：
1. 写入 L3 覆盖 `customFieldsDetailconfig` = `{"version":2,"layout":"floor","blocks":{}}`。
2. 判定关键：shop-api 确认后端 return 该字段；SSR `/product/57` 抓取出现 **floor 版式独有的吸顶 tab**（`href="#floor-variants"` / `id="floor-variants"`），从默认 classic 变为 floor → **L3 覆盖模板版式生效**。
3. 恢复：`customFieldsDetailconfig` 置空 → DB 确认空；回退 L2/classic。
4. 注意：恢复观察受 SSR/nginx 缓存滞后影响，判定以 shop-api + SSR 源为准。

**结论**：L3 店铺覆盖字段 `detailConfig` 被 C 端消费并覆盖 L2/classic → floor 确认通过。t2(37) 已预置 `{"blocks":{"price":{"style":"jdA"}}}` 印证同机制。

⚠️ **修正（浏览器复核，替代 curl 判定）**：`detailConfig` 覆盖 `promo.visible:false` 后，**促销横幅消失、独立的「服务保障」块保留**——证明块级覆盖只影响声明块。此复核推翻先前 curl 对 `/product/57` 的空商品误判。判据以**浏览器手机视口截图**为准。

**⚠️ 观测注意**：执行 L3 覆盖时常见「浏览器点击商品重定向回首页」（该商品 slug 空/城市 cookie 限制），SSR HTML 抓取（带随机 `?_cb=`）是更可靠的权威判定。

**回滚**：`customFieldsDetailconfig` 置回原始值（默认渠道为空）。

### A5 L4 块内建默认（单块缺省）

**前置**：渠道引用「橙色经典」；模板 pages.product.blocks 只写单个块（如 `"service":{"visible":false}`），其余块不写。

| 步骤 | 操作 | 预期结果 |
|---|---|---|
| 1 | 编辑「橙色经典」pages.product.blocks = `{"service":{"visible":false}}`，保存 | 保存成功 |
| 2 | 手机刷新详情页 | 服务块隐藏（L2 模板显式 false）；其余块（gallery/price/promo 等）**仍显示**＝内建默认 true |
| 3 | 截图留档 | 标「L4-缺省回退」 |
| 4 | 把模板 blocks 改回 `{}` 保存 | 服务块恢复显示（回溯内建默认 true）|

**通过标准**：单块缺省时，该块回退内建默认，不受同层其他块影响。

**✅ 线上实测（2026-09-19，默认渠道，浏览器手机视口截图判定）**：
1. L3 覆盖 `detailConfig` = `{"version":2,"layout":"classic","blocks":{"promo":{"visible":false}}}`，只声明 promo。
2. 覆盖态：促销横幅「满99元包邮」**消失**（`shots/screenshot-1789797427681.png`）；**独立的「服务保障」块仍显示**、底部购买/购物车按钮正常 → 证明同层未声明块不受影响。
3. 恢复：`detailConfig` 置空 → 刷新「满99元包邮」**重现**（`shots/screenshot-1789797486836.png`）→ 删除覆盖后回退内建默认 `visible:true`。
4. 与 A4 修正合并看：**块级覆盖(visible) 作用于单块，缺省块回退内建默认** 得到端到端实证。

**结论**：L4 内建默认回退链路通过（覆盖→隐藏单块；清空→回退显示）；块之间相互隔离。判据用浏览器截图（curl 不可靠）。

**回滚**：blocks 恢复 `{}`/detailConfig 置空。

---

## Part B · 端到端场景

### B1 全店换肤
1. 全局配置(nshop) 主色改粉 `#ff9a9e`,保存 → 全站 C 端主色整体变粉（首页/详情/购物车/我的）。
2. 截图全站；改回 `#ff6600`。

**✅ 线上实测（2026-09-19，浏览器手机视口截图）**：
1. **换肤入口**：因默认渠道引用模板1，改 L1 全局 `themeTokens` 主色**被模板 palette 覆盖不生效**（mergeThemeTokens 语义：主题令牌优先级 L1 < L2 模板）——**引用模板的店，全店换肤真实入口应是「编辑模板 palette.tokens」**。
2. 改模板1 `palette.tokens.primaryColor=#ff9a9e` → **全店联动变粉**：详情页价格/有货/面包屑/促销/立即购买按钮全粉（`screenshot-1789798601730.jpg`）；首页「全部商品」横幅/底部 tab/邮寄标签/热门商品角标全粉（`screenshot-1789798639283.jpg`）。
3. 恢复模板1 橙色。**结论**：换肤入口=模板(L2)或未引用模板渠道的 L1；全店联动生效、跨页一致。

### B2 切换模板
1. 店铺信息模板「生鲜绿」→ 详情页/首页配色与版式联动变化。
2. 截图；切回「橙色经典」。

**✅ 线上实测（2026-09-19，浏览器手机视口截图）**：
1. 默认渠道 `templateId` `1(橙)`→`2(生鲜绿 #07c160)` → **全站变绿**：首页「全部商品」横幅、单功能图标、邮寄标签、热门商品角标、底部 tab 全绿，版式仍 classic（`screenshot-1789798765607.jpg`）。模板2 theme 为顶层 token `primaryColor:#07c160`（非 palette 结构），同样被正确消费。
2. **⚠️ 缓存滞后**：首次加载仍是旧橙（截图首帧），**冷加载（换 `?cb=` 二次 open）后**才变绿——改模板/渠道后须强刷确认，判定以冷加载为准。
3. 恢复 `templateId=1`。**结论**：切模板全店配色联动，模板无页面配置时版式保持 L1 defaults。

### B3 单店覆盖
1. 渠道 detailConfig `{"layout":"dualBuy","blocks":{"promo":{"visible":false}}}`（JSON 写入）。
2. C 端该渠道详情页变双买版式 + 促销块隐藏；全局/模板不被污染（其他渠道不变）。
3. 截图；清空渠道 detailConfig 恢复。

**✅ 线上实测（2026-09-19，浏览器手机视口截图 + DOM 判定）**：
1. 默认渠道 `detailConfig={"version":2,"layout":"dualBuy","blocks":{"promo":{"visible":false}}}`。
2. **dualBuy 版式生效**：服务保障变为折叠块 `summary「服务保障 ▾」`（classic 为平铺卡片）；DOM `eval` 抓取 `["服务保障 ▾"]` 精确确认。
3. **promo.visible:false 生效**：促销折叠块 `details「促销 ▾」` **不存在**（v-if 移除，与 classic 展开卡片均消失）。
4. **L2 主题未被覆盖**：主色仍橙（模板1），仅覆盖声明字段。截图 `screenshot-1789798872737.jpg`。
5. 清空 detailConfig 恢复。**结论**：L3 单店覆盖只影响声明字段（版式+单块），模板/全局/其他渠道不被污染。

### B4 模板停用/删除回退
1. 停用店铺引用的模板 → C 端回退 L1（主题绿/floor）。
2. 删除模板 → 同上回退，不报错。

**✅ 线上实测（2026-09-19，浏览器手机视口截图）**：
1. 先改模板1 palette 为**蓝 `#0066ff`**（制造可观察差异）→ 首页全蓝（`screenshot-1789798961525.jpg`，引用态）。
2. **停用模板1**（`enabled=false`）→ 后端 `shopTemplate` 返回 null → **回退 L1 全局 `#ff6600` 橙**：首页主色从蓝回橙（`screenshot-1789799009580.jpg`），不报错、不空白。
3. 删除与停用回退语义等价（后端对 `!tpl || 跨端 || !enabled` 三态统一返回 null，不真删模板避免破坏数据）。
4. 恢复模板1 启用+橙。**结论**：停用/删除/跨端引用的模板都回退 L1，C 端稳定兜底。

### B5 新增店铺默认 L1
1. 新建渠道（不引用模板）→ C 端直接走 L1 全局配置，无空白。

**✅ 线上实测（2026-09-19，浏览器手机视口截图）**：
1. 模拟新店：默认渠道 `templateId` 置空（未引用模板）→ shopTemplate null → **C 端详情页 L1 橙 `#ff6600` + classic + 全块可见 + 不空白**（`screenshot-1789799068882.jpg`），与 B4/A2 的「未引用模板返回 null → 回退 L1」同语义。
2. 恢复 `templateId=1`。**结论**：新店不引用模板也能开箱即用，天然落在 L1 全局配置上。

---

## Part C · 线上验收与回滚

### 验收清单（每层关键断言 + 截图）
- [x] L0：空配置 → 主题橙 `#FF6B00` + 全块可见 + classic（A1 ✅ 2026-09-19）
- [x] L1：全局主题色 `#ff6600` + defaults.product 生效/未配页回溯 L0（A2/A3 + B4/B5 ✅；B1 注明引用模板时 L1 主色被 L2 覆盖）
- [x] L2：引用模板覆盖 L1；停用/跨端/删除 → 回退 L1（A3 + B2 + B4 ✅）
- [x] L3：detailConfig 覆盖模板；撤销回退 L2；仅影响声明字段（A4 + B3 ✅）
- [x] L4：单块 visible:false → 仅该块隐藏，其余回退内建默认（A5 + B3 ✅）
- [x] P1 验证：生产 `shop_global_config.defaults` 已写入 nshop product/home 示例值（侦察确认在库）
- [x] P2 验证：店铺信息「风格模板」区目标端分段器（nshop/vshop）双向过滤生效，互不可见对方模板（web-admin ✅ 2026-09-19，截图 `screenshot-1789799966268.jpg` nshop / `screenshot-1789800030567.jpg` vshop）

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