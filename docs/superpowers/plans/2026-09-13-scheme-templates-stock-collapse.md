# 方案库模板化 + 就近库存折叠 + 规格区修复 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 店铺信息页促销/服务方案库改为「内置双语模板一键添加」；C 端就近库存默认折叠只显示汇总数量、点击展开明细；web-admin 规格矩阵区条形码/内部码分行并补齐成本价标签。

**Architecture:** 数据格式零改动（频道 customFields 仍存 `[{code, text:{zh_Hans,en}}]`），仅在 web-admin 内置双语模板常量并改造店铺信息页方案库区（模板点击 upsert、去重合并）；商品编辑页促销/服务勾选已实现仅回归验证；nshop 就近库存组件改为汇总条 + 展开态，新增两条 i18n 词条；规格矩阵 sub 区改为字段带标签分行。部署仍走本地构建 + `scripts/deploy.mjs`。

**Tech Stack:** Vite+uni-app（web-admin，无测试框架，回归验证）、Nuxt（nshop，vitest 已有）、Vendure 后端（零改动）。

**关联设计文档：** `docs/superpowers/specs/2026-09-13-scheme-templates-stock-collapse-design.md`

---

## 任务概览与文件地图

| 任务 | 仓库 | 文件 |
|---|---|---|
| T1 模板常量与工具 | vshop | `web-admin/src/constants/scheme-templates.ts`（新建） |
| T2 店铺信息页模板化 | vshop | `web-admin/src/pages/decorate/shop-info/index.vue` |
| T3 规格矩阵区修复 | vshop | `web-admin/src/components/product-tabs/ProductVariantMatrixTab.vue` |
| T4 就近库存折叠 | nshop | `layers/base/app/components/product/NearbyStores.vue`、`layers/base/i18n/locales/*.ts`（12 个） |
| T5 本地构建验证 | vshop/nshop | `pnpm build` |
| T6 部署与回归验收 | vshop/nshop | `node scripts/deploy.mjs`、手机视口截图、操作手册 |

---

### Task 1: web-admin 内置方案模板常量与工具

**Files:**
- Create: `d:\zhao\vshop\web-admin\src\constants\scheme-templates.ts`

背景：店铺信息页方案库改为从内置模板一键添加。模板为平台约定（含中英双语），数据结构与现有 `[{code, text:{zh_Hans,en}}]` 一致。

- [ ] **Step 1: 创建模板常量文件**

Create: `d:\zhao\vshop\web-admin\src\constants\scheme-templates.ts`

```ts
// 内置常用促销/服务保障模板（双语），供店铺信息页「常用模板」区一键添加
export interface SchemeTemplate {
  code: string;
  zh: string;
  en: string;
}

export const PROMO_TEMPLATES: SchemeTemplate[] = [
  { code: 'freeShip99', zh: '满99元包邮', en: 'Free shipping over ¥99' },
  { code: 'flashSale', zh: '限时特惠', en: 'Flash sale' },
  { code: 'newUser', zh: '新人专享', en: 'New user offer' },
  { code: 'memberPrice', zh: '会员价', en: 'Member price' },
  { code: 'couponPick', zh: '领券立减', en: 'Coupon discount' },
  { code: 'cut60', zh: '满60减20', en: '¥20 off ¥60' },
];

export const SERVICE_TEMPLATES: SchemeTemplate[] = [
  { code: 'genuine', zh: '正品保障', en: 'Genuine product' },
  { code: 'sevenDay', zh: '7天无理由退换', en: '7-day returns' },
  { code: 'fastShip', zh: '极速发货', en: 'Fast shipping' },
  { code: 'faka', zh: '假一赔十', en: '10x refund' },
  { code: 'nationwide', zh: '全国联保', en: 'Nationwide warranty' },
];

export interface SchemeRow {
  code: string;
  zh: string;
  en: string;
}

// 添加模板到已选列表：同 code 合并覆盖文案，否则追加；返回新数组（不可变）
export function upsertScheme(list: SchemeRow[], tpl: SchemeTemplate): SchemeRow[] {
  const row: SchemeRow = { code: tpl.code, zh: tpl.zh, en: tpl.en };
  const idx = list.findIndex((s) => s.code === tpl.code);
  if (idx >= 0) {
    return list.map((s, i) => (i === idx ? { ...row } : s));
  }
  return [...list, row];
}

export function hasScheme(list: SchemeRow[], code: string): boolean {
  return list.some((s) => s.code === code);
}
```

- [ ] **Step 2: Commit**

```bash
git -C d:\zhao\vshop add web-admin/src/constants/scheme-templates.ts
git -C d:\zhao\vshop commit -m "feat(admin): 内置促销/服务保障双语模板常量与 upsert 工具"
```

---

### Task 2: 店铺信息页方案库模板化

**Files:**
- Modify: `d:\zhao\vshop\web-admin\src\pages\decorate\shop-info\index.vue`

背景：方案库区当前只有手填三列。改为「常用模板 chips（点击即添加，已添加变 ✓ 灰态）+ 已选列表（可编辑/删除）+ 自定义添加」，保存逻辑不变。

- [ ] **Step 1: 引入模板常量与工具**

在 `<script lang="ts" setup>` 顶部 import 区（`import { fetchActiveChannel ... }` 之后）新增：

```ts
import { PROMO_TEMPLATES, SERVICE_TEMPLATES, upsertScheme, hasScheme } from '../../../constants/scheme-templates';
```

- [ ] **Step 2: 新增模板添加处理函数**

在 `setPriceStyle` 函数之后新增：

```ts
function addPromoTemplate(t: { code: string; zh: string; en: string }) {
  promoSchemes.value = upsertScheme(promoSchemes.value, t);
}
function addServiceTemplate(t: { code: string; zh: string; en: string }) {
  serviceSchemes.value = upsertScheme(serviceSchemes.value, t);
}
```

- [ ] **Step 3: 改造促销方案库卡片模板**

将现有促销方案库 `<view class="card">`（`<view class="img-title">促销方案库（频道默认；商品可覆盖）</view>` 到该 card 结束的 `</view>`）整体替换为：

```html
    <view class="card">
      <view class="img-title">促销方案库（频道默认；商品可覆盖）</view>
      <view class="tpl-wrap">
        <view
          class="tpl"
          :class="{ added: hasScheme(promoSchemes, t.code) }"
          v-for="t in PROMO_TEMPLATES"
          :key="t.code"
          @tap="addPromoTemplate(t)"
        >
          <text class="tpl-zh">{{ t.zh }}</text>
          <text class="tpl-en">{{ t.en }}</text>
          <text class="tpl-plus">{{ hasScheme(promoSchemes, t.code) ? '✓' : '＋' }}</text>
        </view>
      </view>
      <view class="scheme-row" v-for="(s, i) in promoSchemes" :key="i">
        <input class="inp" v-model="s.code" placeholder="code，如 freeShip99" />
        <input class="inp" v-model="s.zh" placeholder="中文文案" />
        <input class="inp" v-model="s.en" placeholder="English" />
        <button class="del" @tap="promoSchemes.splice(i, 1)">删</button>
      </view>
      <button class="add" @tap="promoSchemes.push({ code: '', zh: '', en: '' })">+ 添加方案</button>
    </view>
```

- [ ] **Step 4: 改造服务保障库卡片模板**

将现有服务保障库 `<view class="card">` 整体替换为（结构同上，数据换为 serviceSchemes / SERVICE_TEMPLATES / addServiceTemplate）：

```html
    <view class="card">
      <view class="img-title">服务保障库（频道默认；商品可覆盖）</view>
      <view class="tpl-wrap">
        <view
          class="tpl"
          :class="{ added: hasScheme(serviceSchemes, t.code) }"
          v-for="t in SERVICE_TEMPLATES"
          :key="t.code"
          @tap="addServiceTemplate(t)"
        >
          <text class="tpl-zh">{{ t.zh }}</text>
          <text class="tpl-en">{{ t.en }}</text>
          <text class="tpl-plus">{{ hasScheme(serviceSchemes, t.code) ? '✓' : '＋' }}</text>
        </view>
      </view>
      <view class="scheme-row" v-for="(s, i) in serviceSchemes" :key="i">
        <input class="inp" v-model="s.code" placeholder="code，如 genuine" />
        <input class="inp" v-model="s.zh" placeholder="中文文案" />
        <input class="inp" v-model="s.en" placeholder="English" />
        <button class="del" @tap="serviceSchemes.splice(i, 1)">删</button>
      </view>
      <button class="add" @tap="serviceSchemes.push({ code: '', zh: '', en: '' })">+ 添加方案</button>
    </view>
```

- [ ] **Step 5: 追加模板区样式**

在 `<style lang="scss" scoped>` 的 `.scheme-row` 规则之后新增：

```scss
  .tpl-wrap { display: flex; flex-wrap: wrap; gap: 16rpx; padding: 16rpx 0 8rpx; }
  .tpl {
    display: inline-flex; align-items: center; gap: 8rpx;
    border: 1rpx solid $wa-rule; border-radius: 999rpx;
    padding: 8rpx 22rpx; font-size: 26rpx; color: $wa-ink;
    background: $wa-card;
    .tpl-en { font-size: 22rpx; color: $wa-muted; }
    .tpl-plus { color: $wa-accent; font-size: 26rpx; }
    &.added { background: $wa-bg; color: $wa-muted; border-style: dashed; }
    &.added .tpl-plus { color: $wa-muted; }
  }
```

- [ ] **Step 6: Commit**

```bash
git -C d:\zhao\vshop add web-admin/src/pages/decorate/shop-info/index.vue
git -C d:\zhao\vshop commit -m "feat(admin): 店铺信息页方案库支持内置模板一键添加"
```

---

### Task 3: 规格矩阵区修复（方案 A：字段带标签分行）

**Files:**
- Modify: `d:\zhao\vshop\web-admin\src\components\product-tabs\ProductVariantMatrixTab.vue`

背景：sub 行当前为「变体图 + 条形码 + 内部码 + 成本价」四者挤一行，条形码/内部码互相挤压；成本价仅 placeholder 无标签。改为条形码、内部码分行、每字段带标签、成本价独立显示。**变体图、规格组合显示逻辑保持不变。**

- [ ] **Step 1: 替换 sub 行模板**

将 `<view class="mrow sub">` 块（第 76-90 行，含变体图、条形码、内部码、成本价）整体替换为：

```html
          <view class="mrow sub">
            <view class="variant-cover" @tap="openSkuImage(si)">
              <image v-if="(s.assetIds || []).length && coverPreview(s)" class="cover-img" :src="coverPreview(s)" mode="aspectFill" />
              <text v-else class="cover-plus">＋图</text>
            </view>
            <view class="field">
              <text class="flabel">条形码</text>
              <view class="frow">
                <input class="c-b" placeholder="条形码" :value="s.barcode ?? ''" @input="onSkuField(si, 'barcode', $event)" />
                <text class="scan-btn" @tap="scanSkuField(si, 'barcode')">📷</text>
              </view>
            </view>
          </view>
          <view class="mrow sub">
            <view class="field">
              <text class="flabel">内部码</text>
              <view class="frow">
                <input class="c-b" placeholder="内部码" :value="s.internalCode ?? ''" @input="onSkuField(si, 'internalCode', $event)" />
                <text class="scan-btn" @tap="scanSkuField(si, 'internalCode')">📷</text>
              </view>
            </view>
            <view class="field">
              <text class="flabel">成本价(分)</text>
              <view class="frow">
                <input class="c-p" type="number" placeholder="成本价" :value="String(s.costPrice ?? '')" @input="onSkuField(si, 'costPrice', $event)" />
              </view>
            </view>
          </view>
```

- [ ] **Step 2: 更新 sub 行样式**

将 `.mrow.sub` 的样式（第 419-427 行）替换为：

```scss
    &.sub {
      padding: 12rpx 0 12rpx 12rpx; border-bottom: 1rpx solid $wa-rule;
      background: rgba(0,0,0,0.02);
      .field { flex: 1; display: flex; flex-direction: column; min-width: 0; margin-right: 12rpx; }
      .flabel { font-size: 22rpx; color: $wa-muted; margin-bottom: 6rpx; }
      .frow { display: flex; align-items: center; }
      .c-b { flex: 1; font-size: 24rpx; color: $wa-ink; min-width: 0; }
      .c-p { flex: 0.5; font-size: 24rpx; color: $wa-ink; min-width: 0; text-align: left; }
    }
```

（`.scan-btn` 样式保留现有规则，无需改动。）

- [ ] **Step 3: Commit**

```bash
git -C d:\zhao\vshop add web-admin/src/components/product-tabs/ProductVariantMatrixTab.vue
git -C d:\zhao\vshop commit -m "fix(admin): 规格矩阵条形码/内部码分行并补成本价标签"
```

---

### Task 4: nshop 就近库存折叠展示

**Files:**
- Modify: `d:\zhao\nshop\layers\base\app\components\product\NearbyStores.vue`
- Modify: `d:\zhao\nshop\layers\base\i18n\locales\zh-CN.ts`
- Modify: `d:\zhao\nshop\layers\base\i18n\locales\en-US.ts`
- Modify: 其余 10 个语言包（`bg-BG.ts` / `de-DE.ts` / `es-ES.ts` / `fa-IR.ts` / `fr-FR.ts` / `it-IT.ts` / `ja-JP.ts` / `ko-KR.ts` / `pt-BR.ts` / `ru-RU.ts`）

背景：就近库存默认平铺所有仓库明细，改为默认折叠显示汇总（合计可售 + 门店数 + 最近距离），点击展开仓库明细。空态：未定位显示「开启定位可查看就近库存」（已有词条 `nearbyNoCoords`）；无库存显示「暂无可查看的门店库存」（已有 `nearbyNoStock`）。

- [ ] **Step 1: 补充 i18n 词条（zh-CN）**

在 `d:\zhao\nshop\layers\base\i18n\locales\zh-CN.ts` 的 `messages.detail` 中 `nearbyNoStock: '暂无可查看的门店库存',` 之后新增：

```ts
      nearbySummary: '就近库存 {qty} 件可售',
      nearbyStoresCount: '共 {n} 个门店 · 距您最近约 {d}',
```

- [ ] **Step 2: 补充 i18n 词条（en-US）**

在 `d:\zhao\nshop\layers\base\i18n\locales\en-US.ts` 的 `messages.detail` 中 `nearbyNoStock` 之后新增：

```ts
      nearbySummary: 'Nearby stock: {qty} available',
      nearbyStoresCount: '{n} stores · nearest ~{d}',
```

- [ ] **Step 3: 补充其余 10 个语言包**

对 `bg-BG.ts` / `de-DE.ts` / `es-ES.ts` / `fa-IR.ts` / `fr-FR.ts` / `it-IT.ts` / `ja-JP.ts` / `ko-KR.ts` / `pt-BR.ts` / `ru-RU.ts`：在各自 `messages.detail` 的 `nearbyNoStock` 之后新增同样两条 key，值沿用该包现有语言风格（参考该包 `nearbyTitle` 的翻译语言，如日文包填日文：`nearbySummary: '近くの在庫 {qty} 点販売中'`、`nearbyStoresCount: '全{n}店舗 · 最寄り約{d}'`；无法确定时可直接复用 en-US 英文文案，禁止留空）。

- [ ] **Step 4: 改造 NearbyStores.vue 脚本**

在 `<script setup lang="ts">` 中 `const result = ref<NearbyResult | null>(null);` 之后新增折叠状态与汇总计算：

```ts
const expanded = ref(false);

/** 全部仓库可售合计（默认折叠态主数字） */
const totalAvailable = computed(() =>
  result.value?.state === 'ok'
    ? result.value.items.reduce(
        (sum, loc) => sum + loc.variants.reduce((s, v) => s + v.stockAvailable, 0),
        0,
      )
    : 0,
);

/** 门店数（含 0 件仓） */
const storeCount = computed(() => (result.value?.state === 'ok' ? result.value.items.length : 0));

/** 最近距离文案：取有坐标仓库的最小距离，无则返回 null */
const nearestLabel = computed<string | null>(() => {
  if (result.value?.state !== 'ok') return null;
  const ds = result.value.items
    .map((loc) => loc.distanceKm)
    .filter((km): km is number => km != null && km < 1e9);
  if (!ds.length) return null;
  return formatNearbyDistance(Math.min(...ds));
});
```

- [ ] **Step 5: 改造 NearbyStores.vue 模板**

将 `<template>` 中 `<ul v-else-if="result?.state === 'ok'" ...>...</ul>` 整块（第 83-139 行）替换为：

```html
    <div v-else-if="result?.state === 'ok'" class="nearby-box">
      <div class="summary" role="button" :aria-expanded="expanded" @click="expanded = !expanded">
        <div>
          <p class="summary-kpi">
            {{ t("messages.detail.nearbySummary", { qty: totalAvailable }) }}
          </p>
          <p class="summary-meta">
            {{
              nearestLabel
                ? t("messages.detail.nearbyStoresCount", { n: storeCount, d: nearestLabel })
                : t("messages.detail.nearbyStoresCount", { n: storeCount, d: t("messages.detail.nearbyUnknownDistance") })
            }}
          </p>
        </div>
        <span class="chev" :class="{ open: expanded }">▾</span>
      </div>

      <ul v-show="expanded" class="stock-list">
        <li
          v-for="loc in result.items"
          :key="loc.location.id"
          class="loc-row"
        >
          <div class="loc-head">
            <span class="loc-name">{{ loc.location.name }}</span>
            <UBadge color="primary" variant="soft" size="sm">
              {{ formatNearbyDistance(loc.distanceKm) }}
            </UBadge>
            <span class="loc-qty" :class="{ zero: totalOnHand(loc) === 0 }">
              {{ loc.variants.reduce((s, v) => s + v.stockAvailable, 0) }} 件可售
            </span>
          </div>
          <p v-if="loc.location.description" class="loc-desc">{{ loc.location.description }}</p>
          <div class="loc-meta">
            <span class="truncate">服务城市：{{ serviceCityLabel(loc.location.serviceCities) }}</span>
          </div>
        </li>
      </ul>
    </div>
```

（`totalOnHand` 仅用于 0 件灰显判定；原逐 SKU 明细行与「在库/占用」汇总行在折叠方案中收起，明细保留在 `loc.variants` 数据中，后续如需 SKU 级明细可扩展。）

- [ ] **Step 6: 追加折叠样式**

在 `<style scoped>` 中（如组件末尾）追加：

```css
.nearby-box { border: 1px solid var(--color-border-200, #e5e7eb); border-radius: 0.75rem; overflow: hidden; }
.summary {
  display: flex; align-items: center; justify-content: space-between;
  padding: 0.875rem 1rem; cursor: pointer;
}
.summary-kpi { font-weight: 600; color: var(--color-gray-900, #111827); }
.summary-meta { margin-top: 0.125rem; font-size: 0.75rem; color: var(--color-gray-500, #6b7280); }
.chev { color: var(--color-gray-400, #9ca3af); transition: transform 0.15s ease; }
.chev.open { transform: rotate(180deg); }
.stock-list { border-top: 1px solid var(--color-border-200, #e5e7eb); }
.loc-row { padding: 0.75rem 1rem; border-bottom: 1px solid var(--color-border-100, #f3f4f6); }
.loc-row:last-child { border-bottom: none; }
.loc-head { display: flex; align-items: center; gap: 0.5rem; }
.loc-name { font-weight: 500; flex: 1; min-width: 0; }
.loc-qty { font-size: 0.75rem; color: var(--color-gray-600, #4b5563); white-space: nowrap; }
.loc-qty.zero { color: var(--color-gray-400, #9ca3af); }
.loc-desc { margin-top: 0.25rem; font-size: 0.75rem; color: var(--color-gray-500, #6b7280); }
.loc-meta { margin-top: 0.25rem; font-size: 0.75rem; color: var(--color-gray-400, #9ca3af); }
```

- [ ] **Step 7: 补充 `nearbyUnknownDistance` 词条（zh-CN / en-US / 其余 10 包）**

zh-CN：`nearbyUnknownDistance: '距离未知',`；en-US：`nearbyUnknownDistance: 'distance unknown',`；其余语言包沿用各自风格或复用英文。位置同 Step 1-3（`nearbyStoresCount` 之后）。

- [ ] **Step 8: 构建验证**

Run: `cd d:\zhao\nshop && pnpm build`
Expected: 构建成功；若 `pnpm build` 含 typecheck，确认无 TS 报错。

- [ ] **Step 9: Commit**

```bash
git -C d:\zhao\nshop add layers/base/app/components/product/NearbyStores.vue layers/base/i18n/locales/
git -C d:\zhao\nshop commit -m "feat(detail): 就近库存默认折叠显示汇总，点击展开仓库明细"
```

---

### Task 5: 本地构建验证（web-admin）

**Files:**
- vshop: `web-admin`

- [ ] **Step 1: web-admin 构建**

Run: `cd d:\zhao\vshop\web-admin && pnpm build`
Expected: 构建成功，dist 产物生成。

- [ ] **Step 2: Commit（如有遗漏改动）**

```bash
git -C d:\zhao\vshop status
```
若 T2/T3 改动未全部提交则补交；否则跳过。

---

### Task 6: 部署与回归验收

**Files:**
- vshop: `d:\zhao\vshop\scripts\deploy.mjs`（web-admin 部署）
- nshop: `d:\zhao\nshop\scripts\deploy.mjs`（C 端部署）

- [ ] **Step 1: 部署 web-admin**

Run: `cd d:\zhao\vshop\web-admin && node scripts/deploy.mjs`
Expected: scp 上传 dist 到服务器并生效（按既有部署机制）。

- [ ] **Step 2: 部署 nshop**

Run: `cd d:\zhao\nshop && node scripts/deploy.mjs`
Expected: 上传 `.output/` 并 `pm2 restart`（nshop id 2 cluster）。

- [ ] **Step 3: 手机视口回归截图（Playwright，390×844）**

对以下场景逐一套用既有 Playwright 移动视口脚本截图，并补入 `d:\zhao\nshop\docs\manual\product-detail\index.md`：
1. web-admin 店铺信息页：常用模板区 + 已选列表（添加/删除/编辑后保存成功）。
2. web-admin 商品编辑页「品牌营销」Tab：促销/服务勾选态回填正确（勾选项保存后重新进入仍选中）。
3. web-admin 商品编辑页规格矩阵：条形码/内部码分行、成本价标签与值显示（编辑回填值可见）。
4. C 端详情页就近库存：默认折叠仅显示「就近库存 N 件可售 · 共 n 门店」，点击展开显示仓库明细。
5. C 端详情页促销条/服务条：与运营端方案库设置一致（运营端修改方案库并保存后，C 端强刷可见新方案），中文站中文、英文站英文。

- [ ] **Step 4: 提交文档与最终 commit**

```bash
git -C d:\zhao\nshop add docs/manual/product-detail/index.md
git -C d:\zhao\nshop commit -m "docs: 方案库模板化与就近库存折叠 手机视口截图与操作手册"
```

---

## Self-Review 记录

- **Spec 覆盖**：A（T1/T2）、B 商品勾选现状验证（T6 Step 3.2 回归）、C 库存折叠（T4 + T6 截图）、D 规格区方案 A（T3）——全部覆盖。
- **占位符扫描**：无 TODO/TBD；i18n 十包翻译给出明确指引（沿用各包语言或复用英文），非占位。
- **类型一致性**：`SchemeTemplate` / `SchemeRow` / `upsertScheme` / `hasScheme` 在 T1 定义、T2 引用，命名一致；`formatNearbyDistance` 已在既有 `nearby-stock.ts` 定义（T4 复用），`totalOnHand` 为组件内既有函数。
- **用户补充约束**：规格区改动仅限 sub 行布局（变体图/规格组合显示不变，T3 已注明）；C 端促销/服务动态跟随运营端方案库（回归任务 T6 Step 3.5 明确验证）。
