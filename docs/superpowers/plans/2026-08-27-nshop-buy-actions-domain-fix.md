# nshop 购买行为修复 + 主域 youshop.cn 可访问 实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 修复裸域 `youshop.cn` 电脑无法访问，并让商品详情页「立即购买」「加入购物车」按钮真正生效。

**Architecture:** ① nginx 新增裸域 301 server 块指向 www；② 抽取共享 `useBuyActions` composable 统一处理加购与立即购买，三版式组件复用，消除重复逻辑。

**Tech Stack:** Nuxt 3 (SSR) + Pinia + Vendure GraphQL + OpenResty nginx。

**前置（用户手动）：** 域名解析面板为 `youshop.cn` 添加 A 记录 → `39.97.54.5`。

---

## 文件结构

| 文件 | 职责 |
|------|------|
| `nshop-www.conf`（仓库根） | 前端 nginx 反代配置，新增裸域 301 块 |
| `layers/base/app/composables/useBuyActions.ts` | 共享购买行为：`addToCartHandler` / `buyNowHandler` |
| `.../product-detail/DetailDualBuy.vue` | 补双按钮 click |
| `.../product-detail/DetailClassic.vue` | 补 buyNow click，简化 addToCart |
| `.../product-detail/DetailFloor.vue` | 补 buyNow click，简化 addToCart |

`OrderStatus` 类型：`{status:"success"} | {status:"partial";quantityAvailable:number} | {status:"error";message:string}`（`d:\zhao\nshop\types\order.ts:38-41`）。

---

### Task 1: nginx 裸域 301 重定向

**Files:**
- Modify: `d:\zhao\nshop-www.conf`

- [ ] **Step 1: 在文件顶部（现有 `www.youshop.cn` server 块之前）新增裸域 301 server 块**

在 `# www.youshop.cn …` 注释前插入以下内容：

```nginx
# youshop.cn — 裸域 301 重定向到 www.youshop.cn（URL 统一，避免双域收录）
server {
    listen 80;
    server_name youshop.cn;
    location /shop-api {
        return 301 https://www.youshop.cn/shop-api$is_args$args;
    }
    location / {
        return 301 https://www.youshop.cn$request_uri;
    }
}
```

- [ ] **Step 2: 提交**

```bash
git add nshop-www.conf
git commit -m "fix(nginx): 新增裸域 youshop.cn 301 重定向到 www"
```

---

### Task 2: 共享 composable `useBuyActions`

**Files:**
- Create: `d:\zhao\nshop\layers\base\app\composables\useBuyActions.ts`

- [ ] **Step 1: 创建 composable**

```ts
import { storeToRefs } from "pinia";

export function useBuyActions() {
  const { t } = useI18n();
  const localePath = useLocalePath();
  const toast = useToast();
  const orderStore = useOrderStore();
  const { loading } = storeToRefs(orderStore);
  const { addItemToOrder } = orderStore;
  const productStore = useProductStore();
  const { selectedVariant } = storeToRefs(productStore);
  const { isServiceable } = useCityService();

  const canBuy = computed(() => {
    const v = selectedVariant.value;
    return !!v?.id && isServiceable(v);
  });

  async function addToCartHandler() {
    const id = selectedVariant.value?.id;
    if (!id || !canBuy.value) return;
    const res = await addItemToOrder(id, 1);
    if (res.status === "error") {
      toast.add({
        title: t("messages.detail.addToCart"),
        description: res.message || t("messages.shop.addToCart"),
        color: "error",
      });
    } else if (res.status === "partial") {
      toast.add({
        title: t("messages.detail.addToCart"),
        description: t("messages.detail.stockShortage", { n: res.quantityAvailable ?? 0 }),
        color: "warning",
      });
    } else {
      toast.add({
        title: t("messages.detail.addToCart"),
        description: t("messages.detail.addedToCart"),
        color: "success",
      });
    }
  }

  async function buyNowHandler() {
    const id = selectedVariant.value?.id;
    if (!id || !canBuy.value) return;
    const res = await addItemToOrder(id, 1);
    if (res.status === "error") {
      toast.add({
        title: t("messages.detail.buyNow"),
        description: res.message || t("messages.detail.buyNowFailed"),
        color: "error",
      });
      return;
    }
    if (res.status === "partial") {
      toast.add({
        title: t("messages.detail.buyNow"),
        description: t("messages.detail.stockShortage", { n: res.quantityAvailable ?? 0 }),
        color: "warning",
      });
      return;
    }
    await navigateTo(localePath("/checkout"));
  }

  return { loading, canBuy, addToCartHandler, buyNowHandler };
}
```

- [ ] **Step 2: 补充 i18n 词条（zh-CN / en-US）**

在 `d:\zhao\nshop\layers\base\i18n\locales\zh-CN.ts` 的 `messages.detail` 中新增：

```ts
addedToCart: "已加入购物车",
buyNowFailed: "购买失败，请重试",
stockShortage: "库存不足，已加入 {n} 件",
```

在 `d:\zhao\nshop\layers\base\i18n\locales\en-US.ts` 的 `messages.detail` 中新增：

```ts
addedToCart: "Added to cart",
buyNowFailed: "Purchase failed, please retry",
stockShortage: "Insufficient stock, added {n} item(s)",
```

- [ ] **Step 3: 确认 `useCityService` 导出 `isServiceable`**

若 `d:\zhao\nshop\layers\base\app\composables\useCityService.ts` 未导出 `isServiceable`，改为从 `useProductDetailView` 的同源逻辑读取（其内部即 `useCityService().isServiceable`）。若已导出则跳过。

- [ ] **Step 4: 提交**

```bash
git add layers/base/app/composables/useBuyActions.ts layers/base/i18n/locales/zh-CN.ts layers/base/i18n/locales/en-US.ts
git commit -m "feat(composable): 新增 useBuyActions 统一加购与立即购买"
```

---

### Task 3: 改造 `DetailDualBuy` 补全双按钮

**Files:**
- Modify: `d:\zhao\nshop\layers\base\app\components\product-detail\DetailDualBuy.vue`

- [ ] **Step 1: 引入 `useBuyActions`**

在 `<script setup>` 中 `useProductDetailView` 之后新增：

```ts
const { selectedVariant, productServiceable } = useProductDetailView();
const { canBuy, loading, addToCartHandler, buyNowHandler } = useBuyActions();
```

> 说明：`useBuyActions` 已从 `selectedVariant`/`isServiceable` 计算可买状态；此处 `selectedVariant` 与 `productServiceable` 分别用于 SKU 显示与禁用态。

- [ ] **Step 2: 给「加入购物车」补 `@click` 与禁用态**

将现有 secondary 按钮改为：

```vue
<UButton
  class="flex-1 justify-center text-base sm:min-w-32 sm:flex-none"
  color="secondary"
  variant="solid"
  icon="i-lucide-shopping-cart"
  :loading="loading"
  :disabled="!productServiceable || !canBuy"
  @click="addToCartHandler"
>{{ t("messages.detail.addToCart") }}</UButton>
```

- [ ] **Step 3: 给「立即购买」补 `@click` 与禁用态**

将现有 primary 按钮改为：

```vue
<UButton
  class="flex-1 justify-center text-base sm:min-w-40 sm:flex-none"
  color="primary"
  icon="i-lucide-zap"
  :loading="loading"
  :disabled="!productServiceable || !canBuy"
  @click="buyNowHandler"
>{{ t("messages.detail.buyNow") }}</UButton>
```

- [ ] **Step 4: 提交**

```bash
git add layers/base/app/components/product-detail/DetailDualBuy.vue
git commit -m "fix(detail): dualBuy 版式补全购买按钮点击"
```

---

### Task 4: 改造 `DetailClassic` 补 buyNow、简化 addToCart

**Files:**
- Modify: `d:\zhao\nshop\layers\base\app\components\product-detail\DetailClassic.vue`

- [ ] **Step 1: 引入 `useBuyActions` 并移除旧内联加购逻辑**

将 `<script setup>` 中

```ts
const { loading } = storeToRefs(useOrderStore());
const { addItemToOrder } = useOrderStore();
const toast = useToast();

const inStock = computed(
  () => selectedVariant.value?.stockLevel === "IN_STOCK" || selectedVariant.value?.stockLevel === "LOW_STOCK",
);

async function addToCart() {
  const id = selectedVariant.value?.id;
  if (!id || !productServiceable.value) return;
  const res = await addItemToOrder(id, 1);
  if (res?.status === "partial") {
    toast.add({
      title: t("messages.shop.addToCart"),
      description: `库存不足，已加入 ${res.quantityAvailable ?? 0} 件`,
      color: "warning",
    });
  }
}
```

替换为：

```ts
const { inStock } = storeToRefs(useProductStore());
const { canBuy, loading, addToCartHandler, buyNowHandler } = useBuyActions();
```

> 说明：`inStock` 改从 `useProductStore` 读取（该 store 暴露 `stockLevel`；改用 `storeToRefs(useProductStore()).stockLevel` 后重算 inStock。若嫌麻烦，**保留本地 `inStock` computed 亦可**，`loading` 已由 `useBuyActions` 提供。），`loading` 用于两个按钮。

- [ ] **Step 2: 「加入购物车」改用 `addToCartHandler`**

保持 `:loading="loading"`、`:disabled="!productServiceable"`，`@click="addToCartHandler"`。

- [ ] **Step 3: 「立即购买」补 `@click` 与禁用态**

```vue
<UButton
  class="flex-1 justify-center"
  color="primary"
  size="xl"
  icon="i-lucide-zap"
  :loading="loading"
  :disabled="!productServiceable || !canBuy"
  @click="buyNowHandler"
>{{ t("messages.detail.buyNow") }}</UButton>
```

- [ ] **Step 4: 提交**

```bash
git add layers/base/app/components/product-detail/DetailClassic.vue
git commit -m "fix(detail): classic 版式补全立即购买、集中加购逻辑"
```

---

### Task 5: 改造 `DetailFloor` 补 buyNow、简化 addToCart

**Files:**
- Modify: `d:\zhao\nshop\layers\base\app\components\product-detail\DetailFloor.vue`

- [ ] **Step 1: 引入 `useBuyActions` 并移除旧内联加购逻辑**

将 `<script setup>` 中

```ts
const toast = useToast();
const { loading } = storeToRefs(useOrderStore());
const { addItemToOrder } = useOrderStore();

const inStock = computed(
  () => selectedVariant.value?.stockLevel === "IN_STOCK" || selectedVariant.value?.stockLevel === "LOW_STOCK",
);

async function addToCart() {
  const id = selectedVariant.value?.id;
  if (!id || !productServiceable.value) return;
  const res = await addItemToOrder(id, 1);
  if (res?.status === "partial") {
    toast.add({
      title: t("messages.shop.addToCart"),
      description: `库存不足，已加入 ${res.quantityAvailable ?? 0} 件`,
      color: "warning",
    });
  }
}
```

替换为：

```ts
const { loading, canBuy, addToCartHandler, buyNowHandler } = useBuyActions();
```

保留原 `inStock` computed（其计算值 `stockLevel === "IN_STOCK" || "LOW_STOCK"` 耦合了本组件头部徽章，若无依赖可一并移除）。

- [ ] **Step 2: 「加入购物车」改用 `addToCartHandler`**

保持 `:loading="loading"`、`:disabled="!productServiceable"`，`@click="addToCartHandler"`。

- [ ] **Step 3: 「立即购买」补 `@click` 与禁用态**

```vue
<UButton
  class="flex-1 justify-center text-base"
  color="primary"
  icon="i-lucide-zap"
  :loading="loading"
  :disabled="!productServiceable || !canBuy"
  @click="buyNowHandler"
>{{ t("messages.detail.buyNow") }}</UButton>
```

- [ ] **Step 4: 提交**

```bash
git add layers/base/app/components/product-detail/DetailFloor.vue
git commit -m "fix(detail): floor 版式补全立即购买、集中加购逻辑"
```

---

### Task 6: 本地验证 + 部署

**Files:**
- 无新文件

- [ ] **Step 1: 本地构建验证（不部署）**

Run: `pnpm build`
Expected: 构建成功，无 TS/编译错误。

- [ ] **Step 2: 本地 `pnpm dev` 手动验证**

Run: `pnpm dev`，打开本地商品详情页
Expected:
- 「立即购买」点击 → 加入购物车 → 跳转到 `/checkout`。
- 「加入购物车」点击 → 成功 toast；所选变体库存不足时 warning toast。
- 城市不可配送或未选变体时按钮禁用。

- [ ] **Step 3: 前端部署（nshop 允许本地构建 → 推 dist → 服务器 git pull + pm2 restart）**

Run: `node scripts/deploy.mjs`
Expected: `.output/` 上传、`pm2 restart nshop` 成功。

- [ ] **Step 4: nginx 配置部署**

将 `nshop-www.conf` 推送服务器对应位置（根据部署铁律本地构建/编辑后 git 跟踪，服务器 `git pull`），然后 reload：

Run: `ssh qing 'nginx -t && nginx -s reload'`（或 openresty 等价命令，视服务器环境而定）
Expected: nginx 校验通过并 reload 生效。

- [ ] **Step 5: 上线验证**

访问 `http://youshop.cn/` 与 `https://www.youshop.cn/`
Expected: 裸域 301 到 `https://www.youshop.cn/`；页面正常打开；购买按钮行为符合预期。

---

## 自检

- **Spec 覆盖**：① 主域可访问 → Task 1 + 前置 DNS + Task 6 部署 √；② 加购成功/不足反馈、立即购买跳结算/失败提示 → Task 2-5 √；③ 城市不可配送禁用 → 各组件 `:disabled="!productServiceable || !canBuy"` √。
- **无占位**：所有步骤含具体代码与命令。
- **类型一致**：统一使用 `useBuyActions` 返回值 `{ loading, canBuy, addToCartHandler, buyNowHandler }`；`OrderStatus` 判定 `res.status === "success"/"partial"/"error"`，与 `types/order.ts` 一致。