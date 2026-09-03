# 结算页恢复数量加减 · 金额/小计/汇总全链联动

> 状态：待评审。背景：上次修复因后端能力限制移除了结算页数量±步进器；本次按用户要求**恢复加减按钮**，并确保加减后订单行金额、商品小计、订单汇总真实联动。方案定位为「直接改整行购物车数量」（后端零改动）。

---

## 1. 需求澄清（用户拍板）

- **数量语义**：结算页加减按钮=**直接改活动订单该行数量**（即购物车那行的数量），联动小计、商品小计、订单总数/合计。
- **边界**：减到 `1` 即停（下限 1），整行移除请用行尾「删除」按钮；不复现上一轮「数量与价格打架」。
- **范围**：只改订单行数量 + 联动金额，确定好细节再实施（本 spec 即细节定稿）。
- **根因回顾**：上个任务目标是「修复加减数量但金额/小计/汇总不联动」的 bug，修复时却把加减按钮整段移除（`BoxLines.vue` 现为只读 `×{{ l.quantity }}`）。本次要**找回加减按钮 + 保证金额全链联动**。

## 2. 背景与现状（已勘察）

- `BoxLines.vue`：商品行商品数量现在只读显示 `×{{ l.quantity }}`，无步进器。
- `usePerBoxSelection.ts`：选择状态单例，存 `boxKey -> lineId -> qty`；`setLineChecked`（整行勾选/取消）、`selectedAmount`（对选中行 `lineTotal` 求和）、`excludedItems`（整行未选才回流）均已就位。因上一轮收敛为整行粒度，**无**行内部分数量语义。
- `orderStore.adjustOrderLine(lineId, quantity)`：**已存在**，走 `GqlAdjustOrderLine` 改活动订单行数量，成功后 `useOrderMutation` 更新本地订单。
- `orderStore.fetchOrderBoxes()`：已存在，`GqlGetOrderBoxes` 拉最新分箱（每箱/行 `quantity/unitPrice/lineTotal/配送方式/可用券/运费优惠`）。
- `CheckoutLayoutCn.vue` 等：进入结算页即 `await fetchOrderBoxes()`；汇总 `PerBoxSummary`/吸底 `SummaryBar` 均基于 `orderBoxes` 实时计算。
- `CartQuantityInput.vue`（购物车）：`UInputNumber` + `min=1` `max=10`（硬编码上限）。可作样式参考，但 **max=10 不适用**，结算页需自定义。

## 3. 方案（唯一推荐）：直接改整行购物车数量

**核心**：加减按钮调 `orderStore.adjustOrderLine(lineId, newQty)` 改**活动订单该行数量**，成功后 `fetchOrderBoxes()` 重新拉分箱，让 `quantity/unitPrice/lineTotal` 全从后端重算，驱动行金额、小计、合计、购物车角标全链联动。**后端零改动**、结算仍整行粒度（勾选=该行当前数量整行结算），不复现旧 bug。

### 3.1 数据流
```
点「− 数量 ＋」→ adjustOrderLine(lineId, newQty)   // 改真实购物车数量
  → 成功 → fetchOrderBoxes()                        // 后端重算并回传
  → orderBoxes 该行 quantity/unitPrice/lineTotal 更新
  → BoxLines 行金额          ✓
  → PerBoxSummary 商品小计    ✓
  → SummaryBar 合计/已选件数  ✓
  → 购物车角标                ✓
```
- 数量边界：`min=1`；不加硬编码 `max`（不复用 `CartQuantityInput` 的 max=10）。
- 由于金额/运费/券优惠皆源于后端 box 数据，重拉后自然一致。

### 3.2 改动清单（nshop 前端，零后端）

**`layers/base/app/components/checkout/BoxLines.vue`**
- 把只读 `×{{ l.quantity }}` 替换为「− 数量 ＋」步进按钮组 + 数量显示。
- 步进触发：`−` → 仅当 `l.quantity > 1` 调 `setLineQty(boxKey, lineId, l.quantity - 1)`；`＋` → 调 `setLineQty(boxKey, lineId, l.quantity + 1)`。
- 行金额仍显 `fmt(lineTotal)`（重拉后 = 新数量×单价，正确）；保留复选框与行尾「删除」。

**`layers/base/app/composables/usePerBoxSelection.ts`**
- 新增 `setLineQty(boxKey, lineId, newQty)`：校验 `newQty >= 1`，更新该行选中数量并**保持选中态**（选中行改数量后仍选中）。联动刷新由调用方在 `adjustOrderLine` 成功后 `fetchOrderBoxes()` 完成。
- （可选加固）将 `setLineQty` 封装为「改选中值 + 标记需重拉」：实现在 `adjustOrderLine` 成功回调里先置该行新数量、再重拉分箱即可，保持 `selection` 与后端一致。

**`layers/base/stores/useOrderStore.ts`（不改，仅调用）**
- `adjustOrderLine` / `fetchOrderBoxes` 均已存在，无需改。

**`PerBoxSummary.vue` / `SummaryBar`（不改，仅核验）**
- 汇总基于 `orderBoxes` 实时计算，重拉后自动联动；仅在实现后核对数字正确。

**i18n**：无新增固定文案（`−`/`＋` 为符号）；若加「已达库存上限/最少1件」等提示需补 `zh-CN`+`en-US`。

### 3.3 边界与防错
- **防抖**：连续快速点击时，`orderStore.loading` 期间禁用步进，避免并发 `adjustOrderLine` 竞态。
- **减到1停**：`min=1`，`−` 在 `quantity===1` 时禁用（或点击无效）。
- **改动即重拉**：每次 `adjustOrderLine` 成功都 `fetchOrderBoxes()`，杜绝旧数量截留（复用既有单例指纹刷新机制，见 `_boundFingerprint`）。
- **与既有操作共存**：加减只管数量；行尾「删除」（未选回流）与取消勾选维持现状，互不干扰。

### 3.4 不作本次范围
- **不做**后端 `checkoutSplitted` 部分数量能力（上一轮方案 B）——本方案直接改购物车整行，天然规避，无需后端接入。
- **不做**结算页改到 0 时整行移除——按「下限 1」处理，整行移除走「删除」按钮。
- **不加**库存上限禁用（本期不接库存联动；如需后续单独勘察）。

## 4. 验收标准

1. 结算页每行显示「− 数量 ＋」步进，数量下限 1（减到1则 `−` 失效）；点 `＋` 上限不做硬性限制（本期）。
2. 点 `＋`/`−` → **行金额、商品小计、订单合计、已选件数、购物车角标**全部即时联动刷新。
3. 行金额恒 = 单价 × 当前数量（后端重算），不再「数量变了金额不变」。
4. 加减后**不弹**「放回购物车（回流）」提示（数量一致、无差额）。
5. 快速连点不产生竞态错乱（loading 防抖）。
6. 手机视口（390×844, dpr=2）截图核对上述场景，并入操作手册。

## 5. 部署与交付

- 纯前端（nshop），改动文件：`BoxLines.vue`、`usePerBoxSelection.ts`（+核验 `PerBoxSummary.vue`/`SummaryBar`）。
- 交付 = 实现 + typecheck（核对本文涉及文件零新增错误）+ 手机截图 + 操作手册补充 + `node scripts/deploy.mjs` 部署 `www.youshop.cn`。