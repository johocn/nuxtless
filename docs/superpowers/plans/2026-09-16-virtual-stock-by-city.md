# 商品详情页库存「按城市计算」修复 实现计划（任务2）

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把商品详情页主库存 `saleableStock` 从「全局虚拟仓」改为「按当前选择城市的可服务仓库合并」；纯虚拟/未定位/无城市仓回退全局虚拟仓，修掉「显示无」并支持切城市刷新。

**Architecture:** 后端 `cjk-plugin` 的 `variantStockInfo` 增 `city` 入参，`getSaleableAndDetail` 按仓库 `serviceCities` 过滤绑定物理仓聚合数量；按城市聚合逻辑提炼为**纯函数** `pinByCity` 便于 TDD。前端 `variantStockInfo` query 加 `city`，`useProductStockInfo` 透传 `useLocationStore().cityName`，`StockInfoBlock` 监听城市与变体变化刷新。

**Tech Stack:** Vendure 3.x（cjk-plugin）、Nuxt3（layers/base）、vitest、nuxt-graphql-client codegen。

---

## Task 1: 按城市聚合纯函数 + TDD

**Files:**
- Create: `vendure/packages/cjk-plugin/src/inventory/stock-city-filter.ts`
- Test: `vendure/packages/cjk-plugin/src/inventory/stock-city-filter.spec.ts`

- [ ] **Step 1: 写失败测试**

`vendure/packages/cjk-plugin/src/inventory/stock-city-filter.spec.ts`：

```ts
import { describe, expect, it } from 'vitest';
import { cityServes, pinByCity } from './stock-city-filter';
import type { ID } from '@vendure/core';

const L1 = 'loc-1' as ID;
const L2 = 'loc-2' as ID;
const levels = [
  { stockLocationId: L1, stockOnHand: 30 },
  { stockLocationId: L2, stockOnHand: 20 },
];
const bindings = [{ locationId: L1 }, { locationId: L2 }];

describe('cityServes', () => {
  it('未配置 serviceCities 视为全城可服务', () => {
    expect(cityServes(undefined, '武汉')).toBe(true);
    expect(cityServes([], '武汉')).toBe(true);
  });
  it('精确命中与包含匹配', () => {
    expect(cityServes(['武汉'], '武汉')).toBe(true);
    expect(cityServes(['武汉'], '武汉市')).toBe(true);
    expect(cityServes(['武汉'], '上海')).toBe(false);
  });
  it('忽略大小写/空格并跳过非字符串项', () => {
    expect(cityServes(['  WuHan '], 'wuhan')).toBe(true);
    expect(cityServes([123 as any, '上海'], '北京')).toBe(false);
  });
});

describe('pinByCity', () => {
  const cities = new Map<string, unknown>();
  cities.set('loc-1', ['武汉']);
  cities.set('loc-2', ['上海']);

  it('city 为空时返回全部绑定仓合计（保持 D4）', () => {
    const r = pinByCity(levels, bindings, cities, null);
    expect(r.servedOnHand).toBe(50);
    expect(r.servedLocations).toHaveLength(2);
  });
  it('按城市仅聚合可服务仓', () => {
    const r = pinByCity(levels, bindings, cities, '武汉');
    expect(r.servedOnHand).toBe(30);
    expect(r.servedLocations).toEqual(['loc-1']);
  });
  it('城市无任何可服务仓返回空集与 onHand=0（由调用方回退虚拟仓）', () => {
    const r = pinByCity(levels, bindings, cities, '北京');
    expect(r.servedOnHand).toBe(0);
    expect(r.servedLocations).toHaveLength(0);
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

Run（在 `d:\zhao\vendure`）: `pnpm vitest run packages/cjk-plugin/src/inventory/stock-city-filter.spec.ts`
Expected: FAIL（模块不存在）。

- [ ] **Step 3: 实现纯函数**

`vendure/packages/cjk-plugin/src/inventory/stock-city-filter.ts`：

```ts
import type { ID } from '@vendure/core';

/** 仓库 serviceCities 是否服务目标城市：未配置或空数组视为全城可服务；
 *  匹配含精确、包含、前后缀（与 inventory-plugin locationServesCity 同语义）。 */
export function cityServes(serviceCities: unknown, city: string): boolean {
    if (!Array.isArray(serviceCities) || serviceCities.length === 0) {
        return true;
    }
    const target = city.trim().toLowerCase();
    return (serviceCities as unknown[]).some(s => {
        if (typeof s !== 'string') return false;
        const c = s.trim().toLowerCase();
        return c === target || c.startsWith(target) || target.startsWith(c);
    });
}

export interface CityStockLevel {
    stockLocationId: ID;
    stockOnHand: number;
}

export interface BindRef {
    locationId: ID;
}

export interface CityPin {
    servedLocations: ID[];
    servedOnHand: number;
}

/** 按城市聚合绑定物理仓可售：city 为空 → 全部绑定仓合计；否则仅过滤可服务仓。
 *  无任何可服务仓返回空 servedLocations + onHand=0（由调用方决定回退虚拟仓）。 */
export function pinByCity(
    levels: CityStockLevel[],
    bindings: BindRef[],
    cities: Map<string, unknown>,
    city: string | null | undefined,
): CityPin {
    const boundIds = bindings.map(b => b.locationId);
    const onHand = (locId: ID) =>
        levels.find(l => String(l.stockLocationId) === String(locId))?.stockOnHand ?? 0;
    if (!city) {
        return {
            servedLocations: boundIds,
            servedOnHand: boundIds.reduce((s, id) => s + onHand(id), 0),
        };
    }
    const served = boundIds.filter(id => cityServes(cities.get(String(id)), city));
    if (!served.length) {
        return { servedLocations: served, servedOnHand: 0 };
    }
    return { servedLocations: served, servedOnHand: served.reduce((s, id) => s + onHand(id), 0) };
}
```

- [ ] **Step 4: 运行测试确认通过**

Run（在 `d:\zhao\vendure`）: `pnpm vitest run packages/cjk-plugin/src/inventory/stock-city-filter.spec.ts`
Expected: PASS。

- [ ] **Step 5: Commit**

```bash
git add packages/cjk-plugin/src/inventory/stock-city-filter.ts packages/cjk-plugin/src/inventory/stock-city-filter.spec.ts
git commit -m "feat(cjk-plugin): 按城市聚合组成的纯函数 pinByCity/cityServes（TDD）"
```

---

## Task 2: 后端 `variantStockInfo` 按城市聚合

**Files:**
- Modify: `vendure/packages/cjk-plugin/src/inventory/virtual-physical-stock.service.ts:180-230`
- Modify: `vendure/packages/cjk-plugin/src/inventory/inventory-shop.resolver.ts`

- [ ] **Step 1: service 接入 city 聚合**

`virtual-physical-stock.service.ts` 顶部 import `pinByCity`：

```ts
import { pinByCity } from './stock-city-filter';
```

将 `getSaleableAndDetail` 签名与方法体后半段改为（替换原 L180-230 方法）：

```ts
    async getSaleableAndDetail(
        ctx: RequestContext,
        variantId: ID,
        lat?: number | null,
        lng?: number | null,
        city?: string | null,
    ) {
        const virtual = await this.ensureVirtualLocation(ctx);
        const levels = await this.stockLevelService.getStockLevelsForVariant(ctx, variantId);
        const physicalStockEnabled = Boolean((ctx.channel.customFields as any)?.physicalStockEnabled);
        const bindings = await this.connection
            .getRepository(ctx, VariantLocationBinding)
            .find({ where: { variantId: variantId as any } });
        const virtualOnHand =
            levels.find(l => String(l.stockLocationId) === String(virtual.id))?.stockOnHand ?? 0;

        let stockDetail: any[] = [];
        let saleableStock = virtualOnHand;
        if (physicalStockEnabled && bindings.length) {
            const boundIds = bindings.map(b => b.locationId);
            const locs = await this.connection
                .getRepository(ctx, StockLocation)
                .find({ where: { id: In(boundIds) }, loadEagerRelations: false });
            const origin = lat != null && lng != null ? { lat, lng } : null;

            // 按城市聚合：city 为空 → 全部绑定仓；否则仅服务该城市的绑定仓
            const cities = new Map<string, unknown>();
            for (const loc of locs) {
                cities.set(String(loc.id), (loc.customFields as any)?.serviceCities);
            }
            const { servedLocations, servedOnHand } = pinByCity(
                levels.map(l => ({ stockLocationId: l.stockLocationId, stockOnHand: l.stockOnHand })),
                bindings,
                cities,
                city,
            );

            const servedLocs = servedLocations.length ? locs.filter(l =>
                servedLocations.some(id => String(id) === String(l.id))) : [];
            stockDetail = servedLocs
                .map(loc => {
                    const level = levels.find(l => String(l.stockLocationId) === String(loc.id));
                    const c = (loc.customFields as any) ?? {};
                    const distanceKm = origin
                        ? haversineKm(origin.lat, origin.lng, c.lat ?? 0, c.lng ?? 0)
                        : null;
                    return {
                        locationId: loc.id,
                        name: loc.name,
                        lat: c.lat ?? null,
                        lng: c.lng ?? null,
                        onHand: level?.stockOnHand ?? 0,
                        distanceKm,
                    };
                })
                .sort((a, b) => {
                    if (a.distanceKm == null) return 1;
                    if (b.distanceKm == null) return -1;
                    return a.distanceKm - b.distanceKm;
                });
            // 提供 city 时主库存取城市仓合计；城市无仓可服务或未提供 city 回退全局虚拟仓
            if (city) {
                saleableStock = servedOnHand > 0 ? servedOnHand : virtualOnHand;
            }
        }
        return { variantId, saleableStock, physicalStockEnabled, stockDetail };
    }
```

- [ ] **Step 2: resolver 增 city 参数**

`inventory-shop.resolver.ts` 的 `variantStockInfo` 增 `city`：

```ts
    async variantStockInfo(
        @Ctx() ctx: RequestContext,
        @Args('variantId') variantId: ID,
        @Args('lat', { nullable: true }) lat?: number,
        @Args('lng', { nullable: true }) lng?: number,
        @Args('city', { nullable: true }) city?: string,
    ) {
        return this.virtualPhysicalStockService.getSaleableAndDetail(ctx, variantId, lat, lng, city);
    }
```

- [ ] **Step 3: 单测回归 + 校验类型**

Run（在 `d:\zhao\vendure`）: `pnpm vitest run packages/cjk-plugin` 然后 `pnpm --filter cjk-plugin build`
Expected: 既有 inventory resolver/service 测试通过，build 无 TS 错误。

- [ ] **Step 4: Commit**

```bash
git add packages/cjk-plugin/src/inventory/virtual-physical-stock.service.ts packages/cjk-plugin/src/inventory/inventory-shop.resolver.ts
git commit -m "feat(cjk-plugin): variantStockInfo 支持按城市聚合主库存"
```

---

## Task 3: 前端传城市并监听刷新

**Files:**
- Modify: `nshop/layers/base/gql/queries/product.gql:96-97`
- Modify: `nshop/layers/base/app/composables/useProductStockInfo.ts`
- Modify: `nshop/layers/base/app/components/product/StockInfoBlock.vue`

- [ ] **Step 1: gql query 加 city 变量**

`product.gql` 的 `VariantStockInfo` 改为：

```graphql
query VariantStockInfo($variantId: ID!, $lat: Float, $lng: Float, $city: String) {
  variantStockInfo(variantId: $variantId, lat: $lat, lng: $lng, city: $city) {
```

> 类型随 codegen 自动更新（graphql.schema 已含 `city` 字段后重新 codegen）。

- [ ] **Step 2: useProductStockInfo 透传 city**

`useProductStockInfo.ts` 的 `refresh` 增 `city` 入参并传给 GQL：

```ts
  async function refresh(
    variantId: string,
    lat?: number | null,
    lng?: number | null,
    city?: string | null,
  ): Promise<void> {
    loading.value = true;
    try {
      const data = await GqlVariantStockInfo({
        variantId,
        lat: lat ?? null,
        lng: lng ?? null,
        city: city ?? null,
      });
      info.value = (data.variantStockInfo ?? null) as StockInfo | null;
    } finally {
      loading.value = false;
    }
  }
```

- [ ] **Step 3: StockInfoBlock 读取城市并监听刷新**

`StockInfoBlock.vue` script 部分替换 `load`/`watch` 逻辑：

```ts
const { cityName } = storeToRefs(useLocationStore());

function currentCity(): string | null {
  return (cityName.value as string | undefined)?.trim() || null;
}

async function load() {
  if (!props.variantId) {
    return;
  }
  await refresh(props.variantId, null, null, currentCity());
}

onMounted(load);
// 变体切换（swatch）后重新刷新
watch(
  () => [props.variantId, cityName.value],
  (...args) => {
    load();
  },
);
```

> `useLocationStore` 自动导入可用；`storeToRefs` 由 pinia/nuxt 提供。若该文件此前未引用，保持其余模板不变。

- [ ] **Step 4: codegen + 类型校验**

Run（在 `d:\zhao\nshop`）: 按项目惯例执行 graphql codegen 或直接 `pnpm typecheck`
Expected: `GqlVariantStockInfo` 参数含 `city`，无 TS 错误。

- [ ] **Step 5: Commit**

```bash
git add layers/base/gql/queries/product.gql layers/base/app/composables/useProductStockInfo.ts layers/base/app/components/product/StockInfoBlock.vue
git commit -m "feat(nshop): 详情页库存按当前城市刷新"
```

---

## Task 4: 端到端验收与手册

**Files:**
- 交付物：操作手册补充 + 手机视口截图

- [ ] **Step 1: 本地全栈冒烟**

后端 `cjk-plugin` 构建并重启 vendure；nshop dev 打开商品详情页。为某物理驱动变体配置多个绑定仓（部分仓 `serviceCities` 含当前城市），切换城市：
Expected:
- 物理驱动 + 提供 city → 主库存 = 该城市可服务仓合计；附近明细仅显示该城市仓。
- 物理驱动 + 城市无可服务仓 → 主库存回退虚拟仓数（非「无」）。
- 纯虚拟 / 未定位 → 保持虚拟仓数（D4 不回归）。

- [ ] **Step 2: 手机视口截图**

Playwright 移动视口（**390×844，dpr=2**）分别截「命中城市（库存数>0）」「未命中城市（回退）」「纯虚拟」三态商品详情页。
Expected: 主库存显示具体数值且随城市切换变化。

- [ ] **Step 3: 补操作手册**

在操作手册库存章节补充：主库存按当前城市聚合的规则、城市过滤与回退语义、切换城市刷新行为，附 Step 2 截图。

- [ ] **Step 4: 部署 + 真机验证（本地构建铁律）**

**本地构建**产物 → scp 服务器 → 服务器仅解压 / `pm2 restart`（不在服务器构建）。线上验证「切城市 → 库存数变化」并补真机截图。

- [ ] **Step 5: Commit**

```bash
git add <操作手册> <截图>
git commit -m "docs(stock): 库存按城市展示操作手册与手机视口截图"
```

---

## Self-Review

- **Spec 覆盖**：按城市聚合口径（Task1/2）、前端传城市与切城刷新（Task3）、纯虚拟/未定位/无城市仓回退（Task1 逻辑 + Task2 saleableStock 回退 + Task4 验收）、交付截图补手册（Task4）、部署铁律（Task4）。全覆盖。
- **占位符扫描**：Task3 Step4 依赖 lib 现网 graphql.schema.json 是否已含 `city` 字段——为消除不确定性，**先做后端 Task1+2 并 build 更新 schema，再做 Task3**，codegen 需后端 schema 已含该参数；已在 Task2 Step3 用 `--filter cjk-plugin build` 同步。若 codegen 仍未收录，需在 nshop 手动刷新 `graphql.schema.json`。
- **类型一致**：`pinByCity`/`cityServes` 定义于 Task1，Task2 引用一致；`CityStockLevel`/`BindRef`/`CityPin` 与 levels（`stockLocationId`/`stockOnHand`）结构一致；`refresh(variantId, lat, lng, city)` 签名跨 Task2/3 一致。