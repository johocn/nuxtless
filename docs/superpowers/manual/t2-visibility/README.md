# t2（二月兰会员）前台可见性修复 · 操作手册与验收记录

> 范围：nshop C 端前台（首页可见性 / 城市口径）+ Vendure 后端 `pickupLocations` 字段
> 日期：2026-09-27
> 设计文档：`docs/superpowers/specs/2026-09-27-t2-storefront-visibility-and-blocks-design.md`
> 验收环境：线上 `https://www.youshop.cn/t2/`（手机视口 390×844，dpr=2）
> 本轮代号：**P0**（用户补充指令：「二月兰配送全部是长春地址统一，优先执行这个方案」）

## 一、本次改动四件事

### ① 后端：`pickupLocations` 暴露省市字段（P0-A）

- 文件：`d:\zhao\vendure\packages\cjk-plugin\src\plugin.ts`（shop 端 `type PickupLocation`）
- 新增可空字段 `province / city / district / street`（实体列早已存在，此前 admin 端已暴露、shop 端未暴露）。
- 影响面：前台城市选择器可直接从自提点取「可用城市」，无需额外接口。

### ② 数据：t2 城市口径统一为「长春市」（P0-B）

- 脚本：`scripts/fix-t2-changchun-city.mjs`（幂等，可重复执行；执行前自动备份到 `d:\zhao\_backup\`）
- 改动对象（只动 t2 相关，**不动默认仓 id=3 与自提点**）：

| 对象 | 字段 | 改前 | 改后 |
|---|---|---|---|
| 商品 59 / 71 | `belongCity` | `长春` | `长春市` |
| 商品 59 / 71 | `serviceCities` | `[]` | `["长春市"]` |
| 商品 60 / 61 / 73 / 76 / 77 / 79 | `belongCity` | `null` | `长春市` |
| 商品 60 / 61 / 73 / 76 / 77 / 79 | `serviceCities` | `null` | `["长春市"]` |
| 库存地 id=6（t2 虚拟仓） | `serviceCities` | `null` | `["长春市"]` |

- 写入方式：**先读回完整 customFields → 合并目标字段 → 提交**，避免清掉 `deliveryMethods` / `kind` / `code` 等既有字段。
- 复核：二次运行输出「更新 0 / 跳过 9」，幂等成立；读回字段无丢失。

### ③ 前端：城市名匹配单一真源（P0-C）

- 新增 `layers/base/app/utils/city-match.ts`（纯函数，SSR 友好）：
  - `normalizeCity(name)`：trim + 去末尾「省/市/区/县」+ 小写（`长春市` ↔ `长春`）
  - `matchCity(a,b)`：归一化后 相等 ∨ 互为前缀；任一侧为空按「不判定 → 匹配」
  - `matchAnyCity(list, city)`：非数组/空数组/城市为空 = 不限制
- 口径关系：**本模块是后端 `stock-city-filter.ts:cityServes`（trim + lowercase 相等/前缀）的更宽松超集**——后端能匹配的，前端一定能匹配。
- 消费方：`productVisibility.ts`、`useCityService.ts`（原各自内联一份匹配逻辑，现统一引用此模块）。

### ④ 前端：未选城市时不再误杀商品（P0-C，**首页空白的主因**）

- 文件：`layers/base/app/utils/productVisibility.ts` → `isProductVisible()`
- 改动：`if (!ctx.city) return true;`（原逻辑在未选城市时 `canPickup` 恒为 `false`）。
- 原因：t2 是**单能力渠道（仅门店自提）**，前端被 `lockedMode` 锁成 `SELF_PICKUP`，而未选城市时 `city === belongCity` 恒不成立 → 首页 8 个商品全被过滤 → 楼层 `v-if` 全假 → 首页空白。
- 语义：未选城市时前端不掌握任何城市维度信息，只排除「已知不可达」。

### ⑤ 前端：可用城市列表 + 城市选择器快捷区（P0-C）

- 新增 `layers/base/app/composables/useAvailableCities.ts`，返回 `{ cities, loaded, ensureLoaded, isPickupOnly }`：
  - **仅自提渠道**：渠道能力就绪后自动预取 `pickupLocations` 的 `city` 去重（客户端执行，不增加 SSR 请求）。
  - **含快递渠道**：惰性聚合 `serviceCities`（`SearchProducts` → `GetProductsByIds`），城市面板打开时触发一次，缓存 + 并发去重 + 失败静默。
- `layers/base/app/components/header/CitySelector.vue`：面板顶部新增「可用城市」快捷区；**非空时替代「热门城市」区**，为空时保持原状（省/市两级列表与定位行为不变）。
- `layers/base/gql/queries/map.gql`：`GetPickupLocations` 增取 `province / city / district`。
- 词条：`nav.availableCities`，**12 个语言包全部补齐**（zh-CN / en-US / pt-BR / it-IT / fr-FR / fa-IR / es-ES / de-DE / ru-RU / bg-BG / ko-KR / ja-JP）。

## 二、验收结果（线上，2026-09-27）

### 2.1 接口断言

| 断言 | 结果 |
|---|---|
| t2 `pickupLocations` 返回 5 条且 `city` 全为「长春市」（province 吉林省） | 通过（id 13/1/14/15/16） |

### 2.2 手机视口验收（390×844 / dpr=2）

| # | 验收项 | 结果 | 截图 |
|---|---|---|---|
| 1 | t2 首页出现商品楼层（不再是空白） | 通过：楼层标题 `["品牌闪购","热门商品"]`，去重后 **8 个商品卡**，无空态文案 | [01](shots/01-t2-home-nocity.png) |
| 2 | **未选城市 = 不过滤**（本次修复核心） | 通过：干净 context（无 localStorage、未选城市）首屏即渲染 8 张卡 | [01](shots/01-t2-home-nocity.png) |
| 3 | 城市面板出现「可用城市」区且含「长春市」 | 通过：唯一条目「长春市」；无「热门城市」区；下方保留「全部省份」 | [02](shots/02-t2-city-panel.png) |
| 4 | 选中「长春市」后首页仍有商品 | 通过：顶栏显示「长春市」，热门商品楼层保留 8 张卡 | [03](shots/03-t2-home-changchun.png) |

补充观测（客户端网络，SSR 直出后共 8 次 shop-api 请求，全部 200，无 4xx/5xx）：`GetPickupLocations×1`、`GetMapDistricts×1`、`ActiveOrder/GetActiveOrder×1`、`GetActiveCustomer×1`、`GetMapSdkConfig×1`；console error/warning **0 条**。

> 注：首页首屏数据（`GetMenuCollections` / `SearchProducts` / `GetProductsByIds` / `GetChannelTheme`）由 **HTML SSR 内联**，客户端 0 次请求属正常表现，非静默失败。

## 三、回归步骤（可复现）

```bash
# 1) 数据口径复核（幂等，安全）
node scripts/fix-t2-changchun-city.mjs        # 期望「更新 0 / 跳过 9」

# 2) 单测
pnpm vitest run layers/base/app/utils/city-match.test.ts \
               layers/base/app/utils/productVisibility.test.ts

# 3) 接口断言
node -e "fetch('https://www.youshop.cn/shop-api',{method:'POST',headers:{'Content-Type':'application/json','vendure-token':'66ruvnhh34svhckaa2i'},body:JSON.stringify({query:'query{ pickupLocations{ id name city province } }'})}).then(r=>r.json()).then(j=>console.log(JSON.stringify(j.data.pickupLocations.map(p=>p.name+':'+p.city))))"

# 4) 手机视口截图（390×844 dpr=2）
python tmp/verify-t2-p0.py                    # 产出 tmp/repro/p0-*.png
```

## 四、本轮遗留 / 下一轮（P1）线索

| 现象 | 状态 |
|---|---|
| 首页顶部横向分类条**可见但为空**（仅「全部商品」占位，`main` 内 `/category/` 链接数 = 0） | 待修（P1：分类取数可靠化） |
| t2 首页走**京东兜底楼层**（`hasBlocks=false`，无装修积木） | 待做（P1：新增「热门 / 推荐商品」积木） |
| `RecommendationRow` 链接用复数 `/products/`（断链） | 待修（P1） |
| 酒店房型 `hotelRoomConfig` 误挂在门票商品 59 的变体 57；房间商品 60/61 的变体为 NULL | 待修（P1） |