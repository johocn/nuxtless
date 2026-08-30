# 结算页「自提免地址」+「到店需联系方式」+「高德反查地址」实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 自提箱不再要求收货地址；需联系方式的到店档案在结算时必填联系人（登录用户复用地址本持久化/默认/新增）；物流档案地址块改为高德定位反查自动填写。

**Architecture:** 后端在配送档案(ShippingProfile)实体加 `requiresAddress/requiresContact` 两开关列 + `OrderBoxInfo` 下发；Order 新增 `contactName/contactPhone/remark` 自定义字段。前端换页块显隐判定为「按箱 requires* 汇总」，新增 `CheckoutPickupContactBlock`，地址块接入高德反查（复用现有 `locationStore.geo` + `useGeoLocation().reverseGeocode`）。

**Tech Stack:** Nuxt3(GQL codegen) + Vue3 setup + valibot schema；Vendure (cjk-plugin / pickup-plugin / shipping-profile entity + TypeORM migration)；高德反向地理已封装在 `useGeoLocation`。

---
规格：`docs/superpowers/specs/2026-08-30-checkout-pickup-address-contact-design.md`

## 文件结构

后端（`d:\zhao\vendure`）：
- 修改 `packages/cjk-plugin/src/shipping/shipping-profile.entity.ts`（加两列）
- 新建 `packages/cjk-plugin/src/migrations/migrate-shipping-contact-flags.ts` + 修改 `migrations/index.ts`（注册）
- 修改 `packages/cjk-plugin/src/order/order-box.service.ts`（OrderBox 接口 + computeOrderBoxes 填充）
- 修改 `packages/cjk-plugin/src/plugin.ts`（`type OrderBox` 加两字段）
- 修改 `packages/cjk-plugin/src/order/order-custom-fields.ts`（Order 加三字段）

前端（`d:\zhao\nshop`）：
- 修改 `layers/base/gql/queries/order.gql`（GetOrderBoxes 加两字段；SetOrderCustomFields 保持）
- 修改 `layers/base/gql/fragments/order.gql`（OrderDetail.customFields 加三字段）
- 修改 `layers/base/app/composables/useCheckoutFlow.ts`（submitContact）
- 修改 `layers/base/app/components/checkout/CheckoutLayoutJd.vue`（块门控）
- 新建 `layers/base/app/components/checkout/CheckoutPickupContactBlock.vue`
- 修改 `layers/base/app/pages/checkout/index.vue`（submitJd/submitLegacy）
- 修改 `layers/base/app/components/checkout/AddressBlock.vue`（高德反查填充）
- 修改 `layers/base/i18n/locales/zh-CN.ts` 与 `layers/base/i18n/locales/en-US.ts`（checkout 组词条）

---

## Task 1（后端）：ShippingProfile 实体加两开关列

**Files:**
- Modify: `d:\zhao\vendure\packages\cjk-plugin\src\shipping\shipping-profile.entity.ts`

- [ ] **Step 1: 加两列**

在实体字段区（`enabled`/`isGlobal` 附近）加：
```ts
@Column({ default: true })
requiresAddress: boolean;

@Column({ default: false })
requiresContact: boolean;
```
（对照现有 `@Column() isGlobal: boolean;`，插在其它布尔列旁。）

- [ ] **Step 2: 编译校验**

Run: `cd d:\zhao\vendure; node node_modules/typescript/bin/tsc -p packages/cjk-plugin`
Expected: 退出码 0，无该实体报错。

- [ ] **Step 3: Commit**

```bash
cd /d/zhao/vendure
git add packages/cjk-plugin/src/shipping/shipping-profile.entity.ts
git commit -m "feat(cjk): shipping profile 增加 requiresAddress/requiresContact 列"
```

---

## Task 2（后端）：迁移两列

**Files:**
- Create: `d:\zhao\vendure\packages\cjk-plugin\src\migrations\migrate-shipping-contact-flags.ts`
- Modify: `d:\zhao\vendure\packages\cjk-plugin\src\migrations\index.ts`

- [ ] **Step 1: 写迁移**

新建文件：
```ts
export async function migrateShippingContactFlags(qb: {
    query: (sql: string) => Promise<unknown>;
}): Promise<void> {
    await qb.query(
        "ALTER TABLE \"shipping_profile\" ADD COLUMN IF NOT EXISTS \"requiresAddress\" boolean NOT NULL DEFAULT true",
    );
    await qb.query(
        "ALTER TABLE \"shipping_profile\" ADD COLUMN IF NOT EXISTS \"requiresContact\" boolean NOT NULL DEFAULT false",
    );
}
```

- [ ] **Step 2: 注册到 index**

`migrations/index.ts` 里把 `migrateShippingContactFlags` 加入导出数组（其余逻辑在实现时读该文件按其运行器风格追加；它须在启动时执行一次，幂等由 IF NOT EXISTS 保证）。

- [ ] **Step 3: Commit**

```bash
cd /d/zhao/vendure
git add packages/cjk-plugin/src/migrations
git commit -m "feat(cjk): migration 增加 shipping_profile 地址/联系开关列"
```

---

## Task 3（后端）：OrderBox 下发两开关 + Order 三联系字段

**Files:**
- Modify: `d:\zhao\vendure\packages\cjk-plugin\src\order\order-box.service.ts`
- Modify: `d:\zhao\vendure\packages\cjk-plugin\src\plugin.ts`
- Modify: `d:\zhao\vendure\packages\cjk-plugin\src\order\order-custom-fields.ts`

- [ ] **Step 1: order-box.service 接口与填充**

`interface OrderBox`（line 14-35）加：
```ts
requiresAddress: boolean;
requiresContact: boolean;
```
`computeOrderBoxes`（line 100-111）组装处加：
```ts
requiresAddress: profile?.requiresAddress ?? true,
requiresContact: profile?.requiresContact ?? false,
```

- [ ] **Step 2: plugin.ts 的 OrderBox schema**

`type OrderBox { ... }`（line 1042-1053）加：
```graphql
requiresAddress: Boolean!
requiresContact: Boolean!
```

- [ ] **Step 3: order-custom-fields.ts 加三字段**

`orderCustomFields.Order` 数组末尾追加（参照现有 public 字段：
```ts
{ name: 'contactName', type: 'string', nullable: true, public: true },
{ name: 'contactPhone', type: 'string', nullable: true, public: true },
{ name: 'remark', type: 'text', nullable: true, public: true },
```

- [ ] **Step 4: 编译**

Run: `cd d:\zhao\vendure; node node_modules/typescript/bin/tsc -p packages/cjk-plugin`
Expected: 退出码 0。

- [ ] **Step 5: Commit**

```bash
cd /d/zhao/vendure
git add packages/cjk-plugin/src
git commit -m "feat(cjk): OrderBox 下发 requires* ；Order 增加 contactName/contactPhone/remark"
```

---

## Task 4（后端）：构建并验证接线

- [ ] **Step 1: 构建 cjk-plugin dist**

Run: `cd d:\zhao\vendure; node node_modules/typescript/bin/tsc -p packages/cjk-plugin`
（确保 dist 与 src 变更同步；若仓库 dist 为 git 跟踪产物，需重新编译使 dist 更新。）

- [ ] **Step 2: 部署后端**

按既有流程：push → 服务器 `/www/apps/vendure` `git pull origin master` → `pm2 restart vendure`（遵循「本地构建、服务器只 pull+restart」铁律）。

- [ ] **Step 3: 接口冒烟**

用 superadmin 登录 `https://e.joho.cn/admin-api`，查询：
```graphql
{ orderBoxes { boxKey profileName requiresAddress requiresContact } }
```
Expected: 返回的每箱带 `requiresAddress/requiresContact` 布尔；schema 无报错。再查一单 Order 的 `customFields { contactName contactPhone remark }` 字段可回读（空值）。

---

## Task 5（前端）：GQL 补字段

**Files:**
- Modify: `d:\zhao\nshop\layers\base\gql\queries\order.gql`（GetOrderBoxes 段约 line 180-201）
- Modify: `d:\zhao\nshop\layers\base\gql\fragments\order.gql`（OrderDetail.customFields 段约 line 115-132）

- [ ] **Step 1: GetOrderBoxes 加两字段**

在箱字段区（如 `defaultShippingMethodId` 后）加：
```graphql
requiresAddress
requiresContact
```

- [ ] **Step 2: OrderDetail.customFields 加三字段**

在 customFields 块加：
```graphql
contactName
contactPhone
remark
```

- [ ] **Step 3: 重新生成类型**

Run: `cd /d/zhao/nshop; npm run dev:prepare`（或项目的 GQL codegen 脚本，参考 package.json `gql` 脚本）
Expected: `~/.nuxt/gql` 类型更新，`OrderBoxInfo` 自动带上两字段。

- [ ] **Step 4: Commit**

```bash
cd /d/zhao/nshop
git add layers/base/gql
git commit -m "feat(nshop): gql 补 OrderBox requires* 与 Order 联系字段"
```

---

## Task 6（前端）：useCheckoutFlow 增加 submitContact

**Files:**
- Modify: `d:\zhao\nshop\layers\base\app\composables\useCheckoutFlow.ts`

- [ ] **Step 1: 接口与初值**

`CheckoutSubmitFns`（line 12-19）加 `submitContact`);
```ts
submitContact?: () => Promise<boolean> | null;
```
`provideCheckoutFlow` 的 submitFns 初始化（line 33-37）加：
```ts
submitContact: null,
```

- [ ] **Step 2: Commit**

```bash
cd /d/zhao/nshop
git add layers/base/app/composables/useCheckoutFlow.ts
git commit -m "feat(nshop): checkout flow 支持 submitContact"
```

---

## Task 7（前端）：CheckoutLayoutJd 按箱门控 + 挂联系块

**Files:**
- Modify: `d:\zhao\nshop\layers\base\app\components\checkout\CheckoutLayoutJd.vue`
- Create: `d:\zhao\nshop\layers\base\app\components\checkout\CheckoutPickupContactBlock.vue`

- [ ] **Step 1: 替换 hasLogistics 为按箱汇总**

把 `hasLogistics` computed 替换：
```ts
const hasShippingBox = computed(() =>
    (orderStore.orderBoxes ?? []).some((b) => b.requiresAddress),
);
const hasPickupContactBox = computed(() =>
    (orderStore.orderBoxes ?? []).some((b) => b.requiresContact),
);
```
模板改为：
```vue
<CheckoutAddressBlock v-if="hasShippingBox" />
<CheckoutPickupContactBlock v-if="hasPickupContactBox" />
<CheckoutPaymentBlock />
```

- [ ] **Step 2: 新建 CheckoutPickupContactBlock.vue**

（完整实现见 Task 8；本步先建占位组件并让页面可编译，框架照抄 AddressBlock 的 `<section>` 卡样式，仅标题用联系文案。）

- [ ] **Step 3: 提交前 build 冒烟**

Run: `cd /d/zhao/nshop; npm run build`（或最小 `nuxt-tsc`/build 校验那步）
Expected: 无组件未注册/类型错误。模板注册名必须用完整注册名 `CheckoutPickupContactBlock`（Nuxt 自动注册按目录前缀，防止 SSR 空注释）。

- [ ] **Step 4: Commit**

```bash
cd /d/zhao/nshop
git add layers/base/app/components/checkout/CheckoutLayoutJd.vue layers/base/app/components/checkout/CheckoutPickupContactBlock.vue
git commit -m "feat(nshop): 结算块按 requires* 门控并挂自提联系块"
```

---

## Task 8（前端）：实现 CheckoutPickupContactBlock

**Files:**
- Modify: `d:\zhao\nshop\layers\base\app\components\checkout\CheckoutPickupContactBlock.vue`

联系块职责：`needContact` 时显示；登录用户从地址本加载联系人/选择/新增并默认；未登录手填；`flow.submitFns.submitContact` 校验手机号必填+格式；写 `setOrderCustomFields(contactName/contactPhone/remark)`。

- [ ] **Step 1: script（完整）**

```ts
<script setup lang="ts">
import { useCheckoutFlow } from "~~/layers/base/app/composables/useCheckoutFlow";

const { t } = useI18n();
const toast = useToast();
const orderStore = useOrderStore();
const flow = useCheckoutFlow();
const { isAuthenticated } = storeToRefs(useAuthStore());
const { addresses, fetchAddresses, createAddress, recordToDraft } = useAddressBook();
const { countryCodeDefault } = useAppConfig();

const contactName = ref('');
const contactPhone = ref('');
const contactRemark = ref('');
const selectedAddressId = ref<string | null>(null);

const PHONE_RE = /^1\d{10}$/;

function applyContact(rec) {
  selectedAddressId.value = rec?.id ?? null;
  contactName.value = rec?.fullName ?? '';
  contactPhone.value = rec?.phoneNumber ?? '';
}

onMounted(async () => {
  if (!isAuthenticated.value) return;
  await fetchAddresses();
  if (addresses.value.length) applyContact(addresses.value[0]); // 默认联系人
});

async function pickContact() {
  if (!isAuthenticated.value || !addresses.value.length) return;
  const labels = addresses.value.map((a) => [a.fullName, a.phoneNumber].filter(Boolean).join(' '));
  uni.showActionSheet({
    itemList: ['（新增联系人）', ...labels],
    success: (r) => {
      if (r.tapIndex === 0) { contactName.value = ''; contactPhone.value = ''; selectedAddressId.value = null; return; }
      applyContact(addresses.value[r.tapIndex - 1]);
    },
  });
}

// 新增联系人：存为地址本条目（author 只填姓名+手机，缺省 CN）
const saving = ref(false);
async function saveAsContact(d = { fullName: contactName.value, phoneNumber: contactPhone.value }) {
  const model = isAuthenticated.value;
  if (model && !PHONE_RE.test(d.phoneNumber || '')) {
    toast.add({ title: t('messages.checkout.pickupContactRequired'), description: t('messages.checkout.invalidPhone'), color: 'error' });
    return false;
  }
  if (model) {
    saving.value = true;
    const rec = { fullName: d.fullName, phoneNumber: d.phoneNumber };
    const ok = await createAddress({ fullName: d.fullName, streetLine1: '', streetLine2: '', province: '', city: '', postalCode: '', countryCode: countryCodeDefault, phoneNumber: d.phoneNumber, isDefault: true });
    saving.value = false;
    if (!ok) return false;
  }
  return true;
}

flow.submitFns.submitContact = async () => {
  if (!contactName.value.trim() || !PHONE_RE.test(contactPhone.value.trim())) {
    orderStore.error = t('messages.checkout.pickupContactRequired');
    toast.add({ title: t('messages.checkout.invalidPhone'), description: orderStore.error, color: 'error' });
    return false;
  }
  if (isAuthenticated.value) await saveAsContact();
  orderStore.error = null;
  await orderStore.setOrderCustomFields({
    contactName: contactName.value.trim(),
    contactPhone: contactPhone.value.trim(),
    remark: contactRemark.value.trim() || null,
  });
  return !orderStore.error;
};
</script>
```
> 说明：`orderStore.setOrderCustomFields` 不存在则改为直接调 `GqlSetOrderCustomFields({ input: { customFields: {...} } })`（锚点已有该 gql，line 167-176），并确保在 `GqlSetOrderCustomFields` mutation 里带 `customFields` 入参。

- [ ] **Step 2: template（卡式）**

```vue
<template>
  <section class="card" v-if="needShow">
    <h3>{{ t('messages.checkout.pickupContactTitle') }}</h3>
    <view v-if="isAuthenticated && addresses.length" class="contact-pick" @tap="pickContact">
      <text>{{ contactName }} {{ contactPhone }}</text>
      <text class="link">{{ t('messages.checkout.switchContact') }}</text>
    </view>
    <view class="field">
      <text class="label">{{ t('messages.checkout.pickupContactName') }}</text>
      <input v-model="contactName" :placeholder="t('messages.checkout.pickupContactName')" />
    </view>
    <view class="field">
      <text class="label">{{ t('messages.checkout.pickupContactPhone') }}</text>
      <input v-model="contactPhone" type="number" :placeholder="t('messages.checkout.pickupContactPhone')" />
    </view>
    <view class="field">
      <text class="label">{{ t('messages.checkout.pickupRemark') }}</text>
      <input v-model="contactRemark" :placeholder="t('messages.checkout.pickupRemark')" />
    </view>
  </section>
</template>
```
> `needShow` 依赖父组件传入的 `requiresContact`，若父不传，则内部也从 `orderStore.orderBoxes` 计算 `some(b=>b.requiresContact)` 决定自显；`v-if` 用该值。样式沿用 AddressBlock 的 card 类（实现时参照其 scss）。

- [ ] **Step 3: build 冒烟 + Commit**

Run: `cd /d/zhao/nshop; npm run build` 通过后
```bash
git add layers/base/app/components/checkout/CheckoutPickupContactBlock.vue
git commit -m "feat(nshop): 自提联系块（地址本/新增/未登录手填+校验）"
```

---

## Task 9（前端）：checkout/index.vue 提交接线

**Files:**
- Modify: `d:\zhao\nshop\layers\base\app\pages\checkout\index.vue`

- [ ] **Step 1: submitJd 用 requires* 并插 submitContact**

替换 `submitJd` 内 `hasLogistics` 判定（line 115-117）：
```ts
const hasAddress = (orderStore.orderBoxes ?? []).some((b) => b.requiresAddress);
const hasContact = (orderStore.orderBoxes ?? []).some((b) => b.requiresContact);
```
并把 `if (hasLogistics) { await submitAddress }` 改为 `if (hasAddress) {...}`；在 `submitDelivery` 之后、`submitPayment` 之前插入：
```ts
if (hasContact) { const okContact = (await flow.submitFns.submitContact?.()) ?? false; if (!okContact) return; }
```

- [ ] **Step 2: submitLegacy 兼容**

旧版式按 `order.value?.customFields?.deliveryType === "pickup"` 已跳过 shipping；在 `submitShipping` 后加：
```ts
if (order.value?.customFields?.deliveryType === 'pickup' && flow.submitFns.submitContact) {
  const ok = (await flow.submitFns.submitContact()) ?? false;
  if (!ok) return;
}
```
（保持 legacy 行为：只要 pickup 且需联系块则校验联系；物流则沿用地址。）

- [ ] **Step 3: Commit**

```bash
cd /d/zhao/nshop
git add layers/base/app/pages/checkout/index.vue
git commit -m "feat(nshop): checkout 提交按需校验地址/联系"
```

---

## Task 10（前端）：地址块高德逆反查自动填 + 失败回退

**Files:**
- Modify: `d:\zhao\nshop\layers\base\app\components\checkout\AddressBlock.vue`

复用 `useGeoLocation`（`reverseGeocode`）+ `locationStore.geo/coords`；进入地址块自动反查，失败用首页定位城市兜底（`locationStore.cityName`），AddressForm 已有 `cascadeGeo/preselectByLocation` 承接联动下拉。

- [ ] **Step 1: 自动反查填省市区街道**

onMounted 内（在已有 fetchAddresses 逻辑旁）增加：
```ts
const geoLocation = useGeoLocation();
const locationStore = useLocationStore();
async function fillFromLocation() {
  if (!needsAddress) return;            // 仅物流档案需要时
  if (!state.countryCode && (state.province || state.streetLine1)) return; // 已有用户填
  let g = locationStore.geo;
  if (!g?.province) {
    const c = locationStore.coords;
    if (c?.lat && c?.lng) {
      try { g = await geoLocation.reverseGeocode(c.lat, c.lng); } catch { g = null; }
    }
  }
  if (!g?.province) {
    // 失败回退：用首页定位城市兜底
    const fallbackCity = locationStore.cityName; // 若已有城市名
    if (fallbackCity) { state.city = state.city || fallbackCity; }
    return;
  }
  // 填充四级（AddressForm 的 cascadeGeo 口径：province/city/district/street）
  state.countryCode = state.countryCode || 'CN';
  state.province = g.province || state.province;
  state.city = g.city || state.city;
  state.streetLine1 = (state.district || g.district || '') + (g.street ? g.street : '');
}
onMounted(fillFromLocation);
```
> 说明：若 `ReverseGeocodeInfo` 已有 `district/street`（锚点 B7 确认有），则直接写 `state.district= g.district ?? ''; state.street= g.street ?? ''`（state 已含 district/street 字段，validators/addressForm.ts 已定义）；`streetLine1` 由 AddressForm 的 `syncState` 从 district/street 合并。实现时按 AddressForm 现有一致口径填充，保证与后端落库映射一致。

- [ ] **Step 2: 校验保留**

物流档案必填已由 `addressSummary.has`（收货人+街道）与 §3.3 的省市区必填校验承载；补充 `state.province && state.city` 校验，不满足即 toast「需先选省/市/区」。

- [ ] **Step 3: Commit**

```bash
cd /d/zhao/nshop
git add layers/base/app/components/checkout/AddressBlock.vue
git commit -m "feat(nshop): 地址块高德逆反查自动填省市区街道，失败首页城市兜底"
```

---

## Task 11（前端）：i18n 词条

**Files:**
- Modify: `d:\zhao\nshop\layers\base\i18n\locales\zh-CN.ts`（checkout 组，line 140-172）
- Modify: `d:\zhao\nshop\layers\base\i18n\locales\en-US.ts`（同结构）

- [ ] **Step 1: zh-CN 新增**

`messages.checkout` 组内追加：
```ts
pickupContactTitle: '领取联系方式',
pickupContactName: '领取人',
pickupContactPhone: '联系电话',
pickupRemark: '备注（可选）',
pickupContactRequired: '需填写领取人及联系电话',
invalidPhone: '手机号格式不正确',
switchContact: '切换/新增联系人',
locateAddressDone: '已按定位填充收货地址',
```

- [ ] **Step 2: en-US 新增**（同结构英文）

```ts
pickupContactTitle: 'Pickup Contact',
pickupContactName: 'Contact name',
pickupContactPhone: 'Phone',
pickupRemark: 'Remark (optional)',
pickupContactRequired: 'Contact name & phone are required',
invalidPhone: 'Invalid phone number',
switchContact: 'Switch / add contact',
locateAddressDone: 'Shipping address filled from location',
```

- [ ] **Step 3: Commit**

```bash
cd /d/zhao/nshop
git add layers/base/i18n/locales
git commit -m "feat(nshop): checkout 联系/定位文案 i18n"
```

---

## Task 12（前端）：构建 + 回归 + 交付

- [ ] **Step 1: build**

Run: `cd /d/zhao/nshop; npm run build`
Expected: 退出码 0，无类型/SSR 注册错误。

- [ ] **Step 2: e2e 语义回归（脚本）**

对照 spec 测试计划，用 `scripts/_verify_*.py` 风格跑：纯自提免地址可下单；需联系则未填手机号被阻；混合箱正常。若无现成脚本则新建临时 py/mjs 调用 shop-api 模拟下单断言。

- [ ] **Step 3: 手机截图交付（硬性）**

用手机视口（390×844，dpr=2 = 780×1688 Playwright mobile viewport）对结算页档自提/纯自提需联系/混合箱三种场景截图，补充进操作手册；覆盖高德反查填充与联系块。

- [ ] **Step 4: 汇总交付说明**

给出该迭代实现内容+接口+截图+手工测试路径。

---

## Self-Review 对照

- spec §3.2/§3.3 → Task 7/9/10（按箱 requiresAddress 门控、缺省市区校验、高德反查+首页兜底）。
- spec §4.1/§4.2/§4.4 → Task 3/6/7/8/9/11（Order 三字段、requiresContact 触发、联系块、提交接线、i18n）。
- spec §5（开关承载与下发）→ Task 1/2/3/5。
- 混合箱（§7）→ Task 8/9/10 均按箱汇总，互不冲突。
- 类型一致性：`requiresAddress/requiresContact` 后端实体→OrderBox service→schema→gql→`OrderBoxInfo`；`contactName/contactPhone/remark` Order customFields→fragment→ContactBlock。命名全程一致。
- 无占位符：各 Step 均给真实代码/命令。