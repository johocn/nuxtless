# nshop 购买行为修复 + 主域 youshop.cn 可访问 设计文档

- 日期：2026-08-27
- 范围：nshop 前端（Nuxt SSR）+ 服务器 OpenResty nginx 配置
- 目标：① 修复裸域 `youshop.cn` 电脑无法访问；② 修复商品详情页「立即购买」「加入购物车」点击无效。

## 背景与问题

### 问题1：`https://youshop.cn/` 电脑无法访问
- `youshop.cn` 无 A 记录（需 DNS 解析到服务器 `39.97.54.5`）。
- nginx `server_name` 仅含 `www.youshop.cn`，裸域请求无法命中现有 server。

### 问题2：详情页购买按钮无效果
三个版式（classic / floor / dualBuy）中：
- 「立即购买」：三个版式均未绑定 `@click`。
- 「加入购物车」：DualBuy 完全未绑定；Classic / Floor 已绑定但仅处理「库存不足 partial」，无成功反馈。
- 相关文件：`layers/base/app/components/product-detail/DetailClassic.vue`、`DetailDualBuy.vue`、`DetailFloor.vue`。

## 方案

### 一、主域 youshop.cn 可访问

1. **DNS（用户手动操作）**：域名解析面板为 `youshop.cn` 添加 A 记录 → `39.97.54.5`（`www` 已有）。
2. **nginx**：修改 `nshop-www.conf`，新增一个 `server` 块用于裸域 301 重定向：
   - `server_name youshop.cn;`
   - `location /shop-api { return 301 https://www.youshop.cn/shop-api$is_args$args; }`
   - `location / { return 301 https://www.youshop.cn$request_uri; }`
   - 其余保留现有 `www.youshop.cn` server 反代 127.0.0.1:3000。
3. **部署**：本地改文件推 git → 服务器 `git pull` → reload OpenResty（严格遵守「绝不在服务器构建」）。

### 二、购买按钮修复

新增共享 composable：`layers/base/app/composables/useBuyActions.ts`，返回 `addToCartHandler` 与 `buyNowHandler`：

- `addToCart`：`addItemToOrder(variantId, 1)`
  - `partial`（库存不足）→ 警告 toast（提示实际可加入件数）。
  - `success` → 成功 toast。
- `buyNow`：`addItemToOrder(variantId, 1)` 成功后 `navigateTo("/checkout")`；失败 → 错误 toast 不跳转。
- 前置守卫：`if (!selectedVariant?.id || !productServiceable) return;`（按钮同时 `:disabled`）。
- 复用组件现有的 `loading` 态（UButton `:loading`）。

三版式组件改造：
- 引入 `useBuyActions`；
- 给「立即购买」按钮补 `@click="buyNowHandler"`（classic / floor / dualBuy）；
- 给 DualBuy「加入购物车」补 `@click="addToCartHandler"`；
- Classic / Floor 的「加入购物车」改用新增的 `addToCartHandler`（补充成功 toast），去掉内联重复逻辑。

## 改动文件清单

| 文件 | 动作 |
|------|------|
| `nshop-www.conf` | 新增裸域 `youshop.cn` 301 server 块 |
| `layers/base/app/composables/useBuyActions.ts` | 新增 |
| `.../product-detail/DetailClassic.vue` | 改：补 buyNow click，简化 addToCart |
| `.../product-detail/DetailDualBuy.vue` | 改：补 buyNow + addToCart click |
| `.../product-detail/DetailFloor.vue` | 改：补 buyNow click，简化 addToCart |

## 成功标准

- 浏览器访问 `http(s)://youshop.cn` 与 `https://youshop.cn/xxx` → 301 到 `https://www.youshop.cn/xxx`，页面正常打开。
- 详情页：
  - 「加入购物车」点击后购物车项增加并给出成功反馈；库存不足时给出警告。
  - 「立即购买」点击后加入购物车并跳转 `/checkout` 结算页；失败时提示且不跳转。
  - 城市不可配送（`productServiceable=false`）或无变体时按钮禁用、点击无效。