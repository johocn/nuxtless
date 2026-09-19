# 领域手册（Domain Handbooks）

面向「再次遇到同类问题能快速定位代码、精准修 Bug」的领域知识库。每个业务领域一份手册，与按任务日期组织的 `docs/superpowers/specs|plans` 互补：spec/plan 记录「某次任务怎么做」，手册记录「该领域长期是什么样、代码在哪、坑在哪」。

## 何时建手册

某些领域出现 ≥2 次独立任务（含 Bug 修复）即可建手册。已有 8 本（见下「手册清单」）。

## 手册清单

| 手册 | 领域 | 入口指针说明 |
|---|---|---|
| `shipping-profile.md` | 配送档案/自提点体系（租户归属/全局/三种自提点） | 档案与配送方式绑定、自提点可见性、C 端结算分箱 |
| `checkout.md` | Checkout 结算页（前端渲染） | 23+ 组件/5 composables 文件地图、返回按钮/就近自提点/高德导航 |
| `sso-login.md` | SSO 登录（C 端对接视角） | 登录链路、token 直验、邀请码闭环、跨渠道用户映射 |
| `data-cleaning.md` | 用户数据大清理 | 投产前重置全流程：清理范围/外键依赖序/dry-run 守卫/序列重置 |
| `pricing-tax.md` | 价格/税档三态 | 后台价格一致性、taxMode 三态、displayCentsFromNet/taxFromGross |
| `cross-channel-variants.md` | 跨渠道商品变体/迁移 | 变体全局唯一性、双轨隔离、上架整体迁移 |
| `payment-split-redemption.md` | 支付/分箱/核销 | 分箱与支付合并规则、COD 核销收款、台账归账 |
| `shop-style-theme.md` | 店铺风格/主题/模板回退 | 五级回退链、themeTokens<模板palette、shopTemplate三态、C端判定法 |

> 服务端（Strapi）另有独立 domains 目录：`d:\zhao\strapi\docs\domains\sso-login.md`（SSO 服务端视角，zhao-sso 插件/统一登录页/白名单配置）。

## 命名与目录

- 文件：`docs/domains/<domain>.md`，如 `shipping-profile.md`
- 领域粒度：一个业务概念域一份（配送档案、支付、租户、商品…）

## 章节模板（7 章，新建手册必须齐全）

1. **概念模型** — 核心实体、关系、作用域/可见性规则、关键术语
2. **文件地图（符号级）** — 每个相关文件：路径 → 职责 → 关键导出符号/函数/组件。**不写行号**（防漂移），行号用 `rg` 现查
3. **设计决策** — ADR 式「为什么这么做」（含放弃的备选）
4. **常见坑** — 复现现象 → 根因 → 解法，按本领域特有优先
5. **问题速查（Bug 知识库）** — 四列表格：现象 | 根因 | 代码点 | 回归脚本。每次修完 Bug 追加一行
6. **验证脚本清单** — 脚本路径 → 用途 → 运行命令（含 `tmp/regress-<domain>.mjs`）
7. **历史文档索引** — 相关 specs/plans/manual 的链接与一句话说明

## 维护流程（硬规范）

- **任务完成后自动沉淀**：相关任务收尾时更新对应手册（含第 5 章 Bug 知识库追加）+ memory 速查卡
- **代码定位五步法**（约束 AI 行为，防全仓库漫游）：速查手册 → grep 符号（必要时 ast-grep）→ 最小读取（目标函数 ±30 行）→ 看回归测试 → 修复 + 跑回归
- **行号不入库**：手册中代码位置一律用「文件路径 + 符号名」，行号现场 grep
