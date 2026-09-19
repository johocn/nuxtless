# 5 级可回退风格体系 · 手动测试与修复 Design

> 日期：2026-09-19
> 范围：全店体系（nshop C 端 www.youshop.cn + web-admin 运营后台）
> 交付物：① 手动测试文档 ② 后台设计说明 ③ C 端预计效果 mockup ④ 问题清单 + 本次修复

## 1. 背景

用户要求「手动测试 5 级可回退风格体系每一层级都有效」，并：
- 写测试文档（方案 C：分层矩阵 + 端到端场景 + 线上验收/回滚要点）
- 说明运营后台如何设计
- 给出 C 端预计效果（mockup 已呈现）
- 设计文档过程中检查功能有效性，发现设置不完善处本次一并修复

## 2. 5 级体系（现状核实结论）

| 层级 | 含义 | 存储/实现 | 核实状态 |
|---|---|---|---|
| L0 | 代码内建默认 | `detail-config.ts` BLOCK_DEFAULT_VISIBLE / layout 兜底 classic / 主题默认 | ✅ 有效 |
| L1 | 全局配置 | `shop_global_config`（themeTokens + defaults） | ✅ 逻辑有效，**defaults 为空** |
| L2 | 风格模板 | `shop_template`（theme + pages），渠道经 `customFields.templateId` 引用 | ✅ 有效 |
| L3 | 店铺覆盖 | 渠道 customFields：detailConfig / shopContent / templateId | ✅ 有效 |
| L4 | 页面/模块内建默认 | `blockVisible` / `blockStyle` / `parseDetailConfig` 兜底链 | ✅ 有效 |

合并链路（已核实代码）：
- `mergeThemeTokens`：`{}` ← L1 `themeTokens` ← L2 palette 展开 tokens ← L2 `theme`
- `mergePageConfig`：`{}` ← L1 `defaults[page]` ← L2 `pages[page]` ← L3 店铺覆盖 JSON
- `useThemeConfig` 三查询（GetShopTemplate / GetShopGlobalConfig / GetChannelTheme），`refreshTheme` 强制刷新
- 后端 `shopTemplate()`：优先渠道 templateId，跨端/停用返回 null → C 端回退 L1
- 主题落点：`nshop/app/app.vue` 读 themeTokens → CSS 变量

## 3. 生产数据现状（实测）

| 项 | 数据 |
|---|---|
| 模板库 | 6 个模板：nshop（橙色经典 id=1 / 生鲜绿 id=2 / 深色科技 id=3）+ vshop（id=4/5/6），全部 enabled |
| 全局配置 | nshop / vshop 各 1 条：`themeTokens={#ff6600, #fff3e6, 8}`，**defaults={} 空** |
| 店铺覆盖 | 仅 `__default_channel__`(id1) 和 t2(id37) 引用模板 id=1；其余渠道未引用 |

## 4. 问题清单与修复

| # | 问题 | 影响 | 处理 |
|---|---|---|---|
| P1 | L1 `defaults` 为空 `{}` | L1 页面级兜底无数据可验证 | **本次修复**：给 nshop 全局配置补页面级 defaults 示例数据 |
| P2 | 店铺覆盖页模板列表不过滤 app（`templateApi.list()` 不带 app） | nshop 渠道会看到 vshop 模板，选了也无效 | **本次修复**：按当前 app 过滤模板列表 |
| P3 | vshop 模板（id=4/5/6）零渠道引用 | 属预留 | 文档标注，不处理 |
| P4 | 其余渠道未设模板 | 天然 L1 回退测试点 | 文档标注，利用为测试场景 |

## 5. 手动测试文档结构（方案 C）

### Part A 分层矩阵（L0→L4，每章）

每章含：前置条件 / 操作步骤 / 预期结果 / 截图留档。核心测试方法 = **制造上级差异后逐级撤销，验证每级回退**：

- **L0**：将渠道 templateId 置空 + 全局 defaults 置空 → 验证代码内建默认（主题 #ff6600、全部块可见、classic 布局）
- **L1**：仅配置全局 themeTokens（改主题色）+ defaults.product（如隐藏某块）→ 验证无模板时 L1 生效
- **L2**：渠道引用模板 → 验证模板 theme/pages 覆盖 L1；再引用「跨端/停用」模板 → 验证回退 L1
- **L3**：渠道写 detailConfig（layout/隐藏块/价格样式）→ 验证覆盖模板；清空 → 回退 L2
- **L4**：模板 pages.product.blocks 只写单块字段，其余块缺省 → 验证内建默认 true/classic

### Part B 端到端场景

- 场景 1：全店换肤（全局改主色 → 全站生效）
- 场景 2：切换模板（模板库切换 → 详情页/首页联动）
- 场景 3：单店覆盖（某渠道隐藏促销块 + 改价格样式）
- 场景 4：模板停用/删除后的回退
- 场景 5：新增店铺默认走 L1

### Part C 线上验收与回滚

- 验收清单（每层 1 条关键断言 + 截图）
- 回滚要点：改配置前先记录原值；恢复顺序 L3→L2→L1 逆向

## 6. 运营后台设计说明（已核实）

| 页面 | 路径 | 功能 |
|---|---|---|
| 风格模板库 | `platform/templates` | 列表（按 app 过滤）/ 新建 / 编辑 theme+pages JSON / 启用停用 / 复制 / 删除 |
| 全局配置 | `platform/global-config` | 按 app 编辑 themeTokens（主色/辅色/圆角）+ defaults JSON |
| 店铺覆盖 | `decorate/shop-info` | 模板选择（不使用/全局默认/启用中模板）+ 税率 + 详情页版式/价格样式 + 促销/服务方案库 |

本次修复补充：店铺覆盖页模板选择按当前 app 过滤，避免跨端误选。

## 7. 验证方式

- 合并逻辑：`merge-config.spec.ts` 既有单测（palette 展开/覆盖/回退）
- 手动测试：按 Part A/B 在 www.youshop.cn 上逐步操作 + 手机视口截图
- 修复验证：web-admin 构建 + 部署后按 P1/P2 用例复测

## 8. 不做的事

- 不改 C 端渲染逻辑（5 级链路已验证有效）
- 不新增后台页面（三页已齐全，仅补 app 过滤）
- 不处理 vshop 模板引用（预留）
