# scripts 运维脚本

## 管理员凭证（必读）

仓库**不保存任何后台账号或口令**。所有调用 Vendure admin-api 的脚本都必须先导出环境变量：

```powershell
# PowerShell（Windows 本地）
$env:ADMIN_EMAIL="你的后台账号"
$env:ADMIN_PASSWORD="你的后台密码"
node scripts/apply-limin-brand.mjs
```

```bash
# bash / zsh
ADMIN_EMAIL=你的后台账号 ADMIN_PASSWORD=你的后台密码 node scripts/apply-limin-brand.mjs
```

- `ADMIN_EMAIL`（部分旧脚本也接受 `ADMIN_USER`）与 `ADMIN_PASSWORD` **必填**，缺失时脚本会打印用法并以退出码 1 终止。
- `ADMIN_API` 可覆盖，默认 `https://e.joho.cn/admin-api`。
- `WA_API` 是部分旧脚本的等价覆盖项（优先于 `ADMIN_API`），行为一致。
- 新建超管脚本额外需要 `NEW_ADMIN_EMAIL`（默认 `jiang`）与 `NEW_ADMIN_PASSWORD`（必填）。
- 测试类脚本（`verify_wa_*.py`）同样读取 `ADMIN_EMAIL` / `ADMIN_PASSWORD`。

> 不要把口令写进命令历史、`.env` 提交文件或文档。若怀疑口令曾泄露，请先在后台轮换。

## 常见脚本

| 脚本 | 用途 |
|---|---|
| `apply-limin-brand.mjs` | 写入 limin 店铺模板与渠道品牌配置 |
| `ensure-limin-checkout.mjs` | 补齐 limin 渠道配送/支付方式与租户默认档案 |
| `generate-tenant-map.mjs` | 生成 `layers/base/data/tenant-channels.json` 种子快照 |
| `update-tenant-name.mjs` | 修改租户名，可选同步种子文件 |
| `seed-t2-products.mjs` | 为 t2 渠道补起步商品 |
| `fix-t2-*.mjs` | t2 渠道数据归位（城市/房型/配送），写前自动备份到 `d:\zhao\_backup` |
| `verify-*.mjs` / `_seed_*.mjs` | 线上验收与回归数据准备 |
| `deploy.mjs` | 本地构建产物上传、解包与 `pm2 restart`（覆盖前自动备份、重启后探活，失败自动回滚） |

## 部署

```powershell
# 本地已构建过可跳过重建
$env:SKIP_BUILD="1"; node scripts/deploy.mjs
```

- 配置从仓库根 `.env` 读取（`SERVER_HOST` / `REMOTE_DIR` 必填，`APP_NAME` / `SITE_PORT` 可选）。
- 覆盖线上目录前会备份到 `${REMOTE_DIR}.bak/<时间戳>`（保留最近 3 份）。
- 重启后探活：首页 `http://127.0.0.1:<PORT>/` 返回 200，且商品接口（`GQL_HOST` + `CHANNEL_TOKEN`）返回 200；任一失败自动回滚到本次备份并以退出码 1 终止。

## 平台说明

- 脚本用 Node 18+ 内置 `fetch`，无需额外依赖。
- 统一凭证读取逻辑见 [`_admin-auth.mjs`](./_admin-auth.mjs)。
