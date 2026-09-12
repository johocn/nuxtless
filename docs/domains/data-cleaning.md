# 用户数据大清理领域手册（Data Cleaning）

> 入口指针：`project_memory.md`「用户数据大清理（2026-09-11，投产前重置，已执行）」速查卡 → 本手册。
> 覆盖：Vendure（电商主库）+ Strapi（SSO 消费体系）两库的用户/订单数据清理；youshaop 库为空无需处理。
> 性质：**投产前一次性重置操作**，脚本保留在本地，已执行完毕，本手册用于「再遇到同类清理」时快速复用。

## 1. 概念模型

**清理场景**：投产前把联调/试运营期间产生的用户、订单、绑定关系等**消费数据**全部重置，保留商品/渠道/供应/支付/优惠券等**主数据**。

| 库 | 清理范围 | 保留 |
|---|---|---|
| Vendure（电商主库） | 除 superadmin（`user#1` + `administrator#1`）外**全部 user/customer/order**，含后台管理员账号（johocn/官方自营01-20/chendi/jiang/tang 等）与全部订单/地址 | superadmin(1) + administrator(1) + role 绑定；商品/渠道/供应/支付/优惠券等主数据 |
| Strapi（SSO 消费体系） | `sso_users` / `up_users` / `admin_users` 三张用户表**仅保留 id=1(admin)**，删 lantai/shiyi 两个 CMS 账号 | id=1 admin；`strapi_sessions` 仅 admin 会话 |
| youshaop | **空库（0 张表），无需处理** | — |

**Strapi 内容表显式清空清单**（不随用户级联，必须显式 DELETE，否则旧 openid/邀请码残留影响重新注册）：

- `sso_third_party_bindings`（openid 绑定）
- `sso_invite_codes`
- `sso_tokens`
- `sso_login_logs`
- `zhao_user_invites`
- `zhao_channel_members`
- `zhao_point_records`

**清理后终态（验收基准）**：
- Vendure：仅 superadmin（user#1 + administrator#1 + role 绑定），`customer` 表 count=0、`order` 表 count=0
- Strapi：三张用户表仅 id=1 admin；消费内容表全空；`strapi_sessions` 仅 admin 会话
- SSO 白名单 `vendure-youshop`（含 h.joho.cn 全部回调）完好
- 主数据（商品/渠道/供应/支付/优惠券）全部保留
- `session` / `shipping_line` / `stock_movement` / `order_timeout_task` 等非空但无关联的孤儿/配置数据**按设计保留**（不误删）

**关键术语**：cids=全部 customer id、oids=全部 order id（清理锚点）；DRY=dry-run 干跑开关。

## 2. 文件地图（符号级，行号用 rg 现查）

### 清理脚本（本地，scp 到服务器 /tmp 后运行）

| 文件 | 职责 | 关键符号/行为 |
|---|---|---|
| `_clean_vendure_users.mjs` | Vendure 库用户/顾客/订单清理 | 按依赖序 DELETE（见 §4 坑2）；`DRY` 开关；`setval` 序列重置 |
| `_clean_strapi_users.mjs` | Strapi 库用户 + 内容表清理 | 删三用户表 + 显式清空 7 张内容表；`DRY` 开关 |

### 执行与连接约定

- **部署方式**：本地 `scp` 两个脚本到服务器 `/tmp` 后 `node` 直接运行（不落地到应用目录、不依赖项目构建）
- **数据库连接**：读取 `/www/apps/strapi/.env` 的 `DATABASE_*` 配置，**复用 `/www/apps/strapi/node_modules/pg`**（服务器不装新依赖、不构建）
- **备份目录**：服务器 `/www/apps/_dbbackup/`，strapi/vendure/youshaop 三个库均有 `_20260911_*.dump`（清理前已备份，恢复点）

## 3. 设计决策（ADR 式）

| 决策 | 理由 |
|---|---|
| 锚点用**全量 cids/oids**（全部 customer/order），而非「非 superadmin userId」 | 访客下单的 `customer.userId` 为 null、guest 订单 `customerId` 为 null，按 userId 锚会**漏删**；superadmin 名下无任何 customer/order，取全量即等价且彻底（详见 §4 坑1） |
| 外键**按依赖序删**（子表→父表） | Vendure 外键多为 `NO ACTION`（不级联），乱序删除直接外键冲突报错（详见 §4 坑2） |
| 所有 DELETE 受 `!DRY` 守卫，dry-run 模式**只 count 不 delete** | 防止干跑误删；2026-09-11 曾因守卫缺失 dry-run 实际执行了删除（详见 §4 坑4、§5 Bug 库） |
| Strapi 内容表**显式清空**而非依赖级联 | Strapi 用户表外键几乎全 `CASCADE`（`*_lnk` 自动级联），但内容表不级联，不显式清空会残留 openid/邀请码（详见 §4 坑3） |
| 序列重置用 `setval(pg_get_serial_sequence(...))`，但**先判 null / 排除 join 表** | 复合主键 join 表无 id 序列，`pg_get_serial_sequence` 抛错会回滚整个事务（详见 §4 坑5） |

## 4. 常见坑（关键坑 1-5）

| # | 现象 | 根因 | 解法 |
|---|---|---|---|
| **坑1（锚点坑）** | 按「非 superadmin userId」查 customer/order 删除后，仍有访客顾客/guest 订单残留 | 访客下单的 `customer.userId` 为 null、guest 订单 `customerId` 为 null，userId 锚点匹配不到 | **cids=全部 customer、oids=全部 order 才彻底**；因 superadmin 名下无任何 customer/order，全量即安全 |
| **坑2（Vendure 外键 NO ACTION）** | DELETE 报外键冲突，或漏删子表数据 | Vendure 外键几乎全 `NO ACTION`（不级联），必须按依赖序删 | 依赖序：order 子表（`order_channels`/`order_promotions`/`order_fulfillments`/`order_line`/`refund`/`order_modification`/`payment`/`surcharge`/`fulfillment`/`shipping_line`/`order_line_reference`/`session`）→ `order` → `history_entry` → customer 子表（`address`/`customer_*_lnk`/`employee_customer`/`product_review`/`customer_balance`/`pickup_redemption`/`merchant_settlement_ledger`）→ `customer` → user 子表（`authentication_method`/`user_roles_role`/`api_key`/`tenant_member`）→ `administrator` → `user`。**表结构坑**：`order_item`/`external_authentication_method` 不存在（别写）；`stock_movement` 须在 `order_line` **前**删；`session` 须在 `order` **前**删；`group_buy_order.orderId` 是 varchar，比较须 `::text` 转换；`refund` 无 orderId/orderModificationId 列、只有 `paymentId`（按 payment 关联删）；junction 表（如 `customer_channels_channel`）复合主键、无 id 序列 |
| **坑3（Strapi 外键 CASCADE）** | 删 `up_users`/`sso_users` 后 `*_lnk` 表自动清空，但内容表仍有旧数据 | Strapi 用户表外键几乎全 `CASCADE`（`*_lnk` 自动级联）；但**内容表不会级联** | 显式清空内容表：`sso_third_party_bindings`（openid 绑定）/`sso_invite_codes`/`sso_tokens`/`sso_login_logs`/`zhao_user_invites`/`zhao_channel_members`/`zhao_point_records`，否则旧 openid/邀请码残留影响重新注册 |
| **坑4（dry-run 守卫）** | dry-run 模式实际执行了删除（2026-09-11 曾真删，属实是 bug，巧合达成目标） | 干跑模式忘了把 DELETE 包进 `if(!DRY)` | **dry 模式必须 count 而非 delete，且所有 DELETE 都要受 `!DRY` 守卫** |
| **坑5（序列重置）** | `setval(pg_get_serial_sequence($1,'id'),1,false)` 对复合主键 join 表**抛错并回滚整个事务** | 复合主键 join 表无 id 序列，`pg_get_serial_sequence` 返回 null 后 setval 报错 | 先判 `pg_get_serial_sequence` 是否返回 null，或直接把 join 表排除；superadmin 保留在 user#1，`setval(user_id_seq,1,true)` → 新用户从 2 起 |

## 5. Bug 知识库（问题速查）

| 现象 | 根因 | 代码点 | 验证 |
|---|---|---|---|
| dry-run 模式实际执行了删除（2026-09-11 清理时真实发生） | 干跑模式未把 DELETE 包进 `if(!DRY)` 守卫，count 逻辑缺失 | `_clean_vendure_users.mjs` / `_clean_strapi_users.mjs` 的 DELETE 语句 | 干跑输出应为 count 汇总，日志不得出现 DELETE 执行；断言全部 DELETE 语句均在 `if(!DRY)` 块内 |
| 序列重置抛错回滚整个事务，清理无法提交 | `setval(pg_get_serial_sequence(表,'id'),1,false)` 对复合主键 join 表（无 id 序列）抛错 | `_clean_vendure_users.mjs` 序列重置段 | 运行后事务成功提交；重置前对每个表判 `pg_get_serial_sequence` 返回值非 null，或排除 join 表清单 |
| 漏删访客顾客/guest 订单（按 userId 锚点时） | `customer.userId` 为 null（访客下单）、guest 订单 `customerId` 为 null，userId 锚点匹配不到 | `_clean_vendure_users.mjs` 的 cids/oids 取值逻辑 | 清理后 `customer`/`order` count=0；清理前 dry-run 断言 cids=全部 customer id、oids=全部 order id |

## 6. 验证清单

### 删除后 count 断言

| 断言 | 期望 |
|---|---|
| Vendure `customer` 表 count | 0 |
| Vendure `order` 表 count | 0 |
| Vendure `user` 表 count | 1（仅 superadmin user#1） |
| Vendure `administrator` 表 count | 1（仅 administrator#1） |
| Strapi `sso_users` / `up_users` / `admin_users` | 各仅 id=1 admin |
| Strapi 7 张内容表（`sso_third_party_bindings` / `sso_invite_codes` / `sso_tokens` / `sso_login_logs` / `zhao_user_invites` / `zhao_channel_members` / `zhao_point_records`） | 全空 |
| `strapi_sessions` | 仅 admin 会话 |

### 主数据保留检查

- 商品（product/product_variant/asset）count 不变
- 渠道（channel）count 不变，`__default_channel__` 完好
- 供应（supplier/stock_location）count 不变
- 支付（payment_method/refund 相关主数据）完好
- 优惠券（coupon/promotion）count 不变

### 备份恢复点

- 清理前备份：服务器 `/www/apps/_dbbackup/` 下 strapi/vendure/youshaop 三库 `_20260911_*.dump`，如需回滚从此恢复点还原
- 每次执行清理前先确认当日备份存在，再动 DELETE

## 7. 历史文档索引

- `project_memory.md`「用户数据大清理（2026-09-11，投产前重置，已执行）」段 — 本手册的权威素材：清理范围（AskUserQuestion 确认）、关键坑 1-5、执行方式与终态
- `docs/domains/sso-login.md` — SSO 登录领域手册（C 端对接视角），关联 `sso_users` 清理与 SSO 用户体系
- `docs/superpowers/specs/2026-09-13-domains-sso-login-design.md` §4.1 — 用户数据大清理手册设计蓝本（与 SSO 手册同一设计文档）
