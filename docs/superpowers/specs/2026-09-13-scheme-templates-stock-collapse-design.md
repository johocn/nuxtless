# 商品详情页优化：方案库模板化 + 就近库存折叠 + 规格区修复 · 设计文档

日期：2026-09-13
状态：待批准（用户已确认四处决策：前端内置模板库、商品编辑页现有勾选即可、就近库存汇总条+点击展开、规格区方案 A）
关联：`docs/superpowers/specs/2026-09-13-product-detail-followups-design.md`（就近库存全展示，已批准执行中）

## 背景

上一轮就近库存/促销服务方案库上线后，用户提出三点优化：

1. **促销/服务方案库模板化**：当前店铺信息页的方案库是「手填 code + 中文 + English」三列逐行编辑，希望改为**预先内置常用促销方案、服务保障模板，供客户一键添加**，并支持多语言模板。
2. **就近库存折叠展示**：当前就近库存区平铺所有仓库卡片（含各 SKU 明细），信息过载，希望**默认只展示商品库存数量，具体库存明细点击后展开查看**。
3. **web-admin 规格矩阵区 UI 问题**（用户补充）：条形码、内部码在同一行相互挤压；成本价只有 placeholder「成本价(分)」无标签，编辑时文字不显示。

## 现状确认（已核查代码）

### 方案库链路（促销/服务已非写死）

- 后端：`Channel.customFields` 存 `promoSchemes` / `serviceSchemes`（JSON 字符串，格式 `[{ code, text: { zh_Hans, en } }]`），零后端改动。
- web-admin 店铺信息页（`vshop\web-admin\src\pages\decorate\shop-info\index.vue`）：已有手填式方案库编辑（每行 code/zh/en + 添加/删除），保存经 `myUpdateChannelCustomFields` 写入。
- web-admin 商品编辑页（`ProductBrandMarketingTab.vue`）：**已实现**从店铺方案库 checkbox 勾选促销/服务（`promoOptions`/`serviceOptions` 拉取 channel customFields），空库有提示文案。
- C 端详情页：`PromoBlock.vue` / `ServiceBlock.vue` 按「商品 codes → 频道方案库 → i18n 兜底」回退链渲染，方案库变更自动生效，支持 `VENDURE_LOCALE_MAP`（zh-CN→zh_Hans、en-US→en）多语言。

### 就近库存

- `nshop\layers\base\app\components\product\NearbyStores.vue`：平铺展示全部仓库卡片，每卡片含距离、SKU 明细（可售件数）、在库/占用汇总、服务城市。
- 后端已改全仓库返回（无坐标仓库 `distanceKm = MAX_SAFE_INTEGER`，前端显示「距离未知」）。

### 规格矩阵区

- `vshop\web-admin\src\components\product-tabs\ProductVariantMatrixTab.vue`：主行（规格组合 | 价格 | 划线价 | 库存）下挂 sub 行，sub 行 = 变体图 + 条形码输入 + 内部码输入 + 成本价输入，**四者挤一行**，条形码/内部码长字符串互相挤压；成本价仅 placeholder 无标签。

## 方案

### A. 店铺信息页方案库模板化（web-admin）

**内置模板常量**（新建 `vshop\web-admin\src\constants\scheme-templates.ts`）：

```ts
export const PROMO_TEMPLATES: Array<{ code: string; zh: string; en: string }> = [
  { code: "freeShip99", zh: "满99元包邮", en: "Free shipping over ¥99" },
  { code: "flashSale",   zh: "限时特惠",   en: "Flash sale" },
  { code: "newUser",     zh: "新人专享",   en: "New user offer" },
  { code: "memberPrice", zh: "会员价",     en: "Member price" },
  { code: "couponPick",  zh: "领券立减",   en: "Coupon discount" },
  { code: "cut60",       zh: "满60减20",   en: "¥20 off ¥60" },
];

export const SERVICE_TEMPLATES: Array<{ code: string; zh: string; en: string }> = [
  { code: "genuine",    zh: "正品保障",       en: "Genuine product" },
  { code: "sevenDay",   zh: "7天无理由退换",   en: "7-day returns" },
  { code: "fastShip",   zh: "极速发货",       en: "Fast shipping" },
  { code: "faka",       zh: "假一赔十",       en: "10x refund" },
  { code: "nationwide", zh: "全国联保",       en: "Nationwide warranty" },
];
```

**店铺信息页交互改造**（`shop-info/index.vue`）：

1. 方案库区拆为两段：
   - **常用模板**：chips 网格（中文名 + 英文小字），点击「＋」将该模板追加到已选列表，已添加项变灰并显示「✓」（防重复）。
   - **已选方案**：现有列表行（code 徽章 + 中文输入 + English 输入 + 删除），行内文案可直接修改。
2. 保留「＋ 自定义方案」按钮（手动添加空行，code 自拟）。
3. 保存逻辑不变：`toSchemePayload` 序列化为 `[{ code, text: { zh_Hans, en } }]` 写回 `promoSchemes` / `serviceSchemes`。
4. 模板 code 与已选列表重复时**合并覆盖**（同 code 直接替换文案），不产生重复项。

**多语言**：模板自带中英双语，保存后 C 端按 `VENDURE_LOCALE_MAP` 切换语言自动取对应文案；无语言包改动。

### B. 商品编辑页促销/服务勾选（现状确认，仅验证）

`ProductBrandMarketingTab.vue` 已从店铺方案库勾选促销/服务并保存。本期**不新增开发**，仅在回归中验证：编辑回填勾选态正确、保存后 C 端促销/服务条与勾选一致、店铺方案库为空时提示引导配置。

### C. 就近库存折叠展示（nshop C 端）

改造 `NearbyStores.vue`：

1. **默认态（折叠）**：单行汇总卡片——
   - 主信息：`就近库存 {合计可售} 件可售`（全部仓库 `stockAvailable` 求和，字体强调）；
   - 副信息：`共 {N} 个门店 · 距您最近约 {x}km`（无坐标仓库不参与"最近"计算，门店数含 0 件仓）；
   - 右侧 chevron 指示可展开。
2. **展开态**：保留现有仓库明细行（仓库名、距离徽章「1.2km / 距离未知」、可售件数、服务城市），0 件仓库数字灰显。
3. **空态兜底**：
   - 未定位/未选城市：显示「定位后可查看附近门店库存」；
   - 全部仓库 0 件或后端无返回：显示「暂无可查看的门店库存」。
4. 交互：点击汇总条 toggle 展开/收起，chevron 旋转；SKU 切换（`variantId`）时仍刷新并保持折叠态。
5. 新词条补充至 12 个语言包 `messages.detail`：`nearbySummary`（`就近库存 {qty} 件可售`）、`nearbyStoresCount`（`共 {n} 个门店 · 距您最近约 {d}`）、`nearbyNoCoords`（定位后查看）。

### D. 规格矩阵区修复（方案 A，web-admin）

改造 `ProductVariantMatrixTab.vue` sub 区为「字段带标签 · 分行」：

1. sub 区第一行：变体图 + **条形码**（标签 + 输入 + 📷 扫码按钮）。
2. sub 区第二行：**内部码**（标签 + 输入 + 📷）+ **成本价**（标签 + 输入）。
3. 每个字段显示独立标签（条形码 / 内部码 / 成本价），不再依赖 placeholder；条形码、内部码各占一行不挤压；成本价值与标签编辑时均清晰可见。
4. 数据绑定与 `onSkuField` / 扫码逻辑不变（仅模板结构调整）。

## 文件清单

| 仓库 | 文件 | 改动 |
|---|---|---|
| vshop | `web-admin/src/constants/scheme-templates.ts` | 新建：双语内置模板常量 |
| vshop | `web-admin/src/pages/decorate/shop-info/index.vue` | 改造：常用模板区 + 已选列表 + 去重合并 |
| vshop | `web-admin/src/components/product-tabs/ProductVariantMatrixTab.vue` | 修复：sub 区字段带标签分行（方案 A） |
| vshop | `web-admin/src/components/product-tabs/ProductBrandMarketingTab.vue` | 仅验证编辑回填（无改动则不动） |
| nshop | `layers/base/app/components/product/NearbyStores.vue` | 改造：汇总条 + 点击展开 + 空态 |
| nshop | `layers/base/i18n/locales/*.ts`（12 个） | 新增 `nearbySummary` / `nearbyStoresCount` 等词条 |

## 验收标准

- [ ] 店铺信息页可见「常用模板」区，点击即添加、重复点击不产生重复项；中英文案可改可删；保存后写入 `promoSchemes` / `serviceSchemes`。
- [ ] 保存后 C 端详情页促销条/服务条按新方案库渲染，中文站显示中文、英文站显示英文。
- [ ] 商品编辑页勾选促销/服务保存后回填正确，C 端与勾选一致（编辑回填回归）。
- [ ] 就近库存默认仅显示汇总行（合计可售 + 门店数），点击展开仓库明细，再点收起；未定位显示空态。
- [ ] 规格矩阵区条形码/内部码分行、成本价带标签显示，编辑回填值可见。
- [ ] 本地构建通过（vshop web-admin build / nshop build），手机视口（390×844）截图入库补操作手册。

## 风险与待确认

1. 模板 code 为平台内置约定，若客户店铺已有同名 code 不同文案，以模板点击添加为准覆盖（可再手改文案）。
2. 就近库存「距您最近约 x km」在有坐标仓库为 0 时隐藏该副文案，仅显示门店数，避免「最近 0km」歧义。
3. 规格矩阵 sub 区行高增加（两行），需在手机视口确认不拥挤。
